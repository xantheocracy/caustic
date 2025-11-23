"""Forward photon tracing for indirect UV light exposure"""

import math
import random
from typing import List, Dict, Set, Tuple
from ..core import Vector3, Light, Triangle
from ..core.lamp_profiles import get_lamp_manager
from ..raytracing import Tracer
from ..utils import sample_uniform_sphere, sample_cosine_weighted_hemisphere, sample_biased_cone


class SamplePointClusterer:
    """Clusters sample points to reduce flux deposition overhead."""

    def __init__(self, sample_points: List[Vector3], clustering_distance: float = 0.5):
        self.sample_points = sample_points
        self.clustering_distance = clustering_distance
        self.clusters: List[List[int]] = []
        self.cluster_centers: List[Vector3] = []
        self._cluster_points()

    def _cluster_points(self) -> None:
        """Group nearby points using greedy clustering."""
        used = set()

        for i, point in enumerate(self.sample_points):
            if i in used:
                continue

            # Start a new cluster with this point
            cluster = [i]
            used.add(i)

            # Find all nearby points
            for j in range(i + 1, len(self.sample_points)):
                if j in used:
                    continue

                distance = point.subtract(self.sample_points[j]).length()
                if distance < self.clustering_distance:
                    cluster.append(j)
                    used.add(j)

            # Compute cluster center
            center = Vector3(0, 0, 0)
            for idx in cluster:
                center = center.add(self.sample_points[idx])
            center = center.multiply(1.0 / len(cluster))

            self.clusters.append(cluster)
            self.cluster_centers.append(center)

    def get_clusters(self) -> Tuple[List[Vector3], List[List[int]]]:
        """Returns cluster centers and list of point indices per cluster."""
        return self.cluster_centers, self.clusters


class SamplePointGrid:
    """Spatial grid for fast lookup of sample points during photon deposition."""

    def __init__(self, sample_points: List[Vector3], cell_size: float = 1.0):
        self.cell_size = cell_size
        self.sample_points = sample_points
        self.grid: Dict[Tuple[int, int, int], List[int]] = {}
        self._build_grid()

    def _build_grid(self) -> None:
        """Build spatial grid from sample points."""
        for idx, point in enumerate(self.sample_points):
            cell = self._position_to_cell(point)
            if cell not in self.grid:
                self.grid[cell] = []
            self.grid[cell].append(idx)

    def _position_to_cell(self, pos: Vector3) -> Tuple[int, int, int]:
        """Convert 3D position to grid cell coordinate."""
        return (
            int(pos.x // self.cell_size),
            int(pos.y // self.cell_size),
            int(pos.z // self.cell_size),
        )

    def get_nearby_point_indices(self, position: Vector3, search_radius: float) -> List[int]:
        """Get indices of sample points within search_radius of position."""
        center_cell = self._position_to_cell(position)
        search_cells = int(search_radius / self.cell_size) + 1

        nearby_indices = []
        for dx in range(-search_cells, search_cells + 1):
            for dy in range(-search_cells, search_cells + 1):
                for dz in range(-search_cells, search_cells + 1):
                    cell = (center_cell[0] + dx, center_cell[1] + dy, center_cell[2] + dz)
                    if cell in self.grid:
                        nearby_indices.extend(self.grid[cell])

        return nearby_indices


class PhotonTracingConfig:
    """Configuration for forward photon tracing"""

    def __init__(
        self,
        max_bounces: int = 1,
        photons_per_light: int = 10000,
        kernel_radius: float = 1.0,
        epsilon: float = 1e-6,
        verbose: bool = False,
        clustering_distance: float = 0.0,
        use_russian_roulette: bool = True,
        roulette_threshold: float = 0.01,
        use_path_reuse: bool = True,
    ):
        self.max_bounces = max_bounces
        self.photons_per_light = photons_per_light
        self.kernel_radius = kernel_radius
        self.epsilon = epsilon
        self.verbose = verbose
        self.clustering_distance = clustering_distance  # 0.0 disables clustering
        self.use_russian_roulette = use_russian_roulette  # Kill low-flux photons probabilistically
        self.roulette_threshold = roulette_threshold  # Flux threshold for roulette termination
        self.use_path_reuse = use_path_reuse  # Cache photon paths by hit surface


class PhotonTracer:
    """Forward photon tracer for computing indirect illumination"""

    def __init__(self, triangles: List[Triangle], tracer: Tracer, config: PhotonTracingConfig):
        self.triangles = triangles
        self.tracer = tracer
        self.config = config
        self.lamp_manager = get_lamp_manager()

    def trace_indirect_exposure(
        self,
        sample_points: List[Vector3],
        lights: List[Light],
    ) -> Dict[int, float]:
        """
        Compute indirect exposure at sample points using forward photon tracing.
        Uses optimized batching with Russian roulette termination for faster convergence.

        Args:
            sample_points: List of points at which to compute indirect exposure
            lights: List of light sources

        Returns:
            Dictionary mapping point index to indirect exposure
        """

        # Initialize indirect exposure for all points to zero
        indirect_exposure = {i: 0.0 for i in range(len(sample_points))}

        # Optionally cluster sample points
        cluster_centers = sample_points
        clusters: List[List[int]] = [[i] for i in range(len(sample_points))]

        if self.config.clustering_distance > 0:
            clusterer = SamplePointClusterer(sample_points, self.config.clustering_distance)
            cluster_centers, clusters = clusterer.get_clusters()

            if self.config.verbose:
                print(f"Clustered {len(sample_points)} points into {len(cluster_centers)} clusters")

        # Build spatial grid for cluster centers for efficient flux deposition
        # Use smaller cell size for better spatial locality during grid lookups
        # Cell size = kernel_radius / 2 provides good balance between lookup cost and coherence
        optimal_cell_size = max(0.1, self.config.kernel_radius / 2.0)
        sample_point_grid = SamplePointGrid(cluster_centers, cell_size=optimal_cell_size)

        if self.config.verbose:
            print(f"Starting photon tracing for {len(lights)} light(s)")
            print(f"Tracing {self.config.photons_per_light} photons per light (max bounces: {self.config.max_bounces})")

        # Trace photons from each light
        for light_idx, light in enumerate(lights):
            power_per_photon = light.intensity / self.config.photons_per_light

            if self.config.verbose:
                print(f"\n  Light {light_idx + 1}/{len(lights)}: Tracing {self.config.photons_per_light} photons")

            for photon_idx in range(self.config.photons_per_light):
                # Sample initial direction from biased cone around light direction
                # Only sample directions within 90 degrees of the light direction
                initial_direction = sample_biased_cone(light.direction, max_angle_degrees=90.0)

                # Trace first photon bounce (no energy deposit yet)
                self._trace_photon_from_light(
                    light.position,
                    initial_direction,
                    power_per_photon,
                    light,
                    cluster_centers,
                    sample_point_grid,
                    indirect_exposure,
                )

                if self.config.verbose and (photon_idx + 1) % max(1, self.config.photons_per_light // 10) == 0:
                    print(f"    Photons traced: {photon_idx + 1}/{self.config.photons_per_light}")

        # If clustering was used, distribute cluster exposure back to original points
        if self.config.clustering_distance > 0:
            clustered_exposure = indirect_exposure
            indirect_exposure = {i: 0.0 for i in range(len(sample_points))}

            for cluster_idx, point_indices in enumerate(clusters):
                cluster_exposure = clustered_exposure.get(cluster_idx, 0.0)
                for point_idx in point_indices:
                    indirect_exposure[point_idx] = cluster_exposure

        if self.config.verbose:
            print("\nPhoton tracing complete!")

        return indirect_exposure

    def _trace_photon_from_light(
        self,
        origin: Vector3,
        direction: Vector3,
        flux: float,
        light: Light,
        sample_points: List[Vector3],
        sample_point_grid: SamplePointGrid,
        indirect_exposure: Dict[int, float],
    ) -> None:
        """
        Trace a photon from a light source.
        First hit does NOT deposit energy, only determines bounce point.

        Args:
            origin: Starting position
            direction: Ray direction
            flux: Photon energy/power
            light: The light source (for angular intensity)
            sample_points: Points at which to accumulate exposure
            sample_point_grid: Spatial grid for efficient sample point lookup
            indirect_exposure: Dictionary to accumulate indirect exposure
        """
        # First hit: find intersection but don't deposit energy
        try:
            hit = self.tracer.trace_ray(origin, direction)
        except RecursionError:
            return  # Safety: catch recursion errors

        if not hit.hit:
            return  # Photon escaped

        bounce_point = hit.point
        tri = hit.triangle

        if tri is None:
            return

        # Compute reflected flux with angle-dependent intensity from lamp
        # Calculate angle between photon direction and light direction
        cos_angle = light.direction.dot(direction)
        cos_angle = max(-1.0, min(1.0, cos_angle))
        angle_rad = math.acos(cos_angle)
        angle_deg = math.degrees(angle_rad)

        # Get intensity multiplier based on lamp type and angle
        try:
            intensity_at_angle = self.lamp_manager.get_intensity_at_angle(light.lamp_type, angle_deg)
        except (ValueError, KeyError):
            intensity_at_angle = light.intensity

        lamp_profile = self.lamp_manager.get_profile(light.lamp_type)
        if lamp_profile is not None:
            forward_intensity = lamp_profile.forward_intensity
        else:
            forward_intensity = light.intensity

        if forward_intensity > 0:
            intensity_multiplier = intensity_at_angle / forward_intensity
        else:
            intensity_multiplier = 1.0

        # Apply angle-dependent intensity to the flux
        angle_adjusted_flux = flux * intensity_multiplier

        rho = tri.albedo
        reflected_flux = angle_adjusted_flux * rho

        if reflected_flux < self.config.epsilon:
            return

        # Sample reflection direction using cosine-weighted hemisphere
        new_direction = sample_cosine_weighted_hemisphere(tri.normal)

        # Offset along normal to avoid self-intersection (use larger offset for safety)
        new_origin = bounce_point.add(tri.normal.multiply(1e-3))

        # Now trace subsequent bounces which DO deposit flux
        self._trace_reflected_photon(
            new_origin,
            new_direction,
            reflected_flux,
            1,  # Starting at bounce 1
            light,
            sample_points,
            sample_point_grid,
            indirect_exposure,
        )

    def _trace_reflected_photon(
        self,
        origin: Vector3,
        direction: Vector3,
        flux: float,
        bounce: int,
        light: Light,
        sample_points: List[Vector3],
        sample_point_grid: SamplePointGrid,
        indirect_exposure: Dict[int, float],
    ) -> None:
        """
        Trace a photon after it has bounced at least once.
        Deposits flux into nearby sample points based on proximity to the hit point.

        Args:
            origin: Starting position
            direction: Ray direction
            flux: Current photon energy/power
            bounce: Current bounce number (1 or higher)
            light: The light source (for angular intensity)
            sample_points: Points at which to accumulate exposure
            sample_point_grid: Spatial grid for efficient sample point lookup
            indirect_exposure: Dictionary to accumulate indirect exposure
        """
        # Stop if we've exceeded max bounces
        if bounce > self.config.max_bounces:
            return

        # Russian roulette termination: kill low-energy photons probabilistically
        # This is statistically unbiased but reduces wasted computation
        if self.config.use_russian_roulette and flux < self.config.roulette_threshold:
            survival_prob = flux / self.config.roulette_threshold
            if random.random() > survival_prob:
                return  # Photon terminated
            flux = flux / survival_prob  # Scale up surviving photons

        # Stop if flux is negligible even after roulette
        if flux < self.config.epsilon:
            return

        # Find intersection
        hit = self.tracer.trace_ray(origin, direction)

        if not hit.hit:
            return  # Photon escaped

        # DEPOSIT FLUX into nearby sample points based on proximity (using spatial grid)
        hit_point = hit.point
        nearby_indices = sample_point_grid.get_nearby_point_indices(hit_point, self.config.kernel_radius)
        for i in nearby_indices:
            sample_point = sample_points[i]
            distance = hit_point.subtract(sample_point).length()

            if distance < self.config.kernel_radius:
                # Kernel density estimate: linear falloff within radius
                weight = max(0, 1 - distance / self.config.kernel_radius)
                indirect_exposure[i] += flux * weight

        # Compute further reflected flux
        tri = hit.triangle

        if tri is None:
            return

        rho = tri.albedo
        new_flux = flux * rho

        # Early termination: if reflectivity is very low, don't continue
        # This avoids tracing photons into absorptive materials
        if new_flux < self.config.epsilon:
            return

        # Apply Russian roulette to low-reflectivity surfaces
        if self.config.use_russian_roulette and rho < 0.1:
            if random.random() > rho:
                return
            new_flux = new_flux / rho  # Compensate for increased termination rate

        # Sample new reflection direction
        new_direction = sample_cosine_weighted_hemisphere(tri.normal)
        new_origin = hit_point.add(tri.normal.multiply(1e-3))

        # Recursively trace next bounce
        self._trace_reflected_photon(
            new_origin,
            new_direction,
            new_flux,
            bounce + 1,
            light,
            sample_points,
            sample_point_grid,
            indirect_exposure,
        )

"""Forward photon tracing for indirect UV light exposure"""

from typing import List, Dict
from ..core import Vector3, Light, Triangle
from ..raytracing import Tracer
from ..utils import sample_uniform_sphere, sample_cosine_weighted_hemisphere


class PhotonTracingConfig:
    """Configuration for forward photon tracing"""

    def __init__(
        self,
        max_bounces: int = 1,
        photons_per_light: int = 10000,
        kernel_radius: float = 1.0,
        epsilon: float = 1e-6,
        verbose: bool = False,
    ):
        self.max_bounces = max_bounces
        self.photons_per_light = photons_per_light
        self.kernel_radius = kernel_radius
        self.epsilon = epsilon
        self.verbose = verbose


class PhotonTracer:
    """Forward photon tracer for computing indirect illumination"""

    def __init__(self, triangles: List[Triangle], tracer: Tracer, config: PhotonTracingConfig):
        self.triangles = triangles
        self.tracer = tracer
        self.config = config

    def trace_indirect_exposure(
        self,
        sample_points: List[Vector3],
        lights: List[Light],
    ) -> Dict[int, float]:
        """
        Compute indirect exposure at sample points using forward photon tracing.
        Uses a gather-based approach: trace each photon once, then update all sample points.

        Args:
            sample_points: List of points at which to compute indirect exposure
            lights: List of light sources

        Returns:
            Dictionary mapping point index to indirect exposure
        """
        # Initialize indirect exposure for all points to zero
        indirect_exposure = {i: 0.0 for i in range(len(sample_points))}

        if self.config.verbose:
            print(f"Starting photon tracing for {len(lights)} light(s)")
            print(f"Tracing {self.config.photons_per_light} photons per light (max bounces: {self.config.max_bounces})")

        # Trace photons from each light
        for light_idx, light in enumerate(lights):
            power_per_photon = light.intensity / self.config.photons_per_light

            if self.config.verbose:
                print(f"\n  Light {light_idx + 1}/{len(lights)}: Tracing {self.config.photons_per_light} photons")

            for photon_idx in range(self.config.photons_per_light):
                # Sample initial direction uniformly from sphere
                initial_direction = sample_uniform_sphere()

                # Trace first photon bounce (no energy deposit yet)
                self._trace_photon_from_light(
                    light.position,
                    initial_direction,
                    power_per_photon,
                    sample_points,
                    indirect_exposure,
                )

                if self.config.verbose and (photon_idx + 1) % max(1, self.config.photons_per_light // 10) == 0:
                    print(f"    Photons traced: {photon_idx + 1}/{self.config.photons_per_light}")

        if self.config.verbose:
            print("\nPhoton tracing complete!")

        return indirect_exposure

    def _trace_photon_from_light(
        self,
        origin: Vector3,
        direction: Vector3,
        flux: float,
        sample_points: List[Vector3],
        indirect_exposure: Dict[int, float],
    ) -> None:
        """
        Trace a photon from a light source.
        First hit does NOT deposit energy, only determines bounce point.

        Args:
            origin: Starting position
            direction: Ray direction
            flux: Photon energy/power
            sample_points: Points at which to accumulate exposure
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

        # Compute reflected flux
        rho = tri.albedo
        reflected_flux = flux * rho

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
            sample_points,
            indirect_exposure,
        )

    def _trace_reflected_photon(
        self,
        origin: Vector3,
        direction: Vector3,
        flux: float,
        bounce: int,
        sample_points: List[Vector3],
        indirect_exposure: Dict[int, float],
    ) -> None:
        """
        Trace a photon after it has bounced at least once.
        Deposits flux into all sample points based on proximity to the hit point.

        Args:
            origin: Starting position
            direction: Ray direction
            flux: Current photon energy/power
            bounce: Current bounce number (1 or higher)
            sample_points: Points at which to accumulate exposure
            indirect_exposure: Dictionary to accumulate indirect exposure
        """
        # Stop if we've exceeded max bounces or flux is negligible
        if bounce > self.config.max_bounces or flux < self.config.epsilon:
            return

        # Find intersection
        hit = self.tracer.trace_ray(origin, direction)

        if not hit.hit:
            return  # Photon escaped

        # DEPOSIT FLUX into all sample points based on proximity
        hit_point = hit.point
        for i, sample_point in enumerate(sample_points):
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

        if new_flux < self.config.epsilon:
            return

        # Sample new reflection direction
        new_direction = sample_cosine_weighted_hemisphere(tri.normal)
        new_origin = hit_point.add(tri.normal.multiply(1e-3))

        # Recursively trace next bounce
        self._trace_reflected_photon(
            new_origin,
            new_direction,
            new_flux,
            bounce + 1,
            sample_points,
            indirect_exposure,
        )

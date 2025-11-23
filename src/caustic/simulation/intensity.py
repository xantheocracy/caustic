"""UV intensity calculation (Stage 1)"""

import math
from typing import List, NamedTuple, Optional, Dict
from ..core import Vector3, Light, Triangle
from ..core.lamp_profiles import get_lamp_manager
from ..raytracing import Tracer
from .photon_tracing import PhotonTracer, PhotonTracingConfig


class IntensityResult(NamedTuple):
    """Results of intensity calculation at a point"""

    direct_intensity: float  # Direct intensity from lights
    indirect_intensity: float  # Indirect (reflected) intensity
    total_intensity: float  # Total intensity (direct + indirect)


class IntensityConfig(NamedTuple):
    """Configuration for intensity calculation"""

    max_bounces: int  # Maximum number of reflection bounces (0 for direct only)
    grid_cell_size: float  # Cell size for spatial grid optimization
    photons_per_light: int = 10000  # Number of photons to emit per light for indirect calculation
    kernel_radius: float = 1.0  # Radius for kernel density estimate in photon tracing
    verbose: bool = True  # Enable verbose logging for photon tracing


class IntensityCalculator:
    """
    Calculates UV light intensity at given points, accounting for direct light
    and optionally reflections from surfaces (using forward photon tracing).
    """

    def __init__(self, triangles: List[Triangle], config: IntensityConfig):
        self.tracer = Tracer(triangles, config.grid_cell_size)
        self.triangles = triangles
        self.config = config

        # Initialize photon tracer if indirect lighting is needed
        if config.max_bounces > 0:
            photon_config = PhotonTracingConfig(
                max_bounces=config.max_bounces,
                photons_per_light=config.photons_per_light,
                kernel_radius=config.kernel_radius,
                verbose=config.verbose,
            )
            self.photon_tracer = PhotonTracer(triangles, self.tracer, photon_config)
        else:
            self.photon_tracer = None

        # Cache for photon tracing results
        self._photon_cache: Optional[Dict[int, float]] = None
        self._cached_lights: Optional[List[Light]] = None

    def calculate_intensity(self, point: Vector3, lights: List[Light]) -> IntensityResult:
        """
        Calculate light intensity at a given point from all lights.
        Includes both direct and indirect (reflected) components.
        """
        # Calculate direct intensity
        direct_intensity = 0
        for light in lights:
            direct_intensity += self._calculate_direct_intensity(point, light)

        # Calculate indirect intensity if enabled
        indirect_intensity = 0
        if self.config.max_bounces > 0 and self.photon_tracer is not None:
            indirect_intensity = self._calculate_indirect_intensity(point, lights)

        total_intensity = direct_intensity + indirect_intensity

        return IntensityResult(direct_intensity, indirect_intensity, total_intensity)

    def calculate_intensity_batch(
        self, points: List[Vector3], lights: List[Light]
    ) -> List[IntensityResult]:
        """
        Calculate light intensity at multiple points at once.
        More efficient for photon tracing since it's computed once for all points.
        """
        # Calculate direct intensity for each point
        results = []
        direct_intensities = []
        for point in points:
            direct_intensity = 0
            for light in lights:
                direct_intensity += self._calculate_direct_intensity(point, light)
            direct_intensities.append(direct_intensity)

        # Calculate indirect intensity for all points at once if enabled
        indirect_intensities = [0.0] * len(points)
        if self.config.max_bounces > 0 and self.photon_tracer is not None:
            # Check if we've already cached results for these lights
            if self._cached_lights != lights:
                # Recompute photon tracing for these lights
                self._photon_cache = self.photon_tracer.trace_indirect_exposure(points, lights)
                self._cached_lights = lights

            if self._photon_cache is not None:
                for i in range(len(points)):
                    indirect_intensities[i] = self._photon_cache.get(i, 0.0)

        # Combine results
        for i in range(len(points)):
            total_intensity = direct_intensities[i] + indirect_intensities[i]
            results.append(
                IntensityResult(direct_intensities[i], indirect_intensities[i], total_intensity)
            )

        return results

    def _calculate_indirect_intensity(self, point: Vector3, lights: List[Light]) -> float:
        """
        Calculate indirect intensity contribution at a point using cached photon results.
        This method assumes photon tracing has already been done (usually via batch calculation).
        """
        if self._photon_cache is None:
            # Fallback: compute on-demand for single point
            # This is less efficient but works for single-point queries
            cache = self.photon_tracer.trace_indirect_exposure([point], lights)
            return cache.get(0, 0.0)

        return 0.0  # Should not reach here if used correctly

    def _calculate_direct_intensity(self, point: Vector3, light: Light) -> float:
        """
        Calculate intensity contribution from a single light at a point.
        Uses inverse square law with angular-dependent intensity based on lamp type.
        """
        direction = light.position.subtract(point)
        distance = direction.length()

        if distance < 1e-6:
            return 0  # Point is at the light source

        # Check if there's a direct line of sight to the light
        if not self.tracer.is_path_clear(point, light.position):
            return 0  # Light is blocked

        # Calculate angle between light direction and vector from light to point
        # direction is from point to light, so negate it to get light to point
        to_point = direction.multiply(-1)
        to_point_normalized = to_point.normalize()
        cos_angle = light.direction.dot(to_point_normalized)
        # Clamp to [-1, 1] to handle numerical errors
        cos_angle = max(-1.0, min(1.0, cos_angle))
        angle_rad = math.acos(cos_angle)
        angle_deg = math.degrees(angle_rad)

        # Get the intensity multiplier based on lamp type and angle
        lamp_manager = get_lamp_manager()
        try:
            intensity_at_angle = lamp_manager.get_intensity_at_angle(light.lamp_type, angle_deg)
        except (ValueError, KeyError):
            # Fallback to forward intensity if lamp type is not recognized
            intensity_at_angle = light.intensity

        # Apply inverse square law with angle-dependent intensity
        # Irradiance at distance d from directional point source:
        # E = (intensity_at_angle / forward_intensity) × (I_forward / (4π × d²))
        # light.intensity should equal the forward_intensity from the lamp profile
        lamp_profile = lamp_manager.get_profile(light.lamp_type)
        if lamp_profile is not None:
            forward_intensity = lamp_profile.forward_intensity
        else:
            forward_intensity = light.intensity

        if forward_intensity > 0:
            intensity_multiplier = intensity_at_angle / forward_intensity
        else:
            intensity_multiplier = 1.0

        intensity = intensity_multiplier * light.intensity / (4 * math.pi * distance * distance)

        return intensity

"""UV intensity calculation (Stage 1)"""

import math
from typing import List, NamedTuple
from ..core import Vector3, Light, Triangle
from ..raytracing import Tracer


class IntensityResult(NamedTuple):
    """Results of intensity calculation at a point"""

    direct_intensity: float  # Direct intensity from lights
    total_intensity: float  # Total intensity including reflections


class IntensityConfig(NamedTuple):
    """Configuration for intensity calculation"""

    max_bounces: int  # Maximum number of reflection bounces (0 for direct only)
    grid_cell_size: float  # Cell size for spatial grid optimization


class IntensityCalculator:
    """
    Calculates UV light intensity at given points, accounting for direct light
    and optionally reflections from surfaces.
    """

    def __init__(self, triangles: List[Triangle], config: IntensityConfig):
        self.tracer = Tracer(triangles, config.grid_cell_size)

    def calculate_intensity(self, point: Vector3, lights: List[Light]) -> IntensityResult:
        """
        Calculate light intensity at a given point from all lights.
        Currently implements direct lighting only (no reflections).
        """
        direct_intensity = 0

        for light in lights:
            direct_intensity += self._calculate_direct_intensity(point, light)

        # For now, total intensity is same as direct (no reflections)
        return IntensityResult(direct_intensity, direct_intensity)

    def _calculate_direct_intensity(self, point: Vector3, light: Light) -> float:
        """
        Calculate intensity contribution from a single light at a point.
        Uses inverse square law: intensity = lightIntensity / (4π × distance²)
        """
        direction = light.position.subtract(point)
        distance = direction.length()

        if distance < 1e-6:
            return 0  # Point is at the light source

        # Check if there's a direct line of sight to the light
        if not self.tracer.is_path_clear(point, light.position):
            return 0  # Light is blocked

        # Apply inverse square law
        # Irradiance at distance d from point source of intensity I:
        # E = I / (4π × d²)
        intensity = light.intensity / (4 * math.pi * distance * distance)

        return intensity

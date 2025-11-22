"""UV Light Simulator"""

from typing import List, NamedTuple
from .core import Vector3, Triangle, Light
from .simulation import (
    IntensityCalculator,
    IntensityResult,
    IntensityConfig,
    PathogenCalculator,
    Pathogen,
    PathogenSurvivalResult,
)


class PointResults(NamedTuple):
    """Results for a single evaluation point"""

    position: Vector3
    intensity: IntensityResult
    pathogen_survival: List[PathogenSurvivalResult]


class UVLightSimulator:
    """Main UV light simulator class"""

    def __init__(
        self,
        triangles: List[Triangle],
        lights: List[Light],
        config: IntensityConfig = IntensityConfig(max_bounces=0, grid_cell_size=10),
    ):
        self.triangles = triangles
        self.lights = lights
        self.intensity_calculator = IntensityCalculator(triangles, config)
        self.pathogen_calculator = PathogenCalculator()

    def simulate(
        self,
        points: List[Vector3],
        pathogens: List[Pathogen],
        exposure_time: float,
    ) -> List[PointResults]:
        """
        Simulate UV exposure at specified points over a given time period.
        Uses batch processing for efficiency: calculates all intensities at once
        so photon tracing is only done once for all points.
        """
        results = []

        # Stage 1: Calculate intensities for all points at once
        # This ensures photon tracing is only computed once and reused for all points
        intensities = self.intensity_calculator.calculate_intensity_batch(points, self.lights)

        # Stage 2: Calculate pathogen survival for each point
        for point, intensity in zip(points, intensities):
            pathogen_survival = self.pathogen_calculator.calculate_multiple_survivals(
                intensity.total_intensity, exposure_time, pathogens
            )

            results.append(PointResults(point, intensity, pathogen_survival))

        return results


__all__ = [
    "Vector3",
    "Triangle",
    "Light",
    "Pathogen",
    "PathogenSurvivalResult",
    "IntensityResult",
    "PointResults",
    "UVLightSimulator",
    "IntensityConfig",
]

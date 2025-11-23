"""UV Light Simulator"""

from typing import List, NamedTuple
from .core import Vector3, Triangle, Light
from .data import get_disinfection_database
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
        use_wavelength_dependent: bool = True,
    ) -> List[PointResults]:
        """
        Simulate UV exposure at specified points over a given time period.
        Uses batch processing for efficiency: calculates all intensities at once
        so photon tracing is only done once for all points.

        Args:
            points: List of points to evaluate
            pathogens: List of pathogens
            exposure_time: Exposure time in seconds
            use_wavelength_dependent: If True, use disinfection table for wavelength-dependent k values.
                                       If False, use pathogens.json static values.
        """
        results = []

        # Stage 1: Calculate intensities for all points at once
        # This ensures photon tracing is only computed once and reused for all points
        intensities = self.intensity_calculator.calculate_intensity_batch(points, self.lights)

        # Load disinfection database if using wavelength-dependent calculations
        disinfection_db = None
        if use_wavelength_dependent:
            disinfection_db = get_disinfection_database()

        # Stage 2: Calculate pathogen survival for each point
        for point, intensity in zip(points, intensities):
            if use_wavelength_dependent and disinfection_db is not None and intensity.intensity_by_wavelength:
                # Use wavelength-dependent calculations
                pathogen_survival = []
                for pathogen in pathogens:
                    # Calculate combined survival across wavelengths
                    combined_result = self.pathogen_calculator.calculate_combined_survival(
                        intensity.intensity_by_wavelength,
                        exposure_time,
                        pathogen.name,
                        disinfection_db,
                    )

                    # Create a PathogenSurvivalResult with the combined values
                    # For visualization, use the combined results
                    result = PathogenSurvivalResult(
                        pathogen_name=pathogen.name,
                        k1=0.0,  # Placeholder - multiple wavelengths have different k values
                        k2=0.0,  # Placeholder
                        percent_resistant=0.0,  # Placeholder
                        fluence=combined_result['combined_fluence'],
                        survival_rate=combined_result['total_survival_rate'],
                        ech_uv=combined_result['total_ech_uv'],
                    )
                    pathogen_survival.append(result)
            else:
                # Use static values from pathogens.json
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

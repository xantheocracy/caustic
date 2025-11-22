"""Pathogen survival calculation using Chick-Watson model (Stage 2)"""

import math
from typing import List, NamedTuple


class Pathogen(NamedTuple):
    """Represents a pathogen with its Chick-Watson model parameters"""

    name: str
    k_value: float  # Chick-Watson k value (resistance to UV, higher = more resistant)


class PathogenSurvivalResult(NamedTuple):
    """Results of pathogen survival calculation"""

    pathogen_name: str
    k_value: float
    dose: float  # Irradiance × time (J/m²)
    survival_rate: float  # Fraction of pathogens surviving (0-1)
    log_reduction: float  # Log₁₀ reduction (useful for microbiology)


class PathogenCalculator:
    """
    Calculates pathogen survival rates using the Chick-Watson empirical model.
    This is Stage 2 of the simulation.
    """

    def calculate_survival(
        self,
        intensity: float,  # Irradiance (W/m²)
        exposure_time: float,  # Exposure time (seconds)
        pathogen: Pathogen,
    ) -> PathogenSurvivalResult:
        """
        Calculate survival rate for a pathogen exposed to UV dose.

        Chick-Watson Model:
        N(t) / N₀ = exp(-k × dose)

        Where:
        - N(t) / N₀ = survival rate (fraction remaining)
        - k = pathogen-specific resistance parameter
        - dose = irradiance × time (J/m²)
        """
        # Calculate dose: irradiance × time
        dose = intensity * exposure_time

        # Chick-Watson model: survival = exp(-k × dose)
        survival_rate = math.exp(-pathogen.k_value * dose)

        # Log reduction: -log₁₀(N/N₀) = k × dose / ln(10)
        log_reduction = pathogen.k_value * dose / math.log(10)

        return PathogenSurvivalResult(
            pathogen.name, pathogen.k_value, dose, survival_rate, log_reduction
        )

    def calculate_multiple_survivals(
        self,
        intensity: float,
        exposure_time: float,
        pathogens: List[Pathogen],
    ) -> List[PathogenSurvivalResult]:
        """Calculate survival rates for multiple pathogens at a point."""
        return [
            self.calculate_survival(intensity, exposure_time, pathogen)
            for pathogen in pathogens
        ]

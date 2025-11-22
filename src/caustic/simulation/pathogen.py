"""Pathogen survival calculation using Chick-Watson model (Stage 2)"""

from typing import List, NamedTuple


class Pathogen(NamedTuple):
    """Represents a pathogen with its UV inactivation model parameters"""

    name: str
    k1: float  # Primary inactivation rate constant (cm²/mJ)
    k2: float  # Secondary inactivation rate constant for resistant subpopulation (cm²/mJ)
    percent_resistant: float  # Percentage of resistant subpopulation (0-100)


class PathogenSurvivalResult(NamedTuple):
    """Results of pathogen survival calculation"""

    pathogen_name: str
    k1: float
    k2: float
    percent_resistant: float
    fluence: float  # Irradiance × time (J/m²)
    survival_rate: float  # 10^(-k1 × fluence)
    ech_uv: float  # Effective Cumulative Hydrogen peroxide Equivalent-UV (%)


class PathogenCalculator:
    """
    Calculates pathogen survival rates and eACH-UV metrics.
    This is Stage 2 of the simulation.
    """

    def calculate_survival(
        self,
        intensity: float,  # Irradiance (W/m²)
        exposure_time: float,  # Exposure time (seconds)
        pathogen: Pathogen,
    ) -> PathogenSurvivalResult:
        """
        Calculate survival rate and eACH-UV for a pathogen exposed to UV fluence.

        Metrics calculated:
        1. Survival Rate: 10^(-k1 × fluence)
        2. eACH-UV: (k1 × (1-f) + k2 × f) × fluence × 3.6
           where f = percent_resistant / 100

        Where:
        - fluence = irradiance × time (J/m²)
        - k1, k2 = inactivation rate constants
        - percent_resistant = percentage of resistant population
        """
        # Calculate fluence: irradiance × time
        fluence = intensity * exposure_time

        # Survival rate: 10^(-k1 × fluence)
        survival_rate = 10 ** (-pathogen.k1 * fluence)

        # Calculate eACH-UV
        # f = percent_resistant / 100
        f = pathogen.percent_resistant / 100
        # effective k = k1 × (1-f) + k2 × f
        effective_k = pathogen.k1 * (1 - f) + pathogen.k2 * f
        # eACH-UV = effective_k × fluence × 3.6
        ech_uv = effective_k * fluence * 3.6

        return PathogenSurvivalResult(
            pathogen.name,
            pathogen.k1,
            pathogen.k2,
            pathogen.percent_resistant,
            fluence,
            survival_rate,
            ech_uv,
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

"""Pathogen survival calculation using Chick-Watson model (Stage 2)"""

from typing import Dict, List, NamedTuple, Optional
import math


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
    Supports both single-wavelength and multi-wavelength calculations.
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

    def calculate_survival_at_wavelength(
        self,
        intensity: float,  # Irradiance (W/m²) at this wavelength
        exposure_time: float,  # Exposure time (seconds)
        pathogen_name: str,  # Name of pathogen
        wavelength_nm: float,  # Wavelength in nm
        disinfection_db,  # DisinfectionDatabase instance
    ) -> Optional[PathogenSurvivalResult]:
        """
        Calculate survival rate and eACH-UV for a specific wavelength using wavelength-dependent parameters.

        Args:
            intensity: Irradiance at this wavelength (W/m²)
            exposure_time: Exposure time (seconds)
            pathogen_name: Name of the pathogen
            wavelength_nm: Wavelength in nanometers
            disinfection_db: DisinfectionDatabase instance for looking up parameters

        Returns:
            PathogenSurvivalResult with wavelength-dependent k values, or None if pathogen not found
        """
        # Get wavelength-dependent parameters from disinfection database
        params = disinfection_db.get_parameters_at_wavelength(pathogen_name, wavelength_nm)
        if params is None:
            return None

        k1, k2, percent_resistant = params

        # Calculate fluence: irradiance × time (J/m²)
        fluence = intensity * exposure_time

        # Survival rate: 10^(-k1 × fluence)
        survival_rate = 10 ** (-k1 * fluence)

        # Calculate eACH-UV
        f = percent_resistant / 100
        effective_k = k1 * (1 - f) + k2 * f
        ech_uv = effective_k * fluence * 3.6

        return PathogenSurvivalResult(
            pathogen_name,
            k1,
            k2,
            percent_resistant,
            fluence,
            survival_rate,
            ech_uv,
        )

    def calculate_combined_survival(
        self,
        intensity_by_wavelength: Dict[float, float],  # wavelength_nm -> intensity (W/m²)
        exposure_time: float,  # Exposure time (seconds)
        pathogen_name: str,  # Name of pathogen
        disinfection_db,  # DisinfectionDatabase instance
    ) -> Dict[str, float]:
        """
        Calculate combined survival rate and eACH-UV across multiple wavelengths.

        For multiple wavelengths:
        - Total eACH = sum of eACH values for each wavelength
        - Total Survival = product of survival rates for each wavelength

        Args:
            intensity_by_wavelength: Dict mapping wavelength (nm) to intensity (W/m²)
            exposure_time: Exposure time (seconds)
            pathogen_name: Name of the pathogen
            disinfection_db: DisinfectionDatabase instance

        Returns:
            Dict with keys: 'total_ech_uv', 'total_survival_rate', 'combined_fluence'
        """
        if not intensity_by_wavelength:
            return {'total_ech_uv': 0.0, 'total_survival_rate': 1.0, 'combined_fluence': 0.0}

        total_ech_uv = 0.0
        total_survival_rate = 1.0
        combined_fluence = 0.0

        for wavelength_nm, intensity in intensity_by_wavelength.items():
            result = self.calculate_survival_at_wavelength(
                intensity, exposure_time, pathogen_name, wavelength_nm, disinfection_db
            )

            if result is not None:
                total_ech_uv += result.ech_uv
                total_survival_rate *= result.survival_rate  # Multiplicative
                combined_fluence += result.fluence

        return {
            'total_ech_uv': total_ech_uv,
            'total_survival_rate': total_survival_rate,
            'combined_fluence': combined_fluence,
        }

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

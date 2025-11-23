"""Disinfection table database for wavelength-dependent pathogen parameters"""

import csv
import os
from typing import Dict, List, Optional, Tuple


class DisinfectionData:
    """Represents disinfection parameters for a specific species/strain/wavelength combination"""

    def __init__(self, species: str, strain: str, wavelength_nm: float, k1: float, k2: float, percent_resistant: float):
        self.species = species
        self.strain = strain
        self.wavelength_nm = wavelength_nm
        self.k1 = max(k1, 1e-6) if k1 > 0 else 1e-6  # Ensure k1 > 0
        self.k2 = max(k2, 0) if k2 > 0 else 0  # k2 can be 0 or positive
        self.percent_resistant = max(0, min(100, percent_resistant))  # Bound to [0, 100]


class DisinfectionDatabase:
    """Manages wavelength-dependent disinfection data from the disinfection table"""

    def __init__(self, csv_path: Optional[str] = None):
        """
        Initialize the disinfection database.

        Args:
            csv_path: Path to disinfection_table.csv. If None, uses default location.
        """
        if csv_path is None:
            csv_path = os.path.join(os.path.dirname(__file__), "disinfection_table.csv")

        self.csv_path = csv_path
        # Index: (species, strain) -> [(wavelength, DisinfectionData), ...]
        self._data: Dict[Tuple[str, str], List[Tuple[float, DisinfectionData]]] = {}
        # Track first strain for each species
        self._first_strain_per_species: Dict[str, str] = {}
        self._load_database()

    def _load_database(self) -> None:
        """Load the disinfection database from CSV file"""
        if not os.path.exists(self.csv_path):
            raise FileNotFoundError(f"Disinfection table not found at {self.csv_path}")

        with open(self.csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                try:
                    # Extract relevant columns
                    species = row.get('Species', '').strip()
                    strain = row.get('Strain', '').strip()
                    wavelength_str = row.get('wavelength [nm]', '').strip()
                    k1_str = row.get('k1 [cm2/mJ]', '').strip()
                    k2_str = row.get('k2 [cm2/mJ]', '').strip()
                    percent_resistant_str = row.get('% resistant', '').strip()

                    # Skip incomplete rows
                    if not all([species, strain, wavelength_str, k1_str]):
                        continue

                    wavelength_nm = float(wavelength_str)
                    k1 = float(k1_str)
                    k2 = float(k2_str) if k2_str else 0.0
                    percent_resistant = float(percent_resistant_str) if percent_resistant_str else 0.0

                    # Track first strain for each species
                    if species not in self._first_strain_per_species:
                        self._first_strain_per_species[species] = strain

                    # Only store data for the first strain of each species
                    if strain != self._first_strain_per_species[species]:
                        continue

                    # Create data object
                    data = DisinfectionData(species, strain, wavelength_nm, k1, k2, percent_resistant)

                    # Index by (species, strain)
                    key = (species, strain)
                    if key not in self._data:
                        self._data[key] = []
                    self._data[key].append((wavelength_nm, data))

                except (ValueError, KeyError) as e:
                    # Skip rows with invalid data
                    continue

        # Sort by wavelength for each species/strain combo for easier interpolation
        for key in self._data:
            self._data[key].sort(key=lambda x: x[0])

    def _linear_interpolate(self, wavelength_nm: float, values: List[Tuple[float, float]]) -> float:
        """
        Linearly interpolate a value at a given wavelength.

        Args:
            wavelength_nm: Target wavelength in nm
            values: List of (wavelength, value) tuples sorted by wavelength

        Returns:
            Interpolated value at the target wavelength
        """
        if not values:
            return 0.0

        # Handle edge cases
        if wavelength_nm <= values[0][0]:
            return values[0][1]
        if wavelength_nm >= values[-1][0]:
            return values[-1][1]

        # Find surrounding points
        for i in range(len(values) - 1):
            wl1, val1 = values[i]
            wl2, val2 = values[i + 1]

            if wl1 <= wavelength_nm <= wl2:
                # Linear interpolation
                t = (wavelength_nm - wl1) / (wl2 - wl1)
                return val1 + t * (val2 - val1)

        # Fallback (shouldn't reach here)
        return values[-1][1]

    def get_parameters_at_wavelength(self, species: str, wavelength_nm: float) -> Optional[Tuple[float, float, float]]:
        """
        Get k1, k2, and percent_resistant for a species at a given wavelength using linear interpolation.

        Args:
            species: Species name
            wavelength_nm: Wavelength in nanometers

        Returns:
            Tuple of (k1, k2, percent_resistant) or None if species not found
        """
        # Find the strain we're using for this species
        strain = self._first_strain_per_species.get(species)
        if strain is None:
            return None

        key = (species, strain)
        if key not in self._data:
            return None

        data_points = self._data[key]
        if not data_points:
            return None

        # Extract wavelengths and values
        wavelengths = [wl for wl, _ in data_points]
        k1_values = [(wl, data.k1) for wl, data in data_points]
        k2_values = [(wl, data.k2) for wl, data in data_points]
        percent_resistant_values = [(wl, data.percent_resistant) for wl, data in data_points]

        # Interpolate each parameter
        k1 = self._linear_interpolate(wavelength_nm, k1_values)
        k2 = self._linear_interpolate(wavelength_nm, k2_values)
        percent_resistant = self._linear_interpolate(wavelength_nm, percent_resistant_values)

        # Ensure bounds
        k1 = max(k1, 1e-6)  # k1 must be > 0
        k2 = max(k2, 0)  # k2 must be >= 0
        percent_resistant = max(0, min(100, percent_resistant))  # Bound to [0, 100]

        return k1, k2, percent_resistant

    def get_available_wavelengths_for_species(self, species: str) -> List[float]:
        """
        Get the available wavelengths for a species.

        Args:
            species: Species name

        Returns:
            List of available wavelengths in nm
        """
        strain = self._first_strain_per_species.get(species)
        if strain is None:
            return []

        key = (species, strain)
        if key not in self._data:
            return []

        return sorted([wl for wl, _ in self._data[key]])

    def list_available_species(self) -> List[str]:
        """Get list of all available species"""
        return sorted(list(self._first_strain_per_species.keys()))


# Global database instance
_db_instance: Optional[DisinfectionDatabase] = None


def get_disinfection_database(csv_path: Optional[str] = None) -> DisinfectionDatabase:
    """
    Get or create the global disinfection database instance.

    Args:
        csv_path: Path to disinfection_table.csv. Only used on first call.

    Returns:
        DisinfectionDatabase instance
    """
    global _db_instance
    if _db_instance is None:
        _db_instance = DisinfectionDatabase(csv_path)
    return _db_instance

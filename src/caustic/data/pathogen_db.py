"""Pathogen database management"""

import json
import os
from typing import List, Dict, Optional
from ..simulation import Pathogen


class PathogenDatabase:
    """Manages pathogen information from the database"""

    def __init__(self, db_path: Optional[str] = None):
        """
        Initialize the pathogen database.

        Args:
            db_path: Path to pathogens.json. If None, uses default location.
        """
        if db_path is None:
            # Use default location relative to this file
            db_path = os.path.join(os.path.dirname(__file__), "pathogens.json")

        self.db_path = db_path
        self._pathogens: Dict[str, Dict] = {}
        self._load_database()

    def _load_database(self) -> None:
        """Load the pathogen database from JSON file"""
        if not os.path.exists(self.db_path):
            raise FileNotFoundError(f"Pathogen database not found at {self.db_path}")

        with open(self.db_path, "r") as f:
            data = json.load(f)

        # Index pathogens by name for quick lookup
        for pathogen_data in data.get("pathogens", []):
            name = pathogen_data["name"]
            self._pathogens[name] = pathogen_data

    def get_pathogen(self, name: str) -> Pathogen:
        """
        Get a pathogen by name.

        Args:
            name: Name of the pathogen

        Returns:
            Pathogen object

        Raises:
            KeyError: If pathogen not found
        """
        if name not in self._pathogens:
            available = ", ".join(self._pathogens.keys())
            raise KeyError(
                f"Pathogen '{name}' not found. Available pathogens: {available}"
            )

        data = self._pathogens[name]
        return Pathogen(name=data["name"], k_value=data["k_value"])

    def get_pathogens_by_names(self, names: List[str]) -> List[Pathogen]:
        """
        Get multiple pathogens by name.

        Args:
            names: List of pathogen names

        Returns:
            List of Pathogen objects

        Raises:
            KeyError: If any pathogen not found
        """
        return [self.get_pathogen(name) for name in names]

    def list_all_pathogens(self) -> List[Pathogen]:
        """
        Get all available pathogens.

        Returns:
            List of all Pathogen objects in the database
        """
        return [
            Pathogen(name=data["name"], k_value=data["k_value"])
            for data in self._pathogens.values()
        ]

    def get_pathogen_info(self, name: str) -> Dict:
        """
        Get full pathogen information including description.

        Args:
            name: Name of the pathogen

        Returns:
            Dictionary with name, k_value, and description

        Raises:
            KeyError: If pathogen not found
        """
        if name not in self._pathogens:
            raise KeyError(f"Pathogen '{name}' not found")

        return self._pathogens[name].copy()

    def list_pathogen_names(self) -> List[str]:
        """Get list of all available pathogen names"""
        return list(self._pathogens.keys())

    def print_database(self) -> None:
        """Print a formatted list of all pathogens in the database"""
        print("Available Pathogens:")
        print("-" * 80)
        for name, data in self._pathogens.items():
            print(f"{name}")
            print(f"  k-value: {data['k_value']}")
            print(f"  Description: {data['description']}")
            print()


# Global database instance
_db_instance: Optional[PathogenDatabase] = None


def get_pathogen_database(db_path: Optional[str] = None) -> PathogenDatabase:
    """
    Get or create the global pathogen database instance.

    Args:
        db_path: Path to pathogens.json. Only used on first call.

    Returns:
        PathogenDatabase instance
    """
    global _db_instance
    if _db_instance is None:
        _db_instance = PathogenDatabase(db_path)
    return _db_instance

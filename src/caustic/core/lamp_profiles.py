"""Lamp intensity profiles with angular distribution data"""

import json
import os
from typing import Dict, Optional


class LampProfile:
    """Represents intensity distribution for a specific lamp type"""

    def __init__(self, name: str, wavelength_nm: float, intensity_samples: Dict[int, float], forward_intensity: float = None):
        self.name = name
        self.wavelength_nm = wavelength_nm
        self.intensity_samples = intensity_samples  # angle_deg -> intensity mapping
        self.forward_intensity = forward_intensity if forward_intensity is not None else intensity_samples.get(0, 1.0)
        # Pre-sort angles for interpolation
        self.sorted_angles = sorted(self.intensity_samples.keys())

    def get_intensity_at_angle(self, angle_degrees: float) -> float:
        """
        Get intensity at a given angle using linear interpolation.

        Args:
            angle_degrees: Angle in degrees (0-90)

        Returns:
            Interpolated intensity value
        """
        # Clamp angle to valid range
        angle_degrees = max(0, min(90, angle_degrees))

        # Find the two closest sample points
        if angle_degrees in self.intensity_samples:
            return self.intensity_samples[angle_degrees]

        # Find surrounding samples for interpolation
        lower_angle = None
        upper_angle = None

        for angle in self.sorted_angles:
            if angle <= angle_degrees:
                lower_angle = angle
            if angle >= angle_degrees and upper_angle is None:
                upper_angle = angle

        # Handle edge cases
        if lower_angle is None:
            return self.intensity_samples[self.sorted_angles[0]]
        if upper_angle is None:
            return self.intensity_samples[self.sorted_angles[-1]]

        # Linear interpolation
        if lower_angle == upper_angle:
            return self.intensity_samples[lower_angle]

        lower_intensity = self.intensity_samples[lower_angle]
        upper_intensity = self.intensity_samples[upper_angle]

        # Interpolation weight
        t = (angle_degrees - lower_angle) / (upper_angle - lower_angle)
        return lower_intensity + t * (upper_intensity - lower_intensity)


class LampProfileManager:
    """Manages all available lamp profiles"""

    def __init__(self):
        self.profiles: Dict[str, LampProfile] = {}
        self._load_profiles()

    def _load_profiles(self):
        """Load lamp profiles from JSON file"""
        # Get the path to the data file
        data_dir = os.path.join(os.path.dirname(__file__), '..', 'data')
        data_file = os.path.join(data_dir, 'lamp_intensity_data.json')

        if not os.path.exists(data_file):
            raise FileNotFoundError(f"Lamp intensity data file not found at {data_file}")

        with open(data_file, 'r') as f:
            data = json.load(f)

        # Parse each lamp type
        for lamp_id, lamp_data in data.items():
            # Convert string keys to int for angles
            intensity_samples = {}
            sample_key = 'intensity_samples_at_angle_deg'
            if sample_key not in lamp_data:
                sample_key = 'intensity_samples_at_phi_0deg'

            for angle_str, intensity in lamp_data[sample_key].items():
                intensity_samples[int(angle_str)] = float(intensity)

            profile = LampProfile(
                name=lamp_data['name'],
                wavelength_nm=lamp_data['wavelength_nm'],
                intensity_samples=intensity_samples,
                forward_intensity=lamp_data.get('forward_intensity')
            )
            self.profiles[lamp_id] = profile

    def get_profile(self, lamp_type: str) -> Optional[LampProfile]:
        """Get a lamp profile by type ID"""
        return self.profiles.get(lamp_type)

    def get_intensity_at_angle(self, lamp_type: str, angle_degrees: float) -> float:
        """Get intensity for a lamp type at a specific angle"""
        profile = self.get_profile(lamp_type)
        if profile is None:
            raise ValueError(f"Unknown lamp type: {lamp_type}")
        return profile.get_intensity_at_angle(angle_degrees)

    def get_available_lamps(self) -> Dict[str, str]:
        """Get dict of lamp_id -> lamp_name"""
        return {lamp_id: profile.name for lamp_id, profile in self.profiles.items()}


# Global instance
_lamp_manager = None


def get_lamp_manager() -> LampProfileManager:
    """Get or create the global lamp profile manager"""
    global _lamp_manager
    if _lamp_manager is None:
        _lamp_manager = LampProfileManager()
    return _lamp_manager

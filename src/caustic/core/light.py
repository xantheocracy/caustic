"""Light class for UV light sources"""

from .vector import Vector3


class Light:
    """
    Represents a directional point light source that emits light with angular distribution.
    """

    # Wavelengths for each lamp type (from lamp_intensity_data.json)
    LAMP_WAVELENGTHS = {
        'ushio_b1': 222.0,
        'aerolamp': 222.0,
        'beacon': 254.0,
    }

    def __init__(self, position: Vector3, intensity: float, lamp_type: str = 'ushio_b1', direction: Vector3 = None):
        self.position = position
        self.intensity = intensity  # Total radiant intensity (watts)
        self.lamp_type = lamp_type  # Type of lamp: 'ushio_b1', 'aerolamp', or 'beacon'
        self.direction = direction if direction is not None else Vector3(0, -1, 0)  # Direction light points (normalized)
        # Get wavelength from lamp type
        self.wavelength_nm = self.LAMP_WAVELENGTHS.get(lamp_type, 254.0)  # Default to 254 nm

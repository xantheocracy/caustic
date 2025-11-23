"""Light class for UV light sources"""

from .vector import Vector3


class Light:
    """
    Represents a directional point light source that emits light with angular distribution.
    """

    def __init__(self, position: Vector3, intensity: float, lamp_type: str = 'ushio_b1', direction: Vector3 = None):
        self.position = position
        self.intensity = intensity  # Total radiant intensity (watts)
        self.lamp_type = lamp_type  # Type of lamp: 'ushio_b1', 'aerolamp', or 'beacon'
        self.direction = direction if direction is not None else Vector3(0, -1, 0)  # Direction light points (normalized)

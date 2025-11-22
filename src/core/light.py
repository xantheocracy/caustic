"""Light class for UV light sources"""

from .vector import Vector3


class Light:
    """
    Represents a point light source that emits light in all directions.
    """

    def __init__(self, position: Vector3, intensity: float):
        self.position = position
        self.intensity = intensity  # Total radiant intensity (watts)

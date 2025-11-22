"""Ray class for raytracing"""

from .vector import Vector3


class Ray:
    """
    Represents a ray in 3D space, defined by an origin point and a direction.
    """

    def __init__(self, origin: Vector3, direction: Vector3):
        self.origin = origin
        # Normalize the direction
        self.direction = direction.normalize()

    def get_point(self, t: float) -> Vector3:
        """Get a point along the ray at parameter t"""
        return self.origin.add(self.direction.multiply(t))

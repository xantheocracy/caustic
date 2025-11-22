"""Triangle class for 3D geometry"""

from .vector import Vector3


class Triangle:
    """
    Represents a triangle in 3D space.
    Vertices should be ordered counter-clockwise when viewed from the front (outward-facing side).
    """

    def __init__(self, v0: Vector3, v1: Vector3, v2: Vector3, reflectivity: float = 0.5):
        self.v0 = v0
        self.v1 = v1
        self.v2 = v2
        self.reflectivity = reflectivity

        # Calculate normal using cross product
        edge1 = v1.subtract(v0)
        edge2 = v2.subtract(v0)
        self.normal = edge1.cross(edge2).normalize()

    def get_center(self) -> Vector3:
        """Get the center point of the triangle"""
        return Vector3(
            (self.v0.x + self.v1.x + self.v2.x) / 3,
            (self.v0.y + self.v1.y + self.v2.y) / 3,
            (self.v0.z + self.v1.z + self.v2.z) / 3,
        )

    def get_bounds(self):
        """Get bounding box of the triangle"""
        return {
            "minX": min(self.v0.x, self.v1.x, self.v2.x),
            "maxX": max(self.v0.x, self.v1.x, self.v2.x),
            "minY": min(self.v0.y, self.v1.y, self.v2.y),
            "maxY": max(self.v0.y, self.v1.y, self.v2.y),
            "minZ": min(self.v0.z, self.v1.z, self.v2.z),
            "maxZ": max(self.v0.z, self.v1.z, self.v2.z),
        }

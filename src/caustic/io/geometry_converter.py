"""Converts parsed OBJ data into Triangle objects"""

from typing import List, Tuple
from ..core import Vector3, Triangle


class GeometryConverter:
    """Converts raw vertex and face data into Triangle objects"""

    @staticmethod
    def convert(
        vertices: List[Tuple[float, float, float]],
        faces: List[List[int]],
        scale: float = 1.0,
        reflectivity: float = 0.5,
        swap_yz: bool = False,
    ) -> List[Triangle]:
        """
        Convert vertex and face data into Triangle objects.

        Args:
            vertices: List of (x, y, z) vertex coordinates
            faces: List of faces, each face is a list of vertex indices
            scale: Scale factor to apply to all vertices
            reflectivity: Default reflectivity value for all triangles
            swap_yz: If True, swap Y and Z coordinates (useful for coordinate system conversion)

        Returns:
            List of Triangle objects ready for simulation
        """
        triangles: List[Triangle] = []

        for face in faces:
            if len(face) != 3:
                raise ValueError(f"Face must have exactly 3 vertices, got {len(face)}")

            # Get vertices for this triangle
            v0_coords = vertices[face[0]]
            v1_coords = vertices[face[1]]
            v2_coords = vertices[face[2]]

            # Convert to Vector3 objects with scaling and coordinate conversion
            v0 = GeometryConverter._to_vector3(v0_coords, scale, swap_yz)
            v1 = GeometryConverter._to_vector3(v1_coords, scale, swap_yz)
            v2 = GeometryConverter._to_vector3(v2_coords, scale, swap_yz)

            # Create triangle
            triangle = Triangle(v0, v1, v2, reflectivity)
            triangles.append(triangle)

        return triangles

    @staticmethod
    def _to_vector3(
        coords: Tuple[float, float, float], scale: float = 1.0, swap_yz: bool = False
    ) -> Vector3:
        """
        Convert a coordinate tuple to a Vector3 object.

        Args:
            coords: (x, y, z) coordinate tuple
            scale: Scale factor to apply
            swap_yz: If True, swap Y and Z coordinates

        Returns:
            Vector3 object
        """
        x, y, z = coords
        x *= scale
        y *= scale
        z *= scale

        if swap_yz:
            return Vector3(x, z, y)
        else:
            return Vector3(x, y, z)

"""High-level interface for importing 3D scenes from OBJ files"""

from typing import List
from ..core import Triangle
from .obj_parser import OBJParser, OBJParseError
from .geometry_converter import GeometryConverter


class SceneImporter:
    """High-level interface for importing OBJ files into Triangle objects"""

    @staticmethod
    def import_obj(
        filepath: str,
        scale: float = 1.0,
        reflectivity: float = 0.5,
        swap_yz: bool = False,
    ) -> List[Triangle]:
        """
        Import an OBJ file and convert it to Triangle objects.

        This is the main entry point for loading 3D models.

        Args:
            filepath: Path to the OBJ file
            scale: Scale factor to apply to all vertices (default: 1.0)
            reflectivity: Default reflectivity value for all triangles (default: 0.5)
            swap_yz: If True, swap Y and Z coordinates. Useful when converting from
                     Z-up coordinate systems (like Blender) to Y-up systems (default: False)

        Returns:
            List of Triangle objects ready for simulation

        Raises:
            OBJParseError: If the OBJ file cannot be parsed

        Example:
            >>> triangles = SceneImporter.import_obj("model.obj", scale=0.01)
            >>> # Now you have a list of Triangle objects ready for simulation
        """
        try:
            # Parse OBJ file
            vertices, faces = OBJParser.parse(filepath)

            if not vertices:
                raise OBJParseError("No vertices found in OBJ file")
            if not faces:
                raise OBJParseError("No faces found in OBJ file")

            # Convert to Triangle objects
            triangles = GeometryConverter.convert(
                vertices, faces, scale=scale, reflectivity=reflectivity, swap_yz=swap_yz
            )

            return triangles

        except OBJParseError as e:
            raise OBJParseError(f"Failed to import OBJ file '{filepath}': {e}")

"""Parser for OBJ file format"""

from typing import List, Tuple


class OBJParseError(Exception):
    """Exception raised when OBJ parsing fails"""

    pass


class OBJParser:
    """Parses OBJ files and extracts vertex and face data"""

    @staticmethod
    def parse(filepath: str) -> Tuple[List[Tuple[float, float, float]], List[List[int]]]:
        """
        Parse an OBJ file and extract vertices and faces.

        Args:
            filepath: Path to the OBJ file

        Returns:
            Tuple of (vertices, faces) where:
            - vertices: List of (x, y, z) tuples
            - faces: List of face definitions, each face is a list of vertex indices (0-indexed)

        Raises:
            OBJParseError: If the file cannot be parsed
        """
        vertices: List[Tuple[float, float, float]] = []
        faces: List[List[int]] = []

        try:
            with open(filepath, "r") as f:
                for line_num, line in enumerate(f, start=1):
                    line = line.strip()

                    # Skip empty lines and comments
                    if not line or line.startswith("#"):
                        continue

                    parts = line.split()
                    if not parts:
                        continue

                    command = parts[0]

                    # Parse vertex
                    if command == "v":
                        if len(parts) < 4:
                            raise OBJParseError(
                                f"Line {line_num}: Vertex must have 3 coordinates, got {len(parts) - 1}"
                            )
                        try:
                            x, y, z = float(parts[1]), float(parts[2]), float(parts[3])
                            vertices.append((x, y, z))
                        except ValueError as e:
                            raise OBJParseError(
                                f"Line {line_num}: Invalid vertex coordinates: {e}"
                            )

                    # Parse face
                    elif command == "f":
                        if len(parts) < 4:
                            raise OBJParseError(
                                f"Line {line_num}: Face must have at least 3 vertices, got {len(parts) - 1}"
                            )

                        try:
                            # Extract vertex indices (ignore texture/normal indices if present)
                            face_indices = []
                            for i in range(1, len(parts)):
                                vertex_data = parts[i].split("/")
                                vertex_index = int(vertex_data[0]) - 1  # OBJ uses 1-based indexing

                                if vertex_index < 0 or vertex_index >= len(vertices):
                                    raise OBJParseError(
                                        f"Line {line_num}: Vertex index {vertex_index + 1} out of range"
                                    )

                                face_indices.append(vertex_index)

                            # Triangulate if needed (convert quads/n-gons to triangles)
                            OBJParser._triangulate_face(face_indices, faces)

                        except (ValueError, IndexError) as e:
                            raise OBJParseError(f"Line {line_num}: Invalid face definition: {e}")

        except FileNotFoundError:
            raise OBJParseError(f"File not found: {filepath}")
        except IOError as e:
            raise OBJParseError(f"Error reading file: {e}")

        return vertices, faces

    @staticmethod
    def _triangulate_face(face_indices: List[int], faces: List[List[int]]) -> None:
        """
        Convert a face (which may have 4+ vertices) into triangles.
        Uses fan triangulation from the first vertex.

        Args:
            face_indices: List of vertex indices for the face
            faces: List to append triangulated faces to
        """
        if len(face_indices) == 3:
            # Already a triangle
            faces.append(face_indices)
        elif len(face_indices) > 3:
            # Triangulate using fan method: split n-gon into n-2 triangles
            # All triangles share the first vertex
            for i in range(1, len(face_indices) - 1):
                faces.append([face_indices[0], face_indices[i], face_indices[i + 1]])

"""Spatial grid for fast triangle lookup during raytracing"""

from typing import Dict, Set, Tuple, List
from ..core import Vector3, Triangle, Ray


class SpatialGrid:
    """
    Spatial grid for fast triangle lookup during raytracing.
    Divides 3D space into a uniform grid of cubes, with each cell containing
    a list of triangles that could potentially intersect with that cell.
    """

    def __init__(self, triangles: List[Triangle], cell_size: float = 10):
        self.cell_size = cell_size
        self.grid: Dict[str, List[Triangle]] = {}
        self._build_grid(triangles)

    def _build_grid(self, triangles: List[Triangle]) -> None:
        """Build the spatial grid from triangles"""
        for triangle in triangles:
            bounds = triangle.get_bounds()
            min_cell = self._position_to_cell(
                Vector3(bounds["minX"], bounds["minY"], bounds["minZ"])
            )
            max_cell = self._position_to_cell(
                Vector3(bounds["maxX"], bounds["maxY"], bounds["maxZ"])
            )

            # Add triangle to all cells it intersects
            for x in range(min_cell[0], max_cell[0] + 1):
                for y in range(min_cell[1], max_cell[1] + 1):
                    for z in range(min_cell[2], max_cell[2] + 1):
                        key = self._get_cell_key(x, y, z)
                        if key not in self.grid:
                            self.grid[key] = []
                        self.grid[key].append(triangle)

    def _position_to_cell(self, pos: Vector3) -> Tuple[int, int, int]:
        """Convert a 3D position to a grid cell coordinate"""
        return (
            int(pos.x // self.cell_size),
            int(pos.y // self.cell_size),
            int(pos.z // self.cell_size),
        )

    def _get_cell_key(self, x: int, y: int, z: int) -> str:
        """Get string key for a grid cell"""
        return f"{x},{y},{z}"

    def get_triangles_along_ray(self, ray: Ray, max_distance: float) -> List[Triangle]:
        """
        Get all triangles that could potentially intersect with a ray.
        Uses a 3D grid traversal algorithm (DDA-like) to find relevant cells.
        """
        triangles: Set[Triangle] = set()
        visited: Set[str] = set()

        # Start from the ray origin
        current_pos = ray.origin.clone()
        step_size = self.cell_size * 0.5  # Step size along the ray

        # Trace along the ray and collect triangles from intersected cells
        distance = 0
        while distance < max_distance:
            current_cell = self._position_to_cell(current_pos)
            key = self._get_cell_key(current_cell[0], current_cell[1], current_cell[2])

            if key not in visited:
                visited.add(key)
                if key in self.grid:
                    for tri in self.grid[key]:
                        triangles.add(tri)

            distance += step_size
            current_pos = ray.get_point(distance)

        # Also check final position
        final_cell = self._position_to_cell(ray.get_point(max_distance))
        final_key = self._get_cell_key(final_cell[0], final_cell[1], final_cell[2])
        if final_key not in visited and final_key in self.grid:
            for tri in self.grid[final_key]:
                triangles.add(tri)

        return list(triangles)

    def get_cell(self, x: int, y: int, z: int) -> List[Triangle]:
        """Get all triangles in a specific cell"""
        key = self._get_cell_key(x, y, z)
        return self.grid.get(key, [])

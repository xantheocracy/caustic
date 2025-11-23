"""Spatial grid for fast triangle lookup during raytracing"""

from typing import Dict, Set, Tuple, List
import math
from ..core import Vector3, Triangle, Ray


def calculate_optimal_cell_size(triangles: List[Triangle]) -> float:
    """
    Calculate optimal cell size based on mesh statistics.
    Uses the heuristic: optimal_size = 2-4x average triangle size

    For best results, uses the average bounding box diagonal.
    """
    if not triangles:
        return 10.0  # Default fallback

    total_size = 0.0
    for tri in triangles:
        bounds = tri.get_bounds()
        dx = bounds["maxX"] - bounds["minX"]
        dy = bounds["maxY"] - bounds["minY"]
        dz = bounds["maxZ"] - bounds["minZ"]
        diagonal = math.sqrt(dx*dx + dy*dy + dz*dz)
        total_size += diagonal

    avg_size = total_size / len(triangles)
    optimal = avg_size * 2.5  # Midpoint of 2-4x heuristic

    # Clamp to reasonable range
    optimal = max(0.1, min(optimal, 100.0))

    return optimal


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
        Uses 3D DDA (Digital Differential Analyzer) grid traversal for efficiency.
        Only visits cells that the ray actually intersects.
        """
        triangles: Set[Triangle] = set()
        visited: Set[str] = set()

        # Normalize ray direction
        direction = ray.direction.normalize()

        # Get start and end cells
        start_cell = self._position_to_cell(ray.origin)
        end_pos = ray.origin.add(direction.multiply(max_distance))
        end_cell = self._position_to_cell(end_pos)

        # DDA traversal: step through cells in order
        # Determine step direction for each axis
        step_x = 1 if direction.x >= 0 else -1
        step_y = 1 if direction.y >= 0 else -1
        step_z = 1 if direction.z >= 0 else -1

        # Calculate parametric t values for next grid boundaries
        # t_max represents how far along the ray we need to go to exit the current cell
        if direction.x != 0:
            if step_x > 0:
                t_max_x = (self.cell_size * (start_cell[0] + 1) - ray.origin.x) / direction.x
            else:
                t_max_x = (self.cell_size * start_cell[0] - ray.origin.x) / direction.x
            t_delta_x = self.cell_size / abs(direction.x)
        else:
            t_max_x = float('inf')
            t_delta_x = float('inf')

        if direction.y != 0:
            if step_y > 0:
                t_max_y = (self.cell_size * (start_cell[1] + 1) - ray.origin.y) / direction.y
            else:
                t_max_y = (self.cell_size * start_cell[1] - ray.origin.y) / direction.y
            t_delta_y = self.cell_size / abs(direction.y)
        else:
            t_max_y = float('inf')
            t_delta_y = float('inf')

        if direction.z != 0:
            if step_z > 0:
                t_max_z = (self.cell_size * (start_cell[2] + 1) - ray.origin.z) / direction.z
            else:
                t_max_z = (self.cell_size * start_cell[2] - ray.origin.z) / direction.z
            t_delta_z = self.cell_size / abs(direction.z)
        else:
            t_max_z = float('inf')
            t_delta_z = float('inf')

        # Traverse cells along the ray
        current_cell = start_cell
        t = 0.0
        while t < max_distance:
            # Add triangles from current cell
            key = self._get_cell_key(current_cell[0], current_cell[1], current_cell[2])
            if key not in visited:
                visited.add(key)
                if key in self.grid:
                    for tri in self.grid[key]:
                        triangles.add(tri)

            # Find next cell by stepping to nearest boundary
            if t_max_x < t_max_y:
                if t_max_x < t_max_z:
                    # Step along x
                    t = t_max_x
                    if t >= max_distance:
                        break
                    current_cell = (current_cell[0] + step_x, current_cell[1], current_cell[2])
                    t_max_x += t_delta_x
                else:
                    # Step along z
                    t = t_max_z
                    if t >= max_distance:
                        break
                    current_cell = (current_cell[0], current_cell[1], current_cell[2] + step_z)
                    t_max_z += t_delta_z
            else:
                if t_max_y < t_max_z:
                    # Step along y
                    t = t_max_y
                    if t >= max_distance:
                        break
                    current_cell = (current_cell[0], current_cell[1] + step_y, current_cell[2])
                    t_max_y += t_delta_y
                else:
                    # Step along z
                    t = t_max_z
                    if t >= max_distance:
                        break
                    current_cell = (current_cell[0], current_cell[1], current_cell[2] + step_z)
                    t_max_z += t_delta_z

        return list(triangles)

    def get_cell(self, x: int, y: int, z: int) -> List[Triangle]:
        """Get all triangles in a specific cell"""
        key = self._get_cell_key(x, y, z)
        return self.grid.get(key, [])

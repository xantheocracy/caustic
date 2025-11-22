"""Main raytracing engine"""

from typing import List
from ..core import Vector3, Triangle, Ray
from ..spatial import SpatialGrid
from .intersect import ray_triangle_intersection


class Tracer:
    """Main raytracing engine for determining if light can reach a point."""

    def __init__(self, triangles: List[Triangle], grid_cell_size: float = 10):
        self.grid = SpatialGrid(triangles, grid_cell_size)

    def is_path_clear(self, origin: Vector3, target: Vector3) -> bool:
        """
        Cast a ray and determine if it hits any triangle before reaching a target distance.
        Returns True if the path is clear (no obstructions), False if blocked.
        """
        direction = target.subtract(origin)
        distance = direction.length()

        if distance < 1e-6:
            return True  # Points are essentially the same

        ray = Ray(origin, direction)

        # Get candidate triangles from spatial grid
        candidates = self.grid.get_triangles_along_ray(ray, distance)

        # Check for intersections with any triangle
        for triangle in candidates:
            result = ray_triangle_intersection(ray, triangle)
            if result.hit and result.distance < distance - 1e-6:
                # Triangle blocks the path (intersection is before the target)
                return False

        return True  # Path is clear

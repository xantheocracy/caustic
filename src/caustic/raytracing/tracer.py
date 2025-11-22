"""Main raytracing engine"""

from typing import List, NamedTuple, Optional
from ..core import Vector3, Triangle, Ray
from ..spatial import SpatialGrid
from .intersect import ray_triangle_intersection


class RayHit(NamedTuple):
    """Result of a ray-mesh intersection query"""
    hit: bool
    distance: float
    point: Vector3
    triangle: Optional[Triangle] = None


class Tracer:
    """Main raytracing engine for determining if light can reach a point."""

    def __init__(self, triangles: List[Triangle], grid_cell_size: float = 10):
        self.grid = SpatialGrid(triangles, grid_cell_size)
        self.triangles = triangles

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

    def trace_ray(self, origin: Vector3, direction: Vector3, max_distance: Optional[float] = None) -> RayHit:
        """
        Cast a ray and find the closest intersection with any triangle.
        Returns information about the hit point (position and triangle).

        Args:
            origin: Ray starting point
            direction: Ray direction (will be normalized)
            max_distance: Optional maximum distance to trace (if None, use 10000)

        Returns:
            RayHit with hit information and the intersected triangle
        """
        normalized_dir = direction.normalize()
        ray = Ray(origin, normalized_dir)

        closest_hit = RayHit(hit=False, distance=float('inf'), point=Vector3(0, 0, 0), triangle=None)

        # Use a reasonable default if no max_distance specified
        trace_distance = max_distance if max_distance is not None else 10000.0

        # Get candidate triangles from spatial grid
        candidates = self.grid.get_triangles_along_ray(ray, trace_distance)

        # Check all candidates and find closest hit
        for triangle in candidates:
            result = ray_triangle_intersection(ray, triangle)
            if result.hit:
                if result.distance < closest_hit.distance:
                    closest_hit = RayHit(
                        hit=True,
                        distance=result.distance,
                        point=result.point,
                        triangle=triangle
                    )

        return closest_hit

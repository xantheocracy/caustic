"""Ray-triangle intersection testing"""

from typing import NamedTuple
from ..core import Vector3, Triangle, Ray

EPSILON = 1e-6


class IntersectionResult(NamedTuple):
    """Result of a ray-triangle intersection test"""

    hit: bool
    distance: float  # Distance along the ray to the intersection point
    point: Vector3  # The intersection point in 3D space


def ray_triangle_intersection(ray: Ray, triangle: Triangle) -> IntersectionResult:
    """
    Test if a ray intersects with a triangle using the Möller-Trumbore algorithm.
    Only returns true if the triangle is facing towards the ray (not away from it).
    """
    edge1 = triangle.v1.subtract(triangle.v0)
    edge2 = triangle.v2.subtract(triangle.v0)

    h = ray.direction.cross(edge2)
    a = edge1.dot(h)

    # If a is close to zero, the ray is parallel to the triangle
    if abs(a) < EPSILON:
        return IntersectionResult(False, 0, Vector3(0, 0, 0))

    f = 1.0 / a
    s = ray.origin.subtract(triangle.v0)
    u = f * s.dot(h)

    # Check if intersection is outside the triangle
    if u < 0.0 or u > 1.0:
        return IntersectionResult(False, 0, Vector3(0, 0, 0))

    q = s.cross(edge1)
    v = f * ray.direction.dot(q)

    # Check if intersection is outside the triangle
    if v < 0.0 or u + v > 1.0:
        return IntersectionResult(False, 0, Vector3(0, 0, 0))

    t = f * edge2.dot(q)

    # Only consider intersections in front of the ray
    if t < EPSILON:
        return IntersectionResult(False, 0, Vector3(0, 0, 0))

    # Check if triangle is facing the ray (using normal direction)
    ray_to_surface = triangle.get_center().subtract(ray.origin).normalize()
    facing_dot = triangle.normal.dot(ray_to_surface)

    # Only count as hit if triangle is facing towards the ray
    if facing_dot < 0:
        return IntersectionResult(False, 0, Vector3(0, 0, 0))

    point = ray.get_point(t)
    return IntersectionResult(True, t, point)

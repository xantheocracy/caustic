import { Triangle } from '../core/triangle';
import { Ray } from '../core/ray';
import { Vector3 } from '../core/vector';

/**
 * Result of a ray-triangle intersection test
 */
export interface IntersectionResult {
  hit: boolean;
  distance: number; // Distance along the ray to the intersection point
  point: Vector3; // The intersection point in 3D space
}

const EPSILON = 1e-6;

/**
 * Test if a ray intersects with a triangle using the Möller-Trumbore algorithm.
 * Only returns true if the triangle is facing towards the ray (not away from it).
 */
export function rayTriangleIntersection(
  ray: Ray,
  triangle: Triangle
): IntersectionResult {
  const edge1 = triangle.v1.subtract(triangle.v0);
  const edge2 = triangle.v2.subtract(triangle.v0);

  const h = ray.direction.cross(edge2);
  const a = edge1.dot(h);

  // If a is close to zero, the ray is parallel to the triangle
  if (Math.abs(a) < EPSILON) {
    return { hit: false, distance: 0, point: new Vector3(0, 0, 0) };
  }

  const f = 1.0 / a;
  const s = ray.origin.subtract(triangle.v0);
  const u = f * s.dot(h);

  // Check if intersection is outside the triangle
  if (u < 0.0 || u > 1.0) {
    return { hit: false, distance: 0, point: new Vector3(0, 0, 0) };
  }

  const q = s.cross(edge1);
  const v = f * ray.direction.dot(q);

  // Check if intersection is outside the triangle
  if (v < 0.0 || u + v > 1.0) {
    return { hit: false, distance: 0, point: new Vector3(0, 0, 0) };
  }

  const t = f * edge2.dot(q);

  // Only consider intersections in front of the ray
  if (t < EPSILON) {
    return { hit: false, distance: 0, point: new Vector3(0, 0, 0) };
  }

  // Check if triangle is facing the ray (using normal direction)
  // The ray should be hitting the front face (where normal points outward)
  const rayToSurface = triangle.getCenter().subtract(ray.origin).normalize();
  const facingDot = triangle.normal.dot(rayToSurface);

  // Only count as hit if triangle is facing towards the ray
  if (facingDot < 0) {
    return { hit: false, distance: 0, point: new Vector3(0, 0, 0) };
  }

  const point = ray.getPoint(t);
  return { hit: true, distance: t, point };
}

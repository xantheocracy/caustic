import { Vector3 } from './vector';

/**
 * Represents a ray in 3D space, defined by an origin point and a direction.
 */
export class Ray {
  public direction: Vector3;

  constructor(public origin: Vector3, direction: Vector3) {
    // Normalize the direction
    this.direction = direction.normalize();
  }

  /**
   * Get a point along the ray at parameter t
   */
  getPoint(t: number): Vector3 {
    return this.origin.add(this.direction.multiply(t));
  }
}

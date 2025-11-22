import { Vector3 } from './vector';

/**
 * Represents a triangle in 3D space.
 * Vertices should be ordered counter-clockwise when viewed from the front (outward-facing side).
 */
export class Triangle {
  public normal: Vector3;

  constructor(
    public v0: Vector3,
    public v1: Vector3,
    public v2: Vector3,
    public reflectivity: number = 0.5 // For future reflection support (0-1)
  ) {
    // Calculate normal using cross product
    const edge1 = v1.subtract(v0);
    const edge2 = v2.subtract(v0);
    this.normal = edge1.cross(edge2).normalize();
  }

  /**
   * Get the center point of the triangle
   */
  getCenter(): Vector3 {
    return new Vector3(
      (this.v0.x + this.v1.x + this.v2.x) / 3,
      (this.v0.y + this.v1.y + this.v2.y) / 3,
      (this.v0.z + this.v1.z + this.v2.z) / 3
    );
  }

  /**
   * Get bounding box of the triangle
   */
  getBounds(): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  } {
    return {
      minX: Math.min(this.v0.x, this.v1.x, this.v2.x),
      maxX: Math.max(this.v0.x, this.v1.x, this.v2.x),
      minY: Math.min(this.v0.y, this.v1.y, this.v2.y),
      maxY: Math.max(this.v0.y, this.v1.y, this.v2.y),
      minZ: Math.min(this.v0.z, this.v1.z, this.v2.z),
      maxZ: Math.max(this.v0.z, this.v1.z, this.v2.z),
    };
  }
}

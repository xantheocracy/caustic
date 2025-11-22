import { Ray } from '../core/ray';
import { Triangle } from '../core/triangle';
import { Vector3 } from '../core/vector';
import { rayTriangleIntersection, IntersectionResult } from './intersect';
import { SpatialGrid } from '../spatial/grid';

/**
 * Main raytracing engine for determining if light can reach a point.
 */
export class Tracer {
  private grid: SpatialGrid;

  constructor(triangles: Triangle[], gridCellSize: number = 10) {
    this.grid = new SpatialGrid(triangles, gridCellSize);
  }

  /**
   * Cast a ray and determine if it hits any triangle before reaching a target distance.
   * Returns true if the path is clear (no obstructions), false if blocked.
   */
  isPathClear(origin: Vector3, target: Vector3): boolean {
    const direction = target.subtract(origin);
    const distance = direction.length();

    if (distance < 1e-6) {
      return true; // Points are essentially the same
    }

    const ray = new Ray(origin, direction);

    // Get candidate triangles from spatial grid
    const candidates = this.grid.getTrianglesAlongRay(ray, distance);

    // Check for intersections with any triangle
    for (const triangle of candidates) {
      const result = rayTriangleIntersection(ray, triangle);
      if (result.hit && result.distance < distance - 1e-6) {
        // Triangle blocks the path (intersection is before the target)
        return false;
      }
    }

    return true; // Path is clear
  }
}

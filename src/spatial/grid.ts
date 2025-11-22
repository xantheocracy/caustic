import { Triangle } from '../core/triangle';
import { Vector3 } from '../core/vector';
import { Ray } from '../core/ray';

/**
 * Represents a single cell in the spatial grid
 */
interface GridCell {
  triangles: Triangle[];
}

/**
 * Spatial grid for fast triangle lookup during raytracing.
 * Divides 3D space into a uniform grid of cubes, with each cell containing
 * a list of triangles that could potentially intersect with that cell.
 */
export class SpatialGrid {
  private grid: Map<string, GridCell> = new Map();
  private cellSize: number;

  constructor(triangles: Triangle[], cellSize: number = 10) {
    this.cellSize = cellSize;
    this.buildGrid(triangles);
  }

  /**
   * Build the spatial grid from triangles
   */
  private buildGrid(triangles: Triangle[]): void {
    for (const triangle of triangles) {
      const bounds = triangle.getBounds();
      const minCell = this.positionToCell(
        new Vector3(bounds.minX, bounds.minY, bounds.minZ)
      );
      const maxCell = this.positionToCell(
        new Vector3(bounds.maxX, bounds.maxY, bounds.maxZ)
      );

      // Add triangle to all cells it intersects
      for (let x = minCell.x; x <= maxCell.x; x++) {
        for (let y = minCell.y; y <= maxCell.y; y++) {
          for (let z = minCell.z; z <= maxCell.z; z++) {
            const key = this.getCellKey(x, y, z);
            if (!this.grid.has(key)) {
              this.grid.set(key, { triangles: [] });
            }
            this.grid.get(key)!.triangles.push(triangle);
          }
        }
      }
    }
  }

  /**
   * Convert a 3D position to a grid cell coordinate
   */
  private positionToCell(pos: Vector3): { x: number; y: number; z: number } {
    return {
      x: Math.floor(pos.x / this.cellSize),
      y: Math.floor(pos.y / this.cellSize),
      z: Math.floor(pos.z / this.cellSize),
    };
  }

  /**
   * Get string key for a grid cell
   */
  private getCellKey(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  /**
   * Get all triangles that could potentially intersect with a ray.
   * Uses a 3D grid traversal algorithm (DDA-like) to find relevant cells.
   */
  getTrianglesAlongRay(ray: Ray, maxDistance: number): Triangle[] {
    const triangles = new Set<Triangle>();
    const visited = new Set<string>();

    // Start from the ray origin
    let currentPos = ray.origin.clone();
    const stepSize = this.cellSize * 0.5; // Step size along the ray

    // Trace along the ray and collect triangles from intersected cells
    for (let distance = 0; distance < maxDistance; distance += stepSize) {
      const currentCell = this.positionToCell(currentPos);
      const key = this.getCellKey(currentCell.x, currentCell.y, currentCell.z);

      if (!visited.has(key)) {
        visited.add(key);
        const cell = this.grid.get(key);
        if (cell) {
          cell.triangles.forEach((tri) => triangles.add(tri));
        }
      }

      currentPos = ray.getPoint(distance);
    }

    // Also check final position
    const finalCell = this.positionToCell(ray.getPoint(maxDistance));
    const finalKey = this.getCellKey(finalCell.x, finalCell.y, finalCell.z);
    if (!visited.has(finalKey)) {
      const cell = this.grid.get(finalKey);
      if (cell) {
        cell.triangles.forEach((tri) => triangles.add(tri));
      }
    }

    return Array.from(triangles);
  }

  /**
   * Get all triangles in a specific cell
   */
  getCell(x: number, y: number, z: number): Triangle[] {
    const key = this.getCellKey(x, y, z);
    return this.grid.get(key)?.triangles ?? [];
  }
}

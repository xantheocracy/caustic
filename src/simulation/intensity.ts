import { Vector3 } from '../core/vector';
import { Light } from '../core/light';
import { Triangle } from '../core/triangle';
import { Tracer } from '../raytracing/tracer';

/**
 * Configuration for intensity calculation
 */
export interface IntensityConfig {
  maxBounces: number; // Maximum number of reflection bounces (0 for direct only)
  gridCellSize: number; // Cell size for spatial grid optimization
}

/**
 * Results of intensity calculation at a point
 */
export interface IntensityResult {
  directIntensity: number; // Direct intensity from lights
  totalIntensity: number; // Total intensity including reflections
}

/**
 * Calculates UV light intensity at given points, accounting for direct light
 * and optionally reflections from surfaces.
 */
export class IntensityCalculator {
  private tracer: Tracer;

  constructor(triangles: Triangle[], config: IntensityConfig) {
    this.tracer = new Tracer(triangles, config.gridCellSize);
  }

  /**
   * Calculate light intensity at a given point from all lights.
   * Currently implements direct lighting only (no reflections).
   */
  calculateIntensity(point: Vector3, lights: Light[]): IntensityResult {
    let directIntensity = 0;

    for (const light of lights) {
      directIntensity += this.calculateDirectIntensity(point, light);
    }

    // For now, total intensity is same as direct (no reflections)
    return {
      directIntensity,
      totalIntensity: directIntensity,
    };
  }

  /**
   * Calculate intensity contribution from a single light at a point.
   * Uses inverse square law: intensity = lightIntensity / (4π × distance²)
   */
  private calculateDirectIntensity(point: Vector3, light: Light): number {
    const direction = light.position.subtract(point);
    const distance = direction.length();

    if (distance < 1e-6) {
      return 0; // Point is at the light source
    }

    // Check if there's a direct line of sight to the light
    if (!this.tracer.isPathClear(point, light.position)) {
      return 0; // Light is blocked
    }

    // Apply inverse square law
    // Irradiance at distance d from point source of intensity I:
    // E = I / (4π × d²)
    const intensity = light.intensity / (4 * Math.PI * distance * distance);

    return intensity;
  }
}

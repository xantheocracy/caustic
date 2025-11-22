import { Vector3 } from './core/vector';
import { Triangle } from './core/triangle';
import { Light } from './core/light';
import { IntensityCalculator, IntensityResult } from './simulation/intensity';
import { PathogenCalculator, Pathogen, PathogenSurvivalResult } from './simulation/pathogen';

/**
 * Main simulation configuration
 */
export interface SimulationConfig {
  maxBounces: number;
  gridCellSize: number;
}

/**
 * Results for a single evaluation point
 */
export interface PointResults {
  position: Vector3;
  intensity: IntensityResult;
  pathogenSurvival: PathogenSurvivalResult[];
}

/**
 * Main UV light simulator class
 */
export class UVLightSimulator {
  private intensityCalculator: IntensityCalculator;
  private pathogenCalculator: PathogenCalculator;
  private triangles: Triangle[];
  private lights: Light[];

  constructor(
    triangles: Triangle[],
    lights: Light[],
    config: SimulationConfig = { maxBounces: 0, gridCellSize: 10 }
  ) {
    this.triangles = triangles;
    this.lights = lights;
    this.intensityCalculator = new IntensityCalculator(triangles, {
      maxBounces: config.maxBounces,
      gridCellSize: config.gridCellSize,
    });
    this.pathogenCalculator = new PathogenCalculator();
  }

  /**
   * Simulate UV exposure at specified points over a given time period.
   */
  simulate(
    points: Vector3[],
    pathogens: Pathogen[],
    exposureTime: number
  ): PointResults[] {
    return points.map((point) => {
      // Stage 1: Calculate intensity
      const intensity = this.intensityCalculator.calculateIntensity(
        point,
        this.lights
      );

      // Stage 2: Calculate pathogen survival
      const pathogenSurvival = this.pathogenCalculator.calculateMultipleSurvivals(
        intensity.totalIntensity,
        exposureTime,
        pathogens
      );

      return {
        position: point,
        intensity,
        pathogenSurvival,
      };
    });
  }
}

// Export all core types and classes
export { Vector3, Triangle, Light };
export { Pathogen, PathogenSurvivalResult };
export { IntensityResult };

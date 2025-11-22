/**
 * Represents a pathogen with its Chick-Watson model parameters
 */
export interface Pathogen {
  name: string;
  kValue: number; // Chick-Watson k value (resistance to UV, higher = more resistant)
}

/**
 * Results of pathogen survival calculation
 */
export interface PathogenSurvivalResult {
  pathogenName: string;
  kValue: number;
  dose: number; // Irradiance × time (J/m²)
  survivalRate: number; // Fraction of pathogens surviving (0-1)
  logReduction: number; // Log₁₀ reduction (useful for microbiology)
}

/**
 * Calculates pathogen survival rates using the Chick-Watson empirical model.
 * This is Stage 2 of the simulation.
 */
export class PathogenCalculator {
  /**
   * Calculate survival rate for a pathogen exposed to UV dose.
   *
   * Chick-Watson Model:
   * N(t) / N₀ = exp(-k × dose)
   *
   * Where:
   * - N(t) / N₀ = survival rate (fraction remaining)
   * - k = pathogen-specific resistance parameter
   * - dose = irradiance × time (J/m²)
   */
  calculateSurvival(
    intensity: number, // Irradiance (W/m²)
    exposure_time: number, // Exposure time (seconds)
    pathogen: Pathogen
  ): PathogenSurvivalResult {
    // Calculate dose: irradiance × time
    const dose = intensity * exposure_time;

    // Chick-Watson model: survival = exp(-k × dose)
    const survivalRate = Math.exp(-pathogen.kValue * dose);

    // Log reduction: -log₁₀(N/N₀) = k × dose / ln(10)
    const logReduction =
      pathogen.kValue * dose / Math.LN10;

    return {
      pathogenName: pathogen.name,
      kValue: pathogen.kValue,
      dose,
      survivalRate,
      logReduction,
    };
  }

  /**
   * Calculate survival rates for multiple pathogens at a point.
   */
  calculateMultipleSurvivals(
    intensity: number,
    exposure_time: number,
    pathogens: Pathogen[]
  ): PathogenSurvivalResult[] {
    return pathogens.map((pathogen) =>
      this.calculateSurvival(intensity, exposure_time, pathogen)
    );
  }
}

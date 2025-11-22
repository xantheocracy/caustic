"""Run a simple simulation on the test room"""

from .. import UVLightSimulator, IntensityConfig
from ..io import SimulationResultsWriter
from ..data import get_pathogen_database
from .simple_room import create_simple_room_environment, generate_floor_test_points


def run_simulation(output_file: str = "simulation_results.json"):
    """Run a simple simulation on the test room"""
    print("=== UV Light Simulator: Simple Room Test ===\n")

    # Create environment
    triangles, lights = create_simple_room_environment()
    print(f"Room setup: {len(triangles)} triangles, {len(lights)} light(s)\n")

    # Load pathogens from database
    pathogen_db = get_pathogen_database()
    pathogen_names = ["E. coli", "COVID-19 (Omicron)", "Influenza A"]
    pathogens = pathogen_db.get_pathogens_by_names(pathogen_names)

    # Create simulator
    simulator = UVLightSimulator(
        triangles,
        lights,
        IntensityConfig(max_bounces=2, grid_cell_size=5, photons_per_light=5000, verbose=True),
    )

    # Generate test points on the floor
    test_points = generate_floor_test_points()
    print(f"Running simulation on {len(test_points)} floor points...\n")

    # Run simulation with 60 second exposure
    exposure_time = 60  # seconds
    results = simulator.simulate(test_points, pathogens, exposure_time)

    # Display results
    print(f"Results for {exposure_time} second UV exposure:\n")
    print("Position (x,y,z) | Intensity (W/m²) | E. coli | COVID-19 | Influenza A")
    print("-" * 90)

    for result in results:
        pos = result.position
        pos_str = f"({pos.x:.1f}, {pos.y:.1f}, {pos.z:.1f})".ljust(16)
        intensity_str = f"{result.intensity.total_intensity:.4f}".ljust(16)

        # Get survival rates for each pathogen
        survival_strs = [
            f"{s.survival_rate * 100:.2f}%".ljust(9) for s in result.pathogen_survival
        ]

        print(pos_str + " | " + intensity_str + " | " + " | ".join(survival_strs))

    # Print summary statistics
    print("\n" + "=" * 90)
    print("Summary Statistics:\n")

    intensities = [r.intensity.total_intensity for r in results]
    max_intensity = max(intensities)
    min_intensity = min(intensities)
    avg_intensity = sum(intensities) / len(intensities)

    print(f"Max intensity: {max_intensity:.4f} W/m²")
    print(f"Min intensity: {min_intensity:.4f} W/m²")
    print(f"Avg intensity: {avg_intensity:.4f} W/m²")

    # Check for shadowing by the block
    points_behind_block = [
        r
        for r in results
        if 4 < r.position.x < 6 and 4 < r.position.z < 6
    ]

    if points_behind_block:
        block_shadow_intensity = sum(
            r.intensity.total_intensity for r in points_behind_block
        ) / len(points_behind_block)
        intensity_reduction = ((avg_intensity - block_shadow_intensity) / avg_intensity) * 100
        print(
            f"\nAvg intensity in block shadow region: {block_shadow_intensity:.4f} W/m²"
        )
        print(f"Intensity reduction due to block: {intensity_reduction:.2f}%")

    # Save results to file
    print(f"\n\nSaving results to {output_file}...")
    SimulationResultsWriter.write(output_file, triangles, results, pathogens, lights)
    print(f"Results saved successfully!")


if __name__ == "__main__":
    run_simulation()

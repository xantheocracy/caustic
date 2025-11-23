"""
Performance benchmarking script for UV light simulation.
Tests the airplane interior environment with various parameter combinations.
"""

import json
import time
import sys
import os
from typing import List, Tuple, Dict
from pathlib import Path

# Add project paths
project_root = Path(__file__).parent.parent.parent
src_path = project_root / "src"
if str(src_path) not in sys.path:
    sys.path.insert(0, str(src_path))

from caustic import UVLightSimulator, IntensityConfig
from caustic.core import Vector3, Light, Triangle
from caustic.core.lamp_profiles import get_lamp_manager
from caustic.data import get_pathogen_database
from caustic.spatial.grid import calculate_optimal_cell_size


class BenchmarkResults:
    """Track and display benchmark results"""

    def __init__(self):
        self.results: List[Dict] = []

    def add(self, config_name: str, params: Dict, elapsed: float, points_count: int,
            lights_count: int, triangle_count: int):
        """Record a benchmark result"""
        self.results.append({
            "config": config_name,
            "params": params,
            "time_seconds": elapsed,
            "points": points_count,
            "lights": lights_count,
            "triangles": triangle_count,
            "time_per_point": elapsed / points_count if points_count > 0 else 0,
            "throughput": points_count / elapsed if elapsed > 0 else 0,  # points/sec
        })

    def print_table(self):
        """Print results as formatted table"""
        if not self.results:
            return

        print("\n" + "="*120)
        print(f"{'Config':<30} {'Grid':<8} {'Photons':<10} {'Bounces':<10} {'Time (s)':<10} {'Points':<8} {'ms/point':<10} {'pts/sec':<10}")
        print("="*120)

        for r in sorted(self.results, key=lambda x: x["time_seconds"]):
            grid = r["params"].get("grid_cell_size", "N/A")
            photons = r["params"].get("photons_per_light", "N/A")
            bounces = r["params"].get("max_bounces", "N/A")

            print(f"{r['config']:<30} {grid!s:<8} {photons!s:<10} {bounces!s:<10} "
                  f"{r['time_seconds']:>9.2f} {r['points']:<8} {r['time_per_point']*1000:>9.1f} {r['throughput']:>9.1f}")

        print("="*120)

    def print_speedups(self):
        """Print speedups relative to baseline"""
        if not self.results:
            return

        baseline = self.results[0]["time_seconds"]
        print("\nSpeedup Results (relative to first config):")
        print("-" * 60)

        for r in self.results:
            speedup = baseline / r["time_seconds"]
            improvement = (speedup - 1) * 100
            symbol = "✓" if speedup > 1 else "✗"
            print(f"{symbol} {r['config']:<40} {speedup:>6.2f}x ({improvement:>+6.1f}%)")


def load_airplane_triangles(filepath: str) -> List[Triangle]:
    """Load triangles from airplane JSON file"""
    print(f"Loading triangles from {filepath}...")
    start = time.time()

    with open(filepath, 'r') as f:
        data = json.load(f)

    triangles = []
    for tri_dict in data["triangles"]:
        v0 = Vector3(tri_dict["v0"]["x"], tri_dict["v0"]["y"], tri_dict["v0"]["z"])
        v1 = Vector3(tri_dict["v1"]["x"], tri_dict["v1"]["y"], tri_dict["v1"]["z"])
        v2 = Vector3(tri_dict["v2"]["x"], tri_dict["v2"]["y"], tri_dict["v2"]["z"])
        reflectivity = tri_dict.get("reflectivity", 0.5)
        triangles.append(Triangle(v0, v1, v2, reflectivity))

    elapsed = time.time() - start
    print(f"  Loaded {len(triangles)} triangles in {elapsed:.2f}s")
    return triangles


def create_test_lights(count: int, triangles: List[Triangle]) -> List[Light]:
    """Create test lights distributed in the scene"""
    # Find scene bounds
    if not triangles:
        return []

    min_x = min(min(t.v0.x, t.v1.x, t.v2.x) for t in triangles)
    max_x = max(max(t.v0.x, t.v1.x, t.v2.x) for t in triangles)
    min_y = min(min(t.v0.y, t.v1.y, t.v2.y) for t in triangles)
    max_y = max(max(t.v0.y, t.v1.y, t.v2.y) for t in triangles)
    min_z = min(min(t.v0.z, t.v1.z, t.v2.z) for t in triangles)
    max_z = max(max(t.v0.z, t.v1.z, t.v2.z) for t in triangles)

    # Create lights distributed through the space
    lights = []
    lamp_manager = get_lamp_manager()

    for i in range(count):
        # Distribute lights evenly in the space
        t = (i + 1) / (count + 1)  # Distribute from 10% to 90%
        x = min_x + (max_x - min_x) * t
        z = min_z + (max_z - min_z) * t
        y = max_y - 0.5  # Place near ceiling

        pos = Vector3(x, y, z)
        direction = Vector3(0, -1, 0)  # Point downward

        # Get intensity from lamp profile
        lamp_profile = lamp_manager.get_profile("ushio_b1")
        intensity = lamp_profile.forward_intensity if lamp_profile else 100.0

        lights.append(Light(pos, intensity, lamp_type="ushio_b1", direction=direction))

    return lights


def create_test_points(count: int, triangles: List[Triangle]) -> List[Vector3]:
    """Create test measurement points distributed in the scene"""
    if not triangles or count == 0:
        return []

    # Find scene bounds
    min_x = min(min(t.v0.x, t.v1.x, t.v2.x) for t in triangles)
    max_x = max(max(t.v0.x, t.v1.x, t.v2.x) for t in triangles)
    min_y = min(min(t.v0.y, t.v1.y, t.v2.y) for t in triangles)
    max_y = max(max(t.v0.y, t.v1.y, t.v2.y) for t in triangles)
    min_z = min(min(t.v0.z, t.v1.z, t.v2.z) for t in triangles)
    max_z = max(max(t.v0.z, t.v1.z, t.v2.z) for t in triangles)

    # Create points as a grid in the space
    points = []
    import math

    # Distribute count points evenly
    points_per_axis = max(1, int(math.ceil(count ** (1/3))))

    for i in range(points_per_axis):
        for j in range(points_per_axis):
            for k in range(points_per_axis):
                if len(points) >= count:
                    break

                # Normalize to [0, 1]
                ti = (i + 0.5) / points_per_axis
                tj = (j + 0.5) / points_per_axis
                tk = (k + 0.5) / points_per_axis

                x = min_x + (max_x - min_x) * ti
                y = min_y + (max_y - min_y) * tj
                z = min_z + (max_z - min_z) * tk

                points.append(Vector3(x, y, z))

            if len(points) >= count:
                break

        if len(points) >= count:
            break

    return points[:count]


def run_simulation(triangles: List[Triangle], lights: List[Light],
                   points: List[Vector3], config: IntensityConfig) -> float:
    """Run simulation and return elapsed time"""
    # Get pathogens
    pathogen_db = get_pathogen_database()
    pathogens = pathogen_db.get_pathogens_by_names([
        "Escherichia coli", "Human coronavirus"
    ])

    # Create simulator
    simulator = UVLightSimulator(triangles, lights, config)

    # Run simulation
    start = time.time()
    results = simulator.simulate(points, pathogens, 60)
    elapsed = time.time() - start

    return elapsed


def benchmark_suite(triangles: List[Triangle], results: BenchmarkResults):
    """Run a suite of benchmarks with different configurations"""

    # Calculate suggested grid size
    suggested_grid = calculate_optimal_cell_size(triangles)

    print("\n" + "="*100)
    print("PHASE 1: Small Scene - Optimize Grid Cell Size")
    print("="*100)
    print(f"Suggested grid_cell_size (auto-calculated): {suggested_grid:.2f}")
    print("Testing: 10 points, 1 light, max_bounces=0")
    print("Goal: Find optimal grid_cell_size")

    lights = create_test_lights(1, triangles)
    points = create_test_points(10, triangles)

    # Test different grid cell sizes including the suggested one
    test_sizes = [0.25, 0.5, 1.0, 2.0, 5.0, 10.0]
    if suggested_grid not in test_sizes:
        test_sizes = sorted(test_sizes + [suggested_grid])

    for grid_size in test_sizes:
        config = IntensityConfig(
            max_bounces=0,
            grid_cell_size=grid_size,
            photons_per_light=10,
            verbose=False
        )

        print(f"\nTesting grid_cell_size={grid_size}...")
        elapsed = run_simulation(triangles, lights, points, config)
        results.add(f"Phase1: grid={grid_size}",
                   {"grid_cell_size": grid_size, "max_bounces": 0, "photons_per_light": 10},
                   elapsed, len(points), len(lights), len(triangles))
        print(f"  Time: {elapsed:.2f}s")

    results.print_table()

    # Find best grid size
    best_grid = min([r for r in results.results if "Phase1" in r["config"]],
                    key=lambda x: x["time_seconds"])
    best_grid_size = best_grid["params"]["grid_cell_size"]
    print(f"\n✓ Best grid_cell_size: {best_grid_size}")

    print("\n" + "="*100)
    print("PHASE 2: Increase Points - Test Scalability")
    print("="*100)
    print(f"Testing: varying points, 1 light, max_bounces=0, grid_size={best_grid_size}")
    print("Goal: Verify linear scaling with point count")

    for point_count in [10, 25, 50, 100]:
        points = create_test_points(point_count, triangles)
        config = IntensityConfig(
            max_bounces=0,
            grid_cell_size=best_grid_size,
            photons_per_light=10,
            verbose=False
        )

        print(f"\nTesting {point_count} points...")
        elapsed = run_simulation(triangles, lights, points, config)
        results.add(f"Phase2: {point_count}pts",
                   {"grid_cell_size": best_grid_size, "max_bounces": 0,
                    "photons_per_light": 10, "points": point_count},
                   elapsed, len(points), len(lights), len(triangles))
        print(f"  Time: {elapsed:.2f}s ({elapsed/point_count*1000:.1f}ms per point)")

    results.print_table()

    print("\n" + "="*100)
    print("PHASE 3: Add Lights - Test Multi-Light Performance")
    print("="*100)
    print(f"Testing: 50 points, varying lights, max_bounces=0, grid_size={best_grid_size}")
    print("Goal: Measure light scaling")

    points = create_test_points(50, triangles)

    for light_count in [1, 2, 5, 10]:
        lights = create_test_lights(light_count, triangles)
        config = IntensityConfig(
            max_bounces=0,
            grid_cell_size=best_grid_size,
            photons_per_light=10,
            verbose=False
        )

        print(f"\nTesting {light_count} lights...")
        elapsed = run_simulation(triangles, lights, points, config)
        results.add(f"Phase3: {light_count}lights",
                   {"grid_cell_size": best_grid_size, "max_bounces": 0,
                    "photons_per_light": 10, "lights": light_count},
                   elapsed, len(points), len(lights), len(triangles))
        print(f"  Time: {elapsed:.2f}s")

    results.print_table()

    print("\n" + "="*100)
    print("PHASE 4: Enable Reflections - Test Indirect Lighting")
    print("="*100)
    print(f"Testing: 50 points, 2 lights, max_bounces=1, grid_size={best_grid_size}")
    print("Goal: Measure reflection overhead and optimize photon count")

    lights = create_test_lights(2, triangles)
    points = create_test_points(50, triangles)

    for photon_count in [10, 50, 100, 500, 1000]:
        config = IntensityConfig(
            max_bounces=1,
            grid_cell_size=best_grid_size,
            photons_per_light=photon_count,
            verbose=False
        )

        print(f"\nTesting {photon_count} photons/light...")
        elapsed = run_simulation(triangles, lights, points, config)
        results.add(f"Phase4: {photon_count}photons",
                   {"grid_cell_size": best_grid_size, "max_bounces": 1,
                    "photons_per_light": photon_count},
                   elapsed, len(points), len(lights), len(triangles))
        print(f"  Time: {elapsed:.2f}s")

    results.print_table()

    # Estimate final configuration
    print("\n" + "="*100)
    print("PHASE 5: Estimate Final Configuration")
    print("="*100)
    print("Goal: Estimate time for 1000 points, 10 lights, max_bounces=1")
    print("      (without running the full benchmark)")

    # Get timing data to extrapolate
    phase3_50pts = [r for r in results.results if "Phase2" in r["config"] and r["points"] == 50]
    phase3_lights = [r for r in results.results if "Phase3" in r["config"]]
    phase4_photons = [r for r in results.results if "Phase4" in r["config"]]

    if phase3_50pts and phase3_lights and phase4_photons:
        # Get baseline time for 50 points, 1 light, direct only
        baseline_50pts_1light = min([r for r in results.results if "Phase2" in r["config"] and r["points"] == 50],
                                   key=lambda x: x["time_seconds"])["time_seconds"]

        # Linear scaling: 50 -> 1000 = 20x
        estimated_50_1000 = baseline_50pts_1light * 20

        # Light scaling: 1 -> 10 (usually near-linear for direct)
        light_scale = 10
        estimated_1000_10lights = estimated_50_1000 * light_scale

        # Reflection overhead from phase 4
        reflection_overhead = max([r["time_seconds"] for r in phase4_photons]) / baseline_50pts_1light
        estimated_1000_10lights_reflections = estimated_1000_10lights * reflection_overhead

        print(f"\nEstimated Times:")
        print(f"  50 pts, 1 light, direct:        {baseline_50pts_1light:>8.2f}s (measured)")
        print(f"  1000 pts, 1 light, direct:      {estimated_50_1000:>8.2f}s (20x scaling)")
        print(f"  1000 pts, 10 lights, direct:    {estimated_1000_10lights:>8.2f}s (10x light scaling)")
        print(f"  1000 pts, 10 lights, 1 bounce:  {estimated_1000_10lights_reflections:>8.2f}s (with reflections)")

        # Recommendations
        print(f"\nRecommendations:")
        if estimated_1000_10lights_reflections < 30:
            print(f"  ✓ Configuration is feasible! Should complete in <30 seconds")
        elif estimated_1000_10lights_reflections < 60:
            print(f"  ⚠ Configuration is on edge. May take 30-60 seconds")
        else:
            print(f"  ✗ Configuration may be too slow. Consider:")
            print(f"    - Reduce photons_per_light")
            print(f"    - Set max_bounces=0 for initial previews")
            print(f"    - Reduce sample point count")


def main():
    """Main benchmark entry point"""
    # Load airplane data
    airplane_file = Path(__file__).parent / "settings" / "half_plane_interior_triangles.json"

    if not airplane_file.exists():
        print(f"Error: {airplane_file} not found!")
        sys.exit(1)

    triangles = load_airplane_triangles(str(airplane_file))
    results = BenchmarkResults()

    print(f"\nStarting benchmarks on {len(triangles)} triangles")
    print("This will take 10-20 minutes depending on your hardware...")

    benchmark_suite(triangles, results)

    # Final summary
    print("\n" + "="*100)
    print("FINAL SUMMARY")
    print("="*100)
    results.print_speedups()

    print("\nTo run the full workload manually:")
    print("  python site/backend/test.py")
    print("  (with config updated to: max_bounces=1, grid_cell_size=<best>, photons_per_light=1000, points=1000 or more)")


if __name__ == "__main__":
    main()

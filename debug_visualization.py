#!/usr/bin/env python3
"""
Debug script to investigate measurement point placement and visualization issues.
Tests whether points are being placed correctly on room surfaces.
"""

import json
import sys
import os
import math

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from caustic.core import Vector3, Triangle, Light
from caustic.spatial.mesh_sampler import MeshSampler
from caustic.simulation.intensity import IntensityConfig, IntensityCalculator


def load_room_json(filepath):
    """Load room geometry from JSON file"""
    with open(filepath, 'r') as f:
        data = json.load(f)

    triangles = []
    for tri_dict in data["triangles"]:
        v0 = Vector3(tri_dict["v0"]["x"], tri_dict["v0"]["y"], tri_dict["v0"]["z"])
        v1 = Vector3(tri_dict["v1"]["x"], tri_dict["v1"]["y"], tri_dict["v1"]["z"])
        v2 = Vector3(tri_dict["v2"]["x"], tri_dict["v2"]["y"], tri_dict["v2"]["z"])
        reflectivity = tri_dict.get("reflectivity", 0.5)
        triangles.append(Triangle(v0, v1, v2, reflectivity))

    return triangles


def analyze_room_geometry(triangles):
    """Analyze the room geometry to understand its structure"""
    print("\n" + "="*80)
    print("ROOM GEOMETRY ANALYSIS")
    print("="*80)

    # Calculate bounds
    min_x = min_y = min_z = float('inf')
    max_x = max_y = max_z = float('-inf')

    for tri in triangles:
        for v in [tri.v0, tri.v1, tri.v2]:
            min_x = min(min_x, v.x)
            max_x = max(max_x, v.x)
            min_y = min(min_y, v.y)
            max_y = max(max_y, v.y)
            min_z = min(min_z, v.z)
            max_z = max(max_z, v.z)

    print(f"\nBounding box:")
    print(f"  X: [{min_x:.1f}, {max_x:.1f}] (range: {max_x - min_x:.1f})")
    print(f"  Y: [{min_y:.1f}, {max_y:.1f}] (range: {max_y - min_y:.1f})")
    print(f"  Z: [{min_z:.1f}, {max_z:.1f}] (range: {max_z - min_z:.1f})")

    print(f"\nTriangle count: {len(triangles)}")

    # Group triangles by normal direction (to identify walls)
    faces = {
        'floor': [],
        'ceiling': [],
        'wall_x_min': [],
        'wall_x_max': [],
        'wall_y_min': [],
        'wall_y_max': [],
        'wall_z_min': [],
        'wall_z_max': [],
        'other': []
    }

    for tri in triangles:
        normal = tri.normal
        # Determine which face this belongs to based on normal direction
        if abs(normal.y - 1.0) < 0.1:
            faces['ceiling'].append(tri)
        elif abs(normal.y + 1.0) < 0.1:
            faces['floor'].append(tri)
        elif abs(normal.x - 1.0) < 0.1:
            faces['wall_x_max'].append(tri)
        elif abs(normal.x + 1.0) < 0.1:
            faces['wall_x_min'].append(tri)
        elif abs(normal.z - 1.0) < 0.1:
            faces['wall_z_max'].append(tri)
        elif abs(normal.z + 1.0) < 0.1:
            faces['wall_z_min'].append(tri)
        else:
            faces['other'].append(tri)

    print(f"\nTriangles by face:")
    for face_name, face_tris in faces.items():
        if face_tris:
            avg_area = sum(MeshSampler.calculate_triangle_area(t) for t in face_tris) / len(face_tris)
            print(f"  {face_name:15s}: {len(face_tris):3d} triangles, avg area: {avg_area:.2f}")


def analyze_measurement_points(triangles, num_points=500):
    """Generate and analyze measurement points"""
    print("\n" + "="*80)
    print("MEASUREMENT POINT ANALYSIS")
    print("="*80)

    # Generate measurement points
    print(f"\nGenerating {num_points} measurement points...")
    points = MeshSampler.generate_measurement_points(
        triangles,
        num_points=num_points,
        distance_threshold=0.5,
        normal_similarity_threshold=0.9,
        max_attempts_multiplier=10
    )

    print(f"  Generated: {len(points)} points")

    # Analyze point distribution
    if len(points) > 0:
        # Calculate bounds of generated points
        min_x = min(p.x for p in points)
        max_x = max(p.x for p in points)
        min_y = min(p.y for p in points)
        max_y = max(p.y for p in points)
        min_z = min(p.z for p in points)
        max_z = max(p.z for p in points)

        print(f"\nPoint distribution:")
        print(f"  X range: [{min_x:.2f}, {max_x:.2f}]")
        print(f"  Y range: [{min_y:.2f}, {max_y:.2f}]")
        print(f"  Z range: [{min_z:.2f}, {max_z:.2f}]")

        # Sample some points to check positions
        print(f"\nFirst 10 points (checking position format):")
        for i, p in enumerate(points[:10]):
            print(f"  Point {i}: ({p.x:.3f}, {p.y:.3f}, {p.z:.3f})")

        # Check if points are on surface vs inside
        print(f"\nChecking point locations relative to bounds...")

        # Get room bounds from triangles
        min_x_room = min(min(t.v0.x, t.v1.x, t.v2.x) for t in triangles)
        max_x_room = max(max(t.v0.x, t.v1.x, t.v2.x) for t in triangles)
        min_y_room = min(min(t.v0.y, t.v1.y, t.v2.y) for t in triangles)
        max_y_room = max(max(t.v0.y, t.v1.y, t.v2.y) for t in triangles)
        min_z_room = min(min(t.v0.z, t.v1.z, t.v2.z) for t in triangles)
        max_z_room = max(max(t.v0.z, t.v1.z, t.v2.z) for t in triangles)

        # Count points on each face
        face_counts = {
            'at_x_min': 0,
            'at_x_max': 0,
            'at_y_min': 0,
            'at_y_max': 0,
            'at_z_min': 0,
            'at_z_max': 0,
            'inside': 0
        }

        tolerance = 0.1  # Within 0.1 units of surface

        for p in points:
            if abs(p.x - min_x_room) < tolerance:
                face_counts['at_x_min'] += 1
            elif abs(p.x - max_x_room) < tolerance:
                face_counts['at_x_max'] += 1
            elif abs(p.y - min_y_room) < tolerance:
                face_counts['at_y_min'] += 1
            elif abs(p.y - max_y_room) < tolerance:
                face_counts['at_y_max'] += 1
            elif abs(p.z - min_z_room) < tolerance:
                face_counts['at_z_min'] += 1
            elif abs(p.z - max_z_room) < tolerance:
                face_counts['at_z_max'] += 1
            else:
                face_counts['inside'] += 1

        print(f"\nPoint locations (tolerance ±{tolerance}):")
        for face, count in face_counts.items():
            if count > 0:
                percentage = (count / len(points)) * 100
                print(f"  {face:12s}: {count:3d} points ({percentage:5.1f}%)")

    return points


def analyze_intensity_calculation(triangles, points, light_pos, num_samples=10):
    """Test intensity calculation at measurement points"""
    print("\n" + "="*80)
    print("INTENSITY CALCULATION ANALYSIS")
    print("="*80)

    # Create a test light
    light = Light(
        position=light_pos,
        intensity=100.0,
        lamp_type="ushio_b1",
        direction=Vector3(0, -1, 0)
    )

    print(f"\nTest light position: ({light.position.x:.1f}, {light.position.y:.1f}, {light.position.z:.1f})")
    print(f"Light intensity: {light.intensity}W")

    # Create intensity calculator
    config = IntensityConfig(
        max_bounces=0,
        grid_cell_size=10.0,
        photons_per_light=500,
        verbose=False
    )
    calculator = IntensityCalculator(triangles, config)

    # Calculate intensities for a sample of points
    print(f"\nIntensity at {num_samples} sample points:")

    for i, point in enumerate(points[:num_samples]):
        intensity = calculator.calculate_intensity(point, [light])
        distance = light.position.subtract(point).length()

        print(f"  Point {i}: pos=({point.x:.2f},{point.y:.2f},{point.z:.2f}), " +
              f"dist={distance:.2f}, intensity={intensity.total_intensity:.6f}W/m²")

    # Batch calculation test
    print(f"\nBatch intensity calculation on all {len(points)} points...")
    intensities = calculator.calculate_intensity_batch(points, [light])

    # Analyze intensity distribution
    intensity_values = [i.total_intensity for i in intensities]
    intensity_values = [v for v in intensity_values if v > 0]  # Filter zero values

    if intensity_values:
        min_int = min(intensity_values)
        max_int = max(intensity_values)
        avg_int = sum(intensity_values) / len(intensity_values)

        print(f"\nIntensity statistics:")
        print(f"  Min: {min_int:.6f} W/m²")
        print(f"  Max: {max_int:.6f} W/m²")
        print(f"  Avg: {avg_int:.6f} W/m²")
        print(f"  Non-zero points: {len(intensity_values)} / {len(intensities)}")

        # Distribution histogram
        print(f"\nIntensity distribution:")
        bins = 5
        bin_size = (max_int - min_int) / bins
        for b in range(bins):
            bin_min = min_int + b * bin_size
            bin_max = bin_min + bin_size
            count = len([v for v in intensity_values if bin_min <= v < bin_max])
            bar = '*' * (count // 10)
            print(f"    {bin_min:8.6f}-{bin_max:8.6f}: {count:3d} {bar}")


def main():
    """Main debug workflow"""
    print("\n" + "="*80)
    print("UV LIGHT SIMULATOR - VISUALIZATION DEBUG")
    print("="*80)

    # Load the 10x10x10 room
    room_json_path = os.path.join(os.path.dirname(__file__),
                                   'site/frontend/settings/room.json')

    if not os.path.exists(room_json_path):
        print(f"Error: Could not find {room_json_path}")
        return

    print(f"\nLoading room from: {room_json_path}")
    triangles = load_room_json(room_json_path)

    # Analyze geometry
    analyze_room_geometry(triangles)

    # Generate and analyze measurement points
    points = analyze_measurement_points(triangles, num_points=500)

    # Test intensity calculation
    # Place light at (5, 9, 5) - near top center
    light_pos = Vector3(5.0, 9.0, 5.0)
    analyze_intensity_calculation(triangles, points, light_pos, num_samples=20)

    print("\n" + "="*80)
    print("DEBUG ANALYSIS COMPLETE")
    print("="*80 + "\n")


if __name__ == '__main__':
    main()

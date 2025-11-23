"""Mesh surface point sampling for measurement point generation"""

import random
import math
import bisect
from typing import List, Tuple
from ..core import Vector3, Triangle


class MeshSampler:
    """
    Generates well-distributed measurement points on a triangular mesh surface.

    Uses area-weighted random sampling followed by intelligent pruning to ensure
    points are spread out across the mesh with consideration for both spatial
    proximity and surface normal orientation.
    """

    @staticmethod
    def calculate_triangle_area(triangle: Triangle) -> float:
        """
        Calculate the area of a triangle using the cross product method.

        Args:
            triangle: The triangle to measure

        Returns:
            Area of the triangle
        """
        edge1 = triangle.v1.subtract(triangle.v0)
        edge2 = triangle.v2.subtract(triangle.v0)
        cross = edge1.cross(edge2)
        return 0.5 * cross.length()

    @staticmethod
    def sample_point_on_triangle(triangle: Triangle, offset: float = 0.0) -> Vector3:
        """
        Generate a random point uniformly distributed on a triangle surface.

        Uses barycentric coordinates with square root correction for uniform distribution.

        Args:
            triangle: The triangle to sample from
            offset: Distance to offset the point above the surface along the normal (default: 0.0)

        Returns:
            A random point on the triangle surface, optionally offset along the normal
        """
        # Generate random barycentric coordinates with uniform distribution
        r1 = random.random()
        r2 = random.random()

        # Square root method ensures uniform distribution across triangle area
        sqrt_r1 = math.sqrt(r1)
        u = 1 - sqrt_r1
        v = sqrt_r1 * (1 - r2)
        w = sqrt_r1 * r2

        # Barycentric interpolation
        point = triangle.v0.multiply(u).add(
            triangle.v1.multiply(v)
        ).add(
            triangle.v2.multiply(w)
        )

        # Offset point along the triangle's normal if requested
        if offset != 0.0:
            point = point.add(triangle.normal.multiply(offset))

        return point

    @staticmethod
    def points_are_similar(
        point1: Vector3,
        normal1: Vector3,
        point2: Vector3,
        normal2: Vector3,
        distance_threshold: float,
        normal_threshold: float
    ) -> bool:
        """
        Determine if two points are too similar based on distance and normal orientation.

        Args:
            point1: First point position
            normal1: First point's surface normal
            point2: Second point position
            normal2: Second point's surface normal
            distance_threshold: Maximum distance for points to be considered "close"
            normal_threshold: Minimum dot product for normals to be considered "similar" (0-1)

        Returns:
            True if points are similar (should be pruned), False otherwise
        """
        # Check spatial proximity
        distance = point1.subtract(point2).length()
        if distance > distance_threshold:
            return False

        # If close together, check normal similarity
        # Dot product of normalized vectors: 1 = same direction, 0 = perpendicular, -1 = opposite
        normal_dot = normal1.dot(normal2)

        # Points are similar if they're close AND normals are similar
        return normal_dot >= normal_threshold

    @staticmethod
    def sample_random_points_on_surface(
        triangles: List[Triangle],
        num_points: int = 100,
        seed: int = None,
        surface_offset: float = 0.01
    ) -> List[Vector3]:
        """
        Generate N random points uniformly sampled on the mesh surfaces.

        Simple random sampling without pruning - points are uniformly distributed
        based on triangle areas.

        Args:
            triangles: List of triangles representing the mesh
            num_points: Number of points to generate
            seed: Random seed for reproducibility (None for random)
            surface_offset: Distance to offset points above the surface along the normal

        Returns:
            List of Vector3 points uniformly sampled on the mesh surface
        """
        if not triangles:
            raise ValueError("Cannot generate points on empty triangle list")

        if num_points <= 0:
            raise ValueError("num_points must be positive")

        # Set random seed if provided
        if seed is not None:
            random.seed(seed)

        # Calculate triangle areas and cumulative distribution
        triangle_areas = [MeshSampler.calculate_triangle_area(tri) for tri in triangles]
        total_area = sum(triangle_areas)

        if total_area == 0:
            raise ValueError("Total mesh area is zero - degenerate triangles")

        # Create cumulative distribution for weighted sampling
        cumulative_areas = []
        cumulative_sum = 0.0
        for area in triangle_areas:
            cumulative_sum += area
            cumulative_areas.append(cumulative_sum)

        # Normalize to [0, 1]
        max_cumulative = cumulative_areas[-1]
        cumulative_areas = [a / max_cumulative for a in cumulative_areas]

        # Generate random points
        points: List[Vector3] = []
        for _ in range(num_points):
            # Select triangle based on area-weighted distribution
            rand_val = random.random()
            triangle_idx = bisect.bisect_right(cumulative_areas, rand_val)
            triangle_idx = min(triangle_idx, len(triangles) - 1)

            selected_triangle = triangles[triangle_idx]
            point = MeshSampler.sample_point_on_triangle(selected_triangle, offset=surface_offset)
            points.append(point)

        return points

    @staticmethod
    def sample_vertical_cross_section(
        triangles: List[Triangle],
        x_coordinate: float,
        grid_size: int = 10,
        seed: int = None,
        surface_offset: float = 0.01
    ) -> List[Vector3]:
        """
        Generate a regular NxN grid of points on a vertical cross-section parallel to the Y-Z plane.

        The cross-section is defined by a fixed X coordinate, and points are placed
        on a regular NxN grid within the Y-Z bounds of all triangles.

        Args:
            triangles: List of triangles representing the mesh
            x_coordinate: The X coordinate of the cross-section plane (all points will have this X)
            grid_size: N for NxN grid sampling (default: 10)
            seed: Random seed for reproducibility (unused, kept for API compatibility)
            surface_offset: Distance to offset points above the surface along the normal

        Returns:
            List of Vector3 points placed on a regular grid at the specified X coordinate
        """
        if not triangles:
            raise ValueError("Cannot generate points on empty triangle list")

        if grid_size <= 0:
            raise ValueError("grid_size must be positive")

        # Find the Y-Z bounds of all triangles
        min_y = float('inf')
        max_y = float('-inf')
        min_z = float('inf')
        max_z = float('-inf')

        for tri in triangles:
            for vertex in [tri.v0, tri.v1, tri.v2]:
                if vertex.y < min_y:
                    min_y = vertex.y
                if vertex.y > max_y:
                    max_y = vertex.y
                if vertex.z < min_z:
                    min_z = vertex.z
                if vertex.z > max_z:
                    max_z = vertex.z

        if min_y == max_y or min_z == max_z:
            raise ValueError("Triangles have no extent in Y or Z directions")

        # Generate regular grid points
        points: List[Vector3] = []

        for i in range(grid_size):
            for j in range(grid_size):
                # Create a regular grid with points at cell centers
                y = min_y + (i + 0.5) * (max_y - min_y) / grid_size
                z = min_z + (j + 0.5) * (max_z - min_z) / grid_size

                # Create point with exact x coordinate and grid-based y, z
                point = Vector3(x_coordinate, y, z)
                points.append(point)

        return points

    @staticmethod
    def generate_measurement_points(
        triangles: List[Triangle],
        num_points: int = 100,
        distance_threshold: float = 1.0,
        normal_similarity_threshold: float = 0.9,
        max_attempts_multiplier: int = 10,
        seed: int = None,
        surface_offset: float = 0.01
    ) -> List[Vector3]:
        """
        Generate well-distributed measurement points on a triangular mesh.

        The algorithm:
        1. Calculate areas for all triangles
        2. Generate points randomly on triangles (probability ∝ triangle area)
        3. Offset points slightly above the surface along the normal
        4. Prune points that are too close together AND have similar normals using spatial grid
        5. Return the pruned set of measurement points

        Args:
            triangles: List of triangles representing the mesh
            num_points: Target number of measurement points to generate
            distance_threshold: Maximum distance (units) for points to be considered "nearby"
            normal_similarity_threshold: Minimum dot product (0-1) for normals to be "similar"
                                        0.9 ≈ 25° difference, 0.7 ≈ 45° difference, 0.0 ≈ 90° difference
            max_attempts_multiplier: Generate this many times num_points initially before pruning
            seed: Random seed for reproducibility (None for random)
            surface_offset: Distance to offset points above the surface along the normal (default: 0.01)

        Returns:
            List of Vector3 points distributed across the mesh surface, offset along normals

        Raises:
            ValueError: If triangles list is empty or parameters are invalid
        """
        if not triangles:
            raise ValueError("Cannot generate points on empty triangle list")

        if num_points <= 0:
            raise ValueError("num_points must be positive")

        if distance_threshold <= 0:
            raise ValueError("distance_threshold must be positive")

        if not 0 <= normal_similarity_threshold <= 1:
            raise ValueError("normal_similarity_threshold must be between 0 and 1")

        # Set random seed if provided
        if seed is not None:
            random.seed(seed)

        # Step 1: Calculate triangle areas and total mesh area
        triangle_areas = [MeshSampler.calculate_triangle_area(tri) for tri in triangles]
        total_area = sum(triangle_areas)

        if total_area == 0:
            raise ValueError("Total mesh area is zero - degenerate triangles")

        # Create cumulative distribution for weighted sampling
        # OPTIMIZATION: Use binary search for faster triangle selection
        cumulative_areas = []
        cumulative_sum = 0.0
        for area in triangle_areas:
            cumulative_sum += area
            cumulative_areas.append(cumulative_sum)

        # Normalize to [0, 1]
        max_cumulative = cumulative_areas[-1]
        cumulative_areas = [a / max_cumulative for a in cumulative_areas]

        # Step 2: Generate candidate points (more than needed, to account for pruning)
        max_attempts = num_points * max_attempts_multiplier
        candidate_points: List[Tuple[Vector3, Vector3]] = []  # (point, normal) pairs

        for _ in range(max_attempts):
            # OPTIMIZATION: Use binary search for triangle selection (O(log n) instead of O(n))
            rand_val = random.random()
            triangle_idx = bisect.bisect_right(cumulative_areas, rand_val)
            triangle_idx = min(triangle_idx, len(triangles) - 1)

            selected_triangle = triangles[triangle_idx]

            # Sample a random point on this triangle, offset above the surface
            point = MeshSampler.sample_point_on_triangle(selected_triangle, offset=surface_offset)
            normal = selected_triangle.normal

            candidate_points.append((point, normal))

        # Step 3: Prune similar points using spatial grid (O(n·k) instead of O(n²))
        # where k is the number of nearby points (much smaller than n)

        # Build spatial grid for fast spatial lookups
        grid_cell_size = max(distance_threshold, 0.1)
        spatial_grid: dict = {}  # cell -> list of (index, point, normal)

        def point_to_cell(p: Vector3) -> Tuple[int, int, int]:
            """Convert 3D point to grid cell"""
            return (int(p.x // grid_cell_size), int(p.y // grid_cell_size), int(p.z // grid_cell_size))

        # Add all candidate points to grid
        for idx, (point, normal) in enumerate(candidate_points):
            cell = point_to_cell(point)
            if cell not in spatial_grid:
                spatial_grid[cell] = []
            spatial_grid[cell].append((idx, point, normal))

        # Prune using grid-based approach
        pruned_points: List[Vector3] = []
        used_indices = set()

        for i, (point, normal) in enumerate(candidate_points):
            if i in used_indices:
                continue

            # Keep this point
            pruned_points.append(point)
            used_indices.add(i)

            # Find nearby cells to check
            cell = point_to_cell(point)
            cells_to_check = []
            search_range = 2  # Check adjacent cells

            for dx in range(-search_range, search_range + 1):
                for dy in range(-search_range, search_range + 1):
                    for dz in range(-search_range, search_range + 1):
                        nearby_cell = (cell[0] + dx, cell[1] + dy, cell[2] + dz)
                        if nearby_cell in spatial_grid:
                            cells_to_check.extend(spatial_grid[nearby_cell])

            # Check only nearby points instead of all remaining points
            for j, other_point, other_normal in cells_to_check:
                if j in used_indices or j <= i:
                    continue

                if MeshSampler.points_are_similar(
                    point, normal,
                    other_point, other_normal,
                    distance_threshold,
                    normal_similarity_threshold
                ):
                    used_indices.add(j)

            # Stop if we have enough points
            if len(pruned_points) >= num_points:
                break

        return pruned_points[:num_points]


def generate_measurement_points(
    triangles: List[Triangle],
    num_points: int = 100,
    distance_threshold: float = 1.0,
    normal_similarity_threshold: float = 0.9,
    max_attempts_multiplier: int = 10,
    seed: int = None,
    surface_offset: float = 0.01
) -> List[Vector3]:
    """
    Convenience function for generating measurement points on a mesh.

    See MeshSampler.generate_measurement_points for full documentation.

    Args:
        triangles: List of triangles representing the mesh
        num_points: Target number of measurement points
        distance_threshold: Maximum distance for points to be "nearby"
        normal_similarity_threshold: Minimum dot product for normals to be "similar" (0-1)
        max_attempts_multiplier: Oversampling factor for pruning
        seed: Random seed for reproducibility
        surface_offset: Distance to offset points above the surface along the normal (default: 0.01)

    Returns:
        List of Vector3 measurement points, offset above the surface
    """
    return MeshSampler.generate_measurement_points(
        triangles=triangles,
        num_points=num_points,
        distance_threshold=distance_threshold,
        normal_similarity_threshold=normal_similarity_threshold,
        max_attempts_multiplier=max_attempts_multiplier,
        seed=seed,
        surface_offset=surface_offset
    )

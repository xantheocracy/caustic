"""Simple example: cubic room with central block"""

from typing import List, Tuple
from ..core import Vector3, Triangle, Light


def create_simple_room_environment() -> Tuple[List[Triangle], List[Light]]:
    """
    Creates a simple cubic room with a central block.
    Room dimensions: 10×10×10 units
    Block dimensions: 2×2×2 units at the center
    """
    triangles: List[Triangle] = []

    # Room dimensions
    room_size = 10
    room_min = 0
    room_max = room_size

    # Room construction: all triangles face inward
    # Each wall consists of 2 triangles

    # Floor (y = 0, faces upward into room)
    triangles.append(
        Triangle(
            Vector3(room_min, room_min, room_min),
            Vector3(room_max, room_min, room_max),
            Vector3(room_min, room_min, room_max),
        )
    )
    triangles.append(
        Triangle(
            Vector3(room_min, room_min, room_min),
            Vector3(room_max, room_min, room_min),
            Vector3(room_max, room_min, room_max),
        )
    )

    # Ceiling (y = room_max, faces downward into room)
    triangles.append(
        Triangle(
            Vector3(room_min, room_max, room_min),
            Vector3(room_min, room_max, room_max),
            Vector3(room_max, room_max, room_max),
        )
    )
    triangles.append(
        Triangle(
            Vector3(room_min, room_max, room_min),
            Vector3(room_max, room_max, room_max),
            Vector3(room_max, room_max, room_min),
        )
    )

    # Front wall (z = room_min, faces inward)
    triangles.append(
        Triangle(
            Vector3(room_min, room_min, room_min),
            Vector3(room_min, room_max, room_min),
            Vector3(room_max, room_max, room_min),
        )
    )
    triangles.append(
        Triangle(
            Vector3(room_min, room_min, room_min),
            Vector3(room_max, room_max, room_min),
            Vector3(room_max, room_min, room_min),
        )
    )

    # Back wall (z = room_max, faces inward)
    triangles.append(
        Triangle(
            Vector3(room_max, room_min, room_max),
            Vector3(room_max, room_max, room_max),
            Vector3(room_min, room_max, room_max),
        )
    )
    triangles.append(
        Triangle(
            Vector3(room_max, room_min, room_max),
            Vector3(room_min, room_max, room_max),
            Vector3(room_min, room_min, room_max),
        )
    )

    # Left wall (x = room_min, faces inward)
    triangles.append(
        Triangle(
            Vector3(room_min, room_min, room_max),
            Vector3(room_min, room_max, room_max),
            Vector3(room_min, room_max, room_min),
        )
    )
    triangles.append(
        Triangle(
            Vector3(room_min, room_min, room_max),
            Vector3(room_min, room_max, room_min),
            Vector3(room_min, room_min, room_min),
        )
    )

    # Right wall (x = room_max, faces inward)
    triangles.append(
        Triangle(
            Vector3(room_max, room_min, room_min),
            Vector3(room_max, room_max, room_min),
            Vector3(room_max, room_max, room_max),
        )
    )
    triangles.append(
        Triangle(
            Vector3(room_max, room_min, room_min),
            Vector3(room_max, room_max, room_max),
            Vector3(room_max, room_min, room_max),
        )
    )

    # Central hovering block (2×2×2, centered at 5,4,5)
    # Triangles face outward
    block_min = 4
    block_max = 6

    # Block bottom (y = block_min, faces downward/outward)
    triangles.append(
        Triangle(
            Vector3(block_min, block_min, block_min),
            Vector3(block_min, block_min, block_max),
            Vector3(block_max, block_min, block_max),
        )
    )
    triangles.append(
        Triangle(
            Vector3(block_min, block_min, block_min),
            Vector3(block_max, block_min, block_max),
            Vector3(block_max, block_min, block_min),
        )
    )

    # Block top (y = block_max, faces upward/outward)
    triangles.append(
        Triangle(
            Vector3(block_min, block_max, block_min),
            Vector3(block_max, block_max, block_max),
            Vector3(block_min, block_max, block_max),
        )
    )
    triangles.append(
        Triangle(
            Vector3(block_min, block_max, block_min),
            Vector3(block_max, block_max, block_min),
            Vector3(block_max, block_max, block_max),
        )
    )

    # Block front (z = block_min, faces outward)
    triangles.append(
        Triangle(
            Vector3(block_min, block_min, block_min),
            Vector3(block_max, block_min, block_min),
            Vector3(block_max, block_max, block_min),
        )
    )
    triangles.append(
        Triangle(
            Vector3(block_min, block_min, block_min),
            Vector3(block_max, block_max, block_min),
            Vector3(block_min, block_max, block_min),
        )
    )

    # Block back (z = block_max, faces outward)
    triangles.append(
        Triangle(
            Vector3(block_min, block_min, block_max),
            Vector3(block_max, block_max, block_max),
            Vector3(block_max, block_min, block_max),
        )
    )
    triangles.append(
        Triangle(
            Vector3(block_min, block_min, block_max),
            Vector3(block_min, block_max, block_max),
            Vector3(block_max, block_max, block_max),
        )
    )

    # Block left (x = block_min, faces outward)
    triangles.append(
        Triangle(
            Vector3(block_min, block_min, block_min),
            Vector3(block_min, block_max, block_min),
            Vector3(block_min, block_max, block_max),
        )
    )
    triangles.append(
        Triangle(
            Vector3(block_min, block_min, block_min),
            Vector3(block_min, block_max, block_max),
            Vector3(block_min, block_min, block_max),
        )
    )

    # Block right (x = block_max, faces outward)
    triangles.append(
        Triangle(
            Vector3(block_max, block_min, block_min),
            Vector3(block_max, block_max, block_max),
            Vector3(block_max, block_max, block_min),
        )
    )
    triangles.append(
        Triangle(
            Vector3(block_max, block_min, block_min),
            Vector3(block_max, block_min, block_max),
            Vector3(block_max, block_max, block_max),
        )
    )

    # Single light at top center of room, just below ceiling
    lights = [Light(Vector3(5, 9.5, 5), 1000)]  # 1000 W intensity

    return triangles, lights


def generate_floor_test_points() -> List[Vector3]:
    """Generate test points on the floor of the room at various positions"""
    points: List[Vector3] = []
    floor_y = 0.1  # Slightly above the floor

    # Create a grid of test points
    for x in range(1, 20, 1):
        for z in range(1, 20, 1):
            points.append(Vector3(x/2, floor_y, z/2))

    return points

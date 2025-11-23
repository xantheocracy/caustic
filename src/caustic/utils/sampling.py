"""Random sampling utilities for photon tracing"""

import random
import math
from ..core import Vector3


def sample_uniform_sphere() -> Vector3:
    """
    Sample a random direction uniformly from a sphere.
    Uses spherical coordinates with uniform sampling.
    """
    # Random azimuthal angle [0, 2π)
    phi = random.uniform(0, 2 * math.pi)

    # Random polar angle [0, π] with cos weighting for uniform sphere distribution
    cos_theta = random.uniform(-1, 1)
    sin_theta = math.sqrt(max(0, 1 - cos_theta * cos_theta))

    x = sin_theta * math.cos(phi)
    y = sin_theta * math.sin(phi)
    z = cos_theta

    return Vector3(x, y, z).normalize()


def sample_cosine_weighted_hemisphere(normal: Vector3) -> Vector3:
    """
    Sample a random direction from a cosine-weighted hemisphere.
    The distribution is weighted by cos(θ) where θ is the angle from the normal.
    This matches diffuse reflection probability (Lambert's cosine law).

    Args:
        normal: The normal vector of the surface (should be normalized and pointing outward)

    Returns:
        A normalized direction vector in the hemisphere above the surface
    """
    # Random azimuthal angle [0, 2π)
    phi = random.uniform(0, 2 * math.pi)

    # Cosine-weighted polar angle sampling
    # For cosine-weighted hemisphere: use sqrt(random) for cos(theta)
    cos_theta = math.sqrt(random.uniform(0, 1))
    sin_theta = math.sqrt(max(0, 1 - cos_theta * cos_theta))

    # Sample direction in local coordinate system (normal is up)
    local_dir = Vector3(
        sin_theta * math.cos(phi),
        sin_theta * math.sin(phi),
        cos_theta
    )

    # Convert from local to world coordinates using normal as the up direction
    # Create orthonormal basis with normal as Z-axis
    if abs(normal.x) < 0.9:
        tangent = Vector3(0, normal.z, -normal.y).normalize()
    else:
        tangent = Vector3(-normal.z, 0, normal.x).normalize()

    bitangent = normal.cross(tangent).normalize()

    # Express local_dir in world coordinates
    world_dir = Vector3(
        local_dir.x * tangent.x + local_dir.y * bitangent.x + local_dir.z * normal.x,
        local_dir.x * tangent.y + local_dir.y * bitangent.y + local_dir.z * normal.y,
        local_dir.x * tangent.z + local_dir.y * bitangent.z + local_dir.z * normal.z,
    )

    return world_dir.normalize()


def sample_biased_cone(direction: Vector3, max_angle_degrees: float = 90.0) -> Vector3:
    """
    Sample a random direction from a cone around a given direction.
    The distribution is biased toward the center (cosine-weighted around the direction).

    Args:
        direction: The center direction of the cone (should be normalized)
        max_angle_degrees: Maximum angle from the center direction (0-180, default 90)

    Returns:
        A normalized direction vector within the cone
    """
    max_angle_rad = math.radians(max_angle_degrees)

    # Random azimuthal angle [0, 2π)
    phi = random.uniform(0, 2 * math.pi)

    # Cosine-weighted polar angle sampling within the cone
    # For biased cone sampling: use sqrt(random) for cos(theta) within [0, max_angle]
    cos_max_angle = math.cos(max_angle_rad)
    # Sample uniformly in cos space from cos_max_angle to 1.0 (which is 0 degrees)
    cos_theta = random.uniform(cos_max_angle, 1.0)
    # Weight this cosine more heavily toward alignment with direction
    cos_theta = math.sqrt(max(0, cos_theta))  # Additional bias toward center
    sin_theta = math.sqrt(max(0, 1 - cos_theta * cos_theta))

    # Sample direction in local coordinate system (direction is "up")
    local_dir = Vector3(
        sin_theta * math.cos(phi),
        sin_theta * math.sin(phi),
        cos_theta
    )

    # Convert from local to world coordinates using direction as the up direction
    # Create orthonormal basis with direction as Z-axis
    if abs(direction.x) < 0.9:
        tangent = Vector3(0, direction.z, -direction.y).normalize()
    else:
        tangent = Vector3(-direction.z, 0, direction.x).normalize()

    bitangent = direction.cross(tangent).normalize()

    # Express local_dir in world coordinates
    world_dir = Vector3(
        local_dir.x * tangent.x + local_dir.y * bitangent.x + local_dir.z * direction.x,
        local_dir.x * tangent.y + local_dir.y * bitangent.y + local_dir.z * direction.y,
        local_dir.x * tangent.z + local_dir.y * bitangent.z + local_dir.z * direction.z,
    )

    return world_dir.normalize()

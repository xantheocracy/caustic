"""3D Vector class for mathematical operations"""

import math


class Vector3:
    def __init__(self, x: float, y: float, z: float):
        self.x = x
        self.y = y
        self.z = z

    def add(self, v: "Vector3") -> "Vector3":
        return Vector3(self.x + v.x, self.y + v.y, self.z + v.z)

    def subtract(self, v: "Vector3") -> "Vector3":
        return Vector3(self.x - v.x, self.y - v.y, self.z - v.z)

    def multiply(self, scalar: float) -> "Vector3":
        return Vector3(self.x * scalar, self.y * scalar, self.z * scalar)

    def divide(self, scalar: float) -> "Vector3":
        return Vector3(self.x / scalar, self.y / scalar, self.z / scalar)

    def dot(self, v: "Vector3") -> float:
        return self.x * v.x + self.y * v.y + self.z * v.z

    def cross(self, v: "Vector3") -> "Vector3":
        return Vector3(
            self.y * v.z - self.z * v.y,
            self.z * v.x - self.x * v.z,
            self.x * v.y - self.y * v.x,
        )

    def length(self) -> float:
        return math.sqrt(self.x * self.x + self.y * self.y + self.z * self.z)

    def normalize(self) -> "Vector3":
        length = self.length()
        if length == 0:
            return Vector3(0, 0, 0)
        return self.divide(length)

    def clone(self) -> "Vector3":
        return Vector3(self.x, self.y, self.z)

    def __repr__(self) -> str:
        return f"Vector3({self.x:.2f}, {self.y:.2f}, {self.z:.2f})"

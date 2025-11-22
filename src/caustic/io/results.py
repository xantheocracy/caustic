"""File I/O for simulation results"""

import json
from typing import List, Dict, Any
from ..core import Vector3, Triangle, Light
from .. import PointResults, Pathogen


class SimulationResultsWriter:
    """Writes simulation results to a JSON file for visualization"""

    @staticmethod
    def write(
        filename: str,
        triangles: List[Triangle],
        results: List[PointResults],
        pathogens: List[Pathogen],
        lights: List[Light] = None,
    ) -> None:
        """
        Write simulation results to a JSON file.

        Args:
            filename: Output file path
            triangles: List of triangles in the scene
            results: List of point results from simulation
            pathogens: List of pathogens used in simulation
            lights: List of lights in the scene (optional)
        """
        data = {
            "triangles": SimulationResultsWriter._serialize_triangles(triangles),
            "pathogens": SimulationResultsWriter._serialize_pathogens(pathogens),
            "points": SimulationResultsWriter._serialize_results(results),
        }

        if lights is not None:
            data["lights"] = SimulationResultsWriter._serialize_lights(lights)

        with open(filename, "w") as f:
            json.dump(data, f, indent=2)

    @staticmethod
    def _serialize_triangles(triangles: List[Triangle]) -> List[Dict[str, Any]]:
        """Serialize triangles to JSON-compatible format"""
        return [
            {
                "v0": {"x": tri.v0.x, "y": tri.v0.y, "z": tri.v0.z},
                "v1": {"x": tri.v1.x, "y": tri.v1.y, "z": tri.v1.z},
                "v2": {"x": tri.v2.x, "y": tri.v2.y, "z": tri.v2.z},
                "normal": {
                    "x": tri.normal.x,
                    "y": tri.normal.y,
                    "z": tri.normal.z,
                },
                "reflectivity": tri.reflectivity,
            }
            for tri in triangles
        ]

    @staticmethod
    def _serialize_lights(lights: List[Light]) -> List[Dict[str, Any]]:
        """Serialize lights to JSON-compatible format"""
        return [
            {
                "position": {
                    "x": light.position.x,
                    "y": light.position.y,
                    "z": light.position.z,
                },
                "intensity": light.intensity,
            }
            for light in lights
        ]

    @staticmethod
    def _serialize_pathogens(pathogens: List[Pathogen]) -> List[Dict[str, Any]]:
        """Serialize pathogens to JSON-compatible format"""
        return [
            {
                "name": pathogen.name,
                "k_value": pathogen.k_value,
            }
            for pathogen in pathogens
        ]

    @staticmethod
    def _serialize_results(results: List[PointResults]) -> List[Dict[str, Any]]:
        """Serialize point results to JSON-compatible format"""
        return [
            {
                "position": {
                    "x": result.position.x,
                    "y": result.position.y,
                    "z": result.position.z,
                },
                "intensity": {
                    "direct_intensity": result.intensity.direct_intensity,
                    "total_intensity": result.intensity.total_intensity,
                },
                "pathogen_survival": [
                    {
                        "pathogen_name": survival.pathogen_name,
                        "k_value": survival.k_value,
                        "dose": survival.dose,
                        "survival_rate": survival.survival_rate,
                        "log_reduction": survival.log_reduction,
                    }
                    for survival in result.pathogen_survival
                ],
            }
            for result in results
        ]


class SimulationResultsReader:
    """Reads simulation results from a JSON file"""

    @staticmethod
    def read(filename: str) -> Dict[str, Any]:
        """
        Read simulation results from a JSON file.

        Args:
            filename: Input file path

        Returns:
            Dictionary containing triangles, pathogens, lights, and point results
        """
        with open(filename, "r") as f:
            data = json.load(f)

        result = {
            "triangles": SimulationResultsReader._deserialize_triangles(
                data.get("triangles", [])
            ),
            "pathogens": SimulationResultsReader._deserialize_pathogens(
                data.get("pathogens", [])
            ),
            "points": data.get("points", []),
        }

        if "lights" in data:
            result["lights"] = SimulationResultsReader._deserialize_lights(
                data.get("lights", [])
            )

        return result

    @staticmethod
    def _deserialize_triangles(triangle_data: List[Dict[str, Any]]) -> List[Triangle]:
        """Deserialize triangles from JSON format"""
        triangles = []
        for tri_dict in triangle_data:
            v0 = Vector3(
                tri_dict["v0"]["x"],
                tri_dict["v0"]["y"],
                tri_dict["v0"]["z"],
            )
            v1 = Vector3(
                tri_dict["v1"]["x"],
                tri_dict["v1"]["y"],
                tri_dict["v1"]["z"],
            )
            v2 = Vector3(
                tri_dict["v2"]["x"],
                tri_dict["v2"]["y"],
                tri_dict["v2"]["z"],
            )
            reflectivity = tri_dict.get("reflectivity", 0.5)
            triangles.append(Triangle(v0, v1, v2, reflectivity))

        return triangles

    @staticmethod
    def _deserialize_lights(light_data: List[Dict[str, Any]]) -> List[Light]:
        """Deserialize lights from JSON format"""
        lights = []
        for light_dict in light_data:
            pos = Vector3(
                light_dict["position"]["x"],
                light_dict["position"]["y"],
                light_dict["position"]["z"],
            )
            intensity = light_dict["intensity"]
            lights.append(Light(pos, intensity))

        return lights

    @staticmethod
    def _deserialize_pathogens(pathogen_data: List[Dict[str, Any]]) -> List[Pathogen]:
        """Deserialize pathogens from JSON format"""
        return [
            Pathogen(pathogen["name"], pathogen["k_value"])
            for pathogen in pathogen_data
        ]

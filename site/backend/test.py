from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List
import os
import sys
import json

# Add the project src directory to Python path
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
src_path = os.path.join(project_root, "src")
if src_path not in sys.path:
    sys.path.insert(0, src_path)

# Import caustic simulation modules
from caustic import UVLightSimulator, IntensityConfig
from caustic.core import Vector3, Light, Triangle
from caustic.data import get_pathogen_database
from caustic.spatial.mesh_sampler import MeshSampler

app = FastAPI()

# Enable CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Download large settings files on startup
@app.on_event("startup")
async def startup_event():
    """Download large settings files when the server starts"""
    try:
        from download_settings import download_large_settings
        download_large_settings()
    except Exception as e:
        print(f"Warning: Could not download large settings: {e}")

class Position(BaseModel):
    x: float
    y: float
    z: float

class LightInput(BaseModel):
    position: Position
    intensity: float

class SimulationRequest(BaseModel):
    lights: List[LightInput]
    settings_file: str = "room.json"

@app.get("/")
def read_root():
    return {"message": "UV Light Simulator API", "frontend_url": "/static/index.html"}

@app.get("/settings")
def list_settings():
    """
    Returns list of available settings files from both frontend and backend
    """
    files = []

    # Check frontend settings (for small files)
    frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend")
    frontend_settings = os.path.join(frontend_path, "settings")
    if os.path.exists(frontend_settings):
        files.extend([f for f in os.listdir(frontend_settings) if f.endswith('.json')])

    # Check backend settings (for large files)
    backend_settings = os.path.join(os.path.dirname(__file__), "settings")
    if os.path.exists(backend_settings):
        files.extend([f for f in os.listdir(backend_settings) if f.endswith('.json')])

    return {"settings": sorted(list(set(files)))}

@app.get("/settings/{filename}")
async def get_settings_file(filename: str):
    """
    Serve a specific settings JSON file
    """
    from fastapi.responses import FileResponse

    # Check backend settings first (for large files)
    backend_path = os.path.join(os.path.dirname(__file__), "settings", filename)
    if os.path.exists(backend_path):
        return FileResponse(backend_path, media_type="application/json")

    # Then check frontend settings
    frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend", "settings", filename)
    if os.path.exists(frontend_path):
        return FileResponse(frontend_path, media_type="application/json")

    return {"error": f"Settings file not found: {filename}"}

@app.post("/cube")
def cube_number(input_data: BaseModel):
    """
    Receives a number and returns its cube (legacy endpoint)
    """
    number = input_data.number
    result = number ** 3
    return {"number": number, "cube": result}

@app.post("/simulate")
def run_simulation(request: SimulationRequest):
    """
    Runs UV light simulation with user-provided lights
    """
    # Load room triangles from JSON file - check backend first (for large files), then frontend
    backend_settings = os.path.join(os.path.dirname(__file__), "settings", request.settings_file)
    frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend")
    frontend_settings = os.path.join(frontend_path, "settings", request.settings_file)

    if os.path.exists(backend_settings):
        room_json_path = backend_settings
    elif os.path.exists(frontend_settings):
        room_json_path = frontend_settings
    else:
        raise FileNotFoundError(f"Settings file not found: {request.settings_file}")

    with open(room_json_path, 'r') as f:
        room_data = json.load(f)

    # Deserialize triangles
    triangles = []
    for tri_dict in room_data["triangles"]:
        v0 = Vector3(tri_dict["v0"]["x"], tri_dict["v0"]["y"], tri_dict["v0"]["z"])
        v1 = Vector3(tri_dict["v1"]["x"], tri_dict["v1"]["y"], tri_dict["v1"]["z"])
        v2 = Vector3(tri_dict["v2"]["x"], tri_dict["v2"]["y"], tri_dict["v2"]["z"])
        reflectivity = tri_dict.get("reflectivity", 0.5)
        triangles.append(Triangle(v0, v1, v2, reflectivity))

    # Convert user lights to Light objects
    lights = []
    for light_input in request.lights:
        pos = Vector3(light_input.position.x, light_input.position.y, light_input.position.z)
        lights.append(Light(pos, light_input.intensity))

    # Load pathogens from database
    pathogen_db = get_pathogen_database()
    pathogen_names = ["Escherichia coli", "Human coronavirus", "Influenza virus"]
    pathogens = pathogen_db.get_pathogens_by_names(pathogen_names)

    # Create simulator
    simulator = UVLightSimulator(
        triangles,
        lights,
        IntensityConfig(max_bounces=0, grid_cell_size=5, photons_per_light=10, verbose=True)
    )

    # Generate test points on the floor
    test_points = []
    # floor_y = 0.1
    # for x in range(1, 20, 1):
    #     for z in range(1, 20, 1):
    #         test_points.append(Vector3(x/2, floor_y, z/2))
    test_points = MeshSampler.generate_measurement_points(triangles, 500, 0.5, 0.9, 10)

    # Run simulation with 60 second exposure
    exposure_time = 60
    results = simulator.simulate(test_points, pathogens, exposure_time)

    # Serialize results for frontend
    points = []
    for result in results:
        points.append({
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
                    "k1": survival.k1,
                    "k2": survival.k2,
                    "percent_resistant": survival.percent_resistant,
                    "fluence": survival.fluence,
                    "survival_rate": survival.survival_rate,
                    "ech_uv": survival.ech_uv,
                }
                for survival in result.pathogen_survival
            ],
        })

    return {"points": points}

# Mount static files - serve the frontend directory
# IMPORTANT: This must be last so it doesn't override API routes
frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend")
try:
    app.mount("/static", StaticFiles(directory=frontend_path, html=True), name="static")
except Exception as e:
    print(f"Warning: Could not mount static files: {e}")
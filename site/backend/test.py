from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional
import os
import sys
import json
import time

# Add the project src directory to Python path
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
src_path = os.path.join(project_root, "src")
if src_path not in sys.path:
    sys.path.insert(0, src_path)

# Import caustic simulation modules
from caustic import UVLightSimulator, IntensityConfig
from caustic.core import Vector3, Light, Triangle
from caustic.core.lamp_profiles import get_lamp_manager
from caustic.data import get_pathogen_database
from caustic.spatial.mesh_sampler import MeshSampler
from caustic.spatial.grid import calculate_optimal_cell_size

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

class Direction(BaseModel):
    x: float
    y: float
    z: float

class LightInput(BaseModel):
    position: Position
    lamp_type: str = "ushio_b1"  # Default lamp type
    direction: Optional[Direction] = None  # Default will be set in backend

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
    Runs UV light simulation with user-provided lights.
    Logs detailed timing breakdown to console.
    """
    # Track overall execution time
    total_start = time.time()

    print("\n" + "="*80)
    print("SIMULATION START")
    print("="*80)

    # ==================== PHASE 1: Load Settings ====================
    phase1_start = time.time()
    print("\n[1] Loading settings file...")

    backend_settings = os.path.join(os.path.dirname(__file__), "settings", request.settings_file)
    frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend")
    frontend_settings = os.path.join(frontend_path, "settings", request.settings_file)

    if os.path.exists(backend_settings):
        room_json_path = backend_settings
    elif os.path.exists(frontend_settings):
        room_json_path = frontend_settings
    else:
        raise FileNotFoundError(f"Settings file not found: {request.settings_file}")

    settings_load_start = time.time()
    with open(room_json_path, 'r') as f:
        room_data = json.load(f)
    settings_load_time = time.time() - settings_load_start
    print(f"    ✓ JSON file loaded ({settings_load_time:.3f}s)")

    # ==================== PHASE 2: Deserialize Triangles ====================
    phase2_start = time.time()
    print(f"\n[2] Deserializing {len(room_data['triangles'])} triangles...")

    triangles_start = time.time()
    triangles = []
    for tri_dict in room_data["triangles"]:
        v0 = Vector3(tri_dict["v0"]["x"], tri_dict["v0"]["y"], tri_dict["v0"]["z"])
        v1 = Vector3(tri_dict["v1"]["x"], tri_dict["v1"]["y"], tri_dict["v1"]["z"])
        v2 = Vector3(tri_dict["v2"]["x"], tri_dict["v2"]["y"], tri_dict["v2"]["z"])
        reflectivity = tri_dict.get("reflectivity", 0.5)
        triangles.append(Triangle(v0, v1, v2, reflectivity))
    triangles_time = time.time() - triangles_start
    print(f"    ✓ Triangles deserialized ({triangles_time:.3f}s, {len(triangles)/triangles_time:.0f} tri/s)")

    # ==================== PHASE 3: Setup Lights ====================
    phase3_start = time.time()
    print(f"\n[3] Setting up {len(request.lights)} light(s)...")

    lights_start = time.time()
    lamp_manager = get_lamp_manager()
    lights = []
    for i, light_input in enumerate(request.lights):
        pos = Vector3(light_input.position.x, light_input.position.y, light_input.position.z)

        if light_input.direction is not None:
            direction = Vector3(light_input.direction.x, light_input.direction.y, light_input.direction.z)
            direction = direction.normalize()
        else:
            direction = Vector3(0, -1, 0)

        lamp_profile = lamp_manager.get_profile(light_input.lamp_type)
        if lamp_profile is not None:
            intensity = lamp_profile.forward_intensity
        else:
            intensity = 100.0

        lights.append(Light(
            pos,
            intensity,
            lamp_type=light_input.lamp_type,
            direction=direction
        ))
    lights_time = time.time() - lights_start
    print(f"    ✓ Lights configured ({lights_time:.3f}s)")

    # ==================== PHASE 4: Load Pathogens ====================
    phase4_start = time.time()
    print(f"\n[4] Loading pathogens from database...")

    pathogens_start = time.time()
    pathogen_db = get_pathogen_database()
    pathogen_names = ["Escherichia coli", "Human coronavirus", "Influenza virus"]
    pathogens = pathogen_db.get_pathogens_by_names(pathogen_names)
    pathogens_time = time.time() - pathogens_start
    print(f"    ✓ Pathogens loaded: {len(pathogens)} species ({pathogens_time:.3f}s)")

    # ==================== PHASE 5: Calculate Optimal Grid ====================
    phase5_start = time.time()
    print(f"\n[5] Calculating optimal grid cell size...")

    grid_calc_start = time.time()
    optimal_grid_size = calculate_optimal_cell_size(triangles)
    grid_calc_time = time.time() - grid_calc_start
    print(f"    ✓ Grid size calculated: {optimal_grid_size:.4f} ({grid_calc_time:.3f}s)")

    # ==================== PHASE 6: Initialize Simulator ====================
    phase6_start = time.time()
    print(f"\n[6] Initializing simulator...")

    simulator_init_start = time.time()
    simulator = UVLightSimulator(
        triangles,
        lights,
        IntensityConfig(
            max_bounces=0,
            grid_cell_size=optimal_grid_size,
            photons_per_light=100000,
            verbose=False  # Disable verbose photon logging for cleaner console
        )
    )
    simulator_init_time = time.time() - simulator_init_start
    print(f"    ✓ Simulator initialized ({simulator_init_time:.3f}s)")

    # ==================== PHASE 7: Generate Test Points ====================
    phase7_start = time.time()
    print(f"\n[7] Generating test measurement points...")

    points_gen_start = time.time()
    test_points = MeshSampler.generate_measurement_points(triangles, 1000, 0.5, 0.9, 10)
    points_gen_time = time.time() - points_gen_start
    print(f"    ✓ Test points generated: {len(test_points)} points ({points_gen_time:.3f}s, {len(test_points)/points_gen_time:.0f} pts/s)")

    # ==================== PHASE 8: Run Simulation ====================
    phase8_start = time.time()
    print(f"\n[8] Running UV light simulation...")
    print(f"    Configuration: max_bounces=0, {len(lights)} light(s), grid_size={optimal_grid_size:.4f}")
    print(f"    Processing {len(test_points)} points × {len(pathogens)} pathogens...")

    simulation_start = time.time()
    exposure_time = 60
    results = simulator.simulate(test_points, pathogens, exposure_time)
    simulation_time = time.time() - simulation_start
    print(f"    ✓ Simulation complete ({simulation_time:.3f}s)")
    print(f"      Speed: {len(test_points)/simulation_time:.1f} points/sec, {len(test_points)*len(lights)/simulation_time:.1f} point·lights/sec")

    # ==================== PHASE 9: Serialize Results ====================
    phase9_start = time.time()
    print(f"\n[9] Serializing results for frontend...")

    serialize_start = time.time()
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
    serialize_time = time.time() - serialize_start
    print(f"    ✓ Results serialized ({serialize_time:.3f}s, {len(points)/serialize_time:.0f} points/s)")

    # ==================== TIMING SUMMARY ====================
    total_time = time.time() - total_start

    print("\n" + "="*80)
    print("TIMING BREAKDOWN")
    print("="*80)

    timing_data = [
        ("Settings File Load", settings_load_time),
        ("Triangle Deserialization", triangles_time),
        ("Light Setup", lights_time),
        ("Pathogen Database Load", pathogens_time),
        ("Grid Size Calculation", grid_calc_time),
        ("Simulator Initialization", simulator_init_time),
        ("Test Point Generation", points_gen_time),
        ("UV Light Simulation", simulation_time),
        ("Result Serialization", serialize_time),
    ]

    print(f"\n{'Operation':<30} {'Time (s)':<12} {'% of Total':<12}")
    print("-" * 54)
    for operation, duration in timing_data:
        percentage = (duration / total_time) * 100
        print(f"{operation:<30} {duration:>8.3f}s   {percentage:>8.1f}%")
    print("-" * 54)
    print(f"{'TOTAL':<30} {total_time:>8.3f}s   {'100.0%':>8}")

    print("\n" + "="*80)
    print(f"SIMULATION COMPLETE")
    print(f"Total Time: {total_time:.3f}s | Points: {len(test_points)} | Pathogens: {len(pathogens)}")
    print(f"Throughput: {len(test_points)/total_time:.1f} points/sec")
    print("="*80 + "\n")

    return {"points": points}

# Mount static files - serve the frontend directory
# IMPORTANT: This must be last so it doesn't override API routes
frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend")
try:
    app.mount("/static", StaticFiles(directory=frontend_path, html=True), name="static")
except Exception as e:
    print(f"Warning: Could not mount static files: {e}")
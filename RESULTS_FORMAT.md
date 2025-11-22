# Simulation Results File Format

The simulation results are saved in JSON format and include all necessary information for visualization and analysis.

## File Structure

```json
{
  "triangles": [...],
  "lights": [...],
  "pathogens": [...],
  "points": [...]
}
```

## Sections

### Triangles
Contains the 3D geometry of the scene. Each triangle includes:
- **v0, v1, v2**: The three vertices of the triangle
- **normal**: Pre-calculated surface normal vector
- **reflectivity**: Reflectance coefficient (0-1, for future reflection support)

Example:
```json
{
  "v0": {"x": 0, "y": 0, "z": 0},
  "v1": {"x": 10, "y": 0, "z": 10},
  "v2": {"x": 0, "y": 0, "z": 10},
  "normal": {"x": 0.0, "y": -1.0, "z": 0.0},
  "reflectivity": 0.5
}
```

### Lights
Contains the light sources in the scene. Each light includes:
- **position**: 3D coordinates of the light source
- **intensity**: Total radiant intensity in watts (W)

Example:
```json
{
  "position": {"x": 5, "y": 9.5, "z": 5},
  "intensity": 1000
}
```

### Pathogens
Contains the pathogen definitions used in the simulation. Each pathogen includes:
- **name**: Unique identifier for the pathogen
- **k_value**: Chick-Watson resistance parameter

Example:
```json
{
  "name": "E. coli",
  "k_value": 0.001
}
```

### Points
Contains the evaluation points and calculated results. Each point includes:
- **position**: 3D coordinates of the evaluation point
- **intensity**:
  - **direct_intensity**: Direct UV intensity from lights (W/m²)
  - **total_intensity**: Total intensity including reflections (W/m²)
- **pathogen_survival**: Array of survival calculations for each pathogen
  - **pathogen_name**: Name of the pathogen
  - **k_value**: Reference k-value
  - **dose**: Total UV dose (irradiance × time, J/m²)
  - **survival_rate**: Fraction of pathogens surviving (0-1)
  - **log_reduction**: Log₁₀ reduction factor

Example:
```json
{
  "position": {"x": 1, "y": 0.1, "z": 1},
  "intensity": {
    "direct_intensity": 0.6612,
    "total_intensity": 0.6612
  },
  "pathogen_survival": [
    {
      "pathogen_name": "E. coli",
      "k_value": 0.001,
      "dose": 39.67,
      "survival_rate": 0.9611,
      "log_reduction": 0.0172
    }
  ]
}
```

## File I/O

### Writing Results

```python
from src.io import SimulationResultsWriter

SimulationResultsWriter.write(
    filename="results.json",
    triangles=triangles,
    results=point_results,
    pathogens=pathogens,
    lights=lights  # Optional
)
```

### Reading Results

```python
from src.io import SimulationResultsReader

data = SimulationResultsReader.read("results.json")

# Access components
triangles = data["triangles"]
pathogens = data["pathogens"]
lights = data.get("lights", [])  # Optional
points = data["points"]
```

## Current Example

The simple room test generates:
- **24 triangles**: 12 for the room walls, 12 for the central block
- **1 light**: 1000 W at position (5, 9.5, 5)
- **3 pathogens**: E. coli, COVID-19 (Omicron), Influenza A
- **25 evaluation points**: 5×5 grid on the floor

Result file: `simulation_results.json` (~30 KB)

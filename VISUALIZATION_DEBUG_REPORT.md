# UV Light Simulator - Visualization Issue Investigation Report

## Executive Summary

The simple 10×10×10 room is displaying points, but with **zero intensity values** because all measurement points are being positioned **outside the room geometry** or in geometrically invalid locations. This causes the ray tracer's visibility check (`is_path_clear()`) to fail, resulting in zero direct intensity calculations.

## Root Causes Identified

### 1. **CRITICAL: Interior Cube Has Inverted Normals**

The interior cube (triangles 12-23 in room.json) has **inverted surface normals**. The normals point outward from the room's geometric center instead of inward (toward the interior of the cube itself).

**Evidence:**
- Interior cube bounds: x∈[4,6], y∈[4,6], z∈[4,6]
- Bottom face (y=4): Normal is (0, 1, 0) - pointing UP
  - Should be (0, -1, 0) - pointing DOWN (inward)
- Similar inversion affects all 6 faces of the interior cube

**Impact on Measurement Points:**
In `MeshSampler.generate_measurement_points()` (line 191 of mesh_sampler.py):
```python
point = MeshSampler.sample_point_on_triangle(selected_triangle, offset=surface_offset)
```

The default `surface_offset=0.01` offsets points **along the triangle's normal**. With inverted normals:
- Points on interior cube surfaces are pushed OUTWARD instead of staying on the surface
- These exterior points then fail the ray tracing visibility check
- Result: **All interior cube points show zero intensity**

### 2. **Misinterpretation of Surface Offset Direction**

The offset parameter in `sample_point_on_triangle()` (line 191) is applied as:
```python
if offset != 0.0:
    point = point.add(triangle.normal.multiply(offset))
```

This assumes:
- **For exterior surfaces**: Outward normals work correctly, offsetting points slightly outward into free space
- **For interior surfaces**: Inward normals would be needed, but the JSON provides outward normals

**Test Point Distribution Results:**
```
X range: [-0.01, 10.01]  (exceeds bounds of 0-10)
Y range: [-0.01, 10.01]  (exceeds bounds of 0-10)
Z range: [-0.01, 10.01]  (exceeds bounds of 0-10)

Point locations (tolerance ±0.1):
  at_x_min    :  84 points ( 16.8%)
  at_x_max    :  83 points ( 16.6%)
  at_y_min    :  80 points ( 16.0%)
  at_y_max    :  82 points ( 16.4%)
  at_z_min    :  83 points ( 16.6%)
  at_z_max    :  68 points ( 13.6%)
  inside      :  20 points (  4.0%)
```

Notice: Points have coordinates like `(-0.010, 5.99, 2.94)` and `(10.010, ...)` - they're **outside the 0-10 bounds**.

### 3. **Ray Tracing Visibility Failures**

Testing ray visibility from points to a light at (5.0, 9.0, 5.0):

```
Point at (-0.01, 5.99, 2.94)      [exterior point]
  Distance to light: 6.20 units
  Path clear: FALSE ✗
  Intensity: 0.000000 W/m²

Point at (4.07, 4.01, 4.82)       [near interior cube]
  Distance to light: 5.08 units
  Path clear: FALSE ✗
  Intensity: 0.000000 W/m²

Point at (5, 5, 5)                 [room center]
  Distance to light: 4.00 units
  Path clear: FALSE ✗
  Intensity: 0.000000 W/m²
```

**Only the light's own position passes the visibility check** - all measurement points fail.

## Comparison: Large Plane Environment

The plane cabin works correctly because:
1. **All surfaces are exterior surfaces** with **outward-pointing normals**
2. Measurement point offset of +0.01 along outward normals positions them correctly in free space
3. Ray tracing visibility checks succeed
4. Intensity values are correctly calculated and displayed

The plane has ~222k triangles, all representing an external building surface.

## Detailed Problem Breakdown

### Issue #1: Inverted Interior Cube Normals

**Location:** `/home/samdower/caustic/site/frontend/settings/room.json`, triangles 12-23

**Example - Triangle 12 (bottom face of interior cube):**
```json
{
  "v0": {"x": 4, "y": 4, "z": 4},
  "v1": {"x": 4, "y": 4, "z": 6},
  "v2": {"x": 6, "y": 4, "z": 6},
  "normal": {"x": 0, "y": 1, "z": 0},  // WRONG! Should be (0, -1, 0)
  "reflectivity": 0.5
}
```

**Correct calculation for this triangle:**
- Edge 1: v1 - v0 = (0, 0, 2)
- Edge 2: v2 - v0 = (2, 0, 2)
- Cross product (right-hand rule): Edge1 × Edge2 = (0, 4, 0)
- Normalized: (0, 1, 0) - **points upward**

However, this is the **bottom face of an interior object**, so it should face **inward/downward** into the cube's interior: **(0, -1, 0)**

### Issue #2: Point Offset Strategy

**File:** `/home/samdower/caustic/src/caustic/spatial/mesh_sampler.py` (lines 36-70, 115-135, 191)

The `surface_offset` parameter assumes all normals point **away from occupied space**:
```python
@staticmethod
def sample_point_on_triangle(triangle: Triangle, offset: float = 0.0) -> Vector3:
    # ... sampling code ...
    if offset != 0.0:
        point = point.add(triangle.normal.multiply(offset))  # Line 68
    return point
```

And is called with default offset:
```python
point = MeshSampler.sample_point_on_triangle(selected_triangle, offset=surface_offset)
# Line 191, with surface_offset=0.01 by default
```

**Problem:** This offset logic only works when normals point INTO the free space where you want measurement points. With inverted interior normals, points are pushed outside the room.

### Issue #3: No Validation of Geometry Validity

Neither the simulator nor the visualization performs checks for:
1. Whether points are actually on valid surfaces
2. Whether normals are consistently oriented
3. Whether offset points remain within expected bounds

## Solutions

### Solution 1: Fix Interior Cube Normals (Recommended)

Fix the normals for all interior cube triangles to point **inward**:

**For a cube at [4,6]³ that represents an interior object:**
- Bottom face (y=4): Normal should be (0, **-1**, 0)
- Top face (y=6): Normal should be (0, **1**, 0)
- Left face (x=4): Normal should be (**-1**, 0, 0)
- Right face (x=6): Normal should be (**1**, 0, 0)
- Front face (z=4): Normal should be (0, 0, **-1**)
- Back face (z=6): Normal should be (0, 0, **1**)

**Implementation:**
1. Identify all interior surfaces (objects within the room, not the room boundary)
2. Flip normals for these surfaces by reversing vertex winding order OR negating the normal vector
3. Validate that all normals are consistently oriented for each object

### Solution 2: Improve Surface Offset Logic

Enhance the offset strategy to:
1. **Detect orientation** of geometry (interior vs exterior)
2. **Offset direction** based on context:
   - Exterior surfaces: offset along normal (away from object)
   - Interior surfaces: offset opposite to normal (into space)
3. **Validate results** to ensure offset points stay within room bounds

### Solution 3: Add Geometry Validation

Add validation in the backend simulator to:
1. Check point validity before intensity calculation
2. Log warnings for measurement points outside expected bounds
3. Provide diagnostics about geometry orientation issues

## Affected Files

| File | Issue | Severity |
|------|-------|----------|
| `/home/samdower/caustic/site/frontend/settings/room.json` | Inverted interior cube normals | **CRITICAL** |
| `/home/samdower/caustic/src/caustic/spatial/mesh_sampler.py` | Naive offset strategy | HIGH |
| `/home/samdower/caustic/src/caustic/simulation/intensity.py` | No validation of measurement point validity | MEDIUM |
| `/home/samdower/caustic/site/backend/test.py` | No logging of geometry issues | MEDIUM |

## Verification Checklist

- [ ] Fix interior cube normals in room.json
- [ ] Verify all measurement points fall within expected room bounds
- [ ] Confirm ray tracing visibility checks pass for interior points
- [ ] Verify non-zero intensity values are returned
- [ ] Test visualization displays colored spheres at correct positions
- [ ] Compare results between simple room and plane environment
- [ ] Add geometry validation to backend

## Conclusion

The visualization issue is caused by **measurement points being positioned outside the room geometry** due to inverted normals on the interior cube combined with a naive offset strategy. The plane cabin environment works because all surfaces have consistent outward normals. Fixing the interior cube normals in room.json will resolve this issue.

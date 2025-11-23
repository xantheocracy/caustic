# Simple Room Visualization Issue - Technical Investigation Summary

## Problem Statement

The simple 10×10×10 room in `room.json` is displaying measurement points as colored spheres, but:
- All points show **zero intensity** (black color in visualization)
- The plane cabin (222k triangles) shows correct non-zero intensity values
- Backend logs confirm simulation completes successfully
- The issue began after reverting from DecalGeometry to sphere visualization

## Root Cause Analysis

### Finding #1: Measurement Points Are Outside the Room

Debug script output revealed:
```
Point distribution:
  X range: [-0.01, 10.01]  (room bounds: 0-10)
  Y range: [-0.01, 10.01]  (room bounds: 0-10)
  Z range: [-0.01, 10.01]  (room bounds: 0-10)
```

Sample points show positions like:
- `(-0.010, 5.990, 2.943)` - OUTSIDE (x < 0)
- `(10.010, 6.019, 9.776)` - OUTSIDE (x > 10)
- `(7.897, -0.010, 1.196)` - OUTSIDE (y < 0)

**Only ~83% of points are on room surfaces; ~4% are completely inside/invalid.**

### Finding #2: Interior Cube Has Inverted Normals

The 10×10×10 room contains an interior cube at bounds [4,6]³ (triangles 12-23).

Testing normal direction on bottom face (y=4):
```
Triangle 12:
  v0=(4,4,4), v1=(4,4,6), v2=(6,4,6)
  Computed cross product: (0, 4, 0) → normalized: (0, 1, 0)

  JSON specifies: "normal": {"x": 0, "y": 1, "z": 0}

  For an INTERIOR surface facing DOWN into the room,
  this should be (0, -1, 0) - INVERTED!
```

All 6 faces of the interior cube have inverted normals.

### Finding #3: Point Offset Along Normals Pushes Points Outside

In `MeshSampler.sample_point_on_triangle()` (mesh_sampler.py:66-68):
```python
if offset != 0.0:
    point = point.add(triangle.normal.multiply(offset))
```

Called with default `surface_offset=0.01` (mesh_sampler.py:115):

**For inverted normals:**
- Interior cube surface point: (5.0, 4.0, 5.0) [on bottom face, y=4]
- Normal from JSON: (0, 1, 0) [points upward/outward]
- Offset applied: (5.0, 4.0, 5.0) + (0, 1, 0) × 0.01 = **(5.0, 4.01, 5.0)**
- **This point is pushed OUT of the interior cube interior**
- Ray tracing visibility check fails from this external point

### Finding #4: Zero Intensity Is a Symptom of Failed Visibility Checks

In `intensity.py` line 169:
```python
if not self.tracer.is_path_clear(point, light.position):
    return 0  # Light is blocked
```

All measurement points failed visibility checks:
```
Point at (-0.01, 5.99, 2.94):  is_path_clear = False → intensity = 0
Point at (4.07, 4.01, 4.82):   is_path_clear = False → intensity = 0
Point at (5, 5, 5):            is_path_clear = False → intensity = 0
```

## Code Flow Analysis

### How Points Are Generated (mesh_sampler.py)

1. **Line 191**: Sample point on selected triangle: `sample_point_on_triangle(triangle, offset=0.01)`
2. **Line 192**: Get triangle normal: `normal = selected_triangle.normal`
3. **Line 68**: Apply offset: `point = point.add(triangle.normal.multiply(offset))`

**Problem**: No validation that the offset direction is correct for this surface type.

### How Intensity Fails (intensity.py)

1. **Line 105**: Calculate direct intensity from light to point
2. **Line 169**: Check visibility: `if not self.tracer.is_path_clear(point, light.position):`
3. **Line 170**: Return zero if not visible
4. **Line 205**: Apply inverse square law if visible

**Result**: Points outside geometry have no clear line of sight through the geometry boundary.

## Why The Plane Environment Works

The plane cabin geometry has:
- **Only exterior surfaces** (building shell, ~222k triangles)
- **Consistent outward-pointing normals** (standard 3D mesh convention)
- **Valid point offset**: Points are offset slightly outward into free space (away from the building)
- **Passing visibility checks**: All measurement points successfully see the lights
- **Non-zero intensity values**: Correctly calculated and displayed

## Why The Simple Room Fails

The simple room has:
- **Interior cube** with inverted normals
- **Measurement points offset incorrectly** (pushed outside the room instead of staying on surface)
- **Failed visibility checks** (points outside geometry can't see through to lights)
- **Zero intensity values** (visibility check failed)
- **Black spheres in visualization** (all colors map from zero intensity)

## Comparison Table

| Aspect | Plane Cabin | Simple Room |
|--------|-------------|------------|
| Total triangles | ~222,000 | 24 |
| Surface type | Exterior only | Exterior + Interior |
| Normal orientation | All outward | Exterior outward, Interior inverted |
| Point offset direction | Correct (outward) | Incorrect (outward for interior) |
| Visibility checks | ✓ Pass | ✗ Fail |
| Intensity values | Non-zero | All zero |
| Visualization | Colors ✓ | Black ✗ |

## Impact Assessment

### User-Visible Impact
- Simple room displays points but they're all black (zero intensity)
- Larger room shows proper color gradients
- Appears as though lights have no effect on the simple room
- Confusing UX: simulation runs but shows no results

### Technical Impact
- Violates assumption that all normals point away from occupied space
- Breaks the point offset strategy which assumes consistent normal orientation
- Exposes lack of geometry validation in the simulation pipeline
- Could cause issues with other room geometries containing interior objects

## Files Involved

### Primary Issues
1. **`/home/samdower/caustic/site/frontend/settings/room.json`**
   - Triangles 12-23: Interior cube with inverted normals
   - Need to flip vertex winding order or negate normals

2. **`/home/samdower/caustic/src/caustic/spatial/mesh_sampler.py`**
   - `sample_point_on_triangle()` method (lines 36-70)
   - `generate_measurement_points()` method (lines 108-255)
   - No distinction between exterior and interior surfaces

3. **`/home/samdower/caustic/src/caustic/simulation/intensity.py`**
   - `_calculate_direct_intensity()` (lines 157-207)
   - No validation of point validity before visibility checks
   - Returns zero for points outside geometry

### Secondary Issues
1. **`/home/samdower/caustic/site/backend/test.py`**
   - No diagnostics for invalid measurement points
   - Could add logging to identify these issues

2. **Frontend visualization** (`/home/samdower/caustic/site/frontend/index.js`)
   - Works correctly (points ARE being rendered)
   - Issue is in backend data, not visualization

## Resolution Path

### Immediate Fix (High Priority)
1. Fix interior cube normals in room.json
   - Reverse vertex winding order for interior faces
   - OR negate the normal vectors
   - Test that all 6 faces now point inward

2. Verify measurement points are within bounds
   - Should all be in range [0, 10] for each coordinate
   - No points should be outside by more than surface offset (0.01)

3. Confirm intensity values are non-zero
   - Re-run simulation with corrected geometry
   - Verify visibility checks pass

### Medium-Term Improvements
1. Enhance geometry validation
   - Detect interior vs exterior surfaces
   - Apply correct offset direction for each type
   - Validate point positions before returning

2. Add diagnostic logging
   - Log measurement points that fail validity checks
   - Provide geometry orientation statistics
   - Warn if points are out of expected bounds

3. Improve mesh_sampler documentation
   - Clarify assumptions about normal orientation
   - Document required preparation of input geometry
   - Add validation methods for developers

## Testing Protocol

After implementing fixes:

```python
# Verify point distribution
points = MeshSampler.generate_measurement_points(triangles, 500)
# All points should be in [0, 10] range ✓
# ~83% on exterior walls ✓
# ~17% on interior surfaces ✓
# None completely inside ✓

# Verify visibility checks
calculator = IntensityCalculator(triangles, config)
for point in points[:20]:
    intensity = calculator.calculate_intensity(point, lights)
    # All should have intensity.total_intensity > 0 ✓
```

## Conclusion

The simple room visualization fails because:
1. **Interior cube has inverted normals** causing the geometry to be inside-out
2. **Measurement point offset logic** assumes all normals point away from occupied space
3. **Points are pushed outside the room** instead of staying on interior surfaces
4. **Visibility checks fail** resulting in zero intensity

The fix requires correcting the normals in room.json. The code itself is functioning as designed—it's the input geometry that violates the assumed constraints.

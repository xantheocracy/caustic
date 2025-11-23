# Visual Explanation of the Measurement Point Issue

## The Problem in 3D Space

### Scenario 1: Exterior Walls (WORKS CORRECTLY)

```
Room boundary (x=0 wall):

    Z axis
    10 |
       |  • • • • (measurement points)
       |  ↓ ↓ ↓ ↓ (offset along normal)
       | ───────── (wall surface with normal pointing left ←)
       |
     0 |________
       0        10  X axis

How it works:
  1. Sample point ON wall: (0.0, 5.0, 5.0)
  2. Normal points outward: (-1, 0, 0)
  3. Offset applied: (0.0, 5.0, 5.0) + (-1, 0, 0) × 0.01 = (-0.01, 5.0, 5.0)
  4. Result: Point is just OUTSIDE the wall, in free space
  5. Ray to light: ✓ Clear path through air
  6. Intensity: ✓ Non-zero, displays as color
```

### Scenario 2: Interior Cube Bottom Face (BROKEN)

```
Interior cube (y=4 face):

    X axis
    6 |
      | ┌───────┐ (interior cube outline)
      | │ • • • │ (measurement points) [WRONG POSITION!]
      | │ ↑ ↑ ↑ │ (offset along wrong direction)
    4 | │▄▄▄▄▄▄▄│ (bottom face, normal pointing UP: (0,1,0))
      |_│
    0 └─────────
      0    4    6 Z axis

How it breaks:
  1. Sample point ON surface: (5.0, 4.0, 5.0)
  2. Normal (INVERTED): (0, 1, 0) - points UPWARD
  3. Offset applied: (5.0, 4.0, 5.0) + (0, 1, 0) × 0.01 = (5.0, 4.01, 5.0)
  4. Result: Point is ABOVE the surface, OUTSIDE interior cube
  5. Ray to light: ✗ Must pass through interior cube walls
  6. Intensity: ✗ Zero (visibility failed)
```

### What Should Happen (After Fix)

```
Interior cube (y=4 face - CORRECTED):

    X axis
    6 |
      | ┌───────┐ (interior cube outline)
      | │ • • • │ (measurement points) [CORRECT POSITION!]
      | │ ↓ ↓ ↓ │ (offset along correct direction)
    4 | │▄▄▄▄▄▄▄│ (bottom face, normal pointing DOWN: (0,-1,0))
      |_│
    0 └─────────
      0    4    6 Z axis

How it should work:
  1. Sample point ON surface: (5.0, 4.0, 5.0)
  2. Normal (CORRECTED): (0, -1, 0) - points DOWNWARD (into interior)
  3. Offset applied: (5.0, 4.0, 5.0) + (0, -1, 0) × 0.01 = (5.0, 3.99, 5.0)
  4. Result: Point is just BELOW the surface, INSIDE interior cube
  5. Ray to light: ✓ Clear path through room interior
  6. Intensity: ✓ Non-zero, displays as color
```

## The Bottom Cube Face Example

### Current (Broken) State

```
Triangle vertices and winding:
  v0 = (4, 4, 4)  —— v1 = (4, 4, 6)
   |                  |
   |                  |
  v2 = (6, 4, 6)  —— (6, 4, 4)

Winding order: v0 → v1 → v2
Cross product: (v1-v0) × (v2-v0) = (0,0,2) × (2,0,2) = (0, 4, 0)
Normalized: (0, 1, 0) = pointing UP ↑

JSON current value: "normal": {"x": 0, "y": 1, "z": 0} ✗ WRONG

Visual:
        (4,4,6)
         |\
         | \
         |  \ normal points UP (wrong!)
         |   \↑
         |    ╲
      (4,4,4)-(6,4,4)

This is the BOTTOM of the interior cube, so normal should
point DOWN into the interior, not UP into the room!
```

### Corrected State (Target)

```
OPTION 1: Reverse winding order
  Vertices: v2 → v1 → v0 (or use: v0, v2, v1)
  Cross product: (v2-v0) × (v1-v0) = (2,0,2) × (0,0,2) = (0, -4, 0)
  Normalized: (0, -1, 0) = pointing DOWN ↓ ✓ CORRECT

OPTION 2: Negate the normal
  JSON value: "normal": {"x": 0, "y": -1, "z": 0} ✓ CORRECT

Either approach works. The normal should point INWARD
into the interior cube interior.
```

## All Interior Cube Faces

The interior cube needs corrections on all 6 faces:

```
Interior Cube Bounds: x ∈ [4,6], y ∈ [4,6], z ∈ [4,6]

Face       Current Normal    Correct Normal    Why
───────────────────────────────────────────────────────────
Bottom     (0, 1, 0) ✗      (0, -1, 0) ✓    Points INTO interior
  y=4      points UP        points DOWN

Top        (0, -1, 0) ✗     (0, 1, 0) ✓     Points INTO interior
  y=6      points DOWN      points UP

Left       (1, 0, 0) ✗      (-1, 0, 0) ✓    Points INTO interior
  x=4      points RIGHT     points LEFT

Right      (-1, 0, 0) ✗     (1, 0, 0) ✓     Points INTO interior
  x=6      points LEFT      points RIGHT

Front      (0, 0, 1) ✗      (0, 0, -1) ✓    Points INTO interior
  z=4      points BACK      points FORWARD

Back       (0, 0, -1) ✗     (0, 0, 1) ✓     Points INTO interior
  z=6      points FORWARD   points BACK
```

## Point Offset Visualization

### For Exterior Wall (x=0)

```
     Room             Free Space
     [occupied]       [empty]

     ┌─────────────────┐
     │ • • • • • • • • │  measurement points offset outward
     │ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ │  (into free space)
   0 │────────────────┐
     │               /  normal vector points here
     │              /   (outward, away from room)
```

### For Interior Cube (Current - BROKEN)

```
     Interior Cube      Room
     [occupied]        [occupied]

   6 ┌────────┐
     │ ↑ ↑ ↑ ↑ │        <--- points offset UPWARD (wrong!)
     │ • • • •│        <--- into room, not away from cube
     │        │
   4 └────────┘        (normal points upward)

Points end up OUTSIDE the interior cube, ABOVE it,
in the room proper. Visibility checks fail!
```

### For Interior Cube (After Fix - CORRECT)

```
     Interior Cube      Room
     [occupied]        [occupied]

   6 ┌────────┐
     │        │
     │ • • • •│        <--- points offset DOWNWARD (correct!)
     │ ↓ ↓ ↓ ↓│        <--- into interior cube interior
   4 └────────┘        (normal points downward)

Points stay INSIDE the interior cube interior.
Visibility checks pass! ✓
```

## Intensity Calculation Flow

### Current Broken Flow

```
measurement_point = (5.0, 4.01, 5.0)  [outside interior cube]
light_position = (5.0, 9.0, 5.0)

Step 1: Calculate direction
  direction = light_position - measurement_point
  direction = (0, 4.99, 0)
  distance = 4.99

Step 2: Check line of sight
  is_path_clear(measurement_point, light_position)?
  ray: (5.0, 4.01, 5.0) → (5.0, 9.0, 5.0)
  ray passes through interior cube walls ✗
  returns FALSE

Step 3: Calculate intensity
  if not is_path_clear: return 0 ✗

Result: intensity = 0.000000 W/m² (BLACK)
```

### Corrected Flow (After Fix)

```
measurement_point = (5.0, 3.99, 5.0)  [inside interior cube]
light_position = (5.0, 9.0, 5.0)

Step 1: Calculate direction
  direction = light_position - measurement_point
  direction = (0, 5.01, 0)
  distance = 5.01

Step 2: Check line of sight
  is_path_clear(measurement_point, light_position)?
  ray: (5.0, 3.99, 5.0) → (5.0, 9.0, 5.0)
  ray stays within room interior ✓
  returns TRUE

Step 3: Calculate intensity
  intensity = 100.0 / (4π × 5.01²)
  intensity = 0.000318 W/m² (COLORED)

Result: Displays as appropriate color based on intensity
```

## Summary Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    MEASUREMENT POINT FLOW                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  room.json triangles                                         │
│       ↓                                                       │
│  ┌─────────────────────────────────────────────────┐        │
│  │ Exterior walls: normal point outward ✓ OK       │        │
│  │ Interior cube: normal point INWARD ✗ INVERTED  │        │
│  └─────────────────────────────────────────────────┘        │
│       ↓                                                       │
│  MeshSampler.generate_measurement_points()                   │
│       ├─ Sample point on triangle                           │
│       └─ Offset by normal × 0.01                            │
│           ├─ Exterior walls: ✓ Points in free space         │
│           └─ Interior cube: ✗ Points outside interior       │
│       ↓                                                       │
│  ┌─────────────────────────────────────────────────┐        │
│  │ Valid points: visibility checks PASS            │ → ✓   │
│  │ Invalid points: visibility checks FAIL          │ → ✗   │
│  └─────────────────────────────────────────────────┘        │
│       ↓                                                       │
│  IntensityCalculator.calculate_intensity()                   │
│       ├─ Valid points: compute inverse square law            │
│       │   → Non-zero intensity                               │
│       └─ Invalid points: return 0                            │
│           → Zero intensity                                   │
│       ↓                                                       │
│  Frontend visualization                                      │
│       ├─ Non-zero intensity: colored sphere ✓ (plane)       │
│       └─ Zero intensity: black sphere ✗ (simple room)       │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## The Fix

Simply invert the normals for the interior cube triangles in room.json:

**Triangle 12 (before):**
```json
{
  "v0": {"x": 4, "y": 4, "z": 4},
  "v1": {"x": 4, "y": 4, "z": 6},
  "v2": {"x": 6, "y": 4, "z": 6},
  "normal": {"x": 0, "y": 1, "z": 0},
  "reflectivity": 0.5
}
```

**Triangle 12 (after):**
```json
{
  "v0": {"x": 4, "y": 4, "z": 4},
  "v1": {"x": 4, "y": 4, "z": 6},
  "v2": {"x": 6, "y": 4, "z": 6},
  "normal": {"x": 0, "y": -1, "z": 0},  // Flipped!
  "reflectivity": 0.5
}
```

Apply this to all 12 triangles of the interior cube (triangles 12-23).

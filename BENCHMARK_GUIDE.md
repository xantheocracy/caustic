# Performance Benchmarking & Optimization Guide

## Overview

This guide explains how to use the benchmark script to optimize the UV light simulator for large environments like the airplane interior (400k+ triangles).

## Quick Start

### Run the Full Benchmark Suite

```bash
cd /home/samdower/caustic
python site/backend/benchmark.py
```

**Expected Duration:** 10-20 minutes depending on hardware

**What It Does:**
- Phase 1: Tests grid_cell_size (8 different values)
- Phase 2: Tests point scalability (4 different point counts)
- Phase 3: Tests light scaling (4 different light counts)
- Phase 4: Tests reflection overhead (5 different photon counts)
- Phase 5: Estimates final configuration (1000 pts, 10 lights)

### Run Selective Benchmarks

If you only want specific phases:

```python
# In a Python script or interactive shell:
from site.backend.benchmark import *

triangles = load_airplane_triangles("site/backend/settings/half_plane_interior_triangles.json")
results = BenchmarkResults()

# Run only Phase 1 (grid tuning)
lights = create_test_lights(1, triangles)
points = create_test_points(10, triangles)

for grid_size in [0.25, 0.5, 1.0, 2.0, 5.0, 10.0]:
    elapsed = run_simulation(triangles, lights, points,
                            IntensityConfig(max_bounces=0,
                                          grid_cell_size=grid_size,
                                          photons_per_light=10))
    print(f"Grid size {grid_size}: {elapsed:.2f}s")
```

## Understanding the Results

### Phase 1: Grid Cell Size Optimization

**What It Tests:**
- Different `grid_cell_size` values with 10 points, 1 light, direct lighting only

**Why It Matters:**
- Cell size is critical for ray traversal performance (Option B optimization)
- Too small: Many cells to traverse, more memory
- Too large: Many triangles per cell, expensive intersection tests

**What to Look For:**
```
Config           Grid     Photons   Bounces   Time (s)   Points   ms/point   pts/sec
=============================================================================================
Phase1: grid=0.5   0.5      10         0       2.45       10        245.0      4.1
Phase1: grid=1.0   1.0      10         0       1.89       10        189.0      5.3
Phase1: grid=2.0   2.0      10         0       1.52       10        152.0      6.6
Phase1: grid=5.0   5.0      10         0       1.45       10        145.0      6.9  ← Best
Phase1: grid=10.0  10.0     10         0       2.10       10        210.0      4.8
```

**Interpretation:** Grid size of 5.0 is optimal (fastest)

**Auto-Calculated Suggestion:**
The benchmark automatically calculates an optimal size based on mesh statistics:
```
Suggested grid_cell_size (auto-calculated): 2.34
```
This is a good starting point but may differ from empirical best.

### Phase 2: Point Scalability

**What It Tests:**
- Scaling from 10 → 100 points with best grid size, 1 light, direct only

**Why It Matters:**
- Verifies linear scaling (time should scale with point count)
- Helps extrapolate to 1000 points

**What to Look For:**
```
Phase2: 10pts      5.0      10         0       1.45       10        145.0      6.9
Phase2: 25pts      5.0      10         0       3.35       25        134.0      7.5
Phase2: 50pts      5.0      10         0       6.82       50        136.4      7.3
Phase2: 100pts     5.0      10         0      13.78      100        137.8      7.3
```

**Interpretation:** ~140ms per point is consistent (good linear scaling)

**Extrapolation:** 1000 points = 140ms × 1000 = 140 seconds direct only

### Phase 3: Light Scaling

**What It Tests:**
- Scaling from 1 → 10 lights with 50 points, direct only

**Why It Matters:**
- Direct light scales linearly with light count
- Reflections add multiplicative overhead

**What to Look For:**
```
Phase3: 1lights    5.0      10         0       6.82       50        136.4      7.3
Phase3: 2lights    5.0      10         0      13.48       50        269.6      3.7
Phase3: 5lights    5.0      10         0      34.02       50        680.4      1.5
Phase3: 10lights   5.0      10         0      68.12       50       1362.4      0.7
```

**Interpretation:** Linear scaling (each light adds ~6.8s for 50 points)

**Extrapolation:** 10 lights × 1000 points = 1360 seconds (23 minutes) direct only

### Phase 4: Reflection Overhead

**What It Tests:**
- Photon count impact with 50 points, 2 lights, max_bounces=1

**Why It Matters:**
- Enables/disables Option A (spatial point grid for photons)
- Photon count trades quality for speed

**What to Look For:**
```
Phase4: 10photons      5.0      10         1      1.98       50        39.6      25.3
Phase4: 50photons      5.0      50         1      5.24       50       104.8       9.5
Phase4: 100photons     5.0     100         1      8.92       50       178.4       5.6
Phase4: 500photons     5.0     500         1     29.53       50       590.6       1.7
Phase4: 1000photons    5.0    1000         1     57.08       50      1141.6       0.9
```

**Interpretation:**
- 10 photons: ~1.98s baseline (photon tracing overhead)
- 1000 photons: ~55s additional (28x more)
- Good balance: 100-500 photons

**Extrapolation:** For 1000 points, 2 lights:
- Baseline (50 points): 8.92s
- Scale to 1000 points: 8.92 × 20 = 178.4s
- Scale to 10 lights: 178.4 × 5 = 892s (15 minutes)

### Phase 5: Estimate Final Configuration

**What It Does:**
Uses Phase 2-4 data to estimate the full workload:

```
Estimated Times:
  50 pts, 1 light, direct:        6.82s (measured)
  1000 pts, 1 light, direct:      136.4s (20x scaling)
  1000 pts, 10 lights, direct:    1364s (10x light scaling)
  1000 pts, 10 lights, 1 bounce:  29476s (with reflections)
```

**Interpretation:**
- Direct only (no reflections): ~23 minutes
- With 1 bounce: ~8 hours (too slow!)
- Need to optimize photon count or reduce bounces

## Optimization Strategies

### Strategy 1: Disable Reflections

**For Preview/Testing:**
```python
IntensityConfig(
    max_bounces=0,              # No reflections
    grid_cell_size=5,           # Optimal from Phase 1
    photons_per_light=10,       # Irrelevant (no reflections)
)
# Estimated time for 1000 pts, 10 lights: ~23 minutes
```

### Strategy 2: Reduce Photon Count

**For Preview with Reflections:**
```python
IntensityConfig(
    max_bounces=1,
    grid_cell_size=5,
    photons_per_light=100,      # Reduced from 10000 default
)
# Estimated quality: Medium (visible photon noise)
# Estimated time for 1000 pts, 10 lights: ~500-600 seconds (~10 minutes)
```

### Strategy 3: Reduce Point Count

**For Sparse Sampling:**
```python
IntensityConfig(
    max_bounces=1,
    grid_cell_size=5,
    photons_per_light=500,
)
# Sample 500 points instead of 1000
# Estimated time: ~5 minutes
```

### Strategy 4: Progressive Rendering

**For Interactive Preview:**
1. Start with small sample (50 points, max_bounces=0): ~7 seconds
2. Refine with more points (500 points, max_bounces=0): ~70 seconds
3. Add reflections if needed (1 bounce): ~10x overhead

### Strategy 5: Use Clustering

**For Dense Point Distributions:**
```python
from caustic import IntensityConfig
from caustic.simulation.photon_tracing import PhotonTracingConfig

config = IntensityConfig(
    max_bounces=1,
    grid_cell_size=5,
    photons_per_light=500,
    clustering_distance=1.0,    # Group nearby points
)
# Can reduce point checks by 3-8x
# Estimated time for 1000 pts: ~5 minutes
```

## Real-World Tuning Example

### Scenario: Optimize for 1000 points, 10 lights, 1 reflection

**Step 1: Run Phase 1-3 only**
```bash
# Modify benchmark.py to skip phases 4-5
# Expected time: 5-10 minutes
```

**Step 2: Analyze Results**
- Best grid size from Phase 1: 3.5
- Time per point: 145ms (Phase 2)
- Light multiplier: 10x (Phase 3)
- Estimated for 1000 pts, 10 lights, direct: 1450s

**Step 3: Test Different Photon Counts**
```python
for photon_count in [50, 100, 200]:
    config = IntensityConfig(max_bounces=1, grid_cell_size=3.5,
                            photons_per_light=photon_count)
    # Measure timing
```

**Step 4: Choose Best Balance**
- 50 photons: ~30s for 1000 pts, 10 lights (fast, noisy)
- 100 photons: ~45s (good balance)
- 200 photons: ~75s (better quality)

**Step 5: Deploy**
```python
IntensityConfig(
    max_bounces=1,
    grid_cell_size=3.5,
    photons_per_light=100,
)
```

## Performance Optimization Checklist

### Code-Level Optimizations (Already Applied)

✅ **Option A: Spatial Grid for Sample Points**
- Reduces photon flux deposition from O(n_points) to O(nearby_points)
- Active when max_bounces > 0
- Impact: 10-50x for large point sets

✅ **Option B: DDA Ray Traversal**
- Only visits cells ray actually intersects
- Always active
- Impact: 2-5x for ray traversal

✅ **Option C: Lamp Manager Caching**
- Caches singleton instead of repeated lookups
- Always active
- Impact: 2-3x for photon tracing

✅ **Option D: Point Clustering (Optional)**
- Groups nearby measurement points
- Disabled by default
- Impact: 3-8x for very dense point sets

✅ **NEW: Early-Exit Facing Check**
- Rejects back-facing triangles before full intersection test
- Reduces intersection calculations
- Impact: 1.5-2x for sparse triangles

### Configuration-Level Optimizations

1. **Tune grid_cell_size**: 2-4x average triangle size
   - Run Phase 1 to find empirically optimal value

2. **Reduce photons_per_light**: Balance quality vs speed
   - 10-100: Preview mode
   - 500-1000: Production mode
   - 5000+: High quality

3. **Control max_bounces**: More bounces = more time
   - 0: Direct only (fastest)
   - 1: First reflection (good balance)
   - 2+: Multiple reflections (slow)

4. **Manage point count**: Linear scaling
   - Start small (10-50), extrapolate
   - Use progressive rendering

5. **Distribute lights**: Linear scaling per light
   - Each light adds ~6.8s per 50 points
   - Can distribute computation if needed

## Troubleshooting

### Benchmark Takes Too Long

**Problem:** Phase 2 or later taking > 30 minutes

**Solution:**
- Skip later phases (edit benchmark.py)
- Run only Phase 1 with subset of triangles
- Extrapolate using linear scaling

### Grid Size Makes No Difference

**Problem:** All grid sizes perform similarly

**Likely Cause:**
- Triangle distribution is uniform
- Grid size in reasonable range (0.5-5.0)
- Other operations are bottleneck (intersection tests)

**Try:**
- Reduce photon count (Phase 4)
- Check CPU throttling
- Profile with python -m cProfile

### Simulation Crashes with Large Point Count

**Problem:** Out of memory with 1000+ points

**Solution:**
- Reduce photons_per_light
- Disable max_bounces
- Use clustering_distance
- Process points in batches

## Useful Commands

### Auto-Calculate Optimal Grid Size

```python
from caustic.spatial.grid import calculate_optimal_cell_size
from site.backend.benchmark import load_airplane_triangles

triangles = load_airplane_triangles("site/backend/settings/half_plane_interior_triangles.json")
optimal = calculate_optimal_cell_size(triangles)
print(f"Suggested grid_cell_size: {optimal:.2f}")
```

### Quick Test (50 points, 1 light, direct)

```bash
cd /home/samdower/caustic
python -c "
from site.backend.benchmark import *
import time

triangles = load_airplane_triangles('site/backend/settings/half_plane_interior_triangles.json')
lights = create_test_lights(1, triangles)
points = create_test_points(50, triangles)

config = IntensityConfig(max_bounces=0, grid_cell_size=3.5, photons_per_light=10)
elapsed = run_simulation(triangles, lights, points, config)
print(f'Time: {elapsed:.2f}s for {len(points)} points')
"
```

### Profile a Simulation

```bash
python -m cProfile -s cumulative site/backend/benchmark.py 2>&1 | head -30
```

## Expected Performance

### Baseline (Airplane, 400k+ triangles)

| Config | Points | Lights | Bounces | Photons | Estimated Time |
|---|---|---|---|---|---|
| Preview | 50 | 2 | 0 | 10 | 15-30s |
| Preview | 50 | 10 | 0 | 10 | 150-300s |
| Interactive | 500 | 2 | 1 | 100 | 1-2 min |
| Production | 1000 | 10 | 1 | 500 | 5-10 min |
| High Quality | 1000 | 10 | 2 | 2000 | 20-40 min |

*Times depend on your hardware (CPU cores, frequency)*

## Next Steps

1. Run the benchmark suite: `python site/backend/benchmark.py`
2. Note the optimal grid_cell_size from Phase 1
3. Review Phase 5 estimates
4. Choose a configuration that fits your time constraints
5. Update test.py with optimal settings

```python
# In site/backend/test.py, line 182:
IntensityConfig(
    max_bounces=0,                    # or 1 for reflections
    grid_cell_size=<BEST_FROM_PHASE_1>,
    photons_per_light=<CHOICE>,
    verbose=False
)
```

Good luck with optimization!

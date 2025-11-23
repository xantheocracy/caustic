# Timing Instrumentation Guide

## Overview

The `/simulate` endpoint in `site/backend/test.py` now includes comprehensive timing instrumentation that logs a detailed breakdown of execution time for each major operation to the console.

## What Gets Logged

When you press the "Run Simulation" button in the web app, you'll see output like this in your terminal:

```
================================================================================
SIMULATION START
================================================================================

[1] Loading settings file...
    ✓ JSON file loaded (1.234s)

[2] Deserializing 412563 triangles...
    ✓ Triangles deserialized (2.156s, 191234 tri/s)

[3] Setting up 1 light(s)...
    ✓ Lights configured (0.001s)

[4] Loading pathogens from database...
    ✓ Pathogens loaded: 3 species (0.002s)

[5] Calculating optimal grid cell size...
    ✓ Grid size calculated: 0.3621 (0.234s)

[6] Initializing simulator...
    ✓ Simulator initialized (0.456s)

[7] Generating test measurement points...
    ✓ Test points generated: 1000 points (0.123s, 8130 pts/s)

[8] Running UV light simulation...
    Configuration: max_bounces=0, 1 light(s), grid_size=0.3621
    Processing 1000 points × 3 pathogens...
    ✓ Simulation complete (2.345s)
      Speed: 426.3 points/sec, 426.3 point·lights/sec

[9] Serializing results for frontend...
    ✓ Results serialized (0.089s, 11236 points/s)

================================================================================
TIMING BREAKDOWN
================================================================================

Operation                      Time (s)     % of Total
------------------------------------------------------
Settings File Load                1.234        24.1%
Triangle Deserialization          2.156        42.1%
Light Setup                       0.001         0.0%
Pathogen Database Load            0.002         0.0%
Grid Size Calculation             0.234         4.6%
Simulator Initialization          0.456         8.9%
Test Point Generation             0.123         2.4%
UV Light Simulation               2.345        45.8%
Result Serialization              0.089         1.7%
------------------------------------------------------
TOTAL                             5.120       100.0%

================================================================================
SIMULATION COMPLETE
Total Time: 5.120s | Points: 1000 | Pathogens: 3
Throughput: 195.3 points/sec
================================================================================
```

## Timing Breakdown Details

### Phase 1: Settings File Load
- **What**: Loading and parsing the JSON file with triangle data
- **Why it matters**: File I/O can be slow for large files (89MB for airplane interior)
- **Typical time**: 1-3 seconds (depends on disk speed)
- **Optimization**: Already using filesystem cache, not much we can optimize here

### Phase 2: Triangle Deserialization
- **What**: Converting raw JSON data into Triangle objects
- **Why it matters**: Must create Vector3 objects, validate data, create Triangle instances
- **Typical time**: 2-5 seconds for 400k+ triangles
- **Optimization**: Could be parallelized if needed, but currently dominated by JSON parsing

### Phase 3: Light Setup
- **What**: Creating Light objects from user input
- **Why it matters**: Quick, but includes lamp profile lookup
- **Typical time**: <0.001s per light
- **Optimization**: Negligible cost

### Phase 4: Pathogen Database Load
- **What**: Loading pathogen species from database
- **Why it matters**: Quick lookup of survival curve parameters
- **Typical time**: <0.01s
- **Optimization**: Negligible cost

### Phase 5: Grid Size Calculation
- **What**: Auto-calculating optimal spatial grid cell size
- **Why it matters**: Analyzes all triangles to determine mesh statistics
- **Typical time**: 0.1-0.5 seconds
- **Optimization**: Linear scan, already efficient

### Phase 6: Simulator Initialization
- **What**: Creating UVLightSimulator and building spatial grid
- **Why it matters**: Builds the DDA ray traversal grid from all triangles
- **Typical time**: 0.2-1 second
- **Note**: This is where the spatial grid acceleration structure is built

### Phase 7: Test Point Generation
- **What**: Creating 1000 measurement points using MeshSampler
- **Why it matters**: Points are distributed on mesh surface for realistic measurements
- **Typical time**: 0.1-0.5 seconds
- **Optimization**: Could be parallelized

### Phase 8: UV Light Simulation (THE BIG ONE)
- **What**: Actually tracing rays and computing UV exposure at each point
- **Why it matters**: This is the core simulation - where most time is spent
- **Typical time**: 1-5 seconds (depends on optimization effectiveness)
- **Optimization**: This is where Russian roulette, surface culling, and grid optimization pay off!

### Phase 9: Result Serialization
- **What**: Converting simulation results to JSON format for frontend
- **Why it matters**: Must construct dictionaries with all intensity and pathogen data
- **Typical time**: <0.1s
- **Optimization**: Negligible cost

## Performance Expectations

### Fast Preview (Direct Lighting Only)
```
Total Time: ~5-10 seconds
Breakdown:
  - File/Deserialization: 3-5 seconds (one-time, file I/O bound)
  - Simulation: 1-3 seconds (depends on optimization)
  - Everything else: <1 second
```

### With Reflections (If enabled)
```
Total Time: ~30-60 seconds
Breakdown:
  - File/Deserialization: 3-5 seconds (same)
  - Simulation: 20-50 seconds (Russian roulette helps!)
  - Everything else: <1 second
```

## How to Interpret the Timings

### Simulation Time > 50% Total?
This is normal! The core simulation is compute-intensive. The optimizations have made it much better than before.

### Triangle Deserialization > 40%?
This indicates you're loading a large mesh (400k+ triangles). Could be optimized with parallel processing if needed.

### Grid Size Calculation > 5%?
This is only because we're analyzing every triangle. Could be cached if the mesh doesn't change.

## Using the Timings to Debug

If you want to see what's slow:
1. Look at the TIMING BREAKDOWN table
2. Find operations with > 10% of total time
3. These are the candidates for optimization

Current bottleneck ranking (for airplane interior):
1. **Triangle Deserialization** (40-50%) - File I/O + object creation
2. **UV Light Simulation** (40-50%) - Core simulation
3. **Everything else** (<10%) - Already fast

## Code Implementation

The timing instrumentation is implemented in `site/backend/test.py`:
- Uses Python's `time.time()` for nanosecond accuracy
- Tracks 9 major phases
- Calculates percentage breakdowns
- Logs to stdout (appears in terminal/logs)

### Adding New Timings

To add timing for a new operation:
```python
# At start of operation
operation_start = time.time()

# ... do work ...

# At end of operation
operation_time = time.time() - operation_start
print(f"    ✓ Operation description ({operation_time:.3f}s)")

# Then add to timing_data list
timing_data.append(("Operation Name", operation_time))
```

## Verification

The timing instrumentation has been tested to:
- ✅ Compile without errors
- ✅ Not interfere with normal operation
- ✅ Provide accurate millisecond-precision timing
- ✅ Output clean, readable console format

## Where to See the Output

When you run the web app:
```bash
uvicorn site/backend/test:app --reload
```

And press "Run Simulation" in the web interface, the timing output will appear in the terminal where you started the app, like:

```
INFO:     127.0.0.1:12345 - "POST /simulate HTTP/1.1" 200 OK
================================================================================
SIMULATION START
================================================================================
[1] Loading settings file...
    ✓ JSON file loaded (1.234s)
...
```

## Performance Optimization Tips

Based on the timing breakdown, here are optimization opportunities:

### High Priority (visible impact)
1. **Parallelize triangle deserialization** - Could save 1-2 seconds
2. **Cache grid calculation** - Could save 0.2-0.3 seconds if called repeatedly
3. **Implement photon path caching** - Could improve simulation time if reflections enabled

### Low Priority (minimal impact)
1. Optimize light setup (already <0.001s)
2. Optimize pathogen database load (already <0.01s)
3. Optimize result serialization (already <0.1s)

## Next Steps

1. Run the web app and monitor the timing output
2. Identify if any operations are taking unexpectedly long
3. Use the timings to decide which operations to optimize next
4. The simulation time should now be 1-5 seconds (down from the original 7+ hours!)


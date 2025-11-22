import { UVLightSimulator, Pathogen, Vector3 } from '../index';
import { createSimpleRoomEnvironment, generateFloorTestPoints } from './simple_room';

/**
 * Run a simple simulation on the test room
 */
function runSimulation() {
  console.log('=== UV Light Simulator: Simple Room Test ===\n');

  // Create environment
  const { triangles, lights } = createSimpleRoomEnvironment();
  console.log(`Room setup: ${triangles.length} triangles, ${lights.length} light(s)\n`);

  // Define some test pathogens
  const pathogens: Pathogen[] = [
    { name: 'E. coli', kValue: 0.001 },
    { name: 'COVID-19 (Omicron)', kValue: 0.003 },
    { name: 'Influenza A', kValue: 0.002 },
  ];

  // Create simulator
  const simulator = new UVLightSimulator(triangles, lights, {
    maxBounces: 0,
    gridCellSize: 5,
  });

  // Generate test points on the floor
  const testPoints = generateFloorTestPoints();
  console.log(`Running simulation on ${testPoints.length} floor points...\n`);

  // Run simulation with 60 second exposure
  const exposureTime = 60; // seconds
  const results = simulator.simulate(testPoints, pathogens, exposureTime);

  // Display results
  console.log(`Results for ${exposureTime} second UV exposure:\n`);
  console.log('Position (x,y,z) | Intensity (W/m²) | E. coli | COVID-19 | Influenza A');
  console.log('-'.repeat(90));

  for (const result of results) {
    const pos = result.position;
    const posStr = `(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`.padEnd(16);
    const intensityStr = result.intensity.totalIntensity.toFixed(4).padEnd(16);

    // Get survival rates for each pathogen
    const survivalStrs = result.pathogenSurvival.map((s) =>
      `${(s.survivalRate * 100).toFixed(2)}%`.padEnd(9)
    );

    console.log(
      posStr + ' | ' + intensityStr + ' | ' + survivalStrs.join(' | ')
    );
  }

  // Print summary statistics
  console.log('\n' + '='.repeat(90));
  console.log('Summary Statistics:\n');

  const intensities = results.map((r) => r.intensity.totalIntensity);
  const maxIntensity = Math.max(...intensities);
  const minIntensity = Math.min(...intensities);
  const avgIntensity = intensities.reduce((a, b) => a + b, 0) / intensities.length;

  console.log(`Max intensity: ${maxIntensity.toFixed(4)} W/m²`);
  console.log(`Min intensity: ${minIntensity.toFixed(4)} W/m²`);
  console.log(`Avg intensity: ${avgIntensity.toFixed(4)} W/m²`);

  // Check for shadowing by the block
  const pointsBehindBlock = results.filter(
    (r) =>
      r.position.x > 4 &&
      r.position.x < 6 &&
      r.position.z > 4 &&
      r.position.z < 6
  );

  if (pointsBehindBlock.length > 0) {
    const blockShadowIntensity = pointsBehindBlock.reduce(
      (sum, r) => sum + r.intensity.totalIntensity,
      0
    ) / pointsBehindBlock.length;
    console.log(
      `\nAvg intensity in block shadow region: ${blockShadowIntensity.toFixed(4)} W/m²`
    );
    console.log(
      `Intensity reduction due to block: ${(
        ((avgIntensity - blockShadowIntensity) / avgIntensity) *
        100
      ).toFixed(2)}%`
    );
  }
}

// Run the simulation
runSimulation();

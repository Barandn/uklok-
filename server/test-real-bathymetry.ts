/**
 * Test Real Bathymetry Integration
 * Tests NOAA ERDDAP ETOPO 2022 data with genetic algorithm
 * Validates depth checks against vessel draft
 */

import { runGeneticOptimization } from './genetic-algorithm';
import { DigitalTwin } from './vessel-performance';
import { getRealDepth, getBathymetryStats, prefetchRouteDepths } from './bathymetry';
import { checkDepth } from './weather';

// Test vessel: Container ship with 12m draft
const testVessel = new DigitalTwin({
  dwt: 50000,
  length: 250,
  beam: 32,
  draft: 12, // 12 meters draft - requires minimum 18m depth (1.5x safety)
  serviceSpeed: 18,
  fuelType: 'HFO',
  fuelConsumptionRate: 50,
  enginePower: 15000,
});

// Route: Istanbul to Naples (Mediterranean)
const istanbul = { lat: 41.0082, lon: 28.9784 };
const naples = { lat: 40.8518, lon: 14.2681 };

console.log('🧬 Real Bathymetry Test - Genetic Algorithm');
console.log('============================================');
console.log(`Route: Istanbul (${istanbul.lat}, ${istanbul.lon}) → Naples (${naples.lat}, ${naples.lon})`);
console.log(`Vessel: Container Ship, Draft: ${testVessel.vessel.draft}m, Required Depth: ${testVessel.vessel.draft * 1.5}m\n`);

async function testDepthAPI() {
  console.log('📊 Testing ERDDAP API directly...\n');

  const testPoints = [
    { name: 'Istanbul (Bosphorus)', lat: 41.0082, lon: 28.9784 },
    { name: 'Marmara Sea', lat: 40.7, lon: 28.0 },
    { name: 'Aegean Sea', lat: 39.0, lon: 25.0 },
    { name: 'Ionian Sea', lat: 38.0, lon: 18.0 },
    { name: 'Naples Harbor', lat: 40.8518, lon: 14.2681 },
  ];

  for (const point of testPoints) {
    try {
      const depth = await getRealDepth(point.lat, point.lon);
      const adequate = depth >= testVessel.vessel.draft * 1.5;
      const status = adequate ? '✅' : '⚠️';

      console.log(`${status} ${point.name}`);
      console.log(`   Coordinates: (${point.lat}, ${point.lon})`);
      console.log(`   Depth: ${depth.toFixed(1)}m`);
      console.log(`   Status: ${adequate ? 'ADEQUATE' : 'TOO SHALLOW'} for ${testVessel.vessel.draft}m draft`);
      console.log('');
    } catch (error) {
      console.error(`❌ Failed to query ${point.name}:`, error);
    }
  }

  const stats = getBathymetryStats();
  console.log('📈 API Statistics:');
  console.log(`   Cache Hits: ${stats.cacheHits}`);
  console.log(`   Cache Misses: ${stats.cacheMisses}`);
  console.log(`   API Calls: ${stats.apiCalls}`);
  console.log(`   API Errors: ${stats.apiErrors}`);
  console.log(`   Fallbacks: ${stats.fallbacks}`);
  console.log('');
}

async function testGeneticAlgorithm() {
  console.log('🧬 Testing Genetic Algorithm with Real Bathymetry...\n');

  const minDepthMeters = testVessel.vessel.draft * 1.5; // 18m minimum

  console.log(`Algorithm Parameters:`);
  console.log(`   Population: 15`);
  console.log(`   Generations: 10`);
  console.log(`   Waypoints: 8`);
  console.log(`   Min Depth: ${minDepthMeters}m (1.5x draft)`);
  console.log(`   Shallow Water Avoidance: ENABLED`);
  console.log('');

  const startTime = Date.now();

  try {
    const result = await runGeneticOptimization({
      startLat: istanbul.lat,
      startLon: istanbul.lon,
      endLat: naples.lat,
      endLon: naples.lon,
      vessel: testVessel,
      populationSize: 15,
      generations: 10,
      mutationRate: 0.2,
      crossoverRate: 0.8,
      eliteCount: 3,
      numWaypoints: 8,
      weatherEnabled: false,
      avoidShallowWater: true, // Enable depth checking
      minDepth: minDepthMeters,
    });

    const duration = Date.now() - startTime;

    console.log('✅ Genetic Algorithm Completed!\n');
    console.log('📍 Route Results:');
    console.log(`   Success: ${result.success}`);
    console.log(`   Path Points: ${result.path.length}`);
    console.log(`   Total Distance: ${result.totalDistance.toFixed(1)} nm`);
    console.log(`   Total Fuel: ${result.totalFuel.toFixed(1)} tons`);
    console.log(`   Total CO2: ${result.totalCO2.toFixed(1)} tons`);
    console.log(`   Duration: ${(result.totalDuration / 24).toFixed(1)} days`);
    console.log(`   Computation Time: ${(duration / 1000).toFixed(1)}s`);
    console.log('');

    // Validate waypoint depths
    console.log('🌊 Waypoint Depth Validation:\n');

    let shallowPoints = 0;
    let landPoints = 0;

    for (let i = 0; i < result.path.length; i++) {
      const point = result.path[i];
      const depth = checkDepth(point.lat, point.lon);
      const adequate = depth >= minDepthMeters;
      const isLand = depth === 0;

      if (isLand) landPoints++;
      if (!adequate && !isLand) shallowPoints++;

      const status = isLand ? '🚫' : adequate ? '✅' : '⚠️';

      console.log(`${status} Waypoint ${i}: (${point.lat.toFixed(4)}, ${point.lon.toFixed(4)})`);
      console.log(`   Depth: ${depth.toFixed(1)}m - ${isLand ? 'LAND' : adequate ? 'OK' : 'SHALLOW'}`);

      if (i < result.path.length - 1) {
        console.log('');
      }
    }

    console.log('');
    console.log('📊 Summary:');
    console.log(`   Total Waypoints: ${result.path.length}`);
    console.log(`   Land Points: ${landPoints} ${landPoints > 0 ? '🚫' : '✅'}`);
    console.log(`   Shallow Points: ${shallowPoints} ${shallowPoints > 0 ? '⚠️' : '✅'}`);
    console.log(`   Valid Points: ${result.path.length - landPoints - shallowPoints} ✅`);
    console.log('');

    const finalStats = getBathymetryStats();
    console.log('📈 Final Bathymetry Statistics:');
    console.log(`   Total Cache Hits: ${finalStats.cacheHits}`);
    console.log(`   Total Cache Misses: ${finalStats.cacheMisses}`);
    console.log(`   Total API Calls: ${finalStats.apiCalls}`);
    console.log(`   API Errors: ${finalStats.apiErrors}`);
    console.log(`   Fallbacks Used: ${finalStats.fallbacks}`);
    console.log(`   Cache Hit Rate: ${(finalStats.cacheHits / (finalStats.cacheHits + finalStats.cacheMisses) * 100).toFixed(1)}%`);

  } catch (error) {
    console.error('❌ Genetic Algorithm Failed:', error);
    throw error;
  }
}

async function main() {
  try {
    // Step 1: Test direct API access
    await testDepthAPI();

    console.log('─'.repeat(80));
    console.log('');

    // Step 2: Test genetic algorithm with bathymetry
    await testGeneticAlgorithm();

    console.log('');
    console.log('✅ All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

main();

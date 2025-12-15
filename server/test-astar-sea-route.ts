/**
 * Test: A* Sea-Only Route Verification
 * Tests the A* pathfinding directly on the ocean mask
 * Fast test - no genetic algorithm overhead
 */

import { findOceanPath, validateSeaRoute, isPointInSea } from './sea-mask';
import { calculateGreatCircleDistance } from './vessel-performance';

// Test routes
const testRoutes = [
  {
    name: 'İstanbul → Napoli',
    start: { lat: 41.0082, lon: 28.9784 },
    end: { lat: 40.8518, lon: 14.2681 },
  },
  {
    name: 'İstanbul → Londra',
    start: { lat: 41.0082, lon: 28.9784 },
    end: { lat: 51.5074, lon: 0.1278 },
  },
  {
    name: 'Pire → Barcelona',
    start: { lat: 37.9416, lon: 23.6470 },
    end: { lat: 41.3851, lon: 2.1734 },
  },
];

async function runTest() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  A* OCEAN PATH TEST - GUARANTEED SEA-ONLY ROUTES');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  for (const route of testRoutes) {
    console.log(`🚢 ${route.name}`);
    console.log(`   Start: ${route.start.lat}, ${route.start.lon}`);
    console.log(`   End: ${route.end.lat}, ${route.end.lon}`);

    // Calculate direct distance
    const directDistance = calculateGreatCircleDistance(
      route.start.lat, route.start.lon,
      route.end.lat, route.end.lon
    );
    console.log(`   Direct distance: ${directDistance.toFixed(2)} nm`);

    // Check start/end are in sea or near sea
    const startInSea = isPointInSea(route.start.lat, route.start.lon);
    const endInSea = isPointInSea(route.end.lat, route.end.lon);
    console.log(`   Start in sea: ${startInSea ? '✅' : '⚠️ (will find nearest)'}`);
    console.log(`   End in sea: ${endInSea ? '✅' : '⚠️ (will find nearest)'}`);

    // Find A* path
    console.log('   Finding A* ocean path...');
    const startTime = Date.now();
    const result = findOceanPath(
      route.start.lat, route.start.lon,
      route.end.lat, route.end.lon
    );
    const duration = Date.now() - startTime;
    console.log(`   Time: ${duration}ms`);

    if (result.success && result.path.length > 0) {
      // Calculate total distance
      let totalDistance = 0;
      for (let i = 0; i < result.path.length - 1; i++) {
        totalDistance += calculateGreatCircleDistance(
          result.path[i].lat, result.path[i].lon,
          result.path[i + 1].lat, result.path[i + 1].lon
        );
      }

      console.log(`   ✅ Path found: ${result.path.length} waypoints`);
      console.log(`   📏 Route distance: ${totalDistance.toFixed(2)} nm`);
      console.log(`   📊 Distance ratio: ${(totalDistance / directDistance).toFixed(2)}x`);

      // Validate the path
      const validation = validateSeaRoute(result.path);
      if (validation.valid) {
        console.log(`   🌊 Validation: ✅ ALL WAYPOINTS IN SEA`);
        passed++;
      } else {
        console.log(`   ⚠️ Validation: Land points: ${validation.landPoints.length}, Land segments: ${validation.landSegments.length}`);
        failed++;
      }

      // Show first and last few waypoints
      console.log(`   Waypoints:`);
      const maxShow = Math.min(5, result.path.length);
      for (let i = 0; i < maxShow; i++) {
        const p = result.path[i];
        const inSea = isPointInSea(p.lat, p.lon);
        console.log(`      ${i}: ${inSea ? '🌊' : '⚠️'} lat=${p.lat.toFixed(4)}, lon=${p.lon.toFixed(4)}`);
      }
      if (result.path.length > maxShow) {
        console.log(`      ... ${result.path.length - maxShow * 2} more waypoints ...`);
        for (let i = Math.max(maxShow, result.path.length - maxShow); i < result.path.length; i++) {
          const p = result.path[i];
          const inSea = isPointInSea(p.lat, p.lon);
          console.log(`      ${i}: ${inSea ? '🌊' : '⚠️'} lat=${p.lat.toFixed(4)}, lon=${p.lon.toFixed(4)}`);
        }
      }
    } else {
      console.log(`   ❌ Path not found: ${result.message}`);
      failed++;
    }

    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  RESULT: ${passed}/${testRoutes.length} routes found valid sea paths`);
  if (passed === testRoutes.length) {
    console.log('  🎉 ALL TESTS PASSED - SEA-ONLY ROUTING WORKS!');
  } else {
    console.log('  ⚠️ Some routes failed');
  }
  console.log('═══════════════════════════════════════════════════════════════\n');

  process.exit(failed === 0 ? 0 : 1);
}

runTest();

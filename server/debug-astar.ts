import { runAStarOptimization } from './astar-algorithm';
import { DigitalTwin } from './vessel-performance';

const testVessel = new DigitalTwin({
  dwt: 50000,
  length: 250,
  beam: 32,
  draft: 12,
  serviceSpeed: 18,
  fuelType: 'HFO',
  fuelConsumptionRate: 50,
  enginePower: 15000,
});

console.log('🚢 A* Debug Test - İstanbul to Napoli');
console.log('=====================================');

runAStarOptimization({
  startLat: 41.0082,
  startLon: 28.9784,
  endLat: 40.8518,
  endLon: 14.2681,
  vessel: testVessel,
  gridResolution: 0.25, // Daha küçük grid - daha hassas
  maxIterations: 1000, // Daha fazla iterasyon
  heuristicWeight: 1.2, // Daha dengeli heuristic
  weatherEnabled: false,
  avoidShallowWater: false,
  minDepth: 10,
}).then(result => {
  console.log('\n✅ Sonuç:', {
    success: result.success,
    pathLength: result.path.length,
    totalDistance: result.totalDistance?.toFixed(2),
    totalFuel: result.totalFuel?.toFixed(2),
    iterations: result.iterations,
  });
  
  if (result.path.length > 0) {
    console.log('\n📍 İlk 5 Waypoint:');
    result.path.slice(0, 5).forEach((p, i) => {
      console.log(`  ${i}: lat=${p.lat.toFixed(4)}, lon=${p.lon.toFixed(4)}`);
    });
  } else {
    console.error('\n❌ PATH BOŞ! Algoritma rota bulamadı.');
  }
  
  process.exit(0);
}).catch(err => {
  console.error('\n❌ HATA:', err.message);
  process.exit(1);
});

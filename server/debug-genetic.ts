import { runGeneticOptimization } from './genetic-algorithm';
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

console.log('🧬 Genetik Algoritma Debug Test - İstanbul to Napoli');
console.log('====================================================');

runGeneticOptimization({
  startLat: 41.0082,
  startLon: 28.9784,
  endLat: 40.8518,
  endLon: 14.2681,
  vessel: testVessel,
  populationSize: 15,
  generations: 10,
  mutationRate: 0.2,
  crossoverRate: 0.8,
  eliteCount: 3,
  numWaypoints: 10,
  weatherEnabled: false,
  avoidShallowWater: true,
  minDepth: 24,
}).then(result => {
  console.log('\n✅ Sonuç:', {
    success: result.success,
    pathLength: result.path.length,
    totalDistance: result.totalDistance?.toFixed(2),
    totalFuel: result.totalFuel?.toFixed(2),
  });
  
  if (result.path.length > 0) {
    console.log('\n📍 İlk 10 Waypoint:');
    result.path.forEach((p, i) => {
      console.log(`  ${i}: lat=${p.lat.toFixed(4)}, lon=${p.lon.toFixed(4)}`);
    });
  } else {
    console.error('\n❌ PATH BOŞ! Algoritma rota bulamadı.');
  }
  
  process.exit(0);
}).catch(err => {
  console.error('\n❌ HATA:', err.message);
  console.error(err.stack);
  process.exit(1);
});

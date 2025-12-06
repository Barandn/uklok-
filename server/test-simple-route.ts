import { createSimpleRoute } from './simple-route';
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

console.log('🚢 Basit Rota Testi - İstanbul to Napoli');
console.log('=========================================');

createSimpleRoute(
  41.0082, // İstanbul
  28.9784,
  40.8518, // Napoli
  14.2681,
  testVessel,
  30 // 30 waypoint
).then(result => {
  console.log('\n✅ Sonuç:', {
    success: result.success,
    pathLength: result.path.length,
    totalDistance: result.totalDistance.toFixed(2) + ' nm',
    totalFuel: result.totalFuel.toFixed(2) + ' ton',
    totalCO2: result.totalCO2.toFixed(2) + ' ton',
    totalDuration: result.totalDuration.toFixed(2) + ' hours',
    message: result.message,
  });
  
  console.log('\n📍 İlk 10 Waypoint:');
  result.path.slice(0, 10).forEach((p, i) => {
    console.log(`  ${i}: lat=${p.lat.toFixed(4)}, lon=${p.lon.toFixed(4)}`);
  });
  
  console.log('\n📍 Son 5 Waypoint:');
  result.path.slice(-5).forEach((p, i) => {
    const idx = result.path.length - 5 + i;
    console.log(`  ${idx}: lat=${p.lat.toFixed(4)}, lon=${p.lon.toFixed(4)}`);
  });
  
  process.exit(0);
}).catch(err => {
  console.error('\n❌ HATA:', err.message);
  console.error(err.stack);
  process.exit(1);
});

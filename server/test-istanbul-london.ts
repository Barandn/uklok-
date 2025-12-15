/**
 * Test: Istanbul → London Maritime Route
 * Verifies that the genetic algorithm creates a 100% sea-only optimized route
 * Route goes through: Sea of Marmara → Aegean → Mediterranean → Gibraltar → Atlantic → English Channel
 */

import { runGeneticOptimization, GeneticParams } from './genetic-algorithm';
import { DigitalTwin, VesselParams, calculateGreatCircleDistance } from './vessel-performance';
import { isPointOnLand, routeCrossesLand } from './coastline';
import { isPointInSea, validateSeaRoute } from './sea-mask';

const testVesselParams: VesselParams = {
  dwt: 50000,
  length: 250,
  beam: 32,
  draft: 12,
  serviceSpeed: 18,
  fuelType: 'HFO',
  fuelConsumptionRate: 50,
  enginePower: 15000,
};

const digitalTwin = new DigitalTwin(testVesselParams);

// Istanbul → London route
const testRoute = {
  name: 'İstanbul → Londra',
  start: { lat: 41.0082, lon: 28.9784 },  // Istanbul
  end: { lat: 51.5074, lon: 0.1278 },      // London (Thames estuary)
};

async function runTest() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  İSTANBUL → LONDRA DENİZ ROTASI TESTİ');
  console.log('  Marmara → Ege → Akdeniz → Cebelitarık → Atlantik → Manş');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log(`🚢 ${testRoute.name}`);
  console.log(`   Başlangıç: ${testRoute.start.lat}, ${testRoute.start.lon} (İstanbul)`);
  console.log(`   Bitiş: ${testRoute.end.lat}, ${testRoute.end.lon} (Londra)\n`);

  // Calculate direct great circle distance
  const directDistance = calculateGreatCircleDistance(
    testRoute.start.lat, testRoute.start.lon,
    testRoute.end.lat, testRoute.end.lon
  );
  console.log(`📏 Direkt mesafe (kuş uçuşu): ${directDistance.toFixed(2)} nm`);
  console.log(`   NOT: Deniz rotası karadan geçemez, bu yüzden daha uzun olacak\n`);

  const params: GeneticParams = {
    startLat: testRoute.start.lat,
    startLon: testRoute.start.lon,
    endLat: testRoute.end.lat,
    endLon: testRoute.end.lon,
    vessel: digitalTwin,
    populationSize: 15,
    generations: 10,
    mutationRate: 0.2,
    crossoverRate: 0.8,
    eliteCount: 3,
    numWaypoints: 12,  // More waypoints for this long route
    weatherEnabled: false,
    avoidShallowWater: false,  // Disable to avoid NOAA API issues
    minDepth: 0,
  };

  console.log('⏳ Genetik algoritma çalışıyor...');
  console.log(`   Popülasyon: ${params.populationSize}, Nesil: ${params.generations}`);
  console.log(`   Waypoint sayısı: ${params.numWaypoints}\n`);

  const startTime = Date.now();

  try {
    const result = await runGeneticOptimization(params);
    const duration = Date.now() - startTime;

    console.log(`\n⏱️ Süre: ${duration}ms`);

    if (result.success) {
      console.log(`✅ Rota oluşturuldu: ${result.path.length} waypoint`);
      console.log(`📊 Mesafe: ${result.totalDistance.toFixed(2)} nm`);
      console.log(`⛽ Yakıt: ${result.totalFuel.toFixed(2)} ton`);
      console.log(`🌫️ CO2: ${result.totalCO2.toFixed(2)} ton`);
      if (result.message) {
        console.log(`📝 Not: ${result.message}`);
      }

      // DUAL VALIDATION
      console.log('\n═══════════════════════════════════════════════════════════════');
      console.log('  ROTA DOĞRULAMA');
      console.log('═══════════════════════════════════════════════════════════════\n');

      // 1. Sea mask validation
      const seaValidation = validateSeaRoute(result.path);
      console.log('🌊 Sea-Mask Doğrulaması:');
      console.log(`   Kara noktası: ${seaValidation.landPoints.length}`);
      console.log(`   Kara segmenti: ${seaValidation.landSegments.length}`);
      console.log(`   Geçerli: ${seaValidation.valid ? '✅ EVET' : '❌ HAYIR'}`);

      // 2. Coastline validation
      let coastlandPoints = 0;
      let coastlandSegments = 0;

      for (let i = 0; i < result.path.length; i++) {
        if (isPointOnLand(result.path[i].lat, result.path[i].lon, 0.02)) {
          coastlandPoints++;
        }
      }

      for (let i = 0; i < result.path.length - 1; i++) {
        const from = result.path[i];
        const to = result.path[i + 1];
        if (routeCrossesLand(from.lat, from.lon, to.lat, to.lon, 15)) {
          coastlandSegments++;
        }
      }

      console.log('\n🏖️ Coastline Doğrulaması:');
      console.log(`   Kıyı yakın nokta: ${coastlandPoints}`);
      console.log(`   Kıyı kesen segment: ${coastlandSegments}`);
      console.log(`   Geçerli: ${coastlandSegments === 0 ? '✅ EVET' : '❌ HAYIR'}`);

      // 3. Print waypoints
      console.log('\n📍 Waypoint\'ler:');
      result.path.forEach((p, i) => {
        const inSea = isPointInSea(p.lat, p.lon);
        const nearCoast = isPointOnLand(p.lat, p.lon, 0.02);
        const status = inSea && !nearCoast ? '🌊' : '⚠️';
        console.log(`   ${i}: ${status} lat=${p.lat.toFixed(4)}, lon=${p.lon.toFixed(4)}`);
      });

      // Final verdict
      console.log('\n═══════════════════════════════════════════════════════════════');
      const passed = seaValidation.valid && coastlandSegments === 0;
      if (passed) {
        console.log('  🎉 TEST BAŞARILI - ROTA SADECE DENİZ ÜSTÜNDE!');
        console.log(`  📊 Toplam ${result.path.length} waypoint ile ${result.totalDistance.toFixed(0)} nm rota`);
      } else {
        console.log('  ❌ TEST BAŞARISIZ - ROTA KARADAN GEÇİYOR!');
        if (seaValidation.landPoints.length > 0) {
          console.log(`     Karadaki waypoint indexleri: ${seaValidation.landPoints.join(', ')}`);
        }
        if (seaValidation.landSegments.length > 0) {
          console.log(`     Kara geçen segment indexleri: ${seaValidation.landSegments.join(', ')}`);
        }
      }
      console.log('═══════════════════════════════════════════════════════════════\n');

      process.exit(passed ? 0 : 1);
    } else {
      console.log(`❌ Rota oluşturulamadı: ${result.message}`);
      process.exit(1);
    }
  } catch (error: any) {
    console.error(`❌ HATA: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

runTest();

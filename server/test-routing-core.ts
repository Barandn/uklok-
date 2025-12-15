/**
 * Temel Rota Doğrulama Testi
 * External API'lara bağımlı olmadan kara kontrolü ve genetik algoritma testi
 */

import { runGeneticOptimization, GeneticParams } from './genetic-algorithm';
import { DigitalTwin, VesselParams, calculateGreatCircleDistance } from './vessel-performance';
import { isPointOnLand, routeCrossesLand } from './coastline';

// Test gemisi
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

// Bilinen kara noktaları (kontrol için)
const landPoints = [
  { name: 'İtalya (Roma)', lat: 41.9028, lon: 12.4964 },
  { name: 'Yunanistan (Atina)', lat: 37.9838, lon: 23.7275 },
  { name: 'Türkiye (Ankara)', lat: 39.9334, lon: 32.8597 },
  { name: 'Sicilya', lat: 37.5994, lon: 14.0154 },
];

// Bilinen deniz noktaları (kontrol için)
const seaPoints = [
  { name: 'Akdeniz (İyon)', lat: 37.0, lon: 18.0 },
  { name: 'Akdeniz (Ege)', lat: 38.0, lon: 25.0 },
  { name: 'Akdeniz (Doğu)', lat: 35.0, lon: 30.0 },
  { name: 'Tyrrhenian Sea', lat: 40.0, lon: 12.0 },
];

// Test rotaları
const testRoutes = [
  {
    name: 'İstanbul → Napoli (İtalya etrafı)',
    start: { lat: 41.0082, lon: 28.9784 },
    end: { lat: 40.8518, lon: 14.2681 },
  },
  {
    name: 'Pire → Barcelona',
    start: { lat: 37.9416, lon: 23.6470 },
    end: { lat: 41.3851, lon: 2.1734 },
  },
];

async function testLandDetection() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  TEST 1: KARA TESPİT KONTROLÜ');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  // Kara noktaları kontrolü
  console.log('📍 Kara Noktaları (true dönmeli):');
  for (const point of landPoints) {
    const isLand = isPointOnLand(point.lat, point.lon, 0.02);
    const status = isLand ? '✅' : '❌';
    console.log(`  ${status} ${point.name}: lat=${point.lat}, lon=${point.lon} → ${isLand}`);
    if (isLand) passed++; else failed++;
  }

  // Deniz noktaları kontrolü
  console.log('\n📍 Deniz Noktaları (false dönmeli):');
  for (const point of seaPoints) {
    const isLand = isPointOnLand(point.lat, point.lon, 0.02);
    const status = !isLand ? '✅' : '❌';
    console.log(`  ${status} ${point.name}: lat=${point.lat}, lon=${point.lon} → ${isLand}`);
    if (!isLand) passed++; else failed++;
  }

  console.log(`\n📊 Sonuç: ${passed}/${passed + failed} test geçti`);
  return failed === 0;
}

async function testRouteCrossing() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  TEST 2: ROTA KARA GEÇİŞ KONTROLÜ');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  // Kara geçen rotalar (true dönmeli)
  const landCrossingRoutes = [
    { name: 'İstanbul → Roma (direkt)', start: { lat: 41.0082, lon: 28.9784 }, end: { lat: 41.9028, lon: 12.4964 } },
    { name: 'Pire → Napoli (direkt)', start: { lat: 37.9416, lon: 23.6470 }, end: { lat: 40.8518, lon: 14.2681 } },
  ];

  console.log('🚫 Kara Geçen Rotalar (true dönmeli):');
  for (const route of landCrossingRoutes) {
    const crosses = routeCrossesLand(route.start.lat, route.start.lon, route.end.lat, route.end.lon, 15);
    const status = crosses ? '✅' : '❌';
    console.log(`  ${status} ${route.name} → ${crosses}`);
    if (crosses) passed++; else failed++;
  }

  // Kara geçmeyen rotalar (false dönmeli)
  const seaOnlyRoutes = [
    { name: 'Açık Akdeniz (Doğu-Batı)', start: { lat: 35.0, lon: 30.0 }, end: { lat: 35.0, lon: 20.0 } },
    { name: 'Ege Denizi içi', start: { lat: 38.0, lon: 25.0 }, end: { lat: 37.0, lon: 26.0 } },
  ];

  console.log('\n✅ Deniz Üstü Rotalar (false dönmeli):');
  for (const route of seaOnlyRoutes) {
    const crosses = routeCrossesLand(route.start.lat, route.start.lon, route.end.lat, route.end.lon, 15);
    const status = !crosses ? '✅' : '❌';
    console.log(`  ${status} ${route.name} → ${crosses}`);
    if (!crosses) passed++; else failed++;
  }

  console.log(`\n📊 Sonuç: ${passed}/${passed + failed} test geçti`);
  return failed === 0;
}

async function testGeneticAlgorithm() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  TEST 3: GENETİK ALGORİTMA ROTA OPTİMİZASYONU');
  console.log('  (Sığ su kontrolü kapalı - sadece kara kontrolü aktif)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  for (const route of testRoutes) {
    console.log(`\n🚢 ${route.name}`);
    console.log(`   Başlangıç: ${route.start.lat.toFixed(4)}, ${route.start.lon.toFixed(4)}`);
    console.log(`   Bitiş: ${route.end.lat.toFixed(4)}, ${route.end.lon.toFixed(4)}`);

    const params: GeneticParams = {
      startLat: route.start.lat,
      startLon: route.start.lon,
      endLat: route.end.lat,
      endLon: route.end.lon,
      vessel: digitalTwin,
      populationSize: 8,
      generations: 3,
      mutationRate: 0.2,
      crossoverRate: 0.8,
      eliteCount: 2,
      numWaypoints: 6,
      weatherEnabled: false,
      avoidShallowWater: false,  // Sığ su kontrolü kapalı - API çağrısı yok
      minDepth: 0,
    };

    try {
      console.log('   ⏳ Genetik algoritma çalışıyor...');
      const startTime = Date.now();
      const result = await runGeneticOptimization(params);
      const duration = Date.now() - startTime;

      console.log(`   ⏱️ Süre: ${duration}ms`);

      if (result.success && result.path.length > 0) {
        console.log(`   ✅ Rota oluşturuldu: ${result.path.length} waypoint`);
        console.log(`   📊 Mesafe: ${result.totalDistance.toFixed(2)} nm`);

        // Tüm waypoint'lerin deniz üzerinde olduğunu doğrula
        let landWaypoints = 0;
        let landCrossingSegments = 0;

        for (let i = 0; i < result.path.length; i++) {
          const point = result.path[i];
          if (isPointOnLand(point.lat, point.lon, 0.02)) {
            landWaypoints++;
            console.log(`   ⚠️ Waypoint ${i} KARADA: lat=${point.lat.toFixed(4)}, lon=${point.lon.toFixed(4)}`);
          }
        }

        for (let i = 0; i < result.path.length - 1; i++) {
          const from = result.path[i];
          const to = result.path[i + 1];
          if (routeCrossesLand(from.lat, from.lon, to.lat, to.lon, 15)) {
            landCrossingSegments++;
            console.log(`   ⚠️ Segment ${i}-${i+1} KARA GEÇİYOR`);
          }
        }

        console.log(`   📍 Karadaki waypoint: ${landWaypoints}/${result.path.length}`);
        console.log(`   📍 Kara geçen segment: ${landCrossingSegments}/${result.path.length - 1}`);

        // Waypoint'leri göster
        console.log(`   📍 Waypoint'ler:`);
        result.path.forEach((p, i) => {
          console.log(`      ${i}: lat=${p.lat.toFixed(4)}, lon=${p.lon.toFixed(4)}`);
        });

        if (landWaypoints === 0 && landCrossingSegments === 0) {
          console.log(`   🎉 BAŞARILI: Tüm rota deniz üzerinde!`);
          passed++;
        } else {
          console.log(`   ❌ BAŞARISIZ: Rota kara üzerinden geçiyor!`);
          failed++;
        }
      } else {
        console.log(`   ❌ Rota oluşturulamadı: ${result.message}`);
        failed++;
      }
    } catch (error: any) {
      console.log(`   ❌ HATA: ${error.message}`);
      failed++;
    }
  }

  console.log(`\n📊 Sonuç: ${passed}/${passed + failed} rota başarılı`);
  return failed === 0;
}

async function runAllTests() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('        DENİZ ROTASI SİSTEMİ - TEMEL DOĞRULAMA TESTLERİ');
  console.log('═══════════════════════════════════════════════════════════════');

  const results = {
    landDetection: await testLandDetection(),
    routeCrossing: await testRouteCrossing(),
    geneticAlgorithm: await testGeneticAlgorithm(),
  };

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                      GENEL ÖZET');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log(`  ${results.landDetection ? '✅' : '❌'} Kara Tespit Kontrolü`);
  console.log(`  ${results.routeCrossing ? '✅' : '❌'} Rota Kara Geçiş Kontrolü`);
  console.log(`  ${results.geneticAlgorithm ? '✅' : '❌'} Genetik Algoritma Rotası`);

  const allPassed = Object.values(results).every(r => r);
  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`  ${allPassed ? '🎉 TÜM TESTLER BAŞARILI!' : '❌ BAZI TESTLER BAŞARISIZ!'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  process.exit(allPassed ? 0 : 1);
}

runAllTests().catch(err => {
  console.error('Test hatası:', err);
  process.exit(1);
});

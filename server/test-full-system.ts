/**
 * Kapsamlı Sistem Testi
 * - Genetik algoritma ile optimum rota
 * - Kara kontrolü
 * - Deniz derinlik kontrolü
 * - Hava durumu entegrasyonu
 */

import { runGeneticOptimization, GeneticParams } from './genetic-algorithm';
import { DigitalTwin, VesselParams, calculateGreatCircleDistance } from './vessel-performance';
import { isPointOnLand, routeCrossesLand } from './coastline';
import { checkDepth } from './weather';

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

// Test rotaları
const testRoutes = [
  {
    name: 'İstanbul → Napoli (İtalya etrafı)',
    start: { lat: 41.0082, lon: 28.9784 },
    end: { lat: 40.8518, lon: 14.2681 },
  },
  {
    name: 'Pire → Barcelona (Akdeniz boyunca)',
    start: { lat: 37.9416, lon: 23.6470 },
    end: { lat: 41.3851, lon: 2.1734 },
  },
  {
    name: 'İzmir → Marsilya',
    start: { lat: 38.4192, lon: 27.1287 },
    end: { lat: 43.2965, lon: 5.3698 },
  },
];

async function validateRoute(
  path: Array<{ lat: number; lon: number }>,
  routeName: string
): Promise<{ valid: boolean; issues: string[] }> {
  const issues: string[] = [];

  console.log(`\n🔍 Rota Doğrulama: ${routeName}`);
  console.log(`   Toplam waypoint: ${path.length}`);

  // 1. Her waypoint'in deniz üzerinde olduğunu kontrol et
  let landPoints = 0;
  for (let i = 0; i < path.length; i++) {
    const point = path[i];
    const onLand = isPointOnLand(point.lat, point.lon, 0.02);
    if (onLand) {
      landPoints++;
      issues.push(`Waypoint ${i} KARADA: lat=${point.lat.toFixed(4)}, lon=${point.lon.toFixed(4)}`);
    }
  }

  // 2. Her segment'in kara geçmediğini kontrol et
  let landCrossings = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const from = path[i];
    const to = path[i + 1];
    const crossesLand = routeCrossesLand(from.lat, from.lon, to.lat, to.lon, 15);
    if (crossesLand) {
      landCrossings++;
      issues.push(`Segment ${i}-${i+1} KARA GEÇİYOR: (${from.lat.toFixed(4)},${from.lon.toFixed(4)}) → (${to.lat.toFixed(4)},${to.lon.toFixed(4)})`);
    }
  }

  // 3. Derinlik kontrolü
  let shallowPoints = 0;
  for (let i = 0; i < path.length; i++) {
    const point = path[i];
    const depth = checkDepth(point.lat, point.lon);
    if (depth < 12) { // 12m draft
      shallowPoints++;
      if (depth === 0) {
        issues.push(`Waypoint ${i} KARA (depth=0): lat=${point.lat.toFixed(4)}, lon=${point.lon.toFixed(4)}`);
      } else {
        issues.push(`Waypoint ${i} ÇOK SIĞ (depth=${depth}m): lat=${point.lat.toFixed(4)}, lon=${point.lon.toFixed(4)}`);
      }
    }
  }

  console.log(`   ✓ Kara üzerindeki waypoint: ${landPoints}/${path.length}`);
  console.log(`   ✓ Kara geçen segment: ${landCrossings}/${path.length - 1}`);
  console.log(`   ✓ Sığ su waypoint: ${shallowPoints}/${path.length}`);

  return {
    valid: landPoints === 0 && landCrossings === 0,
    issues,
  };
}

async function runTest() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('    KAPSAMLI DENİZ ROTASI SİSTEM TESTİ');
  console.log('    Genetik Algoritma + Kara Kontrolü + Batimetri');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const results: Array<{
    name: string;
    success: boolean;
    valid: boolean;
    path: Array<{ lat: number; lon: number }>;
    stats: any;
    issues: string[];
  }> = [];

  for (const route of testRoutes) {
    console.log(`\n🚢 Test: ${route.name}`);
    console.log(`   Başlangıç: ${route.start.lat.toFixed(4)}, ${route.start.lon.toFixed(4)}`);
    console.log(`   Bitiş: ${route.end.lat.toFixed(4)}, ${route.end.lon.toFixed(4)}`);

    const params: GeneticParams = {
      startLat: route.start.lat,
      startLon: route.start.lon,
      endLat: route.end.lat,
      endLon: route.end.lon,
      vessel: digitalTwin,
      populationSize: 10,  // Hızlı test için düşük
      generations: 5,      // Hızlı test için düşük
      mutationRate: 0.2,
      crossoverRate: 0.8,
      eliteCount: 2,
      numWaypoints: 8,
      weatherEnabled: false, // Hızlı test için kapalı
      avoidShallowWater: true,
      minDepth: 12,  // Gemi draft'ı
    };

    try {
      console.log('   ⏳ Genetik algoritma çalışıyor...');
      const startTime = Date.now();
      const result = await runGeneticOptimization(params);
      const duration = Date.now() - startTime;

      console.log(`   ⏱️ Süre: ${duration}ms`);

      if (result.success) {
        console.log(`   ✅ Rota oluşturuldu: ${result.path.length} waypoint`);
        console.log(`   📊 Mesafe: ${result.totalDistance.toFixed(2)} nm`);
        console.log(`   ⛽ Yakıt: ${result.totalFuel.toFixed(2)} ton`);
        console.log(`   🌫️ CO2: ${result.totalCO2.toFixed(2)} ton`);

        // Validate the route
        const validation = await validateRoute(result.path, route.name);

        results.push({
          name: route.name,
          success: true,
          valid: validation.valid,
          path: result.path,
          stats: {
            distance: result.totalDistance,
            fuel: result.totalFuel,
            co2: result.totalCO2,
            duration: result.totalDuration,
            generations: result.generations,
            fitness: result.bestFitness,
          },
          issues: validation.issues,
        });

        if (!validation.valid) {
          console.log('\n   ⚠️ SORUNLAR:');
          validation.issues.forEach(issue => console.log(`      - ${issue}`));
        }
      } else {
        console.log(`   ❌ Rota oluşturulamadı: ${result.message}`);
        results.push({
          name: route.name,
          success: false,
          valid: false,
          path: [],
          stats: {},
          issues: [result.message || 'Bilinmeyen hata'],
        });
      }
    } catch (error: any) {
      console.log(`   ❌ HATA: ${error.message}`);
      results.push({
        name: route.name,
        success: false,
        valid: false,
        path: [],
        stats: {},
        issues: [error.message],
      });
    }
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                        ÖZET RAPOR');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let passedCount = 0;
  let totalTests = results.length;

  for (const result of results) {
    const status = result.success && result.valid ? '✅ GEÇTİ' : '❌ BAŞARISIZ';
    console.log(`${status} | ${result.name}`);
    if (result.success) {
      console.log(`         Waypoint: ${result.path.length}, Mesafe: ${result.stats.distance?.toFixed(0)} nm`);
    }
    if (result.issues.length > 0 && !result.valid) {
      console.log(`         Sorunlar: ${result.issues.length} adet`);
    }
    if (result.success && result.valid) {
      passedCount++;
    }
    console.log();
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`        SONUÇ: ${passedCount}/${totalTests} test başarılı`);
  console.log('═══════════════════════════════════════════════════════════════');

  process.exit(passedCount === totalTests ? 0 : 1);
}

runTest().catch(err => {
  console.error('Test hatası:', err);
  process.exit(1);
});

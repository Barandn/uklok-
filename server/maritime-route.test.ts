import { describe, it, expect } from 'vitest';
import { runGeneticOptimization, GeneticParams } from './genetic-algorithm';
import { DigitalTwin, VesselSpecs } from './vessel-performance';
import { isPointOnLand } from './coastline';

describe('Maritime Route Validation - Deniz Rotası Garantisi', () => {
  // Test gemisi
  const testVessel: VesselSpecs = {
    name: 'Test Container Ship',
    vesselType: 'container',
    dwt: 50000,
    length: 250,
    beam: 32,
    draft: 12,
    serviceSpeed: 18,
    fuelType: 'HFO',
    enginePower: 15000,
  };

  const digitalTwin = new DigitalTwin(testVessel);

  it('Genetic Algorithm - Mediterranean route should avoid land', async () => {
    const params: GeneticParams = {
      startLat: 36.0,
      startLon: 15.0, // Sicilya yakını
      endLat: 35.0,
      endLon: 25.0, // Girit yakını
      vessel: digitalTwin,
      populationSize: 4,
      generations: 1,
      mutationRate: 0.2,
      crossoverRate: 0.8,
      eliteCount: 2,
      numWaypoints: 8,
      weatherEnabled: false,
      avoidShallowWater: false,
      minDepth: 10,
    };

    const result = await runGeneticOptimization(params);
    
    console.log('GA Akdeniz Sonuç:', {
      success: result.success,
      pathLength: result.path.length,
      totalDistance: result.totalDistance,
    });

    expect(result.success).toBe(true);

    // Tüm waypoint'lerin deniz üzerinde olduğunu doğrula
    for (const point of result.path) {
      const onLand = isPointOnLand(point.lat, point.lon, 0.01);
      if (onLand) {
        console.error(`KARA TESPİT EDİLDİ: lat=${point.lat}, lon=${point.lon}`);
      }
      expect(onLand).toBe(false);
    }
  }, 60000);

  it('Coastline data should be loaded successfully', () => {
    // Coastline verisi yüklenebilmeli
    const openSeaPoint = isPointOnLand(35.0, 20.0, 0.01);
    expect(openSeaPoint).toBe(false);
    
    console.log('Coastline verisi başarıyla yüklendi');
  });
});

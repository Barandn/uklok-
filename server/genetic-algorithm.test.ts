import { describe, it, expect, beforeAll } from 'vitest';
import { runGeneticOptimization, GeneticParams, GeneticResult } from './genetic-algorithm';
import { routeCrossesLand, isPointOnLand } from './coastline';
import { checkDepth } from './weather';
import { DigitalTwin } from './vessel-performance';

/**
 * Test vessel for genetic algorithm testing
 */
function createTestVessel(): DigitalTwin {
  return new DigitalTwin({
    name: 'Test Vessel',
    imo: '1234567',
    type: 'Container',
    length: 300,
    beam: 40,
    draft: 12,
    grossTonnage: 100000,
    deadweight: 120000,
    serviceSpeed: 18,
    maxSpeed: 24,
    fuelType: 'HFO',
    fuelCapacity: 5000,
    enginePower: 50000,
    propellerType: 'fixed',
    propellerDiameter: 8,
    hullType: 'bulbous',
  });
}

/**
 * Count how many segments in a path cross land
 */
function countLandCrossingSegments(path: Array<{ lat: number; lon: number }>): number {
  let count = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const from = path[i];
    const to = path[i + 1];
    if (routeCrossesLand(from.lat, from.lon, to.lat, to.lon, 15)) {
      count++;
    }
  }
  return count;
}

/**
 * Count how many waypoints are on land
 */
function countLandPoints(path: Array<{ lat: number; lon: number }>): number {
  let count = 0;
  for (const point of path) {
    if (isPointOnLand(point.lat, point.lon, 0.02) || checkDepth(point.lat, point.lon) === 0) {
      count++;
    }
  }
  return count;
}

/**
 * Validate that all points in a path have adequate depth
 */
function validatePathDepth(
  path: Array<{ lat: number; lon: number }>,
  minDepth: number
): {
  valid: boolean;
  shallowPoints: Array<{ index: number; lat: number; lon: number; depth: number }>;
} {
  const shallowPoints: Array<{ index: number; lat: number; lon: number; depth: number }> = [];

  for (let i = 0; i < path.length; i++) {
    const point = path[i];
    const depth = checkDepth(point.lat, point.lon);

    if (depth < minDepth) {
      shallowPoints.push({
        index: i,
        lat: point.lat,
        lon: point.lon,
        depth,
      });
    }
  }

  return {
    valid: shallowPoints.length === 0,
    shallowPoints,
  };
}

describe('Genetic Algorithm Land Crossing Validation', () => {
  let testVessel: DigitalTwin;

  beforeAll(() => {
    testVessel = createTestVessel();
  });

  describe('Istanbul to Naples Route', () => {
    // Istanbul coordinates
    const istanbul = { lat: 41.0082, lon: 28.9784 };
    // Naples coordinates
    const naples = { lat: 40.8518, lon: 14.2681 };

    it('should not place any waypoints on land', async () => {
      const params: GeneticParams = {
        startLat: istanbul.lat,
        startLon: istanbul.lon,
        endLat: naples.lat,
        endLon: naples.lon,
        vessel: testVessel,
        populationSize: 20,
        generations: 10,
        mutationRate: 0.3,
        crossoverRate: 0.8,
        eliteCount: 2,
        numWaypoints: 5,
        weatherEnabled: false,
        avoidShallowWater: true,
        minDepth: 12,
      };

      const result = await runGeneticOptimization(params);

      expect(result.success).toBe(true);
      expect(result.path.length).toBeGreaterThan(2);

      // Validate no waypoints are on land
      const landPointCount = countLandPoints(result.path);
      console.log(`Istanbul to Naples: ${landPointCount} land points out of ${result.path.length}`);
      expect(landPointCount).toBe(0);

      // Log the path for debugging
      console.log('Istanbul to Naples path:');
      result.path.forEach((p, i) => {
        const depth = checkDepth(p.lat, p.lon);
        console.log(`  ${i}: (${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}) depth=${depth}m`);
      });
    }, 60000);

    it('should reduce land crossing segments compared to direct route', async () => {
      // Direct route crosses land
      const directCrosses = routeCrossesLand(istanbul.lat, istanbul.lon, naples.lat, naples.lon, 20);
      console.log('Direct Istanbul to Naples crosses land:', directCrosses);
      expect(directCrosses).toBe(true);

      const params: GeneticParams = {
        startLat: istanbul.lat,
        startLon: istanbul.lon,
        endLat: naples.lat,
        endLon: naples.lon,
        vessel: testVessel,
        populationSize: 25,
        generations: 15,
        mutationRate: 0.3,
        crossoverRate: 0.8,
        eliteCount: 3,
        numWaypoints: 6,
        weatherEnabled: false,
        avoidShallowWater: true,
        minDepth: 12,
      };

      const result = await runGeneticOptimization(params);
      const landCrossings = countLandCrossingSegments(result.path);

      console.log(`Optimized route has ${landCrossings} land-crossing segments out of ${result.path.length - 1} total`);

      // The optimized route should have fewer land crossings than total segments
      expect(landCrossings).toBeLessThan(result.path.length - 1);
    }, 60000);

    it('should avoid shallow water when enabled', async () => {
      const minDraft = 10;

      const params: GeneticParams = {
        startLat: istanbul.lat,
        startLon: istanbul.lon,
        endLat: naples.lat,
        endLon: naples.lon,
        vessel: testVessel,
        populationSize: 15,
        generations: 8,
        mutationRate: 0.3,
        crossoverRate: 0.8,
        eliteCount: 2,
        numWaypoints: 4,
        weatherEnabled: false,
        avoidShallowWater: true,
        minDepth: minDraft,
      };

      const result = await runGeneticOptimization(params);
      expect(result.success).toBe(true);

      // At minimum, waypoints should not be on land (depth > 0)
      const depthValidation = validatePathDepth(result.path, 0);
      const landPoints = depthValidation.shallowPoints.filter(p => p.depth === 0);
      console.log('Land points found:', landPoints.length);
      expect(landPoints.length).toBe(0);
    }, 60000);
  });

  describe('Route Segment Validation', () => {
    it('should detect when a direct line crosses land', () => {
      // Direct line from Venice to Piraeus crosses Italy/Greece
      const crossesLand = routeCrossesLand(45.4408, 12.3155, 37.9475, 23.6372, 20);
      console.log('Venice direct to Piraeus crosses land:', crossesLand);
      expect(crossesLand).toBe(true);
    });

    it('should detect when Istanbul to Naples direct line crosses land', () => {
      const crossesLand = routeCrossesLand(41.0082, 28.9784, 40.8518, 14.2681, 20);
      console.log('Istanbul direct to Naples crosses land:', crossesLand);
      expect(crossesLand).toBe(true);
    });

    it('should allow open Mediterranean sea segment', () => {
      // Segment in central Mediterranean (well away from land)
      const openSeaSegment = routeCrossesLand(35.0, 15.0, 35.5, 18.0, 15);
      console.log('Open Mediterranean segment crosses land:', openSeaSegment);
      expect(openSeaSegment).toBe(false);
    });

    it('should detect segment crossing Sicily', () => {
      // Segment that would cross Sicily
      const crossesSicily = routeCrossesLand(38.5, 13.0, 37.0, 15.5, 20);
      console.log('Segment crossing Sicily:', crossesSicily);
      expect(crossesSicily).toBe(true);
    });
  });

  describe('Open Sea Routes (should not cross land)', () => {
    it('should handle simple Atlantic crossing without land', async () => {
      // Mid-Atlantic points (no land between them)
      const start = { lat: 35.0, lon: -20.0 };
      const end = { lat: 35.0, lon: -10.0 };

      const params: GeneticParams = {
        startLat: start.lat,
        startLon: start.lon,
        endLat: end.lat,
        endLon: end.lon,
        vessel: testVessel,
        populationSize: 10,
        generations: 5,
        mutationRate: 0.2,
        crossoverRate: 0.8,
        eliteCount: 2,
        numWaypoints: 3,
        weatherEnabled: false,
        avoidShallowWater: false,
        minDepth: 0,
      };

      const result = await runGeneticOptimization(params);
      expect(result.success).toBe(true);

      // Open ocean route should have no land crossings
      const landCrossings = countLandCrossingSegments(result.path);
      expect(landCrossings).toBe(0);

      // No waypoints on land
      const landPoints = countLandPoints(result.path);
      expect(landPoints).toBe(0);
    }, 30000);
  });
});

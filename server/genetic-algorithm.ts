/**
 * Genetik Algoritma (Genetic Algorithm)
 * Çok amaçlı rota optimizasyonu
 * Amaçlar: Yakıt tüketimi minimize, Varış zamanı optimize, CII skoru iyileştir
 */

import { DigitalTwin, calculateGreatCircleDistance, calculateBearing, calculateDestinationPoint } from "./vessel-performance";
import { WeatherData, fetchCombinedWeather, checkDepth } from "./weather";
import { isPointOnLand, routeCrossesLand } from './coastline';
import { isPointInSea, segmentCrossesLand as seaMaskSegmentCrossesLand, validateSeaRoute, findOceanPath } from './sea-mask';

/**
 * Maximum attempts for resampling waypoints when validation fails
 */
const MAX_RESAMPLE_ATTEMPTS = 30;

/**
 * Default number of sample points for segment validation
 */
const SEGMENT_SAMPLE_POINTS = 15;

/**
 * Check if a point is definitely in sea (both coastline and sea-mask agree)
 * Uses DUAL validation for maximum safety
 */
function isDefinitelyInSea(lat: number, lon: number): boolean {
  // Method 1: Sea mask grid check (reliable for open water)
  const inSeaMask = isPointInSea(lat, lon);

  // Method 2: Coastline proximity check (reliable for coastal areas)
  const nearCoast = isPointOnLand(lat, lon, 0.05); // 5km buffer

  // Point must be in sea mask AND not too close to coastline
  return inSeaMask && !nearCoast;
}

/**
 * Check if a segment between two points is valid (no land crossing, adequate depth)
 * Uses DUAL validation - both coastline intersection AND sea-mask grid
 * @param from Start point
 * @param to End point
 * @param minDepth Minimum required depth (ship's draft)
 * @param checkShallowWater Whether to check for shallow water
 * @returns true if segment is valid (sea-only, adequate depth)
 */
function isSegmentValid(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  minDepth: number,
  checkShallowWater: boolean
): boolean {
  // Check 1: Coastline intersection (detects crossing shoreline)
  if (routeCrossesLand(from.lat, from.lon, to.lat, to.lon, SEGMENT_SAMPLE_POINTS)) {
    return false;
  }

  // Check 2: Sea mask validation (detects land interior points)
  if (seaMaskSegmentCrossesLand(from.lat, from.lon, to.lat, to.lon, SEGMENT_SAMPLE_POINTS)) {
    return false;
  }

  // Check 3: Endpoint validation
  if (!isDefinitelyInSea(from.lat, from.lon) || !isDefinitelyInSea(to.lat, to.lon)) {
    return false;
  }

  // Check depth along the segment if shallow water avoidance is enabled
  if (checkShallowWater && minDepth > 0) {
    const samples = SEGMENT_SAMPLE_POINTS;
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const lat = from.lat + t * (to.lat - from.lat);
      const lon = from.lon + t * (to.lon - from.lon);
      const depth = checkDepth(lat, lon);

      // If depth is less than ship's draft, segment is invalid
      if (depth < minDepth) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Validate entire route (all segments)
 * @param waypoints Array of waypoints including start and end
 * @param minDepth Minimum required depth
 * @param checkShallowWater Whether to check for shallow water
 * @returns Object with validity status and invalid segment indices
 */
function validateRoute(
  waypoints: Array<{ lat: number; lon: number }>,
  minDepth: number,
  checkShallowWater: boolean
): { valid: boolean; invalidSegments: number[] } {
  const invalidSegments: number[] = [];

  for (let i = 0; i < waypoints.length - 1; i++) {
    if (!isSegmentValid(waypoints[i], waypoints[i + 1], minDepth, checkShallowWater)) {
      invalidSegments.push(i);
    }
  }

  return {
    valid: invalidSegments.length === 0,
    invalidSegments
  };
}

/**
 * Maximum total recursive calls allowed for findSeaValidPath
 * Prevents exponential recursion from hanging the server
 */
let seaValidPathCallCount = 0;
const MAX_SEA_VALID_PATH_CALLS = 100;

/**
 * Find a valid intermediate waypoint between two points that crosses land
 * Uses recursive midpoint subdivision to find sea-valid path
 * Enhanced to handle complex Mediterranean routes (around Italy, Greece, etc.)
 *
 * OPTIMIZED: Reduced offsets and added call limit to prevent hangs
 */
function findSeaValidPath(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  minDepth: number,
  checkShallowWater: boolean,
  maxDepth: number = 3,  // Reduced from 4 to limit recursion
  isTopLevel: boolean = true
): Array<{ lat: number; lon: number }> {
  // Reset call counter at top level
  if (isTopLevel) {
    seaValidPathCallCount = 0;
  }

  // Increment and check call limit
  seaValidPathCallCount++;
  if (seaValidPathCallCount > MAX_SEA_VALID_PATH_CALLS) {
    console.warn(`[findSeaValidPath] Call limit reached (${MAX_SEA_VALID_PATH_CALLS}), returning midpoint`);
    return [{ lat: (from.lat + to.lat) / 2, lon: (from.lon + to.lon) / 2 }];
  }

  // If segment is already valid, return empty (no intermediate points needed)
  if (isSegmentValid(from, to, minDepth, checkShallowWater)) {
    return [];
  }

  if (maxDepth <= 0) {
    // Can't find valid path, return midpoint as best effort
    return [{ lat: (from.lat + to.lat) / 2, lon: (from.lon + to.lon) / 2 }];
  }

  // Try different offsets to find a valid intermediate point
  const midLat = (from.lat + to.lat) / 2;
  const midLon = (from.lon + to.lon) / 2;

  // Calculate perpendicular offset directions
  const bearing = calculateBearing(from.lat, from.lon, to.lat, to.lon);
  const distance = calculateGreatCircleDistance(from.lat, from.lon, to.lat, to.lon);

  // OPTIMIZED: Reduced number of offsets to try (was 9x6=54, now 5x4=20)
  const offsets = [0.1, 0.2, 0.3, 0.5, 0.7]; // Fraction of segment distance
  const directions = [90, -90, 45, -45]; // Multiple directions

  for (const offset of offsets) {
    for (const dir of directions) {
      const offsetBearing = bearing + dir;
      const offsetDistance = distance * offset;
      const candidate = calculateDestinationPoint(midLat, midLon, offsetDistance, offsetBearing);

      // Check if candidate point is in valid water
      if (!isPointOnLand(candidate.lat, candidate.lon, 0.02)) {
        const depth = checkDepth(candidate.lat, candidate.lon);
        if (depth > 0 && (!checkShallowWater || depth >= minDepth)) {
          // Check if segments to/from candidate are valid
          const toCandidate = isSegmentValid(from, candidate, minDepth, checkShallowWater);
          const fromCandidate = isSegmentValid(candidate, to, minDepth, checkShallowWater);

          if (toCandidate && fromCandidate) {
            return [candidate];
          }

          // If only one direction is invalid, recursively fix it (with call limit check)
          if ((toCandidate || fromCandidate) && seaValidPathCallCount < MAX_SEA_VALID_PATH_CALLS) {
            const result: Array<{ lat: number; lon: number }> = [];

            if (!toCandidate) {
              result.push(...findSeaValidPath(from, candidate, minDepth, checkShallowWater, maxDepth - 1, false));
            }
            result.push(candidate);
            if (!fromCandidate) {
              result.push(...findSeaValidPath(candidate, to, minDepth, checkShallowWater, maxDepth - 1, false));
            }

            // Validate the entire result path
            let resultValid = true;
            const fullPath = [from, ...result, to];
            for (let i = 0; i < fullPath.length - 1; i++) {
              if (!isSegmentValid(fullPath[i], fullPath[i + 1], minDepth, checkShallowWater)) {
                resultValid = false;
                break;
              }
            }

            if (resultValid) {
              return result;
            }
          }
        }
      }
    }
  }

  // OPTIMIZED: Reduced grid search (was 7x7=49, now 5x5=25)
  const gridOffsets = [-2, -1, 0, 1, 2];
  const gridStep = 1.0; // degrees

  for (const latOffset of gridOffsets) {
    for (const lonOffset of gridOffsets) {
      if (latOffset === 0 && lonOffset === 0) continue;

      const candidate = {
        lat: midLat + latOffset * gridStep,
        lon: midLon + lonOffset * gridStep
      };

      if (!isPointOnLand(candidate.lat, candidate.lon, 0.02)) {
        const depth = checkDepth(candidate.lat, candidate.lon);
        if (depth > 0 && (!checkShallowWater || depth >= minDepth)) {
          const toCandidate = isSegmentValid(from, candidate, minDepth, checkShallowWater);
          const fromCandidate = isSegmentValid(candidate, to, minDepth, checkShallowWater);

          if (toCandidate && fromCandidate) {
            return [candidate];
          }
        }
      }
    }
  }

  // Fallback: return midpoint
  return [{ lat: midLat, lon: midLon }];
}

/**
 * Kromozom - Bir rota çözümü
 */
interface Chromosome {
  waypoints: Array<{ lat: number; lon: number }>;
  fitness: number;
  totalFuel: number;
  totalCO2: number;
  totalDistance: number;
  totalDuration: number;
}

/**
 * Genetik Algoritma Parametreleri
 */
export interface GeneticParams {
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  vessel: DigitalTwin;
  populationSize: number; // Popülasyon büyüklüğü
  generations: number; // Nesil sayısı
  mutationRate: number; // Mutasyon oranı (0-1)
  crossoverRate: number; // Çaprazlama oranı (0-1)
  eliteCount: number; // En iyi bireyleri koru
  numWaypoints: number; // Rota üzerindeki waypoint sayısı
  weatherEnabled: boolean;
  avoidShallowWater: boolean;
  minDepth: number;
}

/**
 * Genetik Algoritma Sonuç
 */
export interface GeneticResult {
  success: boolean;
  path: Array<{ lat: number; lon: number }>;
  totalDistance: number;
  totalFuel: number;
  totalCO2: number;
  totalDuration: number;
  generations: number;
  bestFitness: number;
  message?: string;
}

/**
 * Genetik Algoritma Ana Fonksiyon
 */
export async function runGeneticOptimization(params: GeneticParams): Promise<GeneticResult> {
  const {
    startLat,
    startLon,
    endLat,
    endLon,
    vessel,
    populationSize,
    generations,
    mutationRate,
    crossoverRate,
    eliteCount,
    numWaypoints,
    weatherEnabled,
    avoidShallowWater,
    minDepth,
  } = params;

  // PRE-FETCH: Load real bathymetry data for route bounds
  // This populates the cache with NOAA ETOPO 2022 depth data
  // Significantly improves performance during waypoint generation and validation
  if (avoidShallowWater && minDepth > 0) {
    try {
      console.log('[GeneticAlgorithm] Pre-fetching bathymetry data for route bounds...');
      const { prefetchRouteDepths } = await import('./bathymetry');
      await prefetchRouteDepths(startLat, startLon, endLat, endLon, 0.25);
      console.log('[GeneticAlgorithm] Bathymetry pre-fetch completed');
    } catch (error) {
      console.warn('[GeneticAlgorithm] Bathymetry pre-fetch failed, using fallback:', error);
    }
  }

  // İlk popülasyonu oluştur
  let population = await initializePopulation(
    startLat,
    startLon,
    endLat,
    endLon,
    populationSize,
    numWaypoints,
    vessel,
    weatherEnabled,
    avoidShallowWater,
    minDepth
  );

  let bestChromosome: Chromosome = population[0];

  // Nesiller boyunca evrim
  for (let gen = 0; gen < generations; gen++) {
    // Fitness değerlerini hesapla
    population = await evaluatePopulation(
      population,
      vessel,
      weatherEnabled,
      startLat,
      startLon,
      endLat,
      endLon,
      avoidShallowWater,
      minDepth
    );

    // En iyi bireyi bul
    population.sort((a, b) => b.fitness - a.fitness);
    if (population[0].fitness > bestChromosome.fitness) {
      bestChromosome = { ...population[0] };
    }

    // Yeni nesil oluştur
    const newPopulation: Chromosome[] = [];

    // Elitleri koru
    for (let i = 0; i < eliteCount && i < population.length; i++) {
      newPopulation.push({ ...population[i] });
    }

    // Çaprazlama ve mutasyon ile yeni bireyler oluştur
    while (newPopulation.length < populationSize) {
      // Ebeveyn seçimi (tournament selection)
      const parent1 = tournamentSelection(population, 3);
      const parent2 = tournamentSelection(population, 3);

      // Çaprazlama
      let offspring: Chromosome;
      if (Math.random() < crossoverRate) {
        offspring = crossover(parent1, parent2, startLat, startLon, endLat, endLon, avoidShallowWater, minDepth);
      } else {
        offspring = { ...parent1 };
      }

      // Mutasyon
      if (Math.random() < mutationRate) {
        offspring = mutate(offspring, startLat, startLon, endLat, endLon, avoidShallowWater, minDepth);
      }

      newPopulation.push(offspring);
    }

    population = newPopulation;
  }

  // Son değerlendirme
  population = await evaluatePopulation(
    population,
    vessel,
    weatherEnabled,
    startLat,
    startLon,
    endLat,
    endLon,
    avoidShallowWater,
    minDepth
  );
  population.sort((a, b) => b.fitness - a.fitness);
  const finalBest = population[0];

  // Build final path
  let finalPath = [
    { lat: startLat, lon: startLon },
    ...finalBest.waypoints,
    { lat: endLat, lon: endLon },
  ];

  // FINAL VALIDATION: Ensure no segment crosses land
  // Use DUAL validation - both coastline and sea-mask
  const validation = validateRoute(finalPath, minDepth, avoidShallowWater);
  const seaMaskValidation = validateSeaRoute(finalPath);

  const hasLandIssues = !validation.valid || !seaMaskValidation.valid;

  if (hasLandIssues) {
    console.log(`[GeneticAlgorithm] Final route has land crossing issues.`);
    console.log(`  - Coastline validation: ${validation.invalidSegments.length} invalid segments`);
    console.log(`  - Sea-mask validation: ${seaMaskValidation.landPoints.length} land points, ${seaMaskValidation.landSegments.length} land segments`);
    console.log(`[GeneticAlgorithm] Attempting to fix with intermediate waypoints...`);

    // Fix invalid segments by inserting sea-valid intermediate waypoints
    const fixedPath: Array<{ lat: number; lon: number }> = [finalPath[0]];

    for (let i = 0; i < finalPath.length - 1; i++) {
      const from = finalPath[i];
      const to = finalPath[i + 1];

      const segmentInvalid = validation.invalidSegments.includes(i) ||
                             seaMaskValidation.landSegments.includes(i);

      if (segmentInvalid) {
        // This segment crosses land - find alternative path
        const intermediatePts = findSeaValidPath(from, to, minDepth, avoidShallowWater);
        fixedPath.push(...intermediatePts);
      }

      fixedPath.push(to);
    }

    finalPath = fixedPath;

    // Re-validate the fixed path with both methods
    const revalidation = validateRoute(finalPath, minDepth, avoidShallowWater);
    const reSeaMaskValidation = validateSeaRoute(finalPath);

    if (!revalidation.valid || !reSeaMaskValidation.valid) {
      console.warn(`[GeneticAlgorithm] Could not fix GA route. Using A* ocean path as fallback.`);

      // FALLBACK: Use A* algorithm on sea-mask grid
      const astarResult = findOceanPath(startLat, startLon, endLat, endLon);

      if (astarResult.success && astarResult.path.length > 0) {
        console.log(`[GeneticAlgorithm] A* fallback successful: ${astarResult.path.length} waypoints`);
        finalPath = astarResult.path;

        // Recalculate metrics for A* path
        let totalDistance = 0;
        for (let i = 0; i < finalPath.length - 1; i++) {
          totalDistance += calculateGreatCircleDistance(
            finalPath[i].lat, finalPath[i].lon,
            finalPath[i + 1].lat, finalPath[i + 1].lon
          );
        }

        const avgSpeed = vessel.vessel.serviceSpeed;
        const totalDuration = totalDistance / avgSpeed;
        const fuelRate = vessel.vessel.fuelConsumptionRate / 24;
        const totalFuel = totalDuration * fuelRate;
        const totalCO2 = totalFuel * 3.114;

        return {
          success: true,
          path: finalPath,
          totalDistance,
          totalFuel,
          totalCO2,
          totalDuration,
          generations,
          bestFitness: 0, // A* doesn't have fitness
          message: 'A* fallback used - guaranteed sea-only route',
        };
      } else {
        console.error(`[GeneticAlgorithm] A* fallback also failed!`);
        return {
          success: false,
          path: [],
          totalDistance: 0,
          totalFuel: 0,
          totalCO2: 0,
          totalDuration: 0,
          generations,
          bestFitness: 0,
          message: 'Could not find valid sea-only route',
        };
      }
    }
  }

  // Final verification - one last check
  const finalSeaCheck = validateSeaRoute(finalPath);
  if (!finalSeaCheck.valid) {
    console.warn(`[GeneticAlgorithm] Final route still has issues, using A* fallback`);
    const astarResult = findOceanPath(startLat, startLon, endLat, endLon);
    if (astarResult.success) {
      finalPath = astarResult.path;
    }
  }

  return {
    success: true,
    path: finalPath,
    totalDistance: finalBest.totalDistance,
    totalFuel: finalBest.totalFuel,
    totalCO2: finalBest.totalCO2,
    totalDuration: finalBest.totalDuration,
    generations,
    bestFitness: finalBest.fitness,
  };
}

/**
 * İlk popülasyonu oluştur
 */
async function initializePopulation(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  populationSize: number,
  numWaypoints: number,
  vessel: DigitalTwin,
  weatherEnabled: boolean,
  avoidShallowWater: boolean,
  minDepth: number
): Promise<Chromosome[]> {
  const population: Chromosome[] = [];

  for (let i = 0; i < populationSize; i++) {
    const waypoints = generateRandomWaypoints(
      startLat,
      startLon,
      endLat,
      endLon,
      numWaypoints,
      avoidShallowWater,
      minDepth
    );

    population.push({
      waypoints,
      fitness: 0,
      totalFuel: 0,
      totalCO2: 0,
      totalDistance: 0,
      totalDuration: 0,
    });
  }

  return population;
}

/**
 * Rastgele waypoint'ler oluştur
 * Validates each waypoint creates valid sea segments with neighbors
 */
function generateRandomWaypoints(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  numWaypoints: number,
  avoidShallowWater: boolean,
  minDepth: number
): Array<{ lat: number; lon: number }> {
  const waypoints: Array<{ lat: number; lon: number }> = [];

  const totalDistance = calculateGreatCircleDistance(startLat, startLon, endLat, endLon);
  const bearing = calculateBearing(startLat, startLon, endLat, endLon);
  const start = { lat: startLat, lon: startLon };
  const end = { lat: endLat, lon: endLon };

  for (let i = 1; i <= numWaypoints; i++) {
    const fraction = i / (numWaypoints + 1);
    const baseDistance = totalDistance * fraction;

    // Previous point for segment validation
    const prevPoint = i === 1 ? start : waypoints[i - 2];
    // Next point for segment validation (estimate based on next waypoint position or end)
    const nextFraction = (i + 1) / (numWaypoints + 1);
    const nextBaseDistance = totalDistance * nextFraction;
    const estimatedNext = i === numWaypoints
      ? end
      : calculateDestinationPoint(startLat, startLon, nextBaseDistance, bearing);

    let point: { lat: number; lon: number } | null = null;
    let attempts = 0;

    while (attempts < MAX_RESAMPLE_ATTEMPTS) {
      // Rastgele sapma ekle (±30 derece, ±30% mesafe)
      const randomBearing = bearing + (Math.random() - 0.5) * 60;
      const randomDistance = baseDistance * (0.7 + Math.random() * 0.6);

      const candidate = calculateDestinationPoint(startLat, startLon, randomDistance, randomBearing);

      // DUAL VALIDATION: Both coastline AND sea-mask must agree point is in sea
      // Check 1: Sea mask validation (most reliable for open water)
      if (!isPointInSea(candidate.lat, candidate.lon)) {
        attempts++;
        continue;
      }

      // Check 2: Coastline proximity (avoid coastal areas)
      if (isPointOnLand(candidate.lat, candidate.lon, 0.05)) {
        attempts++;
        continue;
      }

      const depth = checkDepth(candidate.lat, candidate.lon);

      // Kara kontrolü (backup via depth)
      if (depth === 0) {
        attempts++;
        continue;
      }

      // Sığ su kontrolü - sadece avoidShallowWater aktifse
      if (avoidShallowWater && depth < minDepth) {
        attempts++;
        continue;
      }

      // CRITICAL: Validate segment from previous point doesn't cross land
      if (!isSegmentValid(prevPoint, candidate, minDepth, avoidShallowWater)) {
        attempts++;
        continue;
      }

      // For the last waypoint, also validate segment to end point
      if (i === numWaypoints) {
        if (!isSegmentValid(candidate, end, minDepth, avoidShallowWater)) {
          attempts++;
          continue;
        }
      }

      // Geçerli nokta bulundu
      point = candidate;
      break;
    }

    // If no valid point found, try to find a safe intermediate point
    if (!point) {
      // Calculate a point along the great circle route as fallback
      const safePoint = calculateDestinationPoint(startLat, startLon, baseDistance, bearing);

      // Check if this safe point is valid
      if (!isPointOnLand(safePoint.lat, safePoint.lon, 0.02)) {
        const safeDepth = checkDepth(safePoint.lat, safePoint.lon);
        if (safeDepth > 0 && (!avoidShallowWater || safeDepth >= minDepth)) {
          point = safePoint;
        }
      }

      // Ultimate fallback: use the calculated point anyway
      if (!point) {
        point = calculateDestinationPoint(startLat, startLon, baseDistance, bearing);
      }
    }

    waypoints.push(point);
  }

  return waypoints;
}

/**
 * Popülasyonu değerlendir (fitness hesapla)
 */
async function evaluatePopulation(
  population: Chromosome[],
  vessel: DigitalTwin,
  weatherEnabled: boolean,
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  avoidShallowWater: boolean = false,
  minDepth: number = 0
): Promise<Chromosome[]> {
  for (const chromosome of population) {
    await evaluateChromosome(
      chromosome,
      vessel,
      weatherEnabled,
      startLat,
      startLon,
      endLat,
      endLon,
      avoidShallowWater,
      minDepth
    );
  }
  return population;
}

/**
 * Tek bir kromozomu değerlendir
 * Includes land crossing and shallow water penalties
 */
async function evaluateChromosome(
  chromosome: Chromosome,
  vessel: DigitalTwin,
  weatherEnabled: boolean,
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  avoidShallowWater: boolean = false,
  minDepth: number = 0
): Promise<void> {
  let totalFuel = 0;
  let totalCO2 = 0;
  let totalDistance = 0;
  let totalDuration = 0;
  let landCrossingPenalty = 0;
  let shallowWaterPenalty = 0;

  const allPoints = [
    { lat: startLat, lon: startLon },
    ...chromosome.waypoints,
    { lat: endLat, lon: endLon },
  ];

  for (let i = 0; i < allPoints.length - 1; i++) {
    const from = allPoints[i];
    const to = allPoints[i + 1];

    const distance = calculateGreatCircleDistance(from.lat, from.lon, to.lat, to.lon);

    // CRITICAL: Check if segment crosses land
    if (routeCrossesLand(from.lat, from.lon, to.lat, to.lon, SEGMENT_SAMPLE_POINTS)) {
      // Apply severe penalty for land crossing
      landCrossingPenalty += 1000;
    }

    // Check depth along segment for shallow water
    if (avoidShallowWater && minDepth > 0) {
      const samples = 5;
      for (let j = 0; j <= samples; j++) {
        const t = j / samples;
        const lat = from.lat + t * (to.lat - from.lat);
        const lon = from.lon + t * (to.lon - from.lon);
        const depth = checkDepth(lat, lon);

        if (depth < minDepth) {
          // Penalty proportional to how much shallower than required
          shallowWaterPenalty += (minDepth - depth) * 10;
        }
        if (depth === 0) {
          // Extra penalty for land (depth 0)
          landCrossingPenalty += 500;
        }
      }
    }

    let weather: WeatherData | null = null;
    if (weatherEnabled) {
      // Segment ortası için hava durumu
      const midLat = (from.lat + to.lat) / 2;
      const midLon = (from.lon + to.lon) / 2;
      weather = await fetchCombinedWeather(midLat, midLon);
    }

    const segment = vessel.calculateSegmentConsumption(
      distance,
      vessel.vessel.serviceSpeed,
      weather || undefined
    );

    totalFuel += segment.fuelConsumed;
    totalCO2 += segment.co2Emitted;
    totalDistance += distance;
    totalDuration += segment.duration;
  }

  chromosome.totalFuel = totalFuel;
  chromosome.totalCO2 = totalCO2;
  chromosome.totalDistance = totalDistance;
  chromosome.totalDuration = totalDuration;

  // Fitness fonksiyonu: Yakıt tüketimini minimize et
  // Apply penalties for land crossing and shallow water
  // Daha düşük yakıt = daha yüksek fitness
  // Land crossing makes fitness nearly zero (unviable route)
  const baseFitness = 1000 / (totalFuel + 1);
  const penaltyFactor = Math.max(0.001, 1 - (landCrossingPenalty + shallowWaterPenalty) / 1000);
  chromosome.fitness = baseFitness * penaltyFactor;
}

/**
 * Tournament selection - ebeveyn seçimi
 */
function tournamentSelection(population: Chromosome[], tournamentSize: number): Chromosome {
  let best = population[Math.floor(Math.random() * population.length)];

  for (let i = 1; i < tournamentSize; i++) {
    const candidate = population[Math.floor(Math.random() * population.length)];
    if (candidate.fitness > best.fitness) {
      best = candidate;
    }
  }

  return best;
}

/**
 * Crossover (çaprazlama) - iki ebeveynden yeni birey oluştur
 * Now validates that the crossover point doesn't create land-crossing segments
 */
function crossover(
  parent1: Chromosome,
  parent2: Chromosome,
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  avoidShallowWater: boolean = false,
  minDepth: number = 0
): Chromosome {
  const numWaypoints = parent1.waypoints.length;
  const start = { lat: startLat, lon: startLon };
  const end = { lat: endLat, lon: endLon };

  // Try different crossover points to find one that doesn't create land-crossing segments
  let bestWaypoints: Array<{ lat: number; lon: number }> | null = null;
  let attempts = 0;

  while (attempts < 5 && !bestWaypoints) {
    const crossoverPoint = Math.floor(Math.random() * numWaypoints);

    const newWaypoints = [
      ...parent1.waypoints.slice(0, crossoverPoint),
      ...parent2.waypoints.slice(crossoverPoint),
    ];

    // Validate the segments around the crossover point
    const allPoints = [start, ...newWaypoints, end];
    let valid = true;

    // Check segments around crossover point (most likely to be invalid)
    for (let i = Math.max(0, crossoverPoint - 1); i < Math.min(allPoints.length - 1, crossoverPoint + 2); i++) {
      if (routeCrossesLand(allPoints[i].lat, allPoints[i].lon, allPoints[i + 1].lat, allPoints[i + 1].lon, 10)) {
        valid = false;
        break;
      }
    }

    if (valid) {
      bestWaypoints = newWaypoints;
    }

    attempts++;
  }

  // If no valid crossover found, use parent1's waypoints as fallback
  if (!bestWaypoints) {
    bestWaypoints = [...parent1.waypoints];
  }

  return {
    waypoints: bestWaypoints,
    fitness: 0,
    totalFuel: 0,
    totalCO2: 0,
    totalDistance: 0,
    totalDuration: 0,
  };
}

/**
 * Mutation (mutasyon) - rastgele değişiklik
 * Now validates that the mutated waypoint doesn't create land-crossing segments
 */
function mutate(
  chromosome: Chromosome,
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  avoidShallowWater: boolean,
  minDepth: number
): Chromosome {
  const mutatedWaypoints = [...chromosome.waypoints];
  const mutationIndex = Math.floor(Math.random() * mutatedWaypoints.length);

  // Rastgele bir waypoint'i değiştir
  const totalDistance = calculateGreatCircleDistance(startLat, startLon, endLat, endLon);
  const bearing = calculateBearing(startLat, startLon, endLat, endLon);
  const fraction = (mutationIndex + 1) / (mutatedWaypoints.length + 1);
  const baseDistance = totalDistance * fraction;

  const start = { lat: startLat, lon: startLon };
  const end = { lat: endLat, lon: endLon };

  // Get neighboring points for segment validation
  const prevPoint = mutationIndex === 0 ? start : mutatedWaypoints[mutationIndex - 1];
  const nextPoint = mutationIndex === mutatedWaypoints.length - 1 ? end : mutatedWaypoints[mutationIndex + 1];

  let newPoint: { lat: number; lon: number } | null = null;
  let attempts = 0;

  while (attempts < MAX_RESAMPLE_ATTEMPTS) {
    const randomBearing = bearing + (Math.random() - 0.5) * 60;
    const randomDistance = baseDistance * (0.7 + Math.random() * 0.6);
    const candidate = calculateDestinationPoint(startLat, startLon, randomDistance, randomBearing);

    // Kara kontrolü
    if (isPointOnLand(candidate.lat, candidate.lon, 0.03)) {
      attempts++;
      continue;
    }

    // Depth kontrolü
    const depth = checkDepth(candidate.lat, candidate.lon);
    if (depth === 0) {
      attempts++;
      continue;
    }

    if (avoidShallowWater && depth < minDepth) {
      attempts++;
      continue;
    }

    // CRITICAL: Validate segments to neighboring points don't cross land
    const toPrevValid = isSegmentValid(prevPoint, candidate, minDepth, avoidShallowWater);
    const toNextValid = isSegmentValid(candidate, nextPoint, minDepth, avoidShallowWater);

    if (toPrevValid && toNextValid) {
      newPoint = candidate;
      break;
    }

    attempts++;
  }

  // If no valid point found, keep the original waypoint
  if (newPoint) {
    mutatedWaypoints[mutationIndex] = newPoint;
  }

  return {
    waypoints: mutatedWaypoints,
    fitness: 0,
    totalFuel: 0,
    totalCO2: 0,
    totalDistance: 0,
    totalDuration: 0,
  };
}

/**
 * Genetik Algoritma (Genetic Algorithm)
 * Çok amaçlı rota optimizasyonu
 * Amaçlar: Yakıt tüketimi minimize, Varış zamanı optimize, CII skoru iyileştir
 */

import { DigitalTwin, calculateGreatCircleDistance, calculateBearing, calculateDestinationPoint } from "./vessel-performance";
import { WeatherData, fetchCombinedWeather, checkDepth } from "./weather";
import { isPointOnLand, routeCrossesLand } from './coastline';

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
    population = await evaluatePopulation(population, vessel, weatherEnabled);

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
        offspring = crossover(parent1, parent2, startLat, startLon, endLat, endLon);
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
  population = await evaluatePopulation(population, vessel, weatherEnabled);
  population.sort((a, b) => b.fitness - a.fitness);
  const finalBest = population[0];

  return {
    success: true,
    path: [
      { lat: startLat, lon: startLon },
      ...finalBest.waypoints,
      { lat: endLat, lon: endLon },
    ],
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
  
  for (let i = 1; i <= numWaypoints; i++) {
    const fraction = i / (numWaypoints + 1);
    const baseDistance = totalDistance * fraction;
    
    // Rastgele sapma ekle (±20 derece, ±20% mesafe)
    const randomBearing = bearing + (Math.random() - 0.5) * 40;
    const randomDistance = baseDistance * (0.8 + Math.random() * 0.4);
    
    let point = calculateDestinationPoint(startLat, startLon, randomDistance, randomBearing);
    
    // Kara ve sığ su kontrolü
    let attempts = 0;
    while (attempts < 20) {
    // Kara kontrolü - gerçek coastline verisi kullan
    if (isPointOnLand(point.lat, point.lon, 0.05)) { // Biraz daha esnek buffer
        // Yeni rastgele nokta dene
        const newBearing = bearing + (Math.random() - 0.5) * 60;
        point = calculateDestinationPoint(startLat, startLon, randomDistance, newBearing);
        attempts++;
        continue;
      }
      
      const depth = checkDepth(point.lat, point.lon);
      
      // Kara kontrolü (backup)
      if (depth === 0) {
        const newBearing = bearing + (Math.random() - 0.5) * 60;
        point = calculateDestinationPoint(startLat, startLon, randomDistance, newBearing);
        attempts++;
        continue;
      }
      
      // Sığ su kontrolü - sadece avoidShallowWater aktifse
      if (avoidShallowWater && depth < minDepth) {
        const newBearing = bearing + (Math.random() - 0.5) * 60;
        point = calculateDestinationPoint(startLat, startLon, randomDistance, newBearing);
        attempts++;
        continue;
      }
      
      // Geçerli nokta bulundu
      break;
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
  weatherEnabled: boolean
): Promise<Chromosome[]> {
  for (const chromosome of population) {
    await evaluateChromosome(chromosome, vessel, weatherEnabled);
  }
  return population;
}

/**
 * Tek bir kromozomu değerlendir
 */
async function evaluateChromosome(
  chromosome: Chromosome,
  vessel: DigitalTwin,
  weatherEnabled: boolean
): Promise<void> {
  let totalFuel = 0;
  let totalCO2 = 0;
  let totalDistance = 0;
  let totalDuration = 0;

  const allPoints = chromosome.waypoints;

  for (let i = 0; i < allPoints.length - 1; i++) {
    const from = allPoints[i];
    const to = allPoints[i + 1];

    const distance = calculateGreatCircleDistance(from.lat, from.lon, to.lat, to.lon);

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
  // Daha düşük yakıt = daha yüksek fitness
  chromosome.fitness = 1000 / (totalFuel + 1);
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
 */
function crossover(
  parent1: Chromosome,
  parent2: Chromosome,
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number
): Chromosome {
  const numWaypoints = parent1.waypoints.length;
  const crossoverPoint = Math.floor(Math.random() * numWaypoints);

  const newWaypoints = [
    ...parent1.waypoints.slice(0, crossoverPoint),
    ...parent2.waypoints.slice(crossoverPoint),
  ];

  return {
    waypoints: newWaypoints,
    fitness: 0,
    totalFuel: 0,
    totalCO2: 0,
    totalDistance: 0,
    totalDuration: 0,
  };
}

/**
 * Mutation (mutasyon) - rastgele değişiklik
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

  const randomBearing = bearing + (Math.random() - 0.5) * 60;
  const randomDistance = baseDistance * (0.7 + Math.random() * 0.6);

  let newPoint = calculateDestinationPoint(startLat, startLon, randomDistance, randomBearing);

  // Kara ve sığ su kontrolü
  let attempts = 0;
  while (attempts < 10) {
    // Kara kontrolü
    if (isPointOnLand(newPoint.lat, newPoint.lon, 0.05)) { // Esnek buffer
      const newBearing = randomBearing + (Math.random() - 0.5) * 30;
      newPoint = calculateDestinationPoint(startLat, startLon, randomDistance, newBearing);
      attempts++;
      continue;
    }
    
    if (avoidShallowWater) {
      const depth = checkDepth(newPoint.lat, newPoint.lon);
      if (depth >= minDepth) {
        break;
      }
      const retryBearing = bearing + (Math.random() - 0.5) * 80;
      newPoint = calculateDestinationPoint(startLat, startLon, randomDistance, retryBearing);
      attempts++;
    }
  }

  mutatedWaypoints[mutationIndex] = newPoint;

  return {
    waypoints: mutatedWaypoints,
    fitness: 0,
    totalFuel: 0,
    totalCO2: 0,
    totalDistance: 0,
    totalDuration: 0,
  };
}

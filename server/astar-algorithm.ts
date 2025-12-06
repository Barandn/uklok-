/**
 * A* (A-Star) Algoritması
 * Yeşil deniz taşımacılığı için rota optimizasyonu
 * Maliyet fonksiyonu: Yakıt tüketimi + CO2 emisyonu
 */

import { DigitalTwin, calculateGreatCircleDistance, calculateDestinationPoint, calculateBearing } from "./vessel-performance";
import { WeatherData, fetchCombinedWeather, checkDepth } from "./weather";
import { isPointOnLand, routeCrossesLand } from './coastline';

/**
 * Grid node - A* için düğüm yapısı
 */
interface GridNode {
  lat: number;
  lon: number;
  g: number; // Başlangıçtan bu noktaya kadar olan gerçek maliyet
  h: number; // Bu noktadan hedefe tahmini maliyet (heuristic)
  f: number; // Toplam maliyet (g + h)
  parent: GridNode | null;
  fuelConsumed: number; // Toplam yakıt tüketimi (tons)
  co2Emitted: number; // Toplam CO2 emisyonu (tons)
  distance: number; // Toplam mesafe (nm)
  duration: number; // Toplam süre (hours)
}

/**
 * A* Rota Optimizasyon Parametreleri
 */
export interface AStarParams {
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  vessel: DigitalTwin;
  gridResolution: number; // derece cinsinden (örn: 0.5 = ~30 nm)
  maxIterations: number; // maksimum iterasyon sayısı
  heuristicWeight: number; // heuristic ağırlığı (1.0 = optimal, >1.0 = daha hızlı ama suboptimal)
  weatherEnabled: boolean; // hava durumu verisi kullan
  avoidShallowWater: boolean; // sığ suları önle
  minDepth: number; // minimum derinlik (meters)
}

/**
 * A* Sonuç
 */
export interface AStarResult {
  success: boolean;
  path: Array<{ lat: number; lon: number }>;
  totalDistance: number; // nautical miles
  totalFuel: number; // tons
  totalCO2: number; // tons
  totalDuration: number; // hours
  iterations: number;
  message?: string;
}

/**
 * A* Algoritması Ana Fonksiyon
 */
export async function runAStarOptimization(params: AStarParams): Promise<AStarResult> {
  const {
    startLat,
    startLon,
    endLat,
    endLon,
    vessel,
    gridResolution,
    maxIterations,
    heuristicWeight,
    weatherEnabled,
    avoidShallowWater,
    minDepth,
  } = params;

  // Başlangıç düğümü
  const startNode: GridNode = {
    lat: startLat,
    lon: startLon,
    g: 0,
    h: calculateHeuristic(startLat, startLon, endLat, endLon, heuristicWeight),
    f: 0,
    parent: null,
    fuelConsumed: 0,
    co2Emitted: 0,
    distance: 0,
    duration: 0,
  };
  startNode.f = startNode.g + startNode.h;

  // Open ve Closed listeler
  const openList: GridNode[] = [startNode];
  const closedSet = new Set<string>();
  
  let iterations = 0;
  
  while (openList.length > 0 && iterations < maxIterations) {
    iterations++;
    
    // En düşük f değerine sahip düğümü seç
    openList.sort((a, b) => a.f - b.f);
    const current = openList.shift()!;
    
    // Hedefe ulaştık mı?
    const distanceToGoal = calculateGreatCircleDistance(
      current.lat,
      current.lon,
      endLat,
      endLon
    );
    
    if (distanceToGoal < gridResolution * 60) {
      // Hedefe yeterince yakın (grid çözünürlüğü içinde)
      return reconstructPath(current, endLat, endLon);
    }
    
    // Closed set'e ekle
    const currentKey = nodeKey(current.lat, current.lon);
    closedSet.add(currentKey);
    
    // Komşu düğümleri oluştur
    const neighbors = await generateNeighbors(
      current,
      endLat,
      endLon,
      gridResolution,
      vessel,
      weatherEnabled,
      avoidShallowWater,
      minDepth,
      heuristicWeight
    );
    
    for (const neighbor of neighbors) {
      const neighborKey = nodeKey(neighbor.lat, neighbor.lon);
      
      // Zaten işlendi mi?
      if (closedSet.has(neighborKey)) {
        continue;
      }
      
      // Open list'te var mı?
      const existingIndex = openList.findIndex(
        (n) => nodeKey(n.lat, n.lon) === neighborKey
      );
      
      if (existingIndex === -1) {
        // Yeni düğüm, open list'e ekle
        openList.push(neighbor);
      } else {
        // Mevcut düğüm, daha iyi bir yol bulduysak güncelle
        if (neighbor.g < openList[existingIndex].g) {
          openList[existingIndex] = neighbor;
        }
      }
    }
  }
  
  // Hedefe ulaşılamadı
  return {
    success: false,
    path: [],
    totalDistance: 0,
    totalFuel: 0,
    totalCO2: 0,
    totalDuration: 0,
    iterations,
    message: iterations >= maxIterations 
      ? "Maksimum iterasyon sayısına ulaşıldı" 
      : "Hedefe ulaşılamadı",
  };
}

/**
 * Komşu düğümleri oluştur (8 yön)
 */
async function generateNeighbors(
  current: GridNode,
  endLat: number,
  endLon: number,
  gridResolution: number,
  vessel: DigitalTwin,
  weatherEnabled: boolean,
  avoidShallowWater: boolean,
  minDepth: number,
  heuristicWeight: number
): Promise<GridNode[]> {
  const neighbors: GridNode[] = [];
  
  // 8 yön: N, NE, E, SE, S, SW, W, NW
  const bearings = [0, 45, 90, 135, 180, 225, 270, 315];
  const stepDistance = gridResolution * 60; // derece -> nautical miles
  
  for (const bearing of bearings) {
    const destination = calculateDestinationPoint(
      current.lat,
      current.lon,
      stepDistance,
      bearing
    );
    
    // Kara kontrolü - gerçek coastline verisi kullan (küçük buffer)
    if (isPointOnLand(destination.lat, destination.lon, 0.01)) {
      continue; // Kara üzerinden geçemez
    }
    
    // Sığ su kontrolü (backup)
    const depth = checkDepth(destination.lat, destination.lon);
    if (depth === 0) {
      continue; // Kara (backup check)
    }
    
    // Sığ su kontrolü - sadece avoidShallowWater aktifse
    if (avoidShallowWater && depth < minDepth) {
      continue; // Çok sığ
    }
    
    // Hava durumu verisi
    let weather: WeatherData | null = null;
    if (weatherEnabled) {
      weather = await fetchCombinedWeather(destination.lat, destination.lon);
    }
    
    // Segment maliyeti hesapla
    const segment = vessel.calculateSegmentConsumption(
      stepDistance,
      vessel.vessel.serviceSpeed,
      weather || undefined
    );
    
    // Yeni düğüm oluştur
    const neighbor: GridNode = {
      lat: destination.lat,
      lon: destination.lon,
      g: current.g + segment.fuelConsumed, // Maliyet = yakıt tüketimi
      h: calculateHeuristic(destination.lat, destination.lon, endLat, endLon, heuristicWeight),
      f: 0,
      parent: current,
      fuelConsumed: current.fuelConsumed + segment.fuelConsumed,
      co2Emitted: current.co2Emitted + segment.co2Emitted,
      distance: current.distance + stepDistance,
      duration: current.duration + segment.duration,
    };
    
    neighbor.f = neighbor.g + neighbor.h;
    neighbors.push(neighbor);
  }
  
  return neighbors;
}

/**
 * Heuristic fonksiyon - hedefe tahmini maliyet
 * Great Circle mesafesi kullanarak minimum yakıt tahmini
 */
function calculateHeuristic(
  lat: number,
  lon: number,
  goalLat: number,
  goalLon: number,
  weight: number
): number {
  const distance = calculateGreatCircleDistance(lat, lon, goalLat, goalLon);
  
  // Tahmini yakıt tüketimi (optimistik)
  // Gerçek tüketim hava durumuna bağlı olarak daha yüksek olabilir
  const estimatedFuelPerNM = 0.05; // tons/nm (yaklaşık)
  const estimatedFuel = distance * estimatedFuelPerNM;
  
  return estimatedFuel * weight;
}

/**
 * Düğüm anahtarı oluştur (grid snapping ile)
 */
function nodeKey(lat: number, lon: number): string {
  // Grid'e hizala (0.01 derece hassasiyet)
  const gridLat = Math.round(lat * 100) / 100;
  const gridLon = Math.round(lon * 100) / 100;
  return `${gridLat},${gridLon}`;
}

/**
 * Rotayı yeniden oluştur (hedeften başlangıca)
 */
function reconstructPath(
  endNode: GridNode,
  goalLat: number,
  goalLon: number
): AStarResult {
  const path: Array<{ lat: number; lon: number }> = [];
  let current: GridNode | null = endNode;
  
  // Son düğümden başlangıca geri git
  while (current !== null) {
    path.unshift({ lat: current.lat, lon: current.lon });
    current = current.parent;
  }
  
  // Hedef noktasını ekle
  path.push({ lat: goalLat, lon: goalLon });
  
  return {
    success: true,
    path,
    totalDistance: endNode.distance,
    totalFuel: endNode.fuelConsumed,
    totalCO2: endNode.co2Emitted,
    totalDuration: endNode.duration,
    iterations: 0, // Dışarıdan set edilecek
  };
}

/**
 * Great Circle rotası oluştur (baseline karşılaştırma için)
 */
export function generateGreatCircleRoute(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  numWaypoints: number = 10
): Array<{ lat: number; lon: number }> {
  const route: Array<{ lat: number; lon: number }> = [];
  
  for (let i = 0; i <= numWaypoints; i++) {
    const fraction = i / numWaypoints;
    
    // Spherical linear interpolation (basitleştirilmiş)
    const lat = startLat + (endLat - startLat) * fraction;
    const lon = startLon + (endLon - startLon) * fraction;
    
    route.push({ lat, lon });
  }
  
  return route;
}

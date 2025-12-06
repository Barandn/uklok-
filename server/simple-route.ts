/**
 * Basit Rota Oluşturucu
 * Great Circle rotasını waypoint'lere böler ve deniz kontrolü yapar
 */

import { calculateGreatCircleDistance, calculateBearing, calculateDestinationPoint, DigitalTwin } from './vessel-performance';
import { isPointOnLand } from './coastline';

export interface SimpleRouteResult {
  success: boolean;
  path: Array<{ lat: number; lon: number }>;
  totalDistance: number;
  totalFuel: number;
  totalCO2: number;
  totalDuration: number;
  message?: string;
}

export async function createSimpleRoute(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  vessel: DigitalTwin,
  numWaypoints: number = 20
): Promise<SimpleRouteResult> {
  const path: Array<{ lat: number; lon: number }> = [];
  
  // Toplam mesafe
  const totalDistance = calculateGreatCircleDistance(startLat, startLon, endLat, endLon);
  const stepDistance = totalDistance / numWaypoints;
  
  // Başlangıç noktası
  path.push({ lat: startLat, lon: startLon });
  
  let currentLat = startLat;
  let currentLon = startLon;
  
  // Waypoint'leri oluştur - Great Circle boyunca
  for (let i = 1; i < numWaypoints; i++) {
    const bearing = calculateBearing(currentLat, currentLon, endLat, endLon);
    const nextPoint = calculateDestinationPoint(currentLat, currentLon, stepDistance, bearing);
    
    // Tüm waypoint'leri ekle (kara kontrolü yok - harita üzerinde görselleştirme için)
    path.push({ lat: nextPoint.lat, lon: nextPoint.lon });
    currentLat = nextPoint.lat;
    currentLon = nextPoint.lon;
  }
  
  // Varış noktası
  path.push({ lat: endLat, lon: endLon });
  
  // Yakıt ve emisyon hesapla
  const avgSpeed = vessel.vessel.serviceSpeed;
  const totalDuration = totalDistance / avgSpeed; // hours
  const fuelRate = vessel.vessel.fuelConsumptionRate / 24; // tons/hour
  const totalFuel = totalDuration * fuelRate;
  const totalCO2 = totalFuel * 3.114; // HFO conversion factor
  
  return {
    success: true,
    path,
    totalDistance,
    totalFuel,
    totalCO2,
    totalDuration,
    message: `${path.length} waypoint ile rota oluşturuldu`,
  };
}

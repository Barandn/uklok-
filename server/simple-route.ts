/**
 * Basit Rota Oluşturucu
 * Great Circle rotasını waypoint'lere böler ve deniz kontrolü yapar
 */

import { calculateGreatCircleDistance, DigitalTwin } from './vessel-performance';
import { findOceanPath } from './sea-mask';

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
): Promise<SimpleRouteResult> {
  const graphRoute = findOceanPath(startLat, startLon, endLat, endLon);

  if (!graphRoute.success) {
    return {
      success: false,
      path: [],
      totalDistance: 0,
      totalFuel: 0,
      totalCO2: 0,
      totalDuration: 0,
      message: graphRoute.message || 'Deniz maskesi üzerinde rota oluşturulamadı',
    };
  }

  const path = graphRoute.path;

  // Toplam mesafeyi maskeye uyumlu segmentlerden hesapla
  let totalDistance = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const segment = calculateGreatCircleDistance(
      path[i].lat,
      path[i].lon,
      path[i + 1].lat,
      path[i + 1].lon
    );
    totalDistance += segment;
  }

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
    message: `${path.length} waypoint ile deniz maskesi üzerinden rota oluşturuldu`,
  };
}

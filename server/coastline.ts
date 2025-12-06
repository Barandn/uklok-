/**
 * Coastline Detection Module
 * Uses Natural Earth 110m coastline GeoJSON data for route validation
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface GeoJSONFeature {
  type: string;
  properties: Record<string, any>;
  geometry: {
    type: string;
    coordinates: number[][][] | number[][][][];
  };
}

interface GeoJSONData {
  type: string;
  features: GeoJSONFeature[];
}

let coastlineData: GeoJSONData | null = null;

/**
 * Load coastline GeoJSON data (lazy loading)
 */
function loadCoastlineData(): GeoJSONData {
  if (coastlineData) {
    return coastlineData;
  }

  const coastlinePath = path.join(__dirname, 'data', 'ne_110m_coastline.json');
  const rawData = fs.readFileSync(coastlinePath, 'utf-8');
  coastlineData = JSON.parse(rawData);
  console.log(`[Coastline] Loaded ${coastlineData!.features.length} coastline features`);
  return coastlineData!;
}

/**
 * Calculate distance from point to line segment
 * @param point [lon, lat]
 * @param lineStart [lon, lat]
 * @param lineEnd [lon, lat]
 */
function pointToLineDistance(point: number[], lineStart: number[], lineEnd: number[]): number {
  const [px, py] = point;
  const [x1, y1] = lineStart;
  const [x2, y2] = lineEnd;

  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;

  if (lenSq !== 0) {
    param = dot / lenSq;
  }

  let xx, yy;

  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  const dx = px - xx;
  const dy = py - yy;

  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Check if two line segments intersect
 */
function lineSegmentsIntersect(
  p1: number[],
  p2: number[],
  p3: number[],
  p4: number[]
): boolean {
  const [x1, y1] = p1;
  const [x2, y2] = p2;
  const [x3, y3] = p3;
  const [x4, y4] = p4;

  const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
  
  if (Math.abs(denom) < 1e-10) {
    return false; // Parallel lines
  }

  const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
  const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;

  return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
}

/**
 * Check if a point is on land using Natural Earth coastline data
 * NOTE: This is a simplified check - returns false for most cases
 * Use routeCrossesLand for actual route validation
 * @param lat Latitude
 * @param lon Longitude
 * @param bufferDegrees Safety buffer in degrees (default: 0.02 ≈ 2.2km)
 * @returns true if point is very close to coastline
 */
export function isPointOnLand(lat: number, lon: number, bufferDegrees: number = 0.02): boolean {
  const data = loadCoastlineData();
  const point = [lon, lat];

  // Check distance to any coastline
  let minDistance = Infinity;

  for (const feature of data.features) {
    const { geometry } = feature;

    if (geometry.type === 'LineString') {
      const coords = geometry.coordinates as unknown as number[][];
      
      // Check distance to each line segment
      for (let i = 0; i < coords.length - 1; i++) {
        const dist = pointToLineDistance(point, coords[i], coords[i + 1]);
        minDistance = Math.min(minDistance, dist);
        
        // Early exit if very close
        if (minDistance < bufferDegrees) {
          return true;
        }
      }
    } else if (geometry.type === 'MultiLineString') {
      const multiCoords = geometry.coordinates as unknown as number[][][];
      
      for (const lineString of multiCoords) {
        for (let i = 0; i < lineString.length - 1; i++) {
          const dist = pointToLineDistance(point, lineString[i], lineString[i + 1]);
          minDistance = Math.min(minDistance, dist);
          
          // Early exit if very close
          if (minDistance < bufferDegrees) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

/**
 * Check if a route segment crosses land (coastline intersection)
 * This is the PRIMARY method for route validation
 * @param lat1 Start latitude
 * @param lon1 Start longitude
 * @param lat2 End latitude
 * @param lon2 End longitude
 * @param samples Number of points to check along the route (default: 10)
 * @returns true if route crosses any coastline
 */
export function routeCrossesLand(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  samples: number = 10
): boolean {
  const data = loadCoastlineData();
  const routeStart = [lon1, lat1];
  const routeEnd = [lon2, lat2];

  // Check if route segment intersects any coastline segment
  for (const feature of data.features) {
    const { geometry } = feature;

    if (geometry.type === 'LineString') {
      const coords = geometry.coordinates as unknown as number[][];
      
      for (let i = 0; i < coords.length - 1; i++) {
        if (lineSegmentsIntersect(routeStart, routeEnd, coords[i], coords[i + 1])) {
          return true;
        }
      }
    } else if (geometry.type === 'MultiLineString') {
      const multiCoords = geometry.coordinates as unknown as number[][][];
      
      for (const lineString of multiCoords) {
        for (let i = 0; i < lineString.length - 1; i++) {
          if (lineSegmentsIntersect(routeStart, routeEnd, lineString[i], lineString[i + 1])) {
            return true;
          }
        }
      }
    }
  }

  // Also sample points along the route
  for (let i = 1; i < samples; i++) {
    const t = i / samples;
    const lat = lat1 + t * (lat2 - lat1);
    const lon = lon1 + t * (lon2 - lon1);
    
    if (isPointOnLand(lat, lon, 0.02)) {
      return true;
    }
  }

  return false;
}

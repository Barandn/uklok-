/**
 * Fast Land Detection using Spatial Indexing
 * Uses grid-based bucketing for O(1) polygon lookup
 * Much faster than checking all polygons for each point
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Spatial index bucket size in degrees
 * 5° buckets provide good balance between index size and lookup speed
 */
const BUCKET_SIZE = 5;

interface Polygon {
  coords: number[][];
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

interface SpatialIndex {
  buckets: Map<string, Polygon[]>;
  allPolygons: Polygon[];
}

let spatialIndex: SpatialIndex | null = null;

/**
 * Get bucket key for a lat/lon coordinate
 */
function getBucketKey(lat: number, lon: number): string {
  const bucketLat = Math.floor(lat / BUCKET_SIZE) * BUCKET_SIZE;
  const bucketLon = Math.floor(lon / BUCKET_SIZE) * BUCKET_SIZE;
  return `${bucketLat},${bucketLon}`;
}

/**
 * Ray casting algorithm for point-in-polygon
 */
function pointInPolygon(x: number, y: number, polygon: number[][]): boolean {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Build spatial index from 50m land polygons
 */
function buildSpatialIndex(): SpatialIndex {
  console.log('[LandGrid] Building spatial index...');
  const startTime = Date.now();

  const buckets = new Map<string, Polygon[]>();
  const allPolygons: Polygon[] = [];

  // Load 50m land polygons
  const landPath = path.join(__dirname, 'data', 'ne_50m_land.json');
  let landData: any;

  try {
    const rawData = fs.readFileSync(landPath, 'utf-8');
    landData = JSON.parse(rawData);
    console.log(`[LandGrid] Loaded ${landData.features.length} land features`);
  } catch (error) {
    console.error('[LandGrid] Failed to load land data:', error);
    return { buckets, allPolygons };
  }

  // Process each feature
  for (const feature of landData.features) {
    const { geometry, bbox } = feature;

    // Get polygon coordinates
    let polygonCoords: number[][][] = [];

    if (geometry.type === 'Polygon') {
      polygonCoords = [geometry.coordinates[0]]; // Outer ring only
    } else if (geometry.type === 'MultiPolygon') {
      polygonCoords = geometry.coordinates.map((p: number[][][]) => p[0]);
    }

    // Process each polygon
    for (const coords of polygonCoords) {
      // Calculate bounding box
      let minLat = Infinity, maxLat = -Infinity;
      let minLon = Infinity, maxLon = -Infinity;

      for (const [lon, lat] of coords) {
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
        minLon = Math.min(minLon, lon);
        maxLon = Math.max(maxLon, lon);
      }

      const polygon: Polygon = { coords, minLat, maxLat, minLon, maxLon };
      allPolygons.push(polygon);

      // Add to all buckets that the polygon overlaps
      for (let lat = Math.floor(minLat / BUCKET_SIZE) * BUCKET_SIZE;
           lat <= maxLat;
           lat += BUCKET_SIZE) {
        for (let lon = Math.floor(minLon / BUCKET_SIZE) * BUCKET_SIZE;
             lon <= maxLon;
             lon += BUCKET_SIZE) {
          const key = `${lat},${lon}`;
          if (!buckets.has(key)) {
            buckets.set(key, []);
          }
          buckets.get(key)!.push(polygon);
        }
      }
    }
  }

  const elapsed = Date.now() - startTime;
  console.log(`[LandGrid] Built spatial index in ${elapsed}ms`);
  console.log(`[LandGrid] ${allPolygons.length} polygons in ${buckets.size} buckets`);

  return { buckets, allPolygons };
}

/**
 * Get or create the spatial index
 */
function getSpatialIndex(): SpatialIndex {
  if (!spatialIndex) {
    spatialIndex = buildSpatialIndex();
  }
  return spatialIndex;
}

/**
 * Check if a point is on land using spatial index
 * O(k) where k is the number of polygons in the bucket (typically small)
 * @param lat Latitude
 * @param lon Longitude
 * @returns true if point is on land
 */
export function isLandFast(lat: number, lon: number): boolean {
  const index = getSpatialIndex();

  // Get bucket for this point
  const bucketKey = getBucketKey(lat, lon);
  const polygons = index.buckets.get(bucketKey);

  if (!polygons || polygons.length === 0) {
    return false;
  }

  // Check only polygons in this bucket
  for (const polygon of polygons) {
    // Quick bounding box check
    if (lat < polygon.minLat || lat > polygon.maxLat ||
        lon < polygon.minLon || lon > polygon.maxLon) {
      continue;
    }

    // Point-in-polygon check
    if (pointInPolygon(lon, lat, polygon.coords)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a point is in sea using spatial index
 * @param lat Latitude
 * @param lon Longitude
 * @returns true if point is in sea
 */
export function isSeaFast(lat: number, lon: number): boolean {
  return !isLandFast(lat, lon);
}

/**
 * Great circle interpolation between two points
 */
function interpolateGreatCircle(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
  fraction: number
): { lat: number; lon: number } {
  // For short distances, linear interpolation is fine
  const distDeg = Math.sqrt(Math.pow(lat2 - lat1, 2) + Math.pow(lon2 - lon1, 2));

  if (distDeg < 5) {
    return {
      lat: lat1 + fraction * (lat2 - lat1),
      lon: lon1 + fraction * (lon2 - lon1)
    };
  }

  // For longer distances, use proper great circle interpolation
  const φ1 = lat1 * Math.PI / 180;
  const λ1 = lon1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const λ2 = lon2 * Math.PI / 180;

  const d = Math.acos(
    Math.sin(φ1) * Math.sin(φ2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1)
  );

  if (d < 1e-10) {
    return { lat: lat1, lon: lon1 };
  }

  const a = Math.sin((1 - fraction) * d) / Math.sin(d);
  const b = Math.sin(fraction * d) / Math.sin(d);

  const x = a * Math.cos(φ1) * Math.cos(λ1) + b * Math.cos(φ2) * Math.cos(λ2);
  const y = a * Math.cos(φ1) * Math.sin(λ1) + b * Math.cos(φ2) * Math.sin(λ2);
  const z = a * Math.sin(φ1) + b * Math.sin(φ2);

  return {
    lat: Math.atan2(z, Math.sqrt(x * x + y * y)) * 180 / Math.PI,
    lon: Math.atan2(y, x) * 180 / Math.PI
  };
}

/**
 * Calculate great circle distance in km
 */
function greatCircleDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Check if a segment crosses land using spatial index
 * Uses great circle interpolation for accuracy
 * @returns true if segment crosses land
 */
export function segmentCrossesLandFast(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): boolean {
  // Check endpoints
  if (isLandFast(lat1, lon1) || isLandFast(lat2, lon2)) {
    return true;
  }

  // Calculate distance to determine sample count
  const distanceKm = greatCircleDistanceKm(lat1, lon1, lat2, lon2);

  // Sample every 5km (good balance between accuracy and speed)
  const sampleIntervalKm = 5;
  const samples = Math.max(10, Math.ceil(distanceKm / sampleIntervalKm));

  // Check points along great circle
  for (let i = 1; i < samples; i++) {
    const fraction = i / samples;
    const point = interpolateGreatCircle(lat1, lon1, lat2, lon2, fraction);

    if (isLandFast(point.lat, point.lon)) {
      return true;
    }
  }

  return false;
}

/**
 * Validate entire route
 */
export function validateRouteFast(
  waypoints: Array<{ lat: number; lon: number }>
): { valid: boolean; landPoints: number[]; landSegments: number[] } {
  const landPoints: number[] = [];
  const landSegments: number[] = [];

  for (let i = 0; i < waypoints.length; i++) {
    if (isLandFast(waypoints[i].lat, waypoints[i].lon)) {
      landPoints.push(i);
    }
  }

  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i];
    const to = waypoints[i + 1];
    if (segmentCrossesLandFast(from.lat, from.lon, to.lat, to.lon)) {
      landSegments.push(i);
    }
  }

  return {
    valid: landPoints.length === 0 && landSegments.length === 0,
    landPoints,
    landSegments
  };
}

/**
 * Pre-initialize the spatial index (call at server startup)
 */
export function initializeLandGrid(): void {
  setImmediate(() => {
    getSpatialIndex();
  });
}

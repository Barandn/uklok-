/**
 * High-Resolution Land Detection System
 *
 * Uses multiple data sources for maximum accuracy:
 * 1. Binary land grid (0.05° resolution, ~5.5km) - O(1) lookups
 * 2. Natural Earth 10m polygons - precise boundary detection
 * 3. Spatial indexing for fast polygon queries
 *
 * This system catches ALL land masses including:
 * - Continents
 * - Large islands
 * - Small islands
 * - Minor islands
 * - Reefs and rocks
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// BINARY LAND GRID (High-resolution raster for O(1) lookups)
// ============================================================================

interface LandGrid {
  resolution: number;
  width: number;
  height: number;
  originLat: number;
  originLon: number;
  rows: number[][];  // RLE encoded: each row is [start, length, start, length, ...]
  decodedRows?: boolean[][];  // Decoded for fast access
}

let cachedLandGrid: LandGrid | null = null;
let decodedGrid: boolean[][] | null = null;

/**
 * Load the high-resolution binary land grid
 */
function loadLandGrid(): LandGrid {
  if (cachedLandGrid) return cachedLandGrid;

  const gridPath = path.join(__dirname, 'data', 'land-grid-10m.json');

  try {
    console.log('[LandGrid] Loading high-resolution land grid (10m source)...');
    const raw = fs.readFileSync(gridPath, 'utf-8');
    cachedLandGrid = JSON.parse(raw);
    console.log(`[LandGrid] Loaded grid: ${cachedLandGrid!.width}x${cachedLandGrid!.height}, resolution: ${cachedLandGrid!.resolution}°`);
    return cachedLandGrid!;
  } catch (error) {
    console.error('[LandGrid] Failed to load land grid:', error);
    // Return empty grid as fallback
    cachedLandGrid = {
      resolution: 0.05,
      width: 7200,
      height: 3600,
      originLat: 90,
      originLon: -180,
      rows: []
    };
    return cachedLandGrid;
  }
}

/**
 * Decode RLE grid for fast access
 */
function decodeGrid(): boolean[][] {
  if (decodedGrid) return decodedGrid;

  const grid = loadLandGrid();
  console.log('[LandGrid] Decoding RLE grid for fast access...');
  const startTime = Date.now();

  decodedGrid = [];

  for (let row = 0; row < grid.height; row++) {
    const rowData = new Array(grid.width).fill(false);
    const segments = grid.rows[row] || [];

    for (let i = 0; i < segments.length; i += 2) {
      const start = segments[i];
      const length = segments[i + 1];
      for (let col = start; col < start + length && col < grid.width; col++) {
        rowData[col] = true;
      }
    }

    decodedGrid.push(rowData);
  }

  console.log(`[LandGrid] Decoded in ${Date.now() - startTime}ms`);
  return decodedGrid;
}

/**
 * Check if a point is on land using the binary grid (O(1) lookup)
 */
function isLandFromGrid(lat: number, lon: number): boolean {
  const grid = loadLandGrid();

  // Normalize longitude
  let normalizedLon = lon;
  while (normalizedLon < -180) normalizedLon += 360;
  while (normalizedLon > 180) normalizedLon -= 360;

  // Calculate grid indices
  const row = Math.floor((grid.originLat - lat) / grid.resolution);
  const col = Math.floor((normalizedLon - grid.originLon) / grid.resolution);

  // Check bounds
  if (row < 0 || row >= grid.height || col < 0 || col >= grid.width) {
    return false;
  }

  // Check using RLE encoded data (without full decode)
  const segments = grid.rows[row] || [];

  for (let i = 0; i < segments.length; i += 2) {
    const start = segments[i];
    const length = segments[i + 1];
    if (col >= start && col < start + length) {
      return true;
    }
    if (col < start) break;  // Past possible range
  }

  return false;
}

// ============================================================================
// POLYGON-BASED DETECTION (for precise boundary checking)
// ============================================================================

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
 * Build spatial index from 10m land polygons
 */
function buildSpatialIndex(): SpatialIndex {
  console.log('[LandGrid] Building spatial index from 10m polygons...');
  const startTime = Date.now();

  const buckets = new Map<string, Polygon[]>();
  const allPolygons: Polygon[] = [];

  // Load all land polygon files
  const files = [
    'ne_10m_land.json',
    'ne_10m_minor_islands.json',
    'ne_50m_land.json'  // Fallback for any missed areas
  ];

  for (const filename of files) {
    const landPath = path.join(__dirname, 'data', filename);

    try {
      const rawData = fs.readFileSync(landPath, 'utf-8');
      const landData = JSON.parse(rawData);
      console.log(`[LandGrid] Loading ${filename}: ${landData.features?.length || 0} features`);

      for (const feature of landData.features || []) {
        const { geometry } = feature;

        let polygonCoords: number[][][] = [];

        if (geometry.type === 'Polygon') {
          polygonCoords = [geometry.coordinates[0]];
        } else if (geometry.type === 'MultiPolygon') {
          polygonCoords = geometry.coordinates.map((p: number[][][]) => p[0]);
        }

        for (const coords of polygonCoords) {
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

          // Add to all overlapping buckets
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
    } catch (error) {
      console.warn(`[LandGrid] Could not load ${filename}:`, error);
    }
  }

  console.log(`[LandGrid] Built index in ${Date.now() - startTime}ms: ${allPolygons.length} polygons, ${buckets.size} buckets`);
  return { buckets, allPolygons };
}

function getSpatialIndex(): SpatialIndex {
  if (!spatialIndex) {
    spatialIndex = buildSpatialIndex();
  }
  return spatialIndex;
}

/**
 * Check if point is on land using polygon intersection
 */
function isLandFromPolygons(lat: number, lon: number): boolean {
  const index = getSpatialIndex();
  const bucketKey = getBucketKey(lat, lon);
  const polygons = index.buckets.get(bucketKey);

  if (!polygons || polygons.length === 0) {
    return false;
  }

  for (const polygon of polygons) {
    if (lat < polygon.minLat || lat > polygon.maxLat ||
        lon < polygon.minLon || lon > polygon.maxLon) {
      continue;
    }

    if (pointInPolygon(lon, lat, polygon.coords)) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Check if a point is on land (uses both grid and polygons for maximum accuracy)
 * This is the primary land detection function.
 *
 * @param lat Latitude
 * @param lon Longitude
 * @returns true if point is on land
 */
export function isLandFast(lat: number, lon: number): boolean {
  // First check high-resolution grid (fast O(1) lookup)
  if (isLandFromGrid(lat, lon)) {
    return true;
  }

  // Then check polygons (for edge cases the grid might miss)
  // The grid has 0.05° resolution (~5.5km), so coastal areas need polygon check
  return isLandFromPolygons(lat, lon);
}

/**
 * Check if a point is in sea
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
  const distDeg = Math.sqrt(Math.pow(lat2 - lat1, 2) + Math.pow(lon2 - lon1, 2));

  if (distDeg < 5) {
    return {
      lat: lat1 + fraction * (lat2 - lat1),
      lon: lon1 + fraction * (lon2 - lon1)
    };
  }

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
 * Check if a segment crosses land
 * Uses dense sampling along the great circle path
 *
 * @param lat1 Start latitude
 * @param lon1 Start longitude
 * @param lat2 End latitude
 * @param lon2 End longitude
 * @returns true if segment crosses land
 */
export function segmentCrossesLandFast(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): boolean {
  // Check endpoints first
  if (isLandFast(lat1, lon1) || isLandFast(lat2, lon2)) {
    return true;
  }

  // Calculate distance to determine sample count
  const distanceKm = greatCircleDistanceKm(lat1, lon1, lat2, lon2);

  // Sample every 2km for high accuracy (was 5km)
  // This ensures we catch even narrow land masses
  const sampleIntervalKm = 2;
  const samples = Math.max(20, Math.ceil(distanceKm / sampleIntervalKm));

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
 * Validate entire route for land crossings
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
 * Get land detection statistics
 */
export function getLandGridStats(): {
  gridResolution: number;
  gridSize: string;
  polygonCount: number;
  bucketCount: number;
} {
  const grid = loadLandGrid();
  const index = getSpatialIndex();

  return {
    gridResolution: grid.resolution,
    gridSize: `${grid.width}x${grid.height}`,
    polygonCount: index.allPolygons.length,
    bucketCount: index.buckets.size
  };
}

/**
 * Pre-initialize the land detection system (call at server startup)
 */
export function initializeLandGrid(): void {
  setImmediate(() => {
    loadLandGrid();
    getSpatialIndex();
    console.log('[LandGrid] Land detection system initialized');
  });
}

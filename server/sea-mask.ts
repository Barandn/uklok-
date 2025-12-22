/**
 * Sea/Ocean mask helper
 * Loads a coarse binary raster and exposes helpers to route over navigable water cells.
 * Enhanced with high-resolution pre-computed land grid for O(1) lookups.
 */

import * as fs from 'fs';
import * as path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { calculateGreatCircleDistance } from './vessel-performance';
// Note: land-grid imports removed - 50m land polygons incorrectly mark
// some enclosed seas (Marmara, straits) as land. Ocean mask is more reliable.

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface SeaMask {
  originLat: number; // upper-left corner latitude
  originLon: number; // upper-left corner longitude
  resolution: number; // degrees per pixel
  width: number;
  height: number;
  mask: number[][]; // 0 = water, 1 = land/blocked
}

export interface LatLon {
  lat: number;
  lon: number;
}

interface GridPoint {
  row: number;
  col: number;
}

interface PathResult {
  success: boolean;
  path: LatLon[];
  message?: string;
}

let cachedMask: SeaMask | null = null;

function loadSeaMask(): SeaMask {
  if (cachedMask) return cachedMask;

  // Try high-resolution mask first (0.25° resolution, ~28km cells)
  // Falls back to standard mask if high-res not available
  const highResPath = path.join(__dirname, 'data', 'ocean-mask-highres.json');
  const standardPath = path.join(__dirname, 'data', 'ocean-mask.json');

  let maskPath = standardPath;

  try {
    if (fs.existsSync(highResPath)) {
      maskPath = highResPath;
      console.log('[SeaMask] Using high-resolution ocean mask (0.25° resolution)');
    } else {
      console.log('[SeaMask] High-res mask not found, using standard resolution');
    }
  } catch (e) {
    console.warn('[SeaMask] Error checking for high-res mask:', e);
  }

  try {
    const raw = fs.readFileSync(maskPath, 'utf-8');
    const parsed: SeaMask = JSON.parse(raw);
    cachedMask = parsed;
    console.log(`[SeaMask] Loaded mask: ${parsed.width}x${parsed.height} cells, resolution: ${parsed.resolution}°`);
    return parsed;
  } catch (error) {
    console.error('[SeaMask] Failed to load ocean mask:', error);
    // Return a safe default mask that marks everything as water
    // This prevents crashes but routing will need to rely on other checks
    const defaultMask: SeaMask = {
      originLat: 90,
      originLon: -180,
      resolution: 1,
      width: 360,
      height: 180,
      mask: Array(180).fill(null).map(() => Array(360).fill(0)) // All water
    };
    cachedMask = defaultMask;
    return defaultMask;
  }
}

function normalizeLongitude(lon: number): number {
  let normalized = lon;
  while (normalized < -180) normalized += 360;
  while (normalized > 180) normalized -= 360;
  return normalized;
}

function latLonToCell(lat: number, lon: number): GridPoint | null {
  const mask = loadSeaMask();
  const normalizedLon = normalizeLongitude(lon);
  const row = Math.floor((mask.originLat - lat) / mask.resolution);
  const col = Math.floor((normalizedLon - mask.originLon) / mask.resolution);

  if (row < 0 || row >= mask.height || col < 0 || col >= mask.width) {
    return null;
  }

  return { row, col };
}

function cellToLatLon(point: GridPoint): LatLon {
  const mask = loadSeaMask();
  const lat = mask.originLat - mask.resolution * (point.row + 0.5);
  const lon = mask.originLon + mask.resolution * (point.col + 0.5);
  return { lat, lon };
}

function isSeaCell(point: GridPoint): boolean {
  const mask = loadSeaMask();
  const row = mask.mask[point.row];
  if (!row) return false;
  return row[point.col] === 0;
}

function findNearestSeaCell(lat: number, lon: number, maxRadius = 5): GridPoint | null {
  const startCell = latLonToCell(lat, lon);

  // Check if starting cell is valid sea using ocean mask only
  // (removed isLandFast check - 50m polygons mark some seas as land)
  if (startCell && isSeaCell(startCell)) {
    return startCell;
  }

  const mask = loadSeaMask();
  const normalizedLon = normalizeLongitude(lon);

  // Increased maxRadius to 5 (was 3) to better find sea cells near ports
  for (let radius = 1; radius <= maxRadius; radius++) {
    for (let dRow = -radius; dRow <= radius; dRow++) {
      for (let dCol = -radius; dCol <= radius; dCol++) {
        const candidateRow = startCell ? startCell.row + dRow : Math.floor((mask.originLat - lat) / mask.resolution) + dRow;
        const candidateCol = startCell ? startCell.col + dCol : Math.floor((normalizedLon - mask.originLon) / mask.resolution) + dCol;

        if (
          candidateRow < 0 ||
          candidateRow >= mask.height ||
          candidateCol < 0 ||
          candidateCol >= mask.width
        ) {
          continue;
        }

        const candidate: GridPoint = { row: candidateRow, col: candidateCol };
        // Only check ocean mask - trust it for sea detection
        if (isSeaCell(candidate)) {
          return candidate;
        }
      }
    }
  }

  return null;
}

function reconstructPath(endNode: GridPoint, cameFrom: Map<string, GridPoint>, startKey: string): GridPoint[] {
  const path: GridPoint[] = [endNode];
  let currentKey = key(endNode);

  while (currentKey !== startKey) {
    const parent = cameFrom.get(currentKey);
    if (!parent) break;
    path.push(parent);
    currentKey = key(parent);
  }

  return path.reverse();
}

function key(point: GridPoint): string {
  return `${point.row},${point.col}`;
}

function getNeighbors(point: GridPoint): GridPoint[] {
  const mask = loadSeaMask();
  const neighbors: GridPoint[] = [];

  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const row = point.row + dr;
      let col = point.col + dc;

      // Skip invalid rows (can't wrap around poles)
      if (row < 0 || row >= mask.height) continue;

      // WRAP AROUND DATELINE: Allow Pacific routes to cross 180° longitude
      // When col goes negative, wrap to the right side of the grid
      // When col exceeds width, wrap to the left side
      if (col < 0) col = mask.width + col;
      if (col >= mask.width) col = col - mask.width;

      const candidate: GridPoint = { row, col };
      // Only check ocean mask - removed isLandFast check because
      // 50m land polygons incorrectly mark some enclosed seas as land
      if (isSeaCell(candidate)) {
        neighbors.push(candidate);
      }
    }
  }

  return neighbors;
}

/**
 * Maximum iterations for A* algorithm to prevent infinite loops
 * Increased to handle global routes (e.g., Singapore to Rotterdam)
 */
const MAX_ASTAR_ITERATIONS = 200000;

/**
 * Finds the shortest navigable path (A*) between two geographic coordinates.
 * Uses optimized data structures and iteration limits to prevent hangs.
 */
export function findOceanPath(startLat: number, startLon: number, endLat: number, endLon: number): PathResult {
  const startCell = findNearestSeaCell(startLat, startLon);
  const endCell = findNearestSeaCell(endLat, endLon);

  if (!startCell || !endCell) {
    return { success: false, path: [], message: 'Başlangıç veya bitiş noktası için geçerli deniz hücresi bulunamadı' };
  }

  // Use Set for O(1) lookup instead of Array.find() which is O(n)
  const openSet: GridPoint[] = [startCell];
  const openSetKeys = new Set<string>([key(startCell)]);
  const closedSet = new Set<string>();
  const cameFrom = new Map<string, GridPoint>();
  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();

  const startKey = key(startCell);
  const endKey = key(endCell);
  gScore.set(startKey, 0);
  fScore.set(startKey, heuristic(startCell, endCell));

  let iterations = 0;

  while (openSet.length > 0) {
    // Prevent infinite loops with iteration limit
    iterations++;
    if (iterations > MAX_ASTAR_ITERATIONS) {
      console.warn(`[A*] Iteration limit reached (${MAX_ASTAR_ITERATIONS}). Path may not be optimal.`);
      return { success: false, path: [], message: `Rota hesaplama zaman aşımına uğradı (${iterations} iterasyon)` };
    }

    openSet.sort((a, b) => (fScore.get(key(a)) ?? Infinity) - (fScore.get(key(b)) ?? Infinity));
    const current = openSet.shift()!;
    const currentKey = key(current);
    openSetKeys.delete(currentKey);
    closedSet.add(currentKey);

    if (currentKey === endKey) {
      const gridPath = reconstructPath(current, cameFrom, startKey);
      const latLonPath: LatLon[] = gridPath.map(cellToLatLon);
      // use exact start/end coordinates for user clarity
      latLonPath[0] = { lat: startLat, lon: startLon };
      latLonPath[latLonPath.length - 1] = { lat: endLat, lon: endLon };
      console.log(`[A*] Path found in ${iterations} iterations with ${latLonPath.length} waypoints`);
      return { success: true, path: latLonPath };
    }

    for (const neighbor of getNeighbors(current)) {
      const neighborKey = key(neighbor);

      // Skip if already processed
      if (closedSet.has(neighborKey)) {
        continue;
      }

      const tentativeG = (gScore.get(currentKey) ?? Infinity) + distanceBetween(current, neighbor);

      if (tentativeG < (gScore.get(neighborKey) ?? Infinity)) {
        cameFrom.set(neighborKey, current);
        gScore.set(neighborKey, tentativeG);
        fScore.set(neighborKey, tentativeG + heuristic(neighbor, endCell));

        // O(1) check using Set instead of O(n) Array.find()
        if (!openSetKeys.has(neighborKey)) {
          openSet.push(neighbor);
          openSetKeys.add(neighborKey);
        }
      }
    }
  }

  console.warn(`[A*] No path found after ${iterations} iterations`);
  return { success: false, path: [], message: 'Deniz maskesi üzerinde uygun rota bulunamadı' };
}

function heuristic(a: GridPoint, b: GridPoint): number {
  const pointA = cellToLatLon(a);
  const pointB = cellToLatLon(b);
  return calculateGreatCircleDistance(pointA.lat, pointA.lon, pointB.lat, pointB.lon);
}

function distanceBetween(a: GridPoint, b: GridPoint): number {
  const pointA = cellToLatLon(a);
  const pointB = cellToLatLon(b);
  return calculateGreatCircleDistance(pointA.lat, pointA.lon, pointB.lat, pointB.lon);
}

/**
 * Check if a point is in navigable sea water
 * Uses OCEAN MASK as primary source (more reliable for enclosed seas like Marmara)
 * Land grid is used for fine-grained coastal checks only
 * @returns true if point is in sea, false if on land or outside grid
 */
export function isPointInSea(lat: number, lon: number): boolean {
  // Primary check: Ocean mask (0.25° resolution)
  // This is more reliable for enclosed seas (Marmara, Aegean, etc.)
  const cell = latLonToCell(lat, lon);
  if (!cell) return false; // Outside grid bounds

  // If ocean mask says LAND, definitely land
  if (!isSeaCell(cell)) {
    return false;
  }

  // Ocean mask says SEA - trust it
  // Note: We previously checked land-grid first, but 50m land polygons
  // incorrectly mark some enclosed seas (Marmara, straits) as land.
  // Ocean mask is generated from verified water data and is more reliable
  // for large water bodies.
  return true;
}

/**
 * Check if a line segment crosses land
 * Uses OCEAN MASK with interpolation along segment
 * More reliable for enclosed seas than land polygon checks
 * @returns true if segment crosses land
 */
export function segmentCrossesLand(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): boolean {
  // Check endpoints first
  if (!isPointInSea(lat1, lon1) || !isPointInSea(lat2, lon2)) {
    return true;
  }

  // Calculate distance to determine sample count
  const distanceNm = calculateGreatCircleDistance(lat1, lon1, lat2, lon2);
  const distanceKm = distanceNm * 1.852;

  // Sample every 5km (good balance between accuracy and speed)
  const sampleIntervalKm = 5;
  const samples = Math.max(10, Math.ceil(distanceKm / sampleIntervalKm));

  // Check points along the segment
  for (let i = 1; i < samples; i++) {
    const fraction = i / samples;
    const lat = lat1 + fraction * (lat2 - lat1);
    const lon = lon1 + fraction * (lon2 - lon1);

    if (!isPointInSea(lat, lon)) {
      return true;
    }
  }

  return false;
}

/**
 * Validate entire route - all waypoints must be in sea
 * and no segment should cross land
 */
export function validateSeaRoute(
  waypoints: Array<{ lat: number; lon: number }>
): { valid: boolean; landPoints: number[]; landSegments: number[] } {
  const landPoints: number[] = [];
  const landSegments: number[] = [];

  // Check all waypoints
  for (let i = 0; i < waypoints.length; i++) {
    if (!isPointInSea(waypoints[i].lat, waypoints[i].lon)) {
      landPoints.push(i);
    }
  }

  // Check all segments with distance-adaptive sampling
  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i];
    const to = waypoints[i + 1];
    if (segmentCrossesLand(from.lat, from.lon, to.lat, to.lon)) {
      landSegments.push(i);
    }
  }

  return {
    valid: landPoints.length === 0 && landSegments.length === 0,
    landPoints,
    landSegments
  };
}


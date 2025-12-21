/**
 * Sea/Ocean mask helper
 * Loads a coarse binary raster and exposes helpers to route over navigable water cells.
 * Enhanced with 50m land polygon checks for accurate narrow passage detection.
 */

import * as fs from 'fs';
import * as path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { calculateGreatCircleDistance } from './vessel-performance';
import { isPointInsideLand, routeCrossesLand as coastlineCrossesLand } from './coastline';

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

function findNearestSeaCell(lat: number, lon: number, maxRadius = 3): GridPoint | null {
  const startCell = latLonToCell(lat, lon);

  // Check if starting cell is valid sea (both ocean mask and land polygon)
  if (startCell && isSeaCell(startCell)) {
    const cellCenter = cellToLatLon(startCell);
    if (!isPointInsideLand(cellCenter.lat, cellCenter.lon)) {
      return startCell;
    }
  }

  const mask = loadSeaMask();
  const normalizedLon = normalizeLongitude(lon);

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
        if (isSeaCell(candidate)) {
          // Also check land polygon
          const cellCenter = cellToLatLon(candidate);
          if (!isPointInsideLand(cellCenter.lat, cellCenter.lon)) {
            return candidate;
          }
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
      if (isSeaCell(candidate)) {
        // Additional check: verify cell center is not inside a land polygon
        const cellCenter = cellToLatLon(candidate);
        if (!isPointInsideLand(cellCenter.lat, cellCenter.lon)) {
          neighbors.push(candidate);
        }
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
 * Uses DUAL validation: ocean mask grid + 50m land polygon check
 * This catches narrow land features that the coarse grid may miss
 * @returns true if point is in sea, false if on land or outside grid
 */
export function isPointInSea(lat: number, lon: number): boolean {
  const cell = latLonToCell(lat, lon);
  if (!cell) return false; // Outside grid bounds

  // Check 1: Ocean mask grid (0.25° resolution)
  if (!isSeaCell(cell)) {
    return false;
  }

  // Check 2: 50m land polygon check (catches narrow peninsulas like Peloponnese)
  // This is critical for areas where the coarse grid marks as water
  // but actually contains narrow land features
  if (isPointInsideLand(lat, lon)) {
    return false;
  }

  return true;
}

/**
 * Check if a line segment crosses land
 * Uses TRIPLE validation:
 * 1. Endpoint sea checks (ocean mask + land polygons)
 * 2. Coastline intersection check (110m coastline)
 * 3. Dense point sampling with land polygon checks
 * @returns true if segment crosses land
 */
export function segmentCrossesLand(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): boolean {
  // Check endpoints first (already includes land polygon check)
  if (!isPointInSea(lat1, lon1) || !isPointInSea(lat2, lon2)) {
    return true;
  }

  // Check 2: Coastline intersection check (fast geometric check)
  // This catches obvious crossings over coastlines
  if (coastlineCrossesLand(lat1, lon1, lat2, lon2, 20)) {
    return true;
  }

  // Calculate distance to determine number of samples
  const distance = calculateGreatCircleDistance(lat1, lon1, lat2, lon2);

  // Sample every ~5km to catch narrow land features
  // Increased density for Mediterranean-style complex coastlines
  const sampleDistanceKm = 5; // 5km between samples
  const samples = Math.max(20, Math.ceil(distance * 1.852 / sampleDistanceKm)); // distance is in NM

  // Sample points along the segment with dense land polygon checks
  for (let i = 1; i < samples; i++) {
    const t = i / samples;
    const lat = lat1 + t * (lat2 - lat1);
    const lon = lon1 + t * (lon2 - lon1);

    // Check both ocean mask AND land polygon
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


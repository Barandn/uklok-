/**
 * Sea/Ocean mask helper
 * Loads a coarse binary raster and exposes helpers to route over navigable water cells.
 */

import * as fs from 'fs';
import * as path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { calculateGreatCircleDistance } from './vessel-performance';

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

  const maskPath = path.join(__dirname, 'data', 'ocean-mask.json');
  const raw = fs.readFileSync(maskPath, 'utf-8');
  const parsed: SeaMask = JSON.parse(raw);

  cachedMask = parsed;
  return parsed;
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
  if (startCell && isSeaCell(startCell)) return startCell;

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
      const col = point.col + dc;
      if (row < 0 || col < 0 || row >= mask.height || col >= mask.width) continue;
      const candidate: GridPoint = { row, col };
      if (isSeaCell(candidate)) {
        neighbors.push(candidate);
      }
    }
  }

  return neighbors;
}

/**
 * Finds the shortest navigable path (A*) between two geographic coordinates.
 */
export function findOceanPath(startLat: number, startLon: number, endLat: number, endLon: number): PathResult {
  const startCell = findNearestSeaCell(startLat, startLon);
  const endCell = findNearestSeaCell(endLat, endLon);

  if (!startCell || !endCell) {
    return { success: false, path: [], message: 'Başlangıç veya bitiş noktası için geçerli deniz hücresi bulunamadı' };
  }

  const openSet: GridPoint[] = [startCell];
  const cameFrom = new Map<string, GridPoint>();
  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();

  const startKey = key(startCell);
  gScore.set(startKey, 0);
  fScore.set(startKey, heuristic(startCell, endCell));

  while (openSet.length > 0) {
    openSet.sort((a, b) => (fScore.get(key(a)) ?? Infinity) - (fScore.get(key(b)) ?? Infinity));
    const current = openSet.shift()!;
    const currentKey = key(current);

    if (currentKey === key(endCell)) {
      const gridPath = reconstructPath(current, cameFrom, startKey);
      const latLonPath: LatLon[] = gridPath.map(cellToLatLon);
      // use exact start/end coordinates for user clarity
      latLonPath[0] = { lat: startLat, lon: startLon };
      latLonPath[latLonPath.length - 1] = { lat: endLat, lon: endLon };
      return { success: true, path: latLonPath };
    }

    for (const neighbor of getNeighbors(current)) {
      const tentativeG = (gScore.get(currentKey) ?? Infinity) + distanceBetween(current, neighbor);
      const neighborKey = key(neighbor);

      if (tentativeG < (gScore.get(neighborKey) ?? Infinity)) {
        cameFrom.set(neighborKey, current);
        gScore.set(neighborKey, tentativeG);
        fScore.set(neighborKey, tentativeG + heuristic(neighbor, endCell));

        if (!openSet.find((p) => key(p) === neighborKey)) {
          openSet.push(neighbor);
        }
      }
    }
  }

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


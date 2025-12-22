/**
 * Blocked Zones Module
 * Pre-defined critical land areas that ships MUST avoid
 * Much faster than polygon intersection - simple distance check
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface BlockedPoint {
  lat: number;
  lon: number;
  radius: number; // in kilometers
}

interface BlockedZone {
  name: string;
  description: string;
  points: BlockedPoint[];
}

interface BlockedZonesData {
  description: string;
  version: string;
  zones: BlockedZone[];
}

let cachedZones: BlockedPoint[] | null = null;

/**
 * Load and flatten all blocked zones into a single array of points
 */
function loadBlockedZones(): BlockedPoint[] {
  if (cachedZones) return cachedZones;

  const zonePath = path.join(__dirname, 'data', 'blocked-zones.json');

  try {
    const raw = fs.readFileSync(zonePath, 'utf-8');
    const data: BlockedZonesData = JSON.parse(raw);

    // Flatten all zone points into single array
    cachedZones = [];
    for (const zone of data.zones) {
      for (const point of zone.points) {
        cachedZones.push(point);
      }
    }

    console.log(`[BlockedZones] Loaded ${cachedZones.length} blocked points from ${data.zones.length} zones`);
    return cachedZones;
  } catch (error) {
    console.error('[BlockedZones] Failed to load blocked zones:', error);
    cachedZones = [];
    return cachedZones;
  }
}

/**
 * Calculate distance between two points in kilometers (Haversine formula)
 */
function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Check if a point is within any blocked zone
 * @returns true if point is in a blocked zone (should be avoided)
 */
export function isInBlockedZone(lat: number, lon: number): boolean {
  const zones = loadBlockedZones();

  for (const zone of zones) {
    const dist = distanceKm(lat, lon, zone.lat, zone.lon);
    if (dist <= zone.radius) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a segment passes through any blocked zone
 * Samples points along the segment and checks each
 * @returns true if segment crosses a blocked zone
 */
export function segmentCrossesBlockedZone(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): boolean {
  const zones = loadBlockedZones();
  if (zones.length === 0) return false;

  // Check endpoints first
  if (isInBlockedZone(lat1, lon1) || isInBlockedZone(lat2, lon2)) {
    return true;
  }

  // Calculate segment length to determine sample count
  const segmentDist = distanceKm(lat1, lon1, lat2, lon2);

  // Sample every 10km
  const samples = Math.max(5, Math.ceil(segmentDist / 10));

  for (let i = 1; i < samples; i++) {
    const t = i / samples;
    const lat = lat1 + t * (lat2 - lat1);
    const lon = lon1 + t * (lon2 - lon1);

    if (isInBlockedZone(lat, lon)) {
      return true;
    }
  }

  return false;
}

/**
 * Get the name of the blocked zone a point is in (for debugging)
 */
export function getBlockedZoneName(lat: number, lon: number): string | null {
  const zonePath = path.join(__dirname, 'data', 'blocked-zones.json');

  try {
    const raw = fs.readFileSync(zonePath, 'utf-8');
    const data: BlockedZonesData = JSON.parse(raw);

    for (const zone of data.zones) {
      for (const point of zone.points) {
        const dist = distanceKm(lat, lon, point.lat, point.lon);
        if (dist <= point.radius) {
          return zone.name;
        }
      }
    }
  } catch (error) {
    return null;
  }

  return null;
}

/**
 * Pre-initialize blocked zones (call at server startup)
 */
export function initializeBlockedZones(): void {
  loadBlockedZones();
}

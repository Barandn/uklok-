/**
 * Real Bathymetry Data Integration
 * Uses NOAA ERDDAP ETOPO 2022 for accurate depth information
 * Integrates with genetic algorithm and vessel draft validation
 */

import axios from "axios";
import { distanceToCoastlineKm, isPointOnLand as isCoastlinePointOnLand } from "./coastline";

/**
 * NOAA ERDDAP ETOPO 2022 endpoint
 * 15 arc-second resolution (~450m accuracy)
 */
const ERDDAP_BASE = "https://oceanwatch.pifsc.noaa.gov/erddap/griddap/ETOPO_2022_v1_15s";

/**
 * In-memory cache for depth queries
 * Key: "lat,lon" (rounded to 4 decimals ~11m precision)
 * Value: { depth: number, timestamp: number }
 */
const depthCache = new Map<string, { depth: number; timestamp: number }>();

/**
 * Cache TTL: 7 days (bathymetry doesn't change frequently)
 */
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

/**
 * Request timeout for ERDDAP API
 */
const API_TIMEOUT = 8000; // 8 seconds

/**
 * Statistics for monitoring
 */
let stats = {
  cacheHits: 0,
  cacheMisses: 0,
  apiCalls: 0,
  apiErrors: 0,
  fallbacks: 0,
};

/**
 * Get statistics
 */
export function getBathymetryStats() {
  return { ...stats };
}

/**
 * Clear cache (useful for testing)
 */
export function clearDepthCache() {
  depthCache.clear();
  stats = {
    cacheHits: 0,
    cacheMisses: 0,
    apiCalls: 0,
    apiErrors: 0,
    fallbacks: 0,
  };
}

/**
 * Generate cache key from coordinates
 * Rounds to 4 decimal places (~11m precision, good enough for 450m resolution data)
 */
function getCacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

/**
 * Fallback depth estimation based on distance to coastline
 * Used when ERDDAP API is unavailable
 */
function getDepthFallback(lat: number, lon: number): number {
  // Check if point is on land using coastline data
  if (isCoastlinePointOnLand(lat, lon, 0.01)) {
    return 0; // Land
  }

  // Distance-based estimation
  const distanceKm = distanceToCoastlineKm(lat, lon);

  if (!isFinite(distanceKm)) {
    return 5000; // Deep ocean default
  }

  if (distanceKm < 1) return 2; // Harbor / very close to shore
  if (distanceKm < 5) return 8; // Coastal waters
  if (distanceKm < 15) return 25; // Shallow waters
  if (distanceKm < 50) return 120; // Continental shelf
  if (distanceKm < 200) return 500; // Shelf edge

  return 3000; // Open ocean
}

/**
 * Query real depth from NOAA ERDDAP API
 * Returns depth in meters (positive value)
 * Uses aggressive caching to minimize API calls
 */
export async function getRealDepth(lat: number, lon: number): Promise<number> {
  const cacheKey = getCacheKey(lat, lon);
  const cached = depthCache.get(cacheKey);

  // Check cache
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    stats.cacheHits++;
    return cached.depth;
  }

  stats.cacheMisses++;

  try {
    // Query ERDDAP API
    // Format: /griddap/dataset.json?variable[(lat)][(lon)]
    const url = `${ERDDAP_BASE}.json?z[(${lat})][(${lon})]`;

    stats.apiCalls++;
    const response = await axios.get(url, {
      timeout: API_TIMEOUT,
      headers: {
        'User-Agent': 'UklokGreenShipping/1.0',
      }
    });

    // Parse response
    // Response format: { table: { rows: [[lat, lon, elevation]] } }
    const rows = response.data?.table?.rows;

    if (!rows || rows.length === 0) {
      throw new Error("No data returned from ERDDAP");
    }

    // ETOPO returns elevation (negative for ocean depth)
    const elevation = rows[0][2]; // meters
    const depth = elevation < 0 ? Math.abs(elevation) : 0; // Ocean depth is positive

    // Cache the result
    depthCache.set(cacheKey, { depth, timestamp: Date.now() });

    return depth;
  } catch (error) {
    stats.apiErrors++;
    console.warn(`[Bathymetry] ERDDAP API failed for (${lat}, ${lon}):`, error instanceof Error ? error.message : error);

    // Fallback to estimation
    stats.fallbacks++;
    const fallbackDepth = getDepthFallback(lat, lon);

    // Cache fallback too (shorter TTL)
    depthCache.set(cacheKey, { depth: fallbackDepth, timestamp: Date.now() });

    return fallbackDepth;
  }
}

/**
 * Batch query multiple coordinates
 * More efficient than individual queries
 * ERDDAP supports range queries
 */
export async function getBatchDepths(
  coordinates: Array<{ lat: number; lon: number }>
): Promise<Map<string, number>> {
  const results = new Map<string, number>();

  // Check cache first
  const uncachedCoords: Array<{ lat: number; lon: number }> = [];

  for (const coord of coordinates) {
    const cacheKey = getCacheKey(coord.lat, coord.lon);
    const cached = depthCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      results.set(cacheKey, cached.depth);
      stats.cacheHits++;
    } else {
      uncachedCoords.push(coord);
    }
  }

  // If all cached, return early
  if (uncachedCoords.length === 0) {
    return results;
  }

  // For uncached, query individually with Promise.all
  // (ERDDAP doesn't support multi-point query in single request efficiently)
  const promises = uncachedCoords.map(async (coord) => {
    const depth = await getRealDepth(coord.lat, coord.lon);
    const key = getCacheKey(coord.lat, coord.lon);
    return { key, depth };
  });

  try {
    const batchResults = await Promise.all(promises);

    for (const { key, depth } of batchResults) {
      results.set(key, depth);
    }
  } catch (error) {
    console.error("[Bathymetry] Batch query failed:", error);
  }

  return results;
}

/**
 * Pre-fetch depth data for a route bounding box
 * Queries a grid of points within the route bounds
 * Call this before running genetic algorithm for better performance
 */
export async function prefetchRouteDepths(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  gridResolution: number = 0.25 // degrees (~27km)
): Promise<void> {
  const minLat = Math.min(startLat, endLat) - 1; // Add 1 degree buffer
  const maxLat = Math.max(startLat, endLat) + 1;
  const minLon = Math.min(startLon, endLon) - 1;
  const maxLon = Math.max(startLon, endLon) + 1;

  const coordinates: Array<{ lat: number; lon: number }> = [];

  // Generate grid points
  for (let lat = minLat; lat <= maxLat; lat += gridResolution) {
    for (let lon = minLon; lon <= maxLon; lon += gridResolution) {
      coordinates.push({ lat, lon });
    }
  }

  console.log(`[Bathymetry] Pre-fetching ${coordinates.length} grid points for route...`);

  const startTime = Date.now();
  await getBatchDepths(coordinates);
  const duration = Date.now() - startTime;

  console.log(`[Bathymetry] Pre-fetch completed in ${duration}ms`);
}

/**
 * Check if depth is adequate for vessel draft
 * @param lat Latitude
 * @param lon Longitude
 * @param vesselDraft Vessel draft in meters
 * @param safetyMargin Safety margin multiplier (default 1.5x draft)
 * @returns true if depth is adequate
 */
export async function isDepthAdequate(
  lat: number,
  lon: number,
  vesselDraft: number,
  safetyMargin: number = 1.5
): Promise<boolean> {
  const depth = await getRealDepth(lat, lon);
  const requiredDepth = vesselDraft * safetyMargin;

  return depth >= requiredDepth;
}

/**
 * Get depth category for display
 */
export function getDepthCategory(depth: number): string {
  if (depth === 0) return "Land";
  if (depth < 10) return "Very Shallow (< 10m)";
  if (depth < 50) return "Shallow (10-50m)";
  if (depth < 200) return "Continental Shelf (50-200m)";
  if (depth < 1000) return "Deep (200-1000m)";
  return "Very Deep (> 1000m)";
}

/**
 * Validate a route segment for adequate depth
 * Samples multiple points along the segment
 */
export async function validateSegmentDepth(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
  vesselDraft: number,
  samples: number = 10
): Promise<{ valid: boolean; minDepth: number; invalidPoints: number }> {
  let minDepth = Infinity;
  let invalidPoints = 0;

  const requiredDepth = vesselDraft * 1.5; // 50% safety margin

  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const lat = fromLat + t * (toLat - fromLat);
    const lon = fromLon + t * (toLon - fromLon);

    const depth = await getRealDepth(lat, lon);
    minDepth = Math.min(minDepth, depth);

    if (depth < requiredDepth) {
      invalidPoints++;
    }
  }

  return {
    valid: invalidPoints === 0,
    minDepth,
    invalidPoints,
  };
}

/**
 * Legacy compatibility: Synchronous wrapper with in-memory fallback
 * Used for quick checks during route generation
 * Returns cached value if available, otherwise returns estimate
 */
export function checkDepthSync(lat: number, lon: number): number {
  const cacheKey = getCacheKey(lat, lon);
  const cached = depthCache.get(cacheKey);

  if (cached) {
    return cached.depth;
  }

  // Return fallback estimate for synchronous calls
  return getDepthFallback(lat, lon);
}

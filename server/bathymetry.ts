/**
 * Real Bathymetry Data Integration
 * Uses local pre-downloaded ETOPO data for fast, reliable depth queries
 * Falls back to NOAA ERDDAP API only if local data is unavailable
 */

import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { distanceToCoastlineKm, isPointOnLand as isCoastlinePointOnLand } from "./coastline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * NOAA ERDDAP ETOPO 2022 endpoint (fallback only)
 * 15 arc-second resolution (~450m accuracy)
 */
const ERDDAP_BASE = "https://oceanwatch.pifsc.noaa.gov/erddap/griddap/ETOPO_2022_v1_15s";

/**
 * Three-tier bathymetry data structure
 * Ultra-high (~1.1km) for straits, high (~2.8km) for coasts, standard (~11km) for ocean
 */
interface ThreeTierBathymetryData {
  ultraHighRes: {
    resolution: number;
    regions: Array<{
      name: string;
      originLat: number;
      originLon: number;
      width: number;
      height: number;
      depths: number[][];
    }>;
  };
  highRes: {
    resolution: number;
    regions: Array<{
      name: string;
      originLat: number;
      originLon: number;
      width: number;
      height: number;
      depths: number[][];
    }>;
  };
  standardRes: {
    resolution: number;
    originLat: number;
    originLon: number;
    width: number;
    height: number;
    depths: number[][];
  };
}

/**
 * Cached local bathymetry data
 */
let localBathymetry: ThreeTierBathymetryData | null = null;
let localDataAvailable = false;

/**
 * Load local bathymetry data if available
 */
function loadLocalBathymetry(): ThreeTierBathymetryData | null {
  if (localBathymetry !== null) return localBathymetry;

  const localPath = path.join(__dirname, 'data', 'bathymetry-local.json');

  try {
    if (fs.existsSync(localPath)) {
      console.log('[Bathymetry] Loading three-tier bathymetry data...');
      const raw = fs.readFileSync(localPath, 'utf-8');
      localBathymetry = JSON.parse(raw);
      localDataAvailable = true;

      const ultraCount = localBathymetry!.ultraHighRes?.regions?.length || 0;
      const ultraRes = localBathymetry!.ultraHighRes?.resolution || 'N/A';
      const highCount = localBathymetry!.highRes?.regions?.length || 0;
      const highRes = localBathymetry!.highRes?.resolution || 'N/A';
      const stdSize = localBathymetry!.standardRes ?
        `${localBathymetry!.standardRes.width}x${localBathymetry!.standardRes.height}` : 'N/A';
      const stdRes = localBathymetry!.standardRes?.resolution || 'N/A';

      console.log(`[Bathymetry] Loaded: ${ultraCount} ultra-high (${ultraRes}°), ${highCount} high (${highRes}°), standard ${stdSize} (${stdRes}°)`);
      return localBathymetry;
    }
  } catch (error) {
    console.warn('[Bathymetry] Failed to load local data:', error);
  }

  console.log('[Bathymetry] Local data not available, will use API fallback');
  return null;
}

/**
 * Get depth from local data - THREE-TIER LOOKUP
 * Priority: 1) Ultra-high res, 2) High res, 3) Standard res
 * Returns null if point is outside all data bounds
 */
function getLocalDepth(lat: number, lon: number): number | null {
  const data = loadLocalBathymetry();
  if (!data) return null;

  // Step 1: Check ultra-high resolution regions (straits, canals)
  if (data.ultraHighRes?.regions) {
    for (const region of data.ultraHighRes.regions) {
      const row = Math.floor((region.originLat - lat) / data.ultraHighRes.resolution);
      const col = Math.floor((lon - region.originLon) / data.ultraHighRes.resolution);

      if (row >= 0 && row < region.height && col >= 0 && col < region.width) {
        const depth = region.depths[row]?.[col];
        if (depth !== undefined) {
          return depth;
        }
      }
    }
  }

  // Step 2: Check high resolution regions (coastal areas)
  if (data.highRes?.regions) {
    for (const region of data.highRes.regions) {
      const row = Math.floor((region.originLat - lat) / data.highRes.resolution);
      const col = Math.floor((lon - region.originLon) / data.highRes.resolution);

      if (row >= 0 && row < region.height && col >= 0 && col < region.width) {
        const depth = region.depths[row]?.[col];
        if (depth !== undefined) {
          return depth;
        }
      }
    }
  }

  // Step 3: Fall back to standard resolution global grid
  if (data.standardRes) {
    const stdRes = data.standardRes;
    const row = Math.floor((stdRes.originLat - lat) / stdRes.resolution);
    const col = Math.floor((lon - stdRes.originLon) / stdRes.resolution);

    if (row >= 0 && row < stdRes.height && col >= 0 && col < stdRes.width) {
      return stdRes.depths[row]?.[col] ?? null;
    }
  }

  return null; // Outside all data bounds
}

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
 * Rate limiting: max concurrent requests to NOAA API
 * Prevents overwhelming the external server
 */
const MAX_CONCURRENT_REQUESTS = 3;
let activeRequests = 0;
const requestQueue: Array<() => void> = [];

/**
 * Simple semaphore for rate limiting
 */
async function acquireSlot(): Promise<void> {
  if (activeRequests < MAX_CONCURRENT_REQUESTS) {
    activeRequests++;
    return;
  }

  return new Promise((resolve) => {
    requestQueue.push(() => {
      activeRequests++;
      resolve();
    });
  });
}

function releaseSlot(): void {
  activeRequests--;
  const next = requestQueue.shift();
  if (next) next();
}

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
 * Query real depth - uses local data first, then API fallback
 * Returns depth in meters (positive value)
 * Priority: 1) Memory cache, 2) Local file, 3) NOAA API, 4) Fallback estimation
 */
export async function getRealDepth(lat: number, lon: number): Promise<number> {
  const cacheKey = getCacheKey(lat, lon);
  const cached = depthCache.get(cacheKey);

  // Check memory cache first
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    stats.cacheHits++;
    return cached.depth;
  }

  // Try local data (fast, no network)
  const localDepth = getLocalDepth(lat, lon);
  if (localDepth !== null) {
    stats.cacheHits++;
    depthCache.set(cacheKey, { depth: localDepth, timestamp: Date.now() });
    return localDepth;
  }

  stats.cacheMisses++;

  // If local data is available but point is outside bounds, use fallback directly
  // (Don't call API for points outside common shipping routes)
  if (localDataAvailable) {
    const fallbackDepth = getDepthFallback(lat, lon);
    depthCache.set(cacheKey, { depth: fallbackDepth, timestamp: Date.now() });
    return fallbackDepth;
  }

  // Rate limiting - wait for available slot (API fallback only)
  await acquireSlot();

  try {
    // Query ERDDAP API
    // Format: /griddap/dataset.json?variable[(lat)][(lon)]
    const url = `${ERDDAP_BASE}.json?z[(${lat})][(${lon})]`;

    stats.apiCalls++;
    const response = await axios.get(url, {
      timeout: API_TIMEOUT,
      headers: {
        'User-Agent': 'UklokGreenShipping/1.0',
        'Accept': 'application/json',
      },
      // Validate response is JSON, not HTML
      validateStatus: (status) => status >= 200 && status < 300,
    });

    // Check if response is actually JSON (not HTML error page)
    const contentType = response.headers['content-type'] || '';
    if (contentType.includes('text/html')) {
      throw new Error('ERDDAP returned HTML instead of JSON (likely rate limited or maintenance)');
    }

    // Additional check: ensure data structure is valid
    if (typeof response.data !== 'object' || response.data === null) {
      throw new Error('Invalid response format from ERDDAP');
    }

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
    // Only log first few errors to avoid spam
    if (stats.apiErrors <= 5) {
      console.warn(`[Bathymetry] ERDDAP API failed for (${lat.toFixed(2)}, ${lon.toFixed(2)}):`, error instanceof Error ? error.message : 'Unknown error');
    } else if (stats.apiErrors === 6) {
      console.warn('[Bathymetry] Suppressing further API error logs...');
    }

    // Fallback to estimation
    stats.fallbacks++;
    const fallbackDepth = getDepthFallback(lat, lon);

    // Cache fallback too
    depthCache.set(cacheKey, { depth: fallbackDepth, timestamp: Date.now() });

    return fallbackDepth;
  } finally {
    // Always release the slot
    releaseSlot();
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
 *
 * NOTE: If NOAA API is unavailable, this will gracefully use fallback estimation
 * without blocking route calculation
 */
export async function prefetchRouteDepths(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  gridResolution: number = 0.5 // Increased to reduce API calls (was 0.25)
): Promise<void> {
  const minLat = Math.min(startLat, endLat) - 0.5; // Reduced buffer
  const maxLat = Math.max(startLat, endLat) + 0.5;
  const minLon = Math.min(startLon, endLon) - 0.5;
  const maxLon = Math.max(startLon, endLon) + 0.5;

  const coordinates: Array<{ lat: number; lon: number }> = [];

  // Generate grid points
  for (let lat = minLat; lat <= maxLat; lat += gridResolution) {
    for (let lon = minLon; lon <= maxLon; lon += gridResolution) {
      coordinates.push({ lat, lon });
    }
  }

  // Limit total points to prevent excessive API calls
  const maxPoints = 50;
  const limitedCoords = coordinates.length > maxPoints
    ? coordinates.slice(0, maxPoints)
    : coordinates;

  console.log(`[Bathymetry] Pre-fetching ${limitedCoords.length} grid points for route...`);

  const startTime = Date.now();

  try {
    // Set a timeout for the entire prefetch operation
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error('Prefetch timeout')), 15000);
    });

    await Promise.race([
      getBatchDepths(limitedCoords),
      timeoutPromise
    ]);

    const duration = Date.now() - startTime;
    console.log(`[Bathymetry] Pre-fetch completed in ${duration}ms (${stats.cacheHits} cache hits, ${stats.fallbacks} fallbacks)`);
  } catch (error) {
    console.warn(`[Bathymetry] Pre-fetch failed or timed out, using fallback estimation:`, error instanceof Error ? error.message : 'Unknown error');
    // Don't throw - route calculation will use fallback depths
  }
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

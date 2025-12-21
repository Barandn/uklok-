/**
 * Local Bathymetry Data Generator
 * Downloads ETOPO 2022 depth data from NOAA ERDDAP and saves locally
 * This eliminates runtime API calls and prevents JSON parsing errors
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// NOAA ERDDAP ETOPO 2022 endpoint
const ERDDAP_BASE = "https://oceanwatch.pifsc.noaa.gov/erddap/griddap/ETOPO_2022_v1_15s";

// Configuration - HYBRID RESOLUTION
// Critical areas: 0.05° (~5.5km) - can see straits, narrow passages
// Open ocean: 0.25° (~28km) - sufficient for deep water

// Critical maritime areas - HIGH RESOLUTION (0.05°)
// These include straits, narrow passages, busy shipping lanes
const HIGH_RES_REGIONS = [
  // Mediterranean & Aegean
  { name: 'Mediterranean West', minLat: 35, maxLat: 44, minLon: -6, maxLon: 10 },
  { name: 'Mediterranean Central', minLat: 35, maxLat: 44, minLon: 9, maxLon: 20 },
  { name: 'Adriatic Sea', minLat: 39, maxLat: 46, minLon: 12, maxLon: 20 },
  { name: 'Aegean Sea', minLat: 35, maxLat: 42, minLon: 22, maxLon: 30 },
  { name: 'Marmara & Turkish Straits', minLat: 39, maxLat: 42, minLon: 26, maxLon: 32 },
  { name: 'Eastern Mediterranean', minLat: 31, maxLat: 37, minLon: 28, maxLon: 36 },

  // Critical Straits
  { name: 'Gibraltar Strait', minLat: 35, maxLat: 37, minLon: -7, maxLon: -4 },
  { name: 'Suez & Red Sea North', minLat: 27, maxLat: 32, minLon: 32, maxLon: 35 },
  { name: 'Bab el-Mandeb', minLat: 11, maxLat: 14, minLon: 42, maxLon: 45 },
  { name: 'Hormuz Strait', minLat: 25, maxLat: 28, minLon: 54, maxLon: 58 },

  // Southeast Asia - critical shipping lanes
  { name: 'Malacca Strait', minLat: 0, maxLat: 8, minLon: 98, maxLon: 105 },
  { name: 'Singapore Strait', minLat: 0, maxLat: 3, minLon: 103, maxLon: 105 },
  { name: 'Sunda Strait', minLat: -7, maxLat: -5, minLon: 104, maxLon: 107 },
  { name: 'Lombok Strait', minLat: -9, maxLat: -7, minLon: 115, maxLon: 117 },
  { name: 'South China Sea', minLat: 5, maxLat: 22, minLon: 105, maxLon: 120 },
  { name: 'Taiwan Strait', minLat: 22, maxLat: 26, minLon: 117, maxLon: 122 },

  // East Asia
  { name: 'Korea Strait', minLat: 33, maxLat: 36, minLon: 127, maxLon: 132 },
  { name: 'Japan Inland Sea', minLat: 33, maxLat: 35, minLon: 131, maxLon: 136 },
  { name: 'Tokyo Bay area', minLat: 34, maxLat: 36, minLon: 139, maxLon: 141 },

  // Europe - Northern
  { name: 'English Channel', minLat: 49, maxLat: 52, minLon: -6, maxLon: 3 },
  { name: 'North Sea South', minLat: 51, maxLat: 56, minLon: -1, maxLon: 10 },
  { name: 'Baltic Entrances', minLat: 54, maxLat: 58, minLon: 9, maxLon: 15 },
  { name: 'Baltic Sea', minLat: 53, maxLat: 66, minLon: 14, maxLon: 30 },

  // Americas
  { name: 'Panama Canal area', minLat: 7, maxLat: 10, minLon: -80, maxLon: -77 },
  { name: 'US East Coast ports', minLat: 38, maxLat: 42, minLon: -76, maxLon: -70 },
  { name: 'Gulf of Mexico', minLat: 25, maxLat: 30, minLon: -98, maxLon: -88 },
  { name: 'Caribbean passages', minLat: 17, maxLat: 22, minLon: -75, maxLon: -65 },

  // Other critical areas
  { name: 'Persian Gulf', minLat: 23, maxLat: 30, minLon: 48, maxLon: 57 },
  { name: 'Red Sea', minLat: 12, maxLat: 28, minLon: 32, maxLon: 44 },
  { name: 'Black Sea', minLat: 40, maxLat: 47, minLon: 27, maxLon: 42 },
];

// Open ocean areas - LOWER RESOLUTION (0.25°)
const LOW_RES_REGIONS = [
  // Atlantic Ocean
  { name: 'North Atlantic', minLat: 20, maxLat: 65, minLon: -80, maxLon: -5 },
  { name: 'South Atlantic', minLat: -60, maxLat: 20, minLon: -70, maxLon: 20 },

  // Indian Ocean
  { name: 'Indian Ocean', minLat: -40, maxLat: 25, minLon: 40, maxLon: 100 },

  // Pacific Ocean
  { name: 'West Pacific', minLat: -20, maxLat: 50, minLon: 120, maxLon: 180 },
  { name: 'Central Pacific', minLat: -40, maxLat: 40, minLon: -180, maxLon: -120 },
  { name: 'East Pacific', minLat: -60, maxLat: 60, minLon: -120, maxLon: -80 },

  // Polar
  { name: 'Arctic Ocean', minLat: 65, maxLat: 85, minLon: -180, maxLon: 180 },
  { name: 'Southern Ocean', minLat: -75, maxLat: -40, minLon: -180, maxLon: 180 },
];

const HIGH_RESOLUTION = 0.05;  // ~5.5km - critical areas
const LOW_RESOLUTION = 0.25;   // ~28km - open ocean

interface BathymetryData {
  originLat: number;
  originLon: number;
  resolution: number;
  width: number;
  height: number;
  depths: number[][]; // Depth in meters (positive = water, 0 = land)
}

/**
 * Download depth data for a region from ERDDAP
 * Uses stride parameter for lower resolution to reduce data size
 */
async function downloadRegion(
  name: string,
  minLat: number,
  maxLat: number,
  minLon: number,
  maxLon: number,
  resolution: number
): Promise<Map<string, number>> {
  console.log(`\nDownloading: ${name}`);
  console.log(`  Bounds: (${minLat}-${maxLat}°N, ${minLon}-${maxLon}°E)`);

  const depths = new Map<string, number>();

  // ERDDAP stride: 15 arc-seconds base, we want ~0.1 degree = 6 arc-minutes = 24 steps
  // Actually let's query at lower resolution to reduce requests
  const step = resolution; // degrees

  // Calculate grid dimensions
  const latSteps = Math.ceil((maxLat - minLat) / step);
  const lonSteps = Math.ceil((maxLon - minLon) / step);
  const totalPoints = latSteps * lonSteps;

  console.log(`  Grid: ${lonSteps} x ${latSteps} = ${totalPoints} points`);

  // ERDDAP supports range queries: z[(lat1):(stride):(lat2)][(lon1):(stride):(lon2)]
  // But response can be huge, so we'll chunk it
  const chunkSize = 10; // degrees per chunk
  let downloaded = 0;

  for (let latStart = minLat; latStart < maxLat; latStart += chunkSize) {
    for (let lonStart = minLon; lonStart < maxLon; lonStart += chunkSize) {
      const latEnd = Math.min(latStart + chunkSize, maxLat);
      const lonEnd = Math.min(lonStart + chunkSize, maxLon);

      // Build ERDDAP query with stride
      // Format: z[(latStart):(stride):(latEnd)][(lonStart):(stride):(lonEnd)]
      const strideArcSec = Math.round(step * 3600 / 15); // Convert degrees to 15-arcsec steps
      const url = `${ERDDAP_BASE}.json?z[(${latEnd}):${strideArcSec}:(${latStart})][(${lonStart}):${strideArcSec}:(${lonEnd})]`;

      try {
        console.log(`  Fetching chunk (${latStart}-${latEnd}, ${lonStart}-${lonEnd})...`);

        const response = await axios.get(url, {
          timeout: 60000, // 60 second timeout for larger requests
          headers: {
            'User-Agent': 'UklokBathymetryGenerator/1.0',
            'Accept': 'application/json',
          },
        });

        // Check content type
        const contentType = response.headers['content-type'] || '';
        if (contentType.includes('text/html')) {
          console.warn(`    Warning: HTML response (rate limited?), using fallback`);
          continue;
        }

        // Parse ERDDAP JSON response
        // Format: { table: { columnNames: [...], rows: [[lat, lon, elevation], ...] } }
        const rows = response.data?.table?.rows;
        if (!rows || rows.length === 0) {
          console.warn(`    Warning: No data in response`);
          continue;
        }

        for (const row of rows) {
          const lat = row[0];
          const lon = row[1];
          const elevation = row[2];

          // Convert elevation to depth (negative elevation = ocean depth)
          const depth = elevation < 0 ? Math.abs(elevation) : 0;

          // Round coordinates for consistent keys
          const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
          depths.set(key, depth);
          downloaded++;
        }

        console.log(`    Got ${rows.length} points (total: ${downloaded})`);

        // Small delay to be nice to the server
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        console.warn(`    Error fetching chunk:`, error instanceof Error ? error.message : error);
        // Continue with other chunks
      }
    }
  }

  console.log(`  Downloaded ${downloaded} depth points for ${name}`);
  return depths;
}

/**
 * Generate fallback depths based on distance estimation
 * Used for areas where API failed
 */
function generateFallbackDepths(
  minLat: number,
  maxLat: number,
  minLon: number,
  maxLon: number,
  resolution: number
): Map<string, number> {
  console.log('Generating fallback depth estimates...');
  const depths = new Map<string, number>();

  // Simple heuristic: deeper in center of seas, shallower near coasts
  // This is just a fallback - not accurate but better than nothing
  for (let lat = minLat; lat <= maxLat; lat += resolution) {
    for (let lon = minLon; lon <= maxLon; lon += resolution) {
      const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;

      // Skip if we already have real data
      if (depths.has(key)) continue;

      // Default to moderate depth
      depths.set(key, 500);
    }
  }

  return depths;
}

/**
 * Convert depth map to 2D grid format
 */
function convertToGrid(
  depths: Map<string, number>,
  minLat: number,
  maxLat: number,
  minLon: number,
  maxLon: number,
  resolution: number
): BathymetryData {
  const width = Math.ceil((maxLon - minLon) / resolution);
  const height = Math.ceil((maxLat - minLat) / resolution);

  // Initialize grid with default deep water
  const grid: number[][] = [];
  for (let row = 0; row < height; row++) {
    grid[row] = new Array(width).fill(500); // Default 500m depth
  }

  // Fill in downloaded depths
  let filled = 0;
  for (const [key, depth] of depths) {
    const [latStr, lonStr] = key.split(',');
    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);

    // Calculate grid position (origin is top-left = maxLat, minLon)
    const row = Math.floor((maxLat - lat) / resolution);
    const col = Math.floor((lon - minLon) / resolution);

    if (row >= 0 && row < height && col >= 0 && col < width) {
      grid[row][col] = Math.round(depth);
      filled++;
    }
  }

  console.log(`Filled ${filled} cells in grid (${width}x${height})`);

  return {
    originLat: maxLat,
    originLon: minLon,
    resolution,
    width,
    height,
    depths: grid,
  };
}

/**
 * Save bathymetry data to JSON file
 */
function saveData(data: BathymetryData, filename: string): void {
  const outputPath = path.join(__dirname, '..', 'data', filename);

  // Calculate file size estimate
  const jsonStr = JSON.stringify(data);
  const sizeMB = (jsonStr.length / 1024 / 1024).toFixed(2);

  fs.writeFileSync(outputPath, jsonStr);
  console.log(`\nSaved to: ${outputPath}`);
  console.log(`File size: ${sizeMB} MB`);
}

/**
 * Hybrid bathymetry data structure
 * Stores both high-res and low-res grids for different areas
 */
interface HybridBathymetryData {
  // High resolution data for critical areas
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
  // Low resolution data for open ocean
  lowRes: {
    resolution: number;
    originLat: number;
    originLon: number;
    width: number;
    height: number;
    depths: number[][];
  };
}

/**
 * Save hybrid bathymetry data
 */
function saveHybridData(data: HybridBathymetryData): void {
  const outputPath = path.join(__dirname, '..', 'data', 'bathymetry-local.json');

  const jsonStr = JSON.stringify(data);
  const sizeMB = (jsonStr.length / 1024 / 1024).toFixed(2);

  fs.writeFileSync(outputPath, jsonStr);
  console.log(`\nSaved to: ${outputPath}`);
  console.log(`File size: ${sizeMB} MB`);
}

/**
 * Main function - generates hybrid resolution bathymetry data
 */
async function main(): Promise<void> {
  console.log('=== Hybrid Resolution Bathymetry Generator ===\n');
  console.log(`High resolution: ${HIGH_RESOLUTION}° (~${(HIGH_RESOLUTION * 111).toFixed(1)}km) - critical areas`);
  console.log(`Low resolution: ${LOW_RESOLUTION}° (~${(LOW_RESOLUTION * 111).toFixed(1)}km) - open ocean\n`);

  const hybridData: HybridBathymetryData = {
    highRes: {
      resolution: HIGH_RESOLUTION,
      regions: [],
    },
    lowRes: {
      resolution: LOW_RESOLUTION,
      originLat: 85,
      originLon: -180,
      width: 0,
      height: 0,
      depths: [],
    },
  };

  // Download HIGH RESOLUTION regions (critical areas)
  console.log('=== HIGH RESOLUTION REGIONS ===');
  let totalHighResPoints = 0;

  for (const region of HIGH_RES_REGIONS) {
    const depths = await downloadRegion(
      region.name,
      region.minLat,
      region.maxLat,
      region.minLon,
      region.maxLon,
      HIGH_RESOLUTION
    );

    if (depths.size > 0) {
      // Convert to grid
      const grid = convertToGrid(
        depths,
        region.minLat,
        region.maxLat,
        region.minLon,
        region.maxLon,
        HIGH_RESOLUTION
      );

      hybridData.highRes.regions.push({
        name: region.name,
        originLat: region.maxLat,
        originLon: region.minLon,
        width: grid.width,
        height: grid.height,
        depths: grid.depths,
      });

      totalHighResPoints += grid.width * grid.height;
    }
  }

  console.log(`\nHigh-res total: ${totalHighResPoints.toLocaleString()} points in ${hybridData.highRes.regions.length} regions`);

  // Download LOW RESOLUTION (global coverage for open ocean)
  console.log('\n=== LOW RESOLUTION REGIONS (Open Ocean) ===');
  const allLowResDepths = new Map<string, number>();

  for (const region of LOW_RES_REGIONS) {
    const depths = await downloadRegion(
      region.name,
      region.minLat,
      region.maxLat,
      region.minLon,
      region.maxLon,
      LOW_RESOLUTION
    );

    for (const [key, depth] of depths) {
      allLowResDepths.set(key, depth);
    }
  }

  // Convert low-res to global grid
  const lowResGrid = convertToGrid(
    allLowResDepths,
    -75,  // Global min lat
    85,   // Global max lat
    -180, // Global min lon
    180,  // Global max lon
    LOW_RESOLUTION
  );

  hybridData.lowRes = {
    resolution: LOW_RESOLUTION,
    originLat: 85,
    originLon: -180,
    width: lowResGrid.width,
    height: lowResGrid.height,
    depths: lowResGrid.depths,
  };

  console.log(`\nLow-res total: ${(lowResGrid.width * lowResGrid.height).toLocaleString()} points`);

  // Save hybrid data
  saveHybridData(hybridData);

  // Statistics
  let highResLand = 0, highResShallow = 0, highResDeep = 0;
  for (const region of hybridData.highRes.regions) {
    for (const row of region.depths) {
      for (const d of row) {
        if (d === 0) highResLand++;
        else if (d < 50) highResShallow++;
        else highResDeep++;
      }
    }
  }

  let lowResLand = 0, lowResShallow = 0, lowResDeep = 0;
  for (const row of hybridData.lowRes.depths) {
    for (const d of row) {
      if (d === 0) lowResLand++;
      else if (d < 50) lowResShallow++;
      else lowResDeep++;
    }
  }

  console.log('\n=== STATISTICS ===');
  console.log('\nHigh Resolution (Critical Areas):');
  console.log(`  Regions: ${hybridData.highRes.regions.length}`);
  console.log(`  Total points: ${totalHighResPoints.toLocaleString()}`);
  console.log(`  Land: ${highResLand.toLocaleString()}, Shallow: ${highResShallow.toLocaleString()}, Deep: ${highResDeep.toLocaleString()}`);

  console.log('\nLow Resolution (Open Ocean):');
  console.log(`  Grid: ${lowResGrid.width} x ${lowResGrid.height}`);
  console.log(`  Land: ${lowResLand.toLocaleString()}, Shallow: ${lowResShallow.toLocaleString()}, Deep: ${lowResDeep.toLocaleString()}`);

  console.log('\nDone!');
}

main().catch(console.error);

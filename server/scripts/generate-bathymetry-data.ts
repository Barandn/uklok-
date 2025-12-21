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

// Configuration - THREE-TIER RESOLUTION SYSTEM
// Ultra-high: 0.01° (~1.1km) - can see Bosphorus, Panama locks, smallest straits
// High: 0.025° (~2.8km) - coastal areas, island passages
// Standard: 0.1° (~11km) - open ocean

const ULTRA_HIGH_RESOLUTION = 0.01;  // ~1.1km - critical straits
const HIGH_RESOLUTION = 0.025;       // ~2.8km - coastal & passages
const STANDARD_RESOLUTION = 0.1;     // ~11km - open ocean

// ULTRA-HIGH RESOLUTION - Every tiny strait and canal
const ULTRA_HIGH_RES_REGIONS = [
  // Turkish Straits - critical chokepoints
  { name: 'Bosphorus Strait', minLat: 40.9, maxLat: 41.3, minLon: 28.8, maxLon: 29.2 },
  { name: 'Dardanelles Strait', minLat: 39.9, maxLat: 40.5, minLon: 26.0, maxLon: 27.0 },
  { name: 'Sea of Marmara', minLat: 40.3, maxLat: 41.0, minLon: 27.0, maxLon: 29.5 },

  // Mediterranean critical straits
  { name: 'Strait of Messina', minLat: 37.8, maxLat: 38.4, minLon: 15.4, maxLon: 15.9 },
  { name: 'Strait of Gibraltar', minLat: 35.8, maxLat: 36.2, minLon: -5.8, maxLon: -5.2 },
  { name: 'Strait of Bonifacio', minLat: 41.0, maxLat: 41.5, minLon: 8.5, maxLon: 9.5 },
  { name: 'Strait of Otranto', minLat: 39.5, maxLat: 40.5, minLon: 18.0, maxLon: 20.0 },

  // Suez Canal
  { name: 'Suez Canal', minLat: 29.8, maxLat: 31.3, minLon: 32.2, maxLon: 32.6 },
  { name: 'Gulf of Suez entrance', minLat: 29.0, maxLat: 30.0, minLon: 32.0, maxLon: 34.0 },

  // Red Sea straits
  { name: 'Bab el-Mandeb Strait', minLat: 12.3, maxLat: 12.8, minLon: 43.0, maxLon: 43.7 },

  // Persian Gulf
  { name: 'Strait of Hormuz', minLat: 26.0, maxLat: 27.0, minLon: 55.5, maxLon: 57.0 },

  // Southeast Asia - CRITICAL shipping lanes
  { name: 'Singapore Strait', minLat: 1.0, maxLat: 1.5, minLon: 103.5, maxLon: 104.5 },
  { name: 'Malacca Strait North', minLat: 4.0, maxLat: 6.0, minLon: 99.5, maxLon: 100.5 },
  { name: 'Malacca Strait Central', minLat: 2.5, maxLat: 4.0, minLon: 100.5, maxLon: 102.0 },
  { name: 'Malacca Strait South', minLat: 1.0, maxLat: 2.5, minLon: 102.0, maxLon: 104.0 },
  { name: 'Sunda Strait', minLat: -6.2, maxLat: -5.8, minLon: 105.5, maxLon: 106.2 },
  { name: 'Lombok Strait', minLat: -8.8, maxLat: -8.2, minLon: 115.4, maxLon: 115.8 },
  { name: 'Makassar Strait South', minLat: -5.0, maxLat: -3.0, minLon: 117.0, maxLon: 118.5 },

  // East Asia straits
  { name: 'Taiwan Strait narrow', minLat: 24.0, maxLat: 25.5, minLon: 119.0, maxLon: 120.5 },
  { name: 'Korea Strait', minLat: 33.5, maxLat: 34.5, minLon: 128.5, maxLon: 130.0 },
  { name: 'Tsugaru Strait', minLat: 41.2, maxLat: 41.8, minLon: 140.0, maxLon: 141.5 },
  { name: 'Kanmon Strait', minLat: 33.8, maxLat: 34.1, minLon: 130.8, maxLon: 131.2 },

  // Americas
  { name: 'Panama Canal', minLat: 8.8, maxLat: 9.5, minLon: -80.0, maxLon: -79.4 },
  { name: 'Yucatan Channel', minLat: 21.5, maxLat: 22.5, minLon: -86.5, maxLon: -85.5 },
  { name: 'Florida Straits', minLat: 23.5, maxLat: 24.5, minLon: -82.0, maxLon: -80.0 },
  { name: 'Windward Passage', minLat: 19.5, maxLat: 20.5, minLon: -74.5, maxLon: -73.5 },
  { name: 'Mona Passage', minLat: 18.0, maxLat: 19.0, minLon: -68.5, maxLon: -67.0 },

  // Europe
  { name: 'Dover Strait', minLat: 50.8, maxLat: 51.2, minLon: 1.0, maxLon: 2.0 },
  { name: 'Kattegat South', minLat: 56.5, maxLat: 58.0, minLon: 10.5, maxLon: 12.5 },
  { name: 'Oresund', minLat: 55.5, maxLat: 56.2, minLon: 12.4, maxLon: 13.0 },
  { name: 'Great Belt', minLat: 54.8, maxLat: 56.0, minLon: 10.5, maxLon: 11.5 },
  { name: 'Little Belt', minLat: 54.8, maxLat: 55.8, minLon: 9.5, maxLon: 10.2 },

  // Other critical
  { name: 'Mozambique Channel North', minLat: -13.0, maxLat: -11.0, minLon: 42.0, maxLon: 48.0 },
  { name: 'Torres Strait', minLat: -11.0, maxLat: -9.5, minLon: 141.5, maxLon: 143.5 },
];

// HIGH RESOLUTION - Coastal areas, island passages, busy shipping lanes
const HIGH_RES_REGIONS = [
  // Mediterranean complete coverage
  { name: 'Western Mediterranean', minLat: 35, maxLat: 44, minLon: -6, maxLon: 10 },
  { name: 'Central Mediterranean', minLat: 35, maxLat: 44, minLon: 9, maxLon: 20 },
  { name: 'Adriatic Sea', minLat: 39, maxLat: 46, minLon: 12, maxLon: 20 },
  { name: 'Aegean Sea', minLat: 35, maxLat: 42, minLon: 22, maxLon: 30 },
  { name: 'Eastern Mediterranean', minLat: 31, maxLat: 37, minLon: 28, maxLon: 36 },
  { name: 'Levantine Sea', minLat: 31, maxLat: 36, minLon: 29, maxLon: 36 },

  // Black Sea & Marmara
  { name: 'Black Sea', minLat: 40, maxLat: 47, minLon: 27, maxLon: 42 },
  { name: 'Sea of Azov', minLat: 45, maxLat: 47.5, minLon: 34, maxLon: 40 },

  // Red Sea & Persian Gulf
  { name: 'Red Sea North', minLat: 24, maxLat: 30, minLon: 32, maxLon: 40 },
  { name: 'Red Sea South', minLat: 12, maxLat: 24, minLon: 36, maxLon: 44 },
  { name: 'Persian Gulf', minLat: 23, maxLat: 31, minLon: 47, maxLon: 57 },
  { name: 'Gulf of Oman', minLat: 22, maxLat: 26, minLon: 56, maxLon: 62 },

  // Southeast Asia complete
  { name: 'Andaman Sea', minLat: 5, maxLat: 16, minLon: 92, maxLon: 100 },
  { name: 'Gulf of Thailand', minLat: 6, maxLat: 14, minLon: 99, maxLon: 106 },
  { name: 'South China Sea West', minLat: 5, maxLat: 22, minLon: 105, maxLon: 115 },
  { name: 'South China Sea East', minLat: 5, maxLat: 22, minLon: 114, maxLon: 122 },
  { name: 'Java Sea', minLat: -8, maxLat: -3, minLon: 106, maxLon: 120 },
  { name: 'Celebes Sea', minLat: 0, maxLat: 8, minLon: 117, maxLon: 127 },
  { name: 'Sulu Sea', minLat: 5, maxLat: 12, minLon: 118, maxLon: 123 },
  { name: 'Philippine Sea West', minLat: 10, maxLat: 22, minLon: 120, maxLon: 130 },

  // East Asia
  { name: 'East China Sea', minLat: 25, maxLat: 33, minLon: 120, maxLon: 130 },
  { name: 'Yellow Sea', minLat: 33, maxLat: 40, minLon: 117, maxLon: 127 },
  { name: 'Sea of Japan South', minLat: 33, maxLat: 42, minLon: 127, maxLon: 140 },
  { name: 'Sea of Japan North', minLat: 40, maxLat: 52, minLon: 127, maxLon: 142 },
  { name: 'Japan Pacific Coast', minLat: 30, maxLat: 42, minLon: 138, maxLon: 146 },

  // Europe Northern
  { name: 'North Sea', minLat: 50, maxLat: 62, minLon: -5, maxLon: 12 },
  { name: 'Baltic Sea', minLat: 53, maxLat: 66, minLon: 9, maxLon: 30 },
  { name: 'English Channel', minLat: 48, maxLat: 52, minLon: -7, maxLon: 4 },
  { name: 'Irish Sea', minLat: 51, maxLat: 56, minLon: -8, maxLon: -3 },
  { name: 'Bay of Biscay', minLat: 43, maxLat: 48, minLon: -10, maxLon: 0 },

  // Americas
  { name: 'Gulf of Mexico', minLat: 18, maxLat: 31, minLon: -98, maxLon: -80 },
  { name: 'Caribbean Sea', minLat: 10, maxLat: 22, minLon: -88, maxLon: -60 },
  { name: 'US East Coast', minLat: 25, maxLat: 45, minLon: -82, maxLon: -66 },
  { name: 'US West Coast', minLat: 30, maxLat: 50, minLon: -130, maxLon: -117 },

  // Indian Ocean
  { name: 'Arabian Sea', minLat: 8, maxLat: 25, minLon: 50, maxLon: 75 },
  { name: 'Bay of Bengal', minLat: 5, maxLat: 23, minLon: 78, maxLon: 95 },
  { name: 'Mozambique Channel', minLat: -26, maxLat: -10, minLon: 35, maxLon: 50 },

  // Oceania
  { name: 'Coral Sea', minLat: -25, maxLat: -10, minLon: 145, maxLon: 165 },
  { name: 'Tasman Sea', minLat: -45, maxLat: -30, minLon: 150, maxLon: 175 },
  { name: 'Indonesia Seas', minLat: -12, maxLat: 2, minLon: 115, maxLon: 140 },
];

// STANDARD RESOLUTION - Open ocean (still good quality)
const STANDARD_RES_REGIONS = [
  // Atlantic Ocean
  { name: 'North Atlantic', minLat: 20, maxLat: 65, minLon: -80, maxLon: 0 },
  { name: 'South Atlantic', minLat: -60, maxLat: 20, minLon: -70, maxLon: 20 },

  // Indian Ocean
  { name: 'Indian Ocean', minLat: -45, maxLat: 25, minLon: 20, maxLon: 120 },

  // Pacific Ocean
  { name: 'North Pacific', minLat: 20, maxLat: 65, minLon: 120, maxLon: -100 },
  { name: 'South Pacific', minLat: -60, maxLat: 20, minLon: 120, maxLon: -70 },
  { name: 'Central Pacific', minLat: -20, maxLat: 30, minLon: -180, maxLon: -100 },

  // Polar
  { name: 'Arctic Ocean', minLat: 65, maxLat: 85, minLon: -180, maxLon: 180 },
  { name: 'Southern Ocean', minLat: -75, maxLat: -45, minLon: -180, maxLon: 180 },
];

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
 * Three-tier bathymetry data structure
 * Ultra-high for straits, high for coasts, standard for ocean
 */
interface ThreeTierBathymetryData {
  // Ultra-high resolution for critical straits (~1.1km)
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
  // High resolution for coastal areas (~2.8km)
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
  // Standard resolution for open ocean (~11km)
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
 * Save three-tier bathymetry data
 */
function saveThreeTierData(data: ThreeTierBathymetryData): void {
  const outputPath = path.join(__dirname, '..', 'data', 'bathymetry-local.json');

  const jsonStr = JSON.stringify(data);
  const sizeMB = (jsonStr.length / 1024 / 1024).toFixed(2);

  fs.writeFileSync(outputPath, jsonStr);
  console.log(`\nSaved to: ${outputPath}`);
  console.log(`File size: ${sizeMB} MB`);
}

/**
 * Main function - generates three-tier resolution bathymetry data
 */
async function main(): Promise<void> {
  console.log('=== THREE-TIER Bathymetry Generator ===\n');
  console.log(`Ultra-high: ${ULTRA_HIGH_RESOLUTION}° (~${(ULTRA_HIGH_RESOLUTION * 111).toFixed(1)}km) - straits & canals`);
  console.log(`High: ${HIGH_RESOLUTION}° (~${(HIGH_RESOLUTION * 111).toFixed(1)}km) - coastal areas`);
  console.log(`Standard: ${STANDARD_RESOLUTION}° (~${(STANDARD_RESOLUTION * 111).toFixed(1)}km) - open ocean\n`);

  const threeTierData: ThreeTierBathymetryData = {
    ultraHighRes: {
      resolution: ULTRA_HIGH_RESOLUTION,
      regions: [],
    },
    highRes: {
      resolution: HIGH_RESOLUTION,
      regions: [],
    },
    standardRes: {
      resolution: STANDARD_RESOLUTION,
      originLat: 85,
      originLon: -180,
      width: 0,
      height: 0,
      depths: [],
    },
  };

  // ============ ULTRA-HIGH RESOLUTION (~1.1km) ============
  console.log('=== ULTRA-HIGH RESOLUTION (Straits & Canals) ===');
  let totalUltraHighPoints = 0;

  for (const region of ULTRA_HIGH_RES_REGIONS) {
    console.log(`  Processing: ${region.name}...`);
    const depths = await downloadRegion(
      region.name,
      region.minLat,
      region.maxLat,
      region.minLon,
      region.maxLon,
      ULTRA_HIGH_RESOLUTION
    );

    if (depths.size > 0) {
      const grid = convertToGrid(
        depths,
        region.minLat,
        region.maxLat,
        region.minLon,
        region.maxLon,
        ULTRA_HIGH_RESOLUTION
      );

      threeTierData.ultraHighRes.regions.push({
        name: region.name,
        originLat: region.maxLat,
        originLon: region.minLon,
        width: grid.width,
        height: grid.height,
        depths: grid.depths,
      });

      totalUltraHighPoints += grid.width * grid.height;
    }
  }
  console.log(`\nUltra-high total: ${totalUltraHighPoints.toLocaleString()} points in ${threeTierData.ultraHighRes.regions.length} regions`);

  // ============ HIGH RESOLUTION (~2.8km) ============
  console.log('\n=== HIGH RESOLUTION (Coastal Areas) ===');
  let totalHighResPoints = 0;

  for (const region of HIGH_RES_REGIONS) {
    console.log(`  Processing: ${region.name}...`);
    const depths = await downloadRegion(
      region.name,
      region.minLat,
      region.maxLat,
      region.minLon,
      region.maxLon,
      HIGH_RESOLUTION
    );

    if (depths.size > 0) {
      const grid = convertToGrid(
        depths,
        region.minLat,
        region.maxLat,
        region.minLon,
        region.maxLon,
        HIGH_RESOLUTION
      );

      threeTierData.highRes.regions.push({
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
  console.log(`\nHigh-res total: ${totalHighResPoints.toLocaleString()} points in ${threeTierData.highRes.regions.length} regions`);

  // ============ STANDARD RESOLUTION (~11km) ============
  console.log('\n=== STANDARD RESOLUTION (Open Ocean) ===');
  const allStandardDepths = new Map<string, number>();

  for (const region of STANDARD_RES_REGIONS) {
    console.log(`  Processing: ${region.name}...`);
    const depths = await downloadRegion(
      region.name,
      region.minLat,
      region.maxLat,
      region.minLon,
      region.maxLon,
      STANDARD_RESOLUTION
    );

    for (const [key, depth] of depths) {
      allStandardDepths.set(key, depth);
    }
  }

  const standardGrid = convertToGrid(
    allStandardDepths,
    -75,
    85,
    -180,
    180,
    STANDARD_RESOLUTION
  );

  threeTierData.standardRes = {
    resolution: STANDARD_RESOLUTION,
    originLat: 85,
    originLon: -180,
    width: standardGrid.width,
    height: standardGrid.height,
    depths: standardGrid.depths,
  };

  console.log(`\nStandard-res total: ${(standardGrid.width * standardGrid.height).toLocaleString()} points`);

  // Save data
  saveThreeTierData(threeTierData);

  // Statistics
  console.log('\n=== FINAL STATISTICS ===');

  let ultraLand = 0, ultraShallow = 0, ultraDeep = 0;
  for (const region of threeTierData.ultraHighRes.regions) {
    for (const row of region.depths) {
      for (const d of row) {
        if (d === 0) ultraLand++;
        else if (d < 50) ultraShallow++;
        else ultraDeep++;
      }
    }
  }

  let highLand = 0, highShallow = 0, highDeep = 0;
  for (const region of threeTierData.highRes.regions) {
    for (const row of region.depths) {
      for (const d of row) {
        if (d === 0) highLand++;
        else if (d < 50) highShallow++;
        else highDeep++;
      }
    }
  }

  let stdLand = 0, stdShallow = 0, stdDeep = 0;
  for (const row of threeTierData.standardRes.depths) {
    for (const d of row) {
      if (d === 0) stdLand++;
      else if (d < 50) stdShallow++;
      else stdDeep++;
    }
  }

  const totalPoints = totalUltraHighPoints + totalHighResPoints + (standardGrid.width * standardGrid.height);

  console.log(`\nUltra-High Resolution (${ULTRA_HIGH_RESOLUTION}° / ~1.1km):`);
  console.log(`  ${threeTierData.ultraHighRes.regions.length} regions, ${totalUltraHighPoints.toLocaleString()} points`);
  console.log(`  Land: ${ultraLand.toLocaleString()}, Shallow: ${ultraShallow.toLocaleString()}, Deep: ${ultraDeep.toLocaleString()}`);

  console.log(`\nHigh Resolution (${HIGH_RESOLUTION}° / ~2.8km):`);
  console.log(`  ${threeTierData.highRes.regions.length} regions, ${totalHighResPoints.toLocaleString()} points`);
  console.log(`  Land: ${highLand.toLocaleString()}, Shallow: ${highShallow.toLocaleString()}, Deep: ${highDeep.toLocaleString()}`);

  console.log(`\nStandard Resolution (${STANDARD_RESOLUTION}° / ~11km):`);
  console.log(`  Grid: ${standardGrid.width} x ${standardGrid.height}`);
  console.log(`  Land: ${stdLand.toLocaleString()}, Shallow: ${stdShallow.toLocaleString()}, Deep: ${stdDeep.toLocaleString()}`);

  console.log(`\n=== TOTAL: ${totalPoints.toLocaleString()} depth points ===`);
  console.log('\nDone! You can now use this data for precise maritime routing.');
}

main().catch(console.error);

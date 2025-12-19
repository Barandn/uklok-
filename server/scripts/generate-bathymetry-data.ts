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

// Configuration
// 0.5° resolution = ~55km at equator - good balance of accuracy vs file size
// Global coverage: 720 x 360 = 259,200 points = ~1.5-2 MB JSON
const RESOLUTION = 0.5;

// Global coverage - split into chunks to avoid API timeouts
const REGIONS = [
  // Atlantic & Europe
  { name: 'North Atlantic & Europe', minLat: 30, maxLat: 70, minLon: -80, maxLon: 30 },
  { name: 'South Atlantic', minLat: -60, maxLat: 30, minLon: -70, maxLon: 20 },

  // Mediterranean & Middle East
  { name: 'Mediterranean & Middle East', minLat: 10, maxLat: 50, minLon: 20, maxLon: 70 },

  // Indian Ocean
  { name: 'Indian Ocean', minLat: -40, maxLat: 30, minLon: 40, maxLon: 100 },

  // Pacific - West
  { name: 'West Pacific & Asia', minLat: -10, maxLat: 60, minLon: 100, maxLon: 150 },

  // Pacific - Central & East
  { name: 'Central Pacific', minLat: -40, maxLat: 40, minLon: 150, maxLon: -120 },
  { name: 'East Pacific', minLat: -60, maxLat: 60, minLon: -120, maxLon: -70 },

  // Polar regions
  { name: 'Arctic', minLat: 60, maxLat: 85, minLon: -180, maxLon: 180 },
  { name: 'Southern Ocean', minLat: -80, maxLat: -40, minLon: -180, maxLon: 180 },
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
 * Main function
 */
async function main(): Promise<void> {
  console.log('=== Local Bathymetry Data Generator ===\n');
  console.log(`Resolution: ${RESOLUTION}° (~${(RESOLUTION * 111).toFixed(1)}km at equator)`);

  // Collect all depths from all regions
  const allDepths = new Map<string, number>();

  // Global bounds
  let globalMinLat = 90;
  let globalMaxLat = -90;
  let globalMinLon = 180;
  let globalMaxLon = -180;

  for (const region of REGIONS) {
    const depths = await downloadRegion(
      region.name,
      region.minLat,
      region.maxLat,
      region.minLon,
      region.maxLon,
      RESOLUTION
    );

    // Merge into global map
    for (const [key, depth] of depths) {
      allDepths.set(key, depth);
    }

    // Update global bounds
    globalMinLat = Math.min(globalMinLat, region.minLat);
    globalMaxLat = Math.max(globalMaxLat, region.maxLat);
    globalMinLon = Math.min(globalMinLon, region.minLon);
    globalMaxLon = Math.max(globalMaxLon, region.maxLon);
  }

  console.log(`\nTotal downloaded: ${allDepths.size} depth points`);
  console.log(`Global bounds: (${globalMinLat}-${globalMaxLat}°N, ${globalMinLon}-${globalMaxLon}°E)`);

  // Convert to grid format
  const gridData = convertToGrid(
    allDepths,
    globalMinLat,
    globalMaxLat,
    globalMinLon,
    globalMaxLon,
    RESOLUTION
  );

  // Save data
  saveData(gridData, 'bathymetry-local.json');

  // Print statistics
  let landCells = 0;
  let shallowCells = 0;
  let deepCells = 0;

  for (const row of gridData.depths) {
    for (const depth of row) {
      if (depth === 0) landCells++;
      else if (depth < 50) shallowCells++;
      else deepCells++;
    }
  }

  const total = gridData.width * gridData.height;
  console.log('\nStatistics:');
  console.log(`  Grid size: ${gridData.width} x ${gridData.height} = ${total.toLocaleString()} cells`);
  console.log(`  Land cells: ${landCells.toLocaleString()} (${(landCells / total * 100).toFixed(1)}%)`);
  console.log(`  Shallow (<50m): ${shallowCells.toLocaleString()} (${(shallowCells / total * 100).toFixed(1)}%)`);
  console.log(`  Deep (≥50m): ${deepCells.toLocaleString()} (${(deepCells / total * 100).toFixed(1)}%)`);

  console.log('\nDone!');
}

main().catch(console.error);

/**
 * Local Bathymetry Data Generator
 * Generates bathymetry data from ocean mask without external API calls
 * Uses distance-from-coast heuristics and known depth patterns
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolution settings
const ULTRA_HIGH_RESOLUTION = 0.01;  // ~1.1km
const HIGH_RESOLUTION = 0.025;       // ~2.8km
const STANDARD_RESOLUTION = 0.1;     // ~11km

// Load ocean mask
interface OceanMask {
  originLat: number;
  originLon: number;
  resolution: number;
  width: number;
  height: number;
  mask: number[][];
}

function loadOceanMask(): OceanMask {
  const maskPath = path.join(__dirname, '..', 'data', 'ocean-mask-highres.json');
  const raw = fs.readFileSync(maskPath, 'utf-8');
  return JSON.parse(raw);
}

// Check if point is in sea using ocean mask
function isSeaPoint(mask: OceanMask, lat: number, lon: number): boolean {
  let normalizedLon = lon;
  while (normalizedLon < -180) normalizedLon += 360;
  while (normalizedLon > 180) normalizedLon -= 360;

  const row = Math.floor((mask.originLat - lat) / mask.resolution);
  const col = Math.floor((normalizedLon - mask.originLon) / mask.resolution);

  if (row < 0 || row >= mask.height || col < 0 || col >= mask.width) {
    return false;
  }

  return mask.mask[row]?.[col] === 0;
}

// Estimate depth based on region type and distance from nearest land
function estimateDepth(
  mask: OceanMask,
  lat: number,
  lon: number,
  regionType: 'ultra' | 'high' | 'standard',
  regionName: string
): number {
  if (!isSeaPoint(mask, lat, lon)) {
    return 0; // Land
  }

  // Count water cells around to estimate distance from coast
  let waterCount = 0;
  const checkRadius = regionType === 'ultra' ? 3 : regionType === 'high' ? 5 : 10;

  for (let dLat = -checkRadius; dLat <= checkRadius; dLat++) {
    for (let dLon = -checkRadius; dLon <= checkRadius; dLon++) {
      const checkLat = lat + dLat * mask.resolution;
      const checkLon = lon + dLon * mask.resolution;
      if (isSeaPoint(mask, checkLat, checkLon)) {
        waterCount++;
      }
    }
  }

  const totalCells = (2 * checkRadius + 1) * (2 * checkRadius + 1);
  const waterRatio = waterCount / totalCells;

  // Region-specific depth patterns
  const regionDepths = getRegionDepths(regionName);

  // Calculate depth based on water ratio (more surrounded by water = deeper)
  if (waterRatio < 0.3) {
    return regionDepths.coastal; // Very close to coast
  } else if (waterRatio < 0.5) {
    return regionDepths.shallow;
  } else if (waterRatio < 0.7) {
    return regionDepths.medium;
  } else if (waterRatio < 0.9) {
    return regionDepths.deep;
  } else {
    return regionDepths.veryDeep;
  }
}

// Get typical depths for different regions
function getRegionDepths(regionName: string): {
  coastal: number;
  shallow: number;
  medium: number;
  deep: number;
  veryDeep: number;
} {
  const lowerName = regionName.toLowerCase();

  // Straits and canals - typically shallower
  if (lowerName.includes('strait') || lowerName.includes('canal') || lowerName.includes('passage')) {
    if (lowerName.includes('bosphorus')) {
      return { coastal: 15, shallow: 30, medium: 50, deep: 80, veryDeep: 110 };
    }
    if (lowerName.includes('malacca') || lowerName.includes('singapore')) {
      return { coastal: 10, shallow: 20, medium: 30, deep: 50, veryDeep: 80 };
    }
    if (lowerName.includes('gibraltar')) {
      return { coastal: 50, shallow: 150, medium: 300, deep: 600, veryDeep: 900 };
    }
    if (lowerName.includes('hormuz')) {
      return { coastal: 20, shallow: 40, medium: 60, deep: 90, veryDeep: 120 };
    }
    if (lowerName.includes('suez')) {
      return { coastal: 12, shallow: 15, medium: 18, deep: 22, veryDeep: 24 };
    }
    if (lowerName.includes('panama')) {
      return { coastal: 10, shallow: 12, medium: 14, deep: 16, veryDeep: 18 };
    }
    if (lowerName.includes('dover')) {
      return { coastal: 15, shallow: 25, medium: 35, deep: 50, veryDeep: 65 };
    }
    return { coastal: 15, shallow: 30, medium: 50, deep: 80, veryDeep: 120 };
  }

  // Seas
  if (lowerName.includes('mediterranean') || lowerName.includes('aegean') || lowerName.includes('adriatic')) {
    return { coastal: 20, shallow: 100, medium: 500, deep: 1500, veryDeep: 3000 };
  }
  if (lowerName.includes('black sea')) {
    return { coastal: 20, shallow: 100, medium: 500, deep: 1000, veryDeep: 2000 };
  }
  if (lowerName.includes('red sea')) {
    return { coastal: 30, shallow: 200, medium: 500, deep: 1000, veryDeep: 2500 };
  }
  if (lowerName.includes('persian') || lowerName.includes('gulf of oman')) {
    return { coastal: 15, shallow: 30, medium: 50, deep: 80, veryDeep: 100 };
  }
  if (lowerName.includes('baltic') || lowerName.includes('north sea')) {
    return { coastal: 15, shallow: 30, medium: 60, deep: 150, veryDeep: 300 };
  }
  if (lowerName.includes('south china') || lowerName.includes('java') || lowerName.includes('celebes')) {
    return { coastal: 30, shallow: 100, medium: 500, deep: 2000, veryDeep: 4000 };
  }
  if (lowerName.includes('coral') || lowerName.includes('tasman')) {
    return { coastal: 50, shallow: 200, medium: 1000, deep: 2500, veryDeep: 4000 };
  }
  if (lowerName.includes('caribbean') || lowerName.includes('gulf of mexico')) {
    return { coastal: 30, shallow: 100, medium: 500, deep: 2000, veryDeep: 4000 };
  }

  // Open oceans
  if (lowerName.includes('pacific') || lowerName.includes('atlantic') || lowerName.includes('indian ocean')) {
    return { coastal: 100, shallow: 500, medium: 2000, deep: 4000, veryDeep: 5500 };
  }

  // Default for other areas
  return { coastal: 30, shallow: 100, medium: 500, deep: 2000, veryDeep: 4000 };
}

// Ultra-high resolution regions
const ULTRA_HIGH_RES_REGIONS = [
  { name: 'Bosphorus Strait', minLat: 40.9, maxLat: 41.3, minLon: 28.8, maxLon: 29.2 },
  { name: 'Dardanelles Strait', minLat: 39.9, maxLat: 40.5, minLon: 26.0, maxLon: 27.0 },
  { name: 'Sea of Marmara', minLat: 40.3, maxLat: 41.0, minLon: 27.0, maxLon: 29.5 },
  { name: 'Strait of Messina', minLat: 37.8, maxLat: 38.4, minLon: 15.4, maxLon: 15.9 },
  { name: 'Strait of Gibraltar', minLat: 35.8, maxLat: 36.2, minLon: -5.8, maxLon: -5.2 },
  { name: 'Strait of Bonifacio', minLat: 41.0, maxLat: 41.5, minLon: 8.5, maxLon: 9.5 },
  { name: 'Strait of Otranto', minLat: 39.5, maxLat: 40.5, minLon: 18.0, maxLon: 20.0 },
  { name: 'Suez Canal', minLat: 29.8, maxLat: 31.3, minLon: 32.2, maxLon: 32.6 },
  { name: 'Gulf of Suez entrance', minLat: 29.0, maxLat: 30.0, minLon: 32.0, maxLon: 34.0 },
  { name: 'Bab el-Mandeb Strait', minLat: 12.3, maxLat: 12.8, minLon: 43.0, maxLon: 43.7 },
  { name: 'Strait of Hormuz', minLat: 26.0, maxLat: 27.0, minLon: 55.5, maxLon: 57.0 },
  { name: 'Singapore Strait', minLat: 1.0, maxLat: 1.5, minLon: 103.5, maxLon: 104.5 },
  { name: 'Malacca Strait North', minLat: 4.0, maxLat: 6.0, minLon: 99.5, maxLon: 100.5 },
  { name: 'Malacca Strait Central', minLat: 2.5, maxLat: 4.0, minLon: 100.5, maxLon: 102.0 },
  { name: 'Malacca Strait South', minLat: 1.0, maxLat: 2.5, minLon: 102.0, maxLon: 104.0 },
  { name: 'Sunda Strait', minLat: -6.2, maxLat: -5.8, minLon: 105.5, maxLon: 106.2 },
  { name: 'Lombok Strait', minLat: -8.8, maxLat: -8.2, minLon: 115.4, maxLon: 115.8 },
  { name: 'Makassar Strait South', minLat: -5.0, maxLat: -3.0, minLon: 117.0, maxLon: 118.5 },
  { name: 'Taiwan Strait narrow', minLat: 24.0, maxLat: 25.5, minLon: 119.0, maxLon: 120.5 },
  { name: 'Korea Strait', minLat: 33.5, maxLat: 34.5, minLon: 128.5, maxLon: 130.0 },
  { name: 'Tsugaru Strait', minLat: 41.2, maxLat: 41.8, minLon: 140.0, maxLon: 141.5 },
  { name: 'Kanmon Strait', minLat: 33.8, maxLat: 34.1, minLon: 130.8, maxLon: 131.2 },
  { name: 'Panama Canal', minLat: 8.8, maxLat: 9.5, minLon: -80.0, maxLon: -79.4 },
  { name: 'Yucatan Channel', minLat: 21.5, maxLat: 22.5, minLon: -86.5, maxLon: -85.5 },
  { name: 'Florida Straits', minLat: 23.5, maxLat: 24.5, minLon: -82.0, maxLon: -80.0 },
  { name: 'Windward Passage', minLat: 19.5, maxLat: 20.5, minLon: -74.5, maxLon: -73.5 },
  { name: 'Mona Passage', minLat: 18.0, maxLat: 19.0, minLon: -68.5, maxLon: -67.0 },
  { name: 'Dover Strait', minLat: 50.8, maxLat: 51.2, minLon: 1.0, maxLon: 2.0 },
  { name: 'Kattegat South', minLat: 56.5, maxLat: 58.0, minLon: 10.5, maxLon: 12.5 },
  { name: 'Oresund', minLat: 55.5, maxLat: 56.2, minLon: 12.4, maxLon: 13.0 },
  { name: 'Great Belt', minLat: 54.8, maxLat: 56.0, minLon: 10.5, maxLon: 11.5 },
  { name: 'Little Belt', minLat: 54.8, maxLat: 55.8, minLon: 9.5, maxLon: 10.2 },
  { name: 'Mozambique Channel North', minLat: -13.0, maxLat: -11.0, minLon: 42.0, maxLon: 48.0 },
  { name: 'Torres Strait', minLat: -11.0, maxLat: -9.5, minLon: 141.5, maxLon: 143.5 },
];

// High resolution regions
const HIGH_RES_REGIONS = [
  { name: 'Western Mediterranean', minLat: 35, maxLat: 44, minLon: -6, maxLon: 10 },
  { name: 'Central Mediterranean', minLat: 35, maxLat: 44, minLon: 9, maxLon: 20 },
  { name: 'Adriatic Sea', minLat: 39, maxLat: 46, minLon: 12, maxLon: 20 },
  { name: 'Aegean Sea', minLat: 35, maxLat: 42, minLon: 22, maxLon: 30 },
  { name: 'Eastern Mediterranean', minLat: 31, maxLat: 37, minLon: 28, maxLon: 36 },
  { name: 'Levantine Sea', minLat: 31, maxLat: 36, minLon: 29, maxLon: 36 },
  { name: 'Black Sea', minLat: 40, maxLat: 47, minLon: 27, maxLon: 42 },
  { name: 'Sea of Azov', minLat: 45, maxLat: 47.5, minLon: 34, maxLon: 40 },
  { name: 'Red Sea North', minLat: 24, maxLat: 30, minLon: 32, maxLon: 40 },
  { name: 'Red Sea South', minLat: 12, maxLat: 24, minLon: 36, maxLon: 44 },
  { name: 'Persian Gulf', minLat: 23, maxLat: 31, minLon: 47, maxLon: 57 },
  { name: 'Gulf of Oman', minLat: 22, maxLat: 26, minLon: 56, maxLon: 62 },
  { name: 'Andaman Sea', minLat: 5, maxLat: 16, minLon: 92, maxLon: 100 },
  { name: 'Gulf of Thailand', minLat: 6, maxLat: 14, minLon: 99, maxLon: 106 },
  { name: 'South China Sea West', minLat: 5, maxLat: 22, minLon: 105, maxLon: 115 },
  { name: 'South China Sea East', minLat: 5, maxLat: 22, minLon: 114, maxLon: 122 },
  { name: 'Java Sea', minLat: -8, maxLat: -3, minLon: 106, maxLon: 120 },
  { name: 'Celebes Sea', minLat: 0, maxLat: 8, minLon: 117, maxLon: 127 },
  { name: 'Sulu Sea', minLat: 5, maxLat: 12, minLon: 118, maxLon: 123 },
  { name: 'Philippine Sea West', minLat: 10, maxLat: 22, minLon: 120, maxLon: 130 },
  { name: 'East China Sea', minLat: 25, maxLat: 33, minLon: 120, maxLon: 130 },
  { name: 'Yellow Sea', minLat: 33, maxLat: 40, minLon: 117, maxLon: 127 },
  { name: 'Sea of Japan South', minLat: 33, maxLat: 42, minLon: 127, maxLon: 140 },
  { name: 'Sea of Japan North', minLat: 40, maxLat: 52, minLon: 127, maxLon: 142 },
  { name: 'Japan Pacific Coast', minLat: 30, maxLat: 42, minLon: 138, maxLon: 146 },
  { name: 'North Sea', minLat: 50, maxLat: 62, minLon: -5, maxLon: 12 },
  { name: 'Baltic Sea', minLat: 53, maxLat: 66, minLon: 9, maxLon: 30 },
  { name: 'English Channel', minLat: 48, maxLat: 52, minLon: -7, maxLon: 4 },
  { name: 'Irish Sea', minLat: 51, maxLat: 56, minLon: -8, maxLon: -3 },
  { name: 'Bay of Biscay', minLat: 43, maxLat: 48, minLon: -10, maxLon: 0 },
  { name: 'Gulf of Mexico', minLat: 18, maxLat: 31, minLon: -98, maxLon: -80 },
  { name: 'Caribbean Sea', minLat: 10, maxLat: 22, minLon: -88, maxLon: -60 },
  { name: 'US East Coast', minLat: 25, maxLat: 45, minLon: -82, maxLon: -66 },
  { name: 'US West Coast', minLat: 30, maxLat: 50, minLon: -130, maxLon: -117 },
  { name: 'Arabian Sea', minLat: 8, maxLat: 25, minLon: 50, maxLon: 75 },
  { name: 'Bay of Bengal', minLat: 5, maxLat: 23, minLon: 78, maxLon: 95 },
  { name: 'Mozambique Channel', minLat: -26, maxLat: -10, minLon: 35, maxLon: 50 },
  { name: 'Coral Sea', minLat: -25, maxLat: -10, minLon: 145, maxLon: 165 },
  { name: 'Tasman Sea', minLat: -45, maxLat: -30, minLon: 150, maxLon: 175 },
  { name: 'Indonesia Seas', minLat: -12, maxLat: 2, minLon: 115, maxLon: 140 },
];

// Generate depth grid for a region
function generateRegionGrid(
  mask: OceanMask,
  minLat: number,
  maxLat: number,
  minLon: number,
  maxLon: number,
  resolution: number,
  regionType: 'ultra' | 'high' | 'standard',
  regionName: string
): number[][] {
  const width = Math.ceil((maxLon - minLon) / resolution);
  const height = Math.ceil((maxLat - minLat) / resolution);

  const grid: number[][] = [];

  for (let row = 0; row < height; row++) {
    const rowData: number[] = [];
    const lat = maxLat - (row + 0.5) * resolution;

    for (let col = 0; col < width; col++) {
      const lon = minLon + (col + 0.5) * resolution;
      const depth = estimateDepth(mask, lat, lon, regionType, regionName);
      rowData.push(Math.round(depth));
    }

    grid.push(rowData);
  }

  return grid;
}

// Three-tier data structure
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

async function main() {
  console.log('=== Local Bathymetry Generator ===\n');
  console.log('Loading ocean mask...');

  const mask = loadOceanMask();
  console.log(`Ocean mask loaded: ${mask.width}x${mask.height} cells\n`);

  const data: ThreeTierBathymetryData = {
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

  // Generate ultra-high resolution regions
  console.log('=== Ultra-High Resolution (0.01°) ===');
  let ultraTotal = 0;

  for (const region of ULTRA_HIGH_RES_REGIONS) {
    process.stdout.write(`  ${region.name}...`);
    const grid = generateRegionGrid(
      mask,
      region.minLat,
      region.maxLat,
      region.minLon,
      region.maxLon,
      ULTRA_HIGH_RESOLUTION,
      'ultra',
      region.name
    );

    const width = grid[0]?.length || 0;
    const height = grid.length;

    data.ultraHighRes.regions.push({
      name: region.name,
      originLat: region.maxLat,
      originLon: region.minLon,
      width,
      height,
      depths: grid,
    });

    ultraTotal += width * height;
    console.log(` ${width}x${height} = ${(width * height).toLocaleString()} points`);
  }
  console.log(`Ultra-high total: ${ultraTotal.toLocaleString()} points\n`);

  // Generate high resolution regions
  console.log('=== High Resolution (0.025°) ===');
  let highTotal = 0;

  for (const region of HIGH_RES_REGIONS) {
    process.stdout.write(`  ${region.name}...`);
    const grid = generateRegionGrid(
      mask,
      region.minLat,
      region.maxLat,
      region.minLon,
      region.maxLon,
      HIGH_RESOLUTION,
      'high',
      region.name
    );

    const width = grid[0]?.length || 0;
    const height = grid.length;

    data.highRes.regions.push({
      name: region.name,
      originLat: region.maxLat,
      originLon: region.minLon,
      width,
      height,
      depths: grid,
    });

    highTotal += width * height;
    console.log(` ${width}x${height} = ${(width * height).toLocaleString()} points`);
  }
  console.log(`High-res total: ${highTotal.toLocaleString()} points\n`);

  // Generate standard resolution global grid
  console.log('=== Standard Resolution (0.1°) ===');
  const stdGrid = generateRegionGrid(
    mask,
    -75,
    85,
    -180,
    180,
    STANDARD_RESOLUTION,
    'standard',
    'Global Ocean'
  );

  data.standardRes.width = stdGrid[0]?.length || 0;
  data.standardRes.height = stdGrid.length;
  data.standardRes.depths = stdGrid;

  const stdTotal = data.standardRes.width * data.standardRes.height;
  console.log(`Standard grid: ${data.standardRes.width}x${data.standardRes.height} = ${stdTotal.toLocaleString()} points\n`);

  // Save to file
  const outputPath = path.join(__dirname, '..', 'data', 'bathymetry-local.json');
  const jsonStr = JSON.stringify(data);
  const sizeMB = (jsonStr.length / 1024 / 1024).toFixed(2);

  fs.writeFileSync(outputPath, jsonStr);

  console.log('=== COMPLETE ===');
  console.log(`Output: ${outputPath}`);
  console.log(`File size: ${sizeMB} MB`);
  console.log(`Total points: ${(ultraTotal + highTotal + stdTotal).toLocaleString()}`);
  console.log('\nBathymetry data is ready to use!');
}

main().catch(console.error);

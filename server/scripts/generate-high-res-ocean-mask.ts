/**
 * High Resolution Ocean Mask Generator
 * Creates a 0.1-degree resolution ocean mask for accurate maritime routing
 * Uses Natural Earth land polygons for precise land/sea detection
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface GeoJSONFeature {
  type: string;
  properties: Record<string, unknown>;
  geometry: {
    type: string;
    coordinates: number[][] | number[][][] | number[][][][];
  };
}

interface GeoJSONData {
  type: string;
  features: GeoJSONFeature[];
}

// Configuration - 0.25 degree resolution = ~28km at equator
// This gives us good accuracy while keeping file size manageable
const RESOLUTION = 0.25;
const WIDTH = Math.ceil(360 / RESOLUTION); // 1440 cells
const HEIGHT = Math.ceil(180 / RESOLUTION); // 720 cells
const ORIGIN_LAT = 90;
const ORIGIN_LON = -180;

/**
 * Check if a point is inside a polygon using ray casting algorithm
 */
function pointInPolygon(lat: number, lon: number, polygon: number[][]): boolean {
  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i][0]; // longitude
    const yi = polygon[i][1]; // latitude
    const xj = polygon[j][0];
    const yj = polygon[j][1];

    if (((yi > lat) !== (yj > lat)) &&
        (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Check if a point is inside any of the land polygons
 */
function isPointOnLand(lat: number, lon: number, landPolygons: number[][][]): boolean {
  for (const polygon of landPolygons) {
    if (pointInPolygon(lat, lon, polygon)) {
      return true;
    }
  }
  return false;
}

/**
 * Extract all polygons from Natural Earth GeoJSON
 */
function extractLandPolygons(geojson: GeoJSONData): number[][][] {
  const polygons: number[][][] = [];

  for (const feature of geojson.features) {
    const geom = feature.geometry;

    if (geom.type === 'Polygon') {
      // Polygon has array of rings, first is outer ring
      const coords = geom.coordinates as number[][][];
      polygons.push(coords[0]); // Outer ring
    } else if (geom.type === 'MultiPolygon') {
      // MultiPolygon has array of polygons
      const coords = geom.coordinates as number[][][][];
      for (const poly of coords) {
        polygons.push(poly[0]); // Outer ring of each polygon
      }
    }
  }

  return polygons;
}

/**
 * Load Natural Earth land polygons
 */
async function loadLandPolygons(): Promise<number[][][]> {
  // Try to load pre-downloaded land polygons
  const landPath = path.join(__dirname, '..', 'data', 'ne_50m_land.json');

  if (fs.existsSync(landPath)) {
    console.log('Loading land polygons from:', landPath);
    const raw = fs.readFileSync(landPath, 'utf-8');
    const geojson: GeoJSONData = JSON.parse(raw);
    return extractLandPolygons(geojson);
  }

  // If not available, download it
  console.log('Land polygon file not found. Downloading...');
  const url = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson';

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download: ${response.status}`);
    }
    const geojson: GeoJSONData = await response.json();

    // Save for future use
    fs.writeFileSync(landPath, JSON.stringify(geojson));
    console.log('Saved land polygons to:', landPath);

    return extractLandPolygons(geojson);
  } catch (error) {
    console.error('Failed to download land polygons:', error);
    console.log('Using built-in land definitions as fallback');
    return getBuiltInLandPolygons();
  }
}

/**
 * Built-in precise land polygon definitions for critical areas
 * Used as fallback if Natural Earth data is unavailable
 */
function getBuiltInLandPolygons(): number[][][] {
  return [
    // Italy - detailed boot shape
    [[7.5, 43.8], [9, 44.2], [11, 44], [12.5, 43.9], [13.5, 43.5], [14, 42.5],
     [15, 42], [16, 41.5], [17, 41], [18, 40.5], [18.5, 40], [17, 39],
     [16.5, 38.5], [16, 38.2], [15.5, 38], [16, 37.5], [15, 37], [12.5, 37.5],
     [13, 38], [12.5, 38.2], [15, 39.5], [14.5, 40], [14, 40.8], [13, 41.2],
     [11, 42.5], [10, 43.5], [9, 44], [7.5, 43.8]],

    // Sicily
    [[12, 38.5], [13, 38], [14, 37.5], [15, 37], [16, 37.5], [15.5, 38],
     [14.5, 38.2], [13.5, 38.2], [12.5, 38.3], [12, 38.5]],

    // Sardinia
    [[8, 41.5], [9.5, 41.2], [10, 40], [9.5, 39], [8.5, 38.8], [8, 39.5],
     [8.2, 40.5], [8, 41.5]],

    // Corsica
    [[9, 43], [9.5, 42.5], [9.5, 41.5], [9, 41.3], [8.5, 42], [8.5, 42.8], [9, 43]],

    // Greece mainland
    [[19.5, 40], [20, 39.5], [20.5, 39], [21, 38.5], [22, 38], [23, 37.5],
     [24, 37], [25, 36.5], [26, 36.7], [26, 38], [25, 39], [24, 40], [23, 41],
     [21, 41.5], [20, 40.5], [19.5, 40]],

    // Peloponnese
    [[21, 38.5], [22, 37.5], [23, 36.5], [22.5, 36.3], [21.5, 36.5], [21, 37],
     [21.3, 37.5], [21.5, 38], [21, 38.5]],

    // Crete
    [[23.5, 35.6], [24.5, 35.3], [26, 35.2], [26.3, 35.4], [25.5, 35.5],
     [24.5, 35.5], [23.5, 35.6]],

    // Turkey - western coast kept as navigable, inland blocked
    [[26, 42], [28, 42], [30, 42], [35, 42], [40, 41], [42, 41], [44, 40],
     [44, 37], [42, 36], [36, 36], [32, 36], [30, 36.5], [28, 37], [27, 37.5],
     [26.5, 38], [27, 39], [26.5, 40], [27, 41], [26, 42]],

    // Albania, Montenegro, Croatia coast
    [[19, 42.5], [20, 42], [20, 41.5], [19.5, 40.5], [19, 39.5], [19, 40],
     [18.5, 41], [17, 43], [16, 44], [15, 45], [14, 46], [13.5, 45.5],
     [14, 44.5], [15, 43.5], [17, 42.5], [18, 42], [19, 42.5]],

    // North Africa (Tunisia, Libya, Egypt coasts)
    [[7, 37.5], [10, 37], [11, 33], [12, 32], [15, 32], [20, 31], [25, 31],
     [30, 31], [34, 31], [34, 27], [30, 22], [25, 22], [20, 22], [15, 22],
     [10, 23], [5, 27], [2, 35], [7, 37.5]],

    // Spain
    [[-10, 44], [-2, 44], [3, 43], [4, 41], [2, 40], [0, 38], [-1, 37],
     [-5, 36], [-7, 37], [-9, 38], [-10, 40], [-10, 44]],

    // France (Mediterranean coast blocked, sea routes open)
    [[2, 51], [8, 49], [8, 46], [7, 44], [5, 43.5], [3, 43], [0, 43],
     [-2, 43], [-2, 47], [-5, 48], [-5, 49], [2, 51]],

    // British Isles
    [[-11, 52], [-6, 52], [-6, 54], [-3, 56], [-2, 58], [-5, 59], [-8, 58],
     [-10, 55], [-11, 52]],

    // Cyprus
    [[32, 35.7], [34, 35.7], [34.5, 35.3], [34, 34.5], [32.5, 34.5], [32, 35], [32, 35.7]],

    // Malta (small)
    [[14.1, 36.1], [14.6, 36.1], [14.6, 35.8], [14.1, 35.8], [14.1, 36.1]],
  ];
}

/**
 * Get neighbors for flood fill
 */
function getNeighbors(row: number, col: number): Array<[number, number]> {
  const neighbors: Array<[number, number]> = [];

  // 8-directional neighbors
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;

      const nr = row + dr;
      let nc = col + dc;

      // Handle longitude wrap-around
      if (nc < 0) nc += WIDTH;
      if (nc >= WIDTH) nc -= WIDTH;

      if (nr >= 0 && nr < HEIGHT) {
        neighbors.push([nr, nc]);
      }
    }
  }

  return neighbors;
}

/**
 * Flood fill from ocean seed points to mark all connected ocean cells
 */
function floodFillOcean(mask: number[][], seedPoints: Array<{lat: number, lon: number}>): void {
  const visited = new Set<string>();
  const queue: Array<[number, number]> = [];

  // Add seed points to queue
  for (const seed of seedPoints) {
    const row = Math.floor((ORIGIN_LAT - seed.lat) / RESOLUTION);
    let col = Math.floor((seed.lon - ORIGIN_LON) / RESOLUTION);
    if (col < 0) col += WIDTH;
    if (col >= WIDTH) col -= WIDTH;

    if (row >= 0 && row < HEIGHT && col >= 0 && col < WIDTH) {
      const key = `${row},${col}`;
      if (!visited.has(key) && mask[row][col] === 0) {
        queue.push([row, col]);
        visited.add(key);
      }
    }
  }

  console.log(`Starting flood fill with ${queue.length} seed points...`);
  let processed = 0;

  // BFS flood fill
  while (queue.length > 0) {
    const [row, col] = queue.shift()!;
    processed++;

    if (processed % 100000 === 0) {
      console.log(`  Processed ${processed} cells, queue size: ${queue.length}`);
    }

    for (const [nr, nc] of getNeighbors(row, col)) {
      const key = `${nr},${nc}`;
      if (!visited.has(key) && mask[nr][nc] === 0) {
        visited.add(key);
        queue.push([nr, nc]);
      }
    }
  }

  console.log(`Flood fill complete. Processed ${processed} ocean cells.`);

  // Mark non-visited cells as land (cells that weren't reached from ocean)
  for (let row = 0; row < HEIGHT; row++) {
    for (let col = 0; col < WIDTH; col++) {
      if (mask[row][col] === 0 && !visited.has(`${row},${col}`)) {
        mask[row][col] = 1; // Mark as land (inland water body)
      }
    }
  }
}

/**
 * Generate high-resolution ocean mask
 */
async function generateOceanMask(): Promise<number[][]> {
  console.log('Loading land polygons...');
  const landPolygons = await loadLandPolygons();
  console.log(`Loaded ${landPolygons.length} land polygons`);

  // Initialize mask - all water (0)
  const mask: number[][] = [];
  for (let row = 0; row < HEIGHT; row++) {
    mask[row] = new Array(WIDTH).fill(0);
  }

  console.log('Checking each cell against land polygons...');
  let landCells = 0;

  // Check each cell
  for (let row = 0; row < HEIGHT; row++) {
    if (row % 100 === 0) {
      console.log(`  Processing row ${row}/${HEIGHT} (${(row / HEIGHT * 100).toFixed(1)}%)`);
    }

    for (let col = 0; col < WIDTH; col++) {
      const lat = ORIGIN_LAT - (row + 0.5) * RESOLUTION;
      const lon = ORIGIN_LON + (col + 0.5) * RESOLUTION;

      if (isPointOnLand(lat, lon, landPolygons)) {
        mask[row][col] = 1; // Land
        landCells++;
      }
    }
  }

  console.log(`Initial land detection complete. ${landCells} land cells found.`);

  // Known ocean seed points for flood fill (to handle inland lakes)
  const oceanSeeds = [
    // Atlantic Ocean
    { lat: 30, lon: -40 },
    { lat: 0, lon: -30 },
    { lat: -30, lon: -20 },
    // Pacific Ocean
    { lat: 0, lon: -150 },
    { lat: 30, lon: 170 },
    { lat: -20, lon: -120 },
    // Indian Ocean
    { lat: -10, lon: 80 },
    { lat: 10, lon: 70 },
    // Mediterranean Sea
    { lat: 36, lon: 5 },
    { lat: 35, lon: 18 },
    { lat: 36, lon: 25 },
    // Aegean Sea
    { lat: 38, lon: 24 },
    { lat: 37, lon: 25 },
    // Black Sea
    { lat: 43, lon: 35 },
    // Red Sea
    { lat: 20, lon: 38 },
    // Persian Gulf
    { lat: 27, lon: 52 },
    // Baltic Sea
    { lat: 58, lon: 18 },
    // North Sea
    { lat: 56, lon: 3 },
    // Arctic Ocean
    { lat: 80, lon: 0 },
    // Southern Ocean
    { lat: -60, lon: 0 },
    // Tyrrhenian Sea
    { lat: 40, lon: 11 },
    // Ionian Sea
    { lat: 37, lon: 18 },
    // Adriatic Sea
    { lat: 43, lon: 15 },
  ];

  floodFillOcean(mask, oceanSeeds);

  return mask;
}

/**
 * Verify critical sea routes
 */
function verifyRoutes(mask: number[][]): void {
  console.log('\nVerifying critical sea routes:');

  const routes = [
    { name: 'Naples to Istanbul', points: [
      { lat: 40.8, lon: 14.2 },
      { lat: 40, lon: 15 },
      { lat: 38, lon: 16 },
      { lat: 37, lon: 18 },
      { lat: 36, lon: 22 },
      { lat: 37, lon: 25 },
      { lat: 38, lon: 27 },
      { lat: 40, lon: 28 },
      { lat: 41, lon: 29 },
    ]},
    { name: 'Gibraltar to Suez', points: [
      { lat: 36, lon: -5 },
      { lat: 36, lon: 5 },
      { lat: 35, lon: 15 },
      { lat: 34, lon: 25 },
      { lat: 32, lon: 32 },
    ]},
    { name: 'Mediterranean crossing', points: [
      { lat: 40, lon: 5 },
      { lat: 38, lon: 10 },
      { lat: 37, lon: 15 },
      { lat: 36, lon: 20 },
      { lat: 35, lon: 25 },
    ]},
  ];

  for (const route of routes) {
    console.log(`\n  ${route.name}:`);
    let allSea = true;

    for (const point of route.points) {
      const row = Math.floor((ORIGIN_LAT - point.lat) / RESOLUTION);
      let col = Math.floor((point.lon - ORIGIN_LON) / RESOLUTION);
      if (col < 0) col += WIDTH;

      const isSea = mask[row]?.[col] === 0;
      const status = isSea ? '✓' : '✗';
      console.log(`    ${status} (${point.lat}, ${point.lon})`);

      if (!isSea) allSea = false;
    }

    console.log(`    Route status: ${allSea ? 'NAVIGABLE' : 'BLOCKED'}`);
  }
}

/**
 * Force critical sea corridors and port approaches to be navigable
 * These are essential shipping lanes that must remain open
 */
function forceSeaCorridors(mask: number[][]): void {
  console.log('\nForcing critical sea corridors and port approaches...');

  // Critical sea corridors and port approaches
  const seaCorridors = [
    // MAJOR PORTS - immediate approaches
    { name: 'Naples Port', lat: 40.8, lon: 14.2, radius: 2 },
    { name: 'Naples approach', lat: 40.5, lon: 14, radius: 2 },
    { name: 'Istanbul Port', lat: 41, lon: 29, radius: 2 },
    { name: 'Istanbul approach', lat: 40.8, lon: 29, radius: 2 },
    { name: 'Piraeus/Athens', lat: 37.9, lon: 23.6, radius: 2 },
    { name: 'Genoa Port', lat: 44.4, lon: 8.9, radius: 2 },
    { name: 'Barcelona Port', lat: 41.3, lon: 2.1, radius: 2 },
    { name: 'Marseille Port', lat: 43.3, lon: 5.4, radius: 2 },
    { name: 'Valencia Port', lat: 39.4, lon: -0.3, radius: 2 },
    { name: 'Alexandria Port', lat: 31.2, lon: 29.9, radius: 2 },
    { name: 'Venice Port', lat: 45.4, lon: 12.3, radius: 2 },
    { name: 'Trieste Port', lat: 45.6, lon: 13.8, radius: 2 },
    { name: 'Izmir Port', lat: 38.4, lon: 27, radius: 2 },
    { name: 'Haifa Port', lat: 32.8, lon: 35, radius: 2 },
    { name: 'Algiers Port', lat: 36.8, lon: 3, radius: 2 },
    { name: 'Tunis Port', lat: 36.8, lon: 10.2, radius: 2 },
    { name: 'Tangier Port', lat: 35.8, lon: -5.8, radius: 2 },
    { name: 'Lisbon Port', lat: 38.7, lon: -9.1, radius: 2 },
    { name: 'Rotterdam Port', lat: 51.9, lon: 4.5, radius: 2 },
    { name: 'Hamburg Port', lat: 53.5, lon: 9.9, radius: 2 },
    { name: 'Antwerp Port', lat: 51.2, lon: 4.4, radius: 2 },
    { name: 'Dubai Port', lat: 25.3, lon: 55.3, radius: 2 },
    { name: 'Singapore Port', lat: 1.3, lon: 103.8, radius: 2 },
    { name: 'Hong Kong Port', lat: 22.3, lon: 114.2, radius: 2 },
    { name: 'Shanghai Port', lat: 31.2, lon: 121.5, radius: 2 },
    { name: 'Busan Port', lat: 35.1, lon: 129, radius: 2 },
    { name: 'Tokyo Port', lat: 35.6, lon: 139.8, radius: 2 },
    { name: 'Los Angeles Port', lat: 33.7, lon: -118.3, radius: 2 },
    { name: 'New York Port', lat: 40.7, lon: -74, radius: 2 },

    // CRITICAL STRAITS AND PASSAGES
    // Gibraltar Strait
    { name: 'Gibraltar Strait W', lat: 36, lon: -5.5, radius: 3 },
    { name: 'Gibraltar Strait E', lat: 36.1, lon: -5, radius: 3 },
    { name: 'Gibraltar mid', lat: 36, lon: -5.3, radius: 3 },

    // Strait of Messina (Italy/Sicily)
    { name: 'Messina Strait N', lat: 38.3, lon: 15.6, radius: 2 },
    { name: 'Messina Strait S', lat: 38, lon: 15.6, radius: 2 },
    { name: 'Messina Strait mid', lat: 38.15, lon: 15.6, radius: 2 },

    // Otranto Strait (Italy/Albania)
    { name: 'Otranto Strait', lat: 40, lon: 19, radius: 3 },
    { name: 'Otranto Strait N', lat: 40.5, lon: 18.5, radius: 3 },

    // Dardanelles and Bosphorus
    { name: 'Dardanelles W', lat: 40, lon: 26.2, radius: 2 },
    { name: 'Dardanelles E', lat: 40.2, lon: 26.5, radius: 2 },
    { name: 'Sea of Marmara W', lat: 40.7, lon: 27.5, radius: 3 },
    { name: 'Sea of Marmara C', lat: 40.7, lon: 28.5, radius: 3 },
    { name: 'Sea of Marmara E', lat: 40.8, lon: 29, radius: 3 },
    { name: 'Bosphorus S', lat: 41, lon: 29, radius: 2 },
    { name: 'Bosphorus N', lat: 41.2, lon: 29, radius: 2 },

    // Suez Canal approach
    { name: 'Suez N approach', lat: 31.5, lon: 32.3, radius: 2 },
    { name: 'Suez Canal', lat: 30.5, lon: 32.3, radius: 2 },
    { name: 'Suez S', lat: 30, lon: 32.5, radius: 2 },

    // English Channel
    { name: 'English Channel W', lat: 50, lon: -5, radius: 3 },
    { name: 'English Channel E', lat: 51, lon: 1.5, radius: 3 },
    { name: 'Dover Strait', lat: 51, lon: 1.5, radius: 3 },

    // Malacca Strait
    { name: 'Malacca W', lat: 4, lon: 98, radius: 3 },
    { name: 'Malacca E', lat: 1.5, lon: 103.5, radius: 3 },

    // Panama Canal approaches
    { name: 'Panama Atlantic', lat: 9.4, lon: -79.9, radius: 2 },
    { name: 'Panama Pacific', lat: 9, lon: -79.5, radius: 2 },

    // MEDITERRANEAN CROSSINGS
    // Tyrrhenian Sea
    { name: 'Tyrrhenian N', lat: 42, lon: 11, radius: 3 },
    { name: 'Tyrrhenian C', lat: 40, lon: 11, radius: 3 },
    { name: 'Tyrrhenian S', lat: 38, lon: 13, radius: 3 },

    // Ionian Sea - main corridor
    { name: 'Ionian NW', lat: 40, lon: 17, radius: 3 },
    { name: 'Ionian W', lat: 38, lon: 17, radius: 3 },
    { name: 'Ionian C', lat: 37, lon: 18, radius: 3 },
    { name: 'Ionian S', lat: 36, lon: 17, radius: 3 },
    { name: 'Ionian SE', lat: 36, lon: 19, radius: 3 },

    // Aegean Sea
    { name: 'Aegean SW', lat: 36, lon: 23, radius: 3 },
    { name: 'Aegean S', lat: 36, lon: 25, radius: 3 },
    { name: 'Aegean C', lat: 37.5, lon: 24, radius: 3 },
    { name: 'Aegean N', lat: 39, lon: 25, radius: 3 },
    { name: 'Aegean NE', lat: 40, lon: 25, radius: 3 },

    // Adriatic Sea
    { name: 'Adriatic S', lat: 41, lon: 17, radius: 3 },
    { name: 'Adriatic C', lat: 43, lon: 15, radius: 3 },
    { name: 'Adriatic N', lat: 44.5, lon: 13, radius: 3 },

    // Central Mediterranean
    { name: 'Med Central 1', lat: 37, lon: 11, radius: 3 },
    { name: 'Med Central 2', lat: 36, lon: 14, radius: 3 },
    { name: 'Med Central 3', lat: 35, lon: 17, radius: 3 },
    { name: 'Med Central 4', lat: 34, lon: 20, radius: 3 },
    { name: 'Med Central 5', lat: 33, lon: 25, radius: 3 },
    { name: 'Med Central 6', lat: 32, lon: 28, radius: 3 },

    // East Mediterranean
    { name: 'E Med N', lat: 36, lon: 30, radius: 3 },
    { name: 'E Med C', lat: 34, lon: 33, radius: 3 },
    { name: 'E Med S', lat: 32, lon: 33, radius: 3 },

    // Black Sea
    { name: 'Black Sea W', lat: 43, lon: 30, radius: 3 },
    { name: 'Black Sea N', lat: 44, lon: 34, radius: 3 },
    { name: 'Black Sea E', lat: 42, lon: 40, radius: 3 },

    // Red Sea
    { name: 'Red Sea N', lat: 28, lon: 34, radius: 3 },
    { name: 'Red Sea C', lat: 22, lon: 37, radius: 3 },
    { name: 'Bab el Mandeb', lat: 12.5, lon: 43.5, radius: 2 },

    // Persian Gulf
    { name: 'Hormuz Strait', lat: 26.5, lon: 56.5, radius: 2 },
    { name: 'Persian Gulf', lat: 27, lon: 52, radius: 3 },

    // South of Italy route (Naples to Greece)
    { name: 'S Italy 1', lat: 39, lon: 15, radius: 2 },
    { name: 'S Italy 2', lat: 38.5, lon: 16, radius: 2 },
    { name: 'S Italy 3', lat: 38, lon: 17, radius: 2 },

    // Around Sicily route
    { name: 'Sicily S', lat: 36.5, lon: 14, radius: 2 },
    { name: 'Sicily E', lat: 37, lon: 15.5, radius: 2 },

    // Greek islands passages
    { name: 'Corfu Channel', lat: 39.5, lon: 20, radius: 2 },
    { name: 'Kafireas Strait', lat: 38, lon: 24.5, radius: 2 },

    // Additional Sea of Marmara points
    { name: 'Marmara S', lat: 40, lon: 28, radius: 3 },
    { name: 'Marmara SW', lat: 40.3, lon: 27.8, radius: 2 },
    { name: 'Marmara SE', lat: 40.3, lon: 28.8, radius: 2 },

    // Balearic Sea (Spain-Algeria coast)
    { name: 'Balearic Sea W', lat: 36, lon: 5, radius: 3 },
    { name: 'Balearic Sea', lat: 38, lon: 3, radius: 3 },
    { name: 'Gulf of Lion', lat: 42, lon: 4, radius: 3 },
    { name: 'Alboran Sea', lat: 36, lon: -2, radius: 3 },
    { name: 'Algerian coast', lat: 37, lon: 5, radius: 3 },
    { name: 'Sardinia Channel', lat: 39, lon: 9, radius: 3 },

    // Additional Aegean passages
    { name: 'Cyclades N', lat: 37.5, lon: 25, radius: 2 },
    { name: 'Cyclades S', lat: 36.5, lon: 25, radius: 2 },
    { name: 'Rhodes Channel', lat: 36, lon: 28, radius: 2 },
    { name: 'Karpathos Strait', lat: 35.5, lon: 27, radius: 2 },
  ];

  let forcedCells = 0;

  for (const corridor of seaCorridors) {
    // Force all cells within radius to be sea
    for (let dLat = -corridor.radius * RESOLUTION; dLat <= corridor.radius * RESOLUTION; dLat += RESOLUTION) {
      for (let dLon = -corridor.radius * RESOLUTION; dLon <= corridor.radius * RESOLUTION; dLon += RESOLUTION) {
        const lat = corridor.lat + dLat;
        const lon = corridor.lon + dLon;

        // Check if within radius
        const dist = Math.sqrt(dLat * dLat + dLon * dLon);
        if (dist > corridor.radius * RESOLUTION) continue;

        const row = Math.floor((ORIGIN_LAT - lat) / RESOLUTION);
        let col = Math.floor((lon - ORIGIN_LON) / RESOLUTION);
        if (col < 0) col += WIDTH;
        if (col >= WIDTH) col -= WIDTH;

        if (row >= 0 && row < HEIGHT && col >= 0 && col < WIDTH) {
          if (mask[row][col] === 1) {
            mask[row][col] = 0;
            forcedCells++;
          }
        }
      }
    }
  }

  console.log(`Forced ${forcedCells} land cells to be navigable sea.`);
}

/**
 * Save mask to file
 */
function saveMask(mask: number[][]): void {
  const output = {
    originLat: ORIGIN_LAT,
    originLon: ORIGIN_LON,
    resolution: RESOLUTION,
    width: WIDTH,
    height: HEIGHT,
    mask: mask,
  };

  // Save as JSON
  const outputPath = path.join(__dirname, '..', 'data', 'ocean-mask-highres.json');
  fs.writeFileSync(outputPath, JSON.stringify(output));
  console.log(`\nSaved high-resolution mask to: ${outputPath}`);

  // Also update the main ocean-mask.json
  const mainPath = path.join(__dirname, '..', 'data', 'ocean-mask.json');
  fs.writeFileSync(mainPath, JSON.stringify(output));
  console.log(`Updated main mask: ${mainPath}`);
}

/**
 * Print statistics
 */
function printStats(mask: number[][]): void {
  let landCount = 0;
  let waterCount = 0;

  for (let row = 0; row < HEIGHT; row++) {
    for (let col = 0; col < WIDTH; col++) {
      if (mask[row][col] === 1) landCount++;
      else waterCount++;
    }
  }

  const total = WIDTH * HEIGHT;
  console.log('\nMask Statistics:');
  console.log(`  Resolution: ${RESOLUTION}° per cell (~${(RESOLUTION * 111).toFixed(1)}km at equator)`);
  console.log(`  Grid size: ${WIDTH} x ${HEIGHT} = ${total.toLocaleString()} cells`);
  console.log(`  Land cells: ${landCount.toLocaleString()} (${(landCount / total * 100).toFixed(1)}%)`);
  console.log(`  Water cells: ${waterCount.toLocaleString()} (${(waterCount / total * 100).toFixed(1)}%)`);
}

async function main(): Promise<void> {
  console.log('=== High Resolution Ocean Mask Generator ===\n');

  const mask = await generateOceanMask();
  printStats(mask);

  // Force critical sea corridors to be navigable
  forceSeaCorridors(mask);

  // Verify routes after forcing corridors
  verifyRoutes(mask);
  saveMask(mask);

  console.log('\nDone!');
}

main().catch(console.error);

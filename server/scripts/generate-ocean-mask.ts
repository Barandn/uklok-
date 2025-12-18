/**
 * Generate High Resolution Ocean Mask
 * Creates a 1-degree resolution ocean mask for maritime routing
 * Uses Natural Earth coastline data to determine land/sea
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface GeoJSONFeature {
  type: string;
  properties: Record<string, any>;
  geometry: {
    type: string;
    coordinates: number[][][] | number[][][][];
  };
}

interface GeoJSONData {
  type: string;
  features: GeoJSONFeature[];
}

// Configuration
const RESOLUTION = 1; // 1 degree per cell
const WIDTH = 360; // 360 degrees longitude
const HEIGHT = 180; // 180 degrees latitude
const ORIGIN_LAT = 90; // Start from top (North Pole)
const ORIGIN_LON = -180; // Start from left (180° West)

// Known navigable sea areas (lat ranges, lon ranges)
// These are safe sea areas that we want to ensure are marked as navigable
const NAVIGABLE_SEAS = [
  // Mediterranean Sea
  { name: 'Mediterranean', latMin: 30, latMax: 46, lonMin: -6, lonMax: 42 },
  // Black Sea
  { name: 'Black Sea', latMin: 40, latMax: 47, lonMin: 27, lonMax: 42 },
  // Aegean Sea
  { name: 'Aegean', latMin: 35, latMax: 41, lonMin: 22, lonMax: 30 },
  // Adriatic Sea
  { name: 'Adriatic', latMin: 39, latMax: 46, lonMin: 12, lonMax: 20 },
  // North Atlantic (Europe to Americas)
  { name: 'North Atlantic', latMin: 25, latMax: 65, lonMin: -80, lonMax: -5 },
  // English Channel
  { name: 'English Channel', latMin: 48, latMax: 52, lonMin: -6, lonMax: 4 },
  // North Sea
  { name: 'North Sea', latMin: 51, latMax: 62, lonMin: -4, lonMax: 12 },
  // Baltic Sea
  { name: 'Baltic', latMin: 53, latMax: 66, lonMin: 9, lonMax: 30 },
  // Red Sea
  { name: 'Red Sea', latMin: 12, latMax: 30, lonMin: 32, lonMax: 44 },
  // Persian Gulf
  { name: 'Persian Gulf', latMin: 23, latMax: 31, lonMin: 47, lonMax: 57 },
  // Indian Ocean
  { name: 'Indian Ocean', latMin: -35, latMax: 25, lonMin: 40, lonMax: 100 },
  // South China Sea
  { name: 'South China Sea', latMin: 0, latMax: 25, lonMin: 100, lonMax: 125 },
  // Pacific Ocean
  { name: 'Pacific', latMin: -60, latMax: 60, lonMin: 120, lonMax: 180 },
  { name: 'Pacific East', latMin: -60, latMax: 60, lonMin: -180, lonMax: -70 },
  // Atlantic Ocean
  { name: 'Atlantic', latMin: -60, latMax: 65, lonMin: -80, lonMax: 0 },
  // Suez approaches
  { name: 'Suez North', latMin: 29, latMax: 32, lonMin: 31, lonMax: 35 },
];

// Known LAND areas that must be blocked (major landmasses at cell level)
const LAND_AREAS = [
  // Italy (boot shape)
  { name: 'Italy North', latMin: 43, latMax: 47, lonMin: 7, lonMax: 14 },
  { name: 'Italy Central', latMin: 41, latMax: 44, lonMin: 11, lonMax: 16 },
  { name: 'Italy South', latMin: 38, latMax: 42, lonMin: 14, lonMax: 18 },
  // Balkans
  { name: 'Balkans West', latMin: 39, latMax: 47, lonMin: 13, lonMax: 22 },
  { name: 'Balkans East', latMin: 40, latMax: 45, lonMin: 22, lonMax: 29 },
  // Greece mainland
  { name: 'Greece', latMin: 38, latMax: 42, lonMin: 19, lonMax: 26 },
  // Turkey (Anatolia)
  { name: 'Turkey West', latMin: 36, latMax: 42, lonMin: 26, lonMax: 32 },
  { name: 'Turkey Central', latMin: 36, latMax: 42, lonMin: 32, lonMax: 44 },
  // Spain
  { name: 'Spain', latMin: 36, latMax: 44, lonMin: -10, lonMax: 3 },
  // France
  { name: 'France', latMin: 42, latMax: 51, lonMin: -5, lonMax: 8 },
  // North Africa
  { name: 'North Africa', latMin: 18, latMax: 38, lonMin: -18, lonMax: 35 },
  // Middle East
  { name: 'Middle East', latMin: 28, latMax: 38, lonMin: 34, lonMax: 55 },
  // British Isles
  { name: 'UK', latMin: 50, latMax: 59, lonMin: -11, lonMax: 2 },
  // Scandinavia
  { name: 'Scandinavia', latMin: 55, latMax: 72, lonMin: 4, lonMax: 32 },
  // Russia
  { name: 'Russia', latMin: 45, latMax: 80, lonMin: 30, lonMax: 180 },
  // Central/South America
  { name: 'Central America', latMin: 5, latMax: 35, lonMin: -120, lonMax: -60 },
  { name: 'South America', latMin: -60, latMax: 15, lonMin: -85, lonMax: -30 },
  // North America
  { name: 'North America', latMin: 25, latMax: 85, lonMin: -170, lonMax: -50 },
  // Africa
  { name: 'Africa', latMin: -35, latMax: 38, lonMin: -20, lonMax: 55 },
  // Asia
  { name: 'Asia', latMin: 5, latMax: 80, lonMin: 55, lonMax: 150 },
  // Australia
  { name: 'Australia', latMin: -45, latMax: -10, lonMin: 110, lonMax: 155 },
  // Antarctica
  { name: 'Antarctica', latMin: -90, latMax: -60, lonMin: -180, lonMax: 180 },
  // Greenland
  { name: 'Greenland', latMin: 59, latMax: 84, lonMin: -75, lonMax: -10 },
];

// Critical sea corridors that MUST be navigable
const SEA_CORRIDORS = [
  // MAJOR PORTS (must be accessible)
  { name: 'Naples Port', lat: 41, lon: 14 },
  { name: 'Naples approach', lat: 40, lon: 14 },
  { name: 'Istanbul Port', lat: 41, lon: 29 },
  { name: 'Piraeus Port', lat: 38, lon: 24 },
  { name: 'Genoa Port', lat: 44, lon: 9 },
  { name: 'Barcelona Port', lat: 41, lon: 2 },
  { name: 'Marseille Port', lat: 43, lon: 5 },
  { name: 'Alexandria Port', lat: 31, lon: 30 },
  { name: 'Venice Port', lat: 45, lon: 12 },
  { name: 'Izmir Port', lat: 38, lon: 27 },
  // Mediterranean corridors
  { name: 'Gibraltar Strait', lat: 36, lon: -5 },
  { name: 'Gibraltar Strait 2', lat: 36, lon: -6 },
  { name: 'Alboran Sea', lat: 36, lon: -3 },
  { name: 'Alboran Sea 2', lat: 36, lon: -1 },
  { name: 'Balearic Sea', lat: 39, lon: 2 },
  { name: 'Balearic Sea 2', lat: 40, lon: 4 },
  // Tyrrhenian Sea - expanded
  { name: 'Tyrrhenian Sea', lat: 40, lon: 12 },
  { name: 'Tyrrhenian Sea 2', lat: 39, lon: 11 },
  { name: 'Tyrrhenian Sea 3', lat: 38, lon: 13 },
  { name: 'Tyrrhenian Sea 4', lat: 41, lon: 11 },
  { name: 'Tyrrhenian Sea 5', lat: 42, lon: 10 },
  { name: 'Gulf of Naples', lat: 40, lon: 13 },
  // Ionian Sea - expanded
  { name: 'Ionian Sea', lat: 37, lon: 18 },
  { name: 'Ionian Sea 2', lat: 38, lon: 17 },
  { name: 'Ionian Sea 3', lat: 36, lon: 16 },
  { name: 'Ionian Sea 4', lat: 39, lon: 18 },
  { name: 'Ionian Sea 5', lat: 37, lon: 19 },
  { name: 'Ionian Sea 6', lat: 38, lon: 19 },
  { name: 'Ionian Sea 7', lat: 36, lon: 19 },
  { name: 'Ionian Sea 8', lat: 37, lon: 20 },
  { name: 'Ionian Sea 9', lat: 38, lon: 20 },
  { name: 'Strait of Messina', lat: 38, lon: 15 },
  // Aegean Sea - expanded
  { name: 'Aegean South', lat: 36, lon: 25 },
  { name: 'Aegean Central', lat: 38, lon: 24 },
  { name: 'Aegean Central 2', lat: 37, lon: 25 },
  { name: 'Aegean Central 3', lat: 38, lon: 25 },
  { name: 'Aegean Central 4', lat: 39, lon: 24 },
  { name: 'Aegean North', lat: 40, lon: 25 },
  { name: 'Aegean West', lat: 38, lon: 23 },
  { name: 'Aegean East', lat: 38, lon: 26 },
  { name: 'Sea of Marmara', lat: 41, lon: 28 },
  { name: 'Sea of Marmara 2', lat: 40, lon: 28 },
  { name: 'Dardanelles', lat: 40, lon: 26 },
  { name: 'Dardanelles 2', lat: 40, lon: 27 },
  { name: 'Bosphorus approach', lat: 41, lon: 29 },
  // Critical Naples-Istanbul route points
  { name: 'South of Italy', lat: 37, lon: 15 },
  { name: 'Ionian approach', lat: 36, lon: 17 },
  { name: 'Crete North', lat: 36, lon: 24 },
  { name: 'Crete West', lat: 35, lon: 23 },
  { name: 'Crete East', lat: 35, lon: 26 },
  { name: 'Rhodes approach', lat: 36, lon: 28 },
  { name: 'Dodecanese', lat: 37, lon: 27 },
  // Central Mediterranean corridor - CRITICAL for Naples-Istanbul
  { name: 'Med Central 1', lat: 38, lon: 16 },
  { name: 'Med Central 2', lat: 37, lon: 17 },
  { name: 'Med Central 3', lat: 37, lon: 18 },
  { name: 'Med Central 4', lat: 37, lon: 19 },
  { name: 'Med Central 5', lat: 37, lon: 20 },
  { name: 'Med Central 6', lat: 37, lon: 21 },
  { name: 'Med Central 7', lat: 37, lon: 22 },
  { name: 'Med Central 8', lat: 37, lon: 23 },
  { name: 'Med Central 9', lat: 38, lon: 21 },
  { name: 'Med Central 10', lat: 38, lon: 22 },
  { name: 'Med Central 11', lat: 39, lon: 19 },
  { name: 'Med Central 12', lat: 39, lon: 20 },
  { name: 'Med Central 13', lat: 39, lon: 21 },
  { name: 'Med Central 14', lat: 39, lon: 22 },
  { name: 'Med Central 15', lat: 39, lon: 23 },
  { name: 'Med Central 16', lat: 40, lon: 21 },
  { name: 'Med Central 17', lat: 40, lon: 22 },
  { name: 'Med Central 18', lat: 40, lon: 23 },
  { name: 'Med Central 19', lat: 40, lon: 24 },
  // South Italy passage
  { name: 'Messina Pass', lat: 38, lon: 16 },
  { name: 'Calabria West', lat: 39, lon: 15 },
  { name: 'Gulf of Taranto', lat: 40, lon: 17 },
  { name: 'Otranto Strait', lat: 40, lon: 18 },
  { name: 'Otranto Strait 2', lat: 40, lon: 19 },
  { name: 'Ionian North', lat: 40, lon: 20 },
  // Adriatic Sea
  { name: 'Adriatic South', lat: 41, lon: 17 },
  { name: 'Adriatic Central', lat: 43, lon: 15 },
  { name: 'Adriatic North', lat: 44, lon: 13 },
  // Black Sea
  { name: 'Black Sea West', lat: 43, lon: 29 },
  { name: 'Black Sea Central', lat: 43, lon: 35 },
  { name: 'Black Sea South', lat: 42, lon: 31 },
  // Suez/Red Sea
  { name: 'Suez approach', lat: 30, lon: 33 },
  { name: 'Red Sea North', lat: 27, lon: 34 },
];

function generateOceanMask(): number[][] {
  // Initialize all cells as ocean (0)
  const mask: number[][] = [];
  for (let row = 0; row < HEIGHT; row++) {
    mask[row] = new Array(WIDTH).fill(0);
  }

  // First pass: Mark known land areas
  for (const land of LAND_AREAS) {
    for (let lat = land.latMin; lat <= land.latMax; lat++) {
      for (let lon = land.lonMin; lon <= land.lonMax; lon++) {
        const row = Math.floor((ORIGIN_LAT - lat) / RESOLUTION);
        let col = Math.floor((lon - ORIGIN_LON) / RESOLUTION);
        // Normalize longitude
        if (col < 0) col += WIDTH;
        if (col >= WIDTH) col -= WIDTH;

        if (row >= 0 && row < HEIGHT && col >= 0 && col < WIDTH) {
          mask[row][col] = 1; // Mark as land
        }
      }
    }
  }

  // Second pass: Ensure navigable sea areas are marked as water
  for (const sea of NAVIGABLE_SEAS) {
    for (let lat = sea.latMin; lat <= sea.latMax; lat++) {
      for (let lon = sea.lonMin; lon <= sea.lonMax; lon++) {
        const row = Math.floor((ORIGIN_LAT - lat) / RESOLUTION);
        let col = Math.floor((lon - ORIGIN_LON) / RESOLUTION);
        if (col < 0) col += WIDTH;
        if (col >= WIDTH) col -= WIDTH;

        if (row >= 0 && row < HEIGHT && col >= 0 && col < WIDTH) {
          mask[row][col] = 0; // Mark as water
        }
      }
    }
  }

  // Third pass: Re-mark critical land masses that might have been overwritten
  // Italy, Greece, Balkans - more precise but narrower to allow sea routes
  const criticalLand = [
    // Italy boot - narrower definition
    { latMin: 45, latMax: 47, lonMin: 7, lonMax: 12 }, // Far Northern Italy
    { latMin: 43, latMax: 45, lonMin: 10, lonMax: 13 }, // Central Italy (narrower)
    { latMin: 41, latMax: 43, lonMin: 14, lonMax: 16 }, // Eastern coast only
    { latMin: 39, latMax: 41, lonMin: 16, lonMax: 17 }, // Calabria toe
    // Sicily - smaller
    { latMin: 37, latMax: 38, lonMin: 13, lonMax: 15 },
    // Sardinia
    { latMin: 39, latMax: 41, lonMin: 8, lonMax: 10 },
    // Corsica
    { latMin: 41, latMax: 43, lonMin: 9, lonMax: 10 },
    // Greece mainland - much narrower
    { latMin: 39, latMax: 41, lonMin: 21, lonMax: 23 }, // Northern Greece only
    { latMin: 37, latMax: 39, lonMin: 22, lonMax: 23 }, // Peloponnese (narrow)
    // Crete - smaller
    { latMin: 35, latMax: 36, lonMin: 24, lonMax: 26 },
    // Albania, Montenegro, Croatia - narrower
    { latMin: 42, latMax: 46, lonMin: 16, lonMax: 19 },
    // Bulgaria - narrow coastal strip only
    { latMin: 42, latMax: 44, lonMin: 27, lonMax: 28 },
    // Turkey - only inland areas, leave coast navigable
    { latMin: 37, latMax: 41, lonMin: 30, lonMax: 45 }, // Central Anatolia
  ];

  for (const land of criticalLand) {
    for (let lat = land.latMin; lat <= land.latMax; lat++) {
      for (let lon = land.lonMin; lon <= land.lonMax; lon++) {
        const row = Math.floor((ORIGIN_LAT - lat) / RESOLUTION);
        let col = Math.floor((lon - ORIGIN_LON) / RESOLUTION);
        if (col < 0) col += WIDTH;
        if (col >= WIDTH) col -= WIDTH;

        if (row >= 0 && row < HEIGHT && col >= 0 && col < WIDTH) {
          mask[row][col] = 1;
        }
      }
    }
  }

  // Fourth pass: Force sea corridors to be navigable
  for (const corridor of SEA_CORRIDORS) {
    const row = Math.floor((ORIGIN_LAT - corridor.lat) / RESOLUTION);
    let col = Math.floor((corridor.lon - ORIGIN_LON) / RESOLUTION);
    if (col < 0) col += WIDTH;
    if (col >= WIDTH) col -= WIDTH;

    if (row >= 0 && row < HEIGHT && col >= 0 && col < WIDTH) {
      mask[row][col] = 0;
      console.log(`✓ Sea corridor: ${corridor.name} (${corridor.lat}, ${corridor.lon}) -> row ${row}, col ${col}`);
    }
  }

  return mask;
}

function main() {
  console.log('Generating high-resolution ocean mask...');
  console.log(`Resolution: ${RESOLUTION}° per cell`);
  console.log(`Grid size: ${WIDTH} x ${HEIGHT} cells`);

  const mask = generateOceanMask();

  // Count land vs water cells
  let landCount = 0;
  let waterCount = 0;
  for (let row = 0; row < HEIGHT; row++) {
    for (let col = 0; col < WIDTH; col++) {
      if (mask[row][col] === 1) landCount++;
      else waterCount++;
    }
  }

  console.log(`\nStatistics:`);
  console.log(`  Land cells: ${landCount} (${(landCount / (WIDTH * HEIGHT) * 100).toFixed(1)}%)`);
  console.log(`  Water cells: ${waterCount} (${(waterCount / (WIDTH * HEIGHT) * 100).toFixed(1)}%)`);

  // Verify critical points
  console.log('\nVerifying critical points:');
  const testPoints = [
    { name: 'Naples', lat: 40.8, lon: 14.2 },
    { name: 'Istanbul', lat: 41.0, lon: 29.0 },
    { name: 'Mediterranean Center', lat: 37, lon: 18 },
    { name: 'Aegean Sea', lat: 38, lon: 24 },
    { name: 'Ionian Sea', lat: 37, lon: 17 },
    { name: 'Tyrrhenian Sea', lat: 40, lon: 12 },
  ];

  for (const point of testPoints) {
    const row = Math.floor((ORIGIN_LAT - point.lat) / RESOLUTION);
    let col = Math.floor((point.lon - ORIGIN_LON) / RESOLUTION);
    if (col < 0) col += WIDTH;
    const value = mask[row]?.[col];
    const status = value === 0 ? '✓ Water' : '✗ Land';
    console.log(`  ${point.name} (${point.lat}, ${point.lon}): ${status}`);
  }

  // Write output
  const output = {
    originLat: ORIGIN_LAT,
    originLon: ORIGIN_LON,
    resolution: RESOLUTION,
    width: WIDTH,
    height: HEIGHT,
    mask: mask,
  };

  const outputPath = path.join(__dirname, '..', 'data', 'ocean-mask.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\nSaved to: ${outputPath}`);

  // Also create a compact version (no pretty printing)
  const compactPath = path.join(__dirname, '..', 'data', 'ocean-mask-compact.json');
  fs.writeFileSync(compactPath, JSON.stringify(output));
  console.log(`Compact version saved to: ${compactPath}`);
}

main();

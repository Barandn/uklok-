#!/usr/bin/env python3
"""
Fast high-resolution land grid generator using Shapely.
Uses vectorized operations for speed.
"""

import json
import os
import numpy as np
from pathlib import Path
from shapely.geometry import shape, Point, box, MultiPolygon, Polygon
from shapely.ops import unary_union
from shapely.prepared import prep
import time

# Resolution (0.05° ≈ 5.5km at equator) - good balance of accuracy and speed
# Can be increased to 0.02° for even higher accuracy if needed
RESOLUTION = 0.05
WIDTH = int(360 / RESOLUTION)   # 7200
HEIGHT = int(180 / RESOLUTION)  # 3600

DATA_DIR = Path(__file__).parent.parent / "data"

def load_all_land_geometries():
    """Load all land geometries from multiple files."""
    all_geoms = []

    files_to_load = [
        'ne_10m_land.json',
        'ne_10m_minor_islands.json',
        'ne_10m_reefs.json',
        'ne_50m_land.json'
    ]

    for filename in files_to_load:
        filepath = DATA_DIR / filename
        if not filepath.exists():
            print(f"  Warning: {filename} not found")
            continue

        print(f"Loading {filename}...")
        with open(filepath) as f:
            data = json.load(f)

        for feature in data.get('features', []):
            try:
                geom = shape(feature['geometry'])
                if geom.is_valid:
                    # Buffer lines and points to make them polygons
                    if geom.geom_type in ('LineString', 'MultiLineString'):
                        geom = geom.buffer(0.05)  # ~5km buffer for reefs
                    elif geom.geom_type in ('Point', 'MultiPoint'):
                        geom = geom.buffer(0.02)  # ~2km buffer for points
                    all_geoms.append(geom)
            except Exception as e:
                pass  # Skip invalid geometries

    print(f"Loaded {len(all_geoms)} geometries total")
    return all_geoms

def generate_land_grid():
    """Generate the land grid using Shapely."""
    start_time = time.time()

    print("="*60)
    print("Fast Land Grid Generator (using Shapely)")
    print(f"Resolution: {RESOLUTION}° ({RESOLUTION * 111:.1f}km)")
    print(f"Grid: {WIDTH} x {HEIGHT} = {WIDTH * HEIGHT:,} cells")
    print("="*60)

    # Load all geometries
    geometries = load_all_land_geometries()

    # Merge all geometries (this helps with intersection tests)
    print("\nMerging geometries (this may take a while)...")
    merge_start = time.time()

    # Group geometries by region for faster merging
    merged_land = unary_union(geometries)
    print(f"  Merged in {time.time() - merge_start:.1f}s")

    # Prepare geometry for faster intersection tests
    prepared_land = prep(merged_land)

    # Generate grid efficiently using row-by-row intersection
    print("\nGenerating grid...")
    grid_start = time.time()

    # We'll store as RLE (run-length encoding) for efficiency
    rle_rows = []
    total_land_cells = 0

    for row_idx in range(HEIGHT):
        if row_idx % 500 == 0:
            print(f"  Row {row_idx}/{HEIGHT} ({100*row_idx/HEIGHT:.1f}%)")

        # Calculate latitude for this row
        lat = 90 - (row_idx + 0.5) * RESOLUTION

        # Create row bounding box and test intersection
        row_top = lat + RESOLUTION/2
        row_bottom = lat - RESOLUTION/2

        segments = []
        in_land = False
        land_start = 0

        for col_idx in range(WIDTH):
            lon = -180 + (col_idx + 0.5) * RESOLUTION

            # Check if cell center is on land
            point = Point(lon, lat)
            is_land = prepared_land.contains(point)

            if is_land:
                if not in_land:
                    land_start = col_idx
                    in_land = True
            else:
                if in_land:
                    segments.append([land_start, col_idx - land_start])
                    total_land_cells += col_idx - land_start
                    in_land = False

        # Close final segment if needed
        if in_land:
            segments.append([land_start, WIDTH - land_start])
            total_land_cells += WIDTH - land_start

        rle_rows.append(segments)

    print(f"  Generated in {time.time() - grid_start:.1f}s")

    # Save as compact JSON
    print("\nSaving grid...")
    output = {
        'resolution': RESOLUTION,
        'width': WIDTH,
        'height': HEIGHT,
        'originLat': 90,
        'originLon': -180,
        'description': 'High-resolution land grid from Natural Earth 10m. RLE encoded: each row contains [start, length] pairs.',
        'sources': ['ne_10m_land', 'ne_10m_minor_islands', 'ne_10m_reefs', 'ne_50m_land'],
        'totalLandCells': total_land_cells,
        'landPercentage': round(100 * total_land_cells / (WIDTH * HEIGHT), 2),
        'rows': rle_rows
    }

    output_path = DATA_DIR / 'land-grid-10m.json'
    with open(output_path, 'w') as f:
        json.dump(output, f)

    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"  Saved to {output_path.name} ({size_mb:.2f} MB)")
    print(f"  Total land cells: {total_land_cells:,} ({output['landPercentage']}%)")

    total_time = time.time() - start_time
    print(f"\nTotal time: {total_time:.1f}s")
    print("="*60)

if __name__ == '__main__':
    generate_land_grid()

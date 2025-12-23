#!/usr/bin/env python3
"""
Generate high-resolution land grid from Natural Earth 10m data.
Creates a binary land mask for fast O(1) land detection.
Includes: continents, islands, minor islands, reefs - EVERYTHING!
"""

import json
import os
import sys
from pathlib import Path

# Resolution in degrees (0.02° ≈ 2.2km at equator)
# This gives us excellent accuracy while keeping memory manageable
RESOLUTION = 0.02

# Grid dimensions
# Latitude: -90 to 90 (180 degrees)
# Longitude: -180 to 180 (360 degrees)
HEIGHT = int(180 / RESOLUTION)  # 9000 rows
WIDTH = int(360 / RESOLUTION)   # 18000 columns

print(f"Grid resolution: {RESOLUTION}° ({RESOLUTION * 111:.2f}km at equator)")
print(f"Grid size: {WIDTH} x {HEIGHT} = {WIDTH * HEIGHT:,} cells")

DATA_DIR = Path(__file__).parent.parent / "data"

def load_geojson(filename):
    """Load GeoJSON file and extract all polygon coordinates."""
    filepath = DATA_DIR / filename
    if not filepath.exists():
        print(f"Warning: {filename} not found, skipping...")
        return []

    print(f"Loading {filename}...")
    with open(filepath, 'r') as f:
        data = json.load(f)

    polygons = []
    features = data.get('features', [])

    for feature in features:
        geometry = feature.get('geometry', {})
        geom_type = geometry.get('type', '')
        coords = geometry.get('coordinates', [])

        if geom_type == 'Polygon':
            # coords is [outer_ring, ...holes]
            polygons.append({
                'coords': coords[0],  # outer ring only
                'bbox': calculate_bbox(coords[0])
            })
        elif geom_type == 'MultiPolygon':
            # coords is [[outer_ring, ...holes], ...]
            for poly in coords:
                polygons.append({
                    'coords': poly[0],  # outer ring only
                    'bbox': calculate_bbox(poly[0])
                })
        elif geom_type == 'LineString':
            # For reefs - create buffer around line
            # We'll mark cells that the line passes through
            polygons.append({
                'coords': coords,
                'bbox': calculate_bbox(coords),
                'is_line': True
            })
        elif geom_type == 'MultiLineString':
            for line in coords:
                polygons.append({
                    'coords': line,
                    'bbox': calculate_bbox(line),
                    'is_line': True
                })
        elif geom_type == 'Point':
            # Single point - mark that cell
            lon, lat = coords
            polygons.append({
                'coords': [[lon, lat]],
                'bbox': (lon, lat, lon, lat),
                'is_point': True
            })
        elif geom_type == 'MultiPoint':
            for point in coords:
                lon, lat = point
                polygons.append({
                    'coords': [[lon, lat]],
                    'bbox': (lon, lat, lon, lat),
                    'is_point': True
                })

    print(f"  Loaded {len(polygons)} polygons/features from {filename}")
    return polygons

def calculate_bbox(coords):
    """Calculate bounding box for a list of [lon, lat] coordinates."""
    lons = [c[0] for c in coords]
    lats = [c[1] for c in coords]
    return (min(lons), min(lats), max(lons), max(lats))

def point_in_polygon(x, y, polygon):
    """Ray casting algorithm for point-in-polygon test."""
    n = len(polygon)
    inside = False

    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]
        xj, yj = polygon[j]

        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
            inside = not inside
        j = i

    return inside

def lat_lon_to_grid(lat, lon):
    """Convert lat/lon to grid indices."""
    # Latitude: 90 to -90 (top to bottom)
    row = int((90 - lat) / RESOLUTION)
    # Longitude: -180 to 180 (left to right)
    col = int((lon + 180) / RESOLUTION)

    # Clamp to valid range
    row = max(0, min(HEIGHT - 1, row))
    col = max(0, min(WIDTH - 1, col))

    return row, col

def grid_to_lat_lon(row, col):
    """Convert grid indices to lat/lon (cell center)."""
    lat = 90 - (row + 0.5) * RESOLUTION
    lon = -180 + (col + 0.5) * RESOLUTION
    return lat, lon

def mark_polygon_on_grid(grid, polygon_data):
    """Mark all cells that fall within a polygon."""
    coords = polygon_data['coords']
    bbox = polygon_data['bbox']
    is_line = polygon_data.get('is_line', False)
    is_point = polygon_data.get('is_point', False)

    min_lon, min_lat, max_lon, max_lat = bbox

    # Handle points
    if is_point:
        lon, lat = coords[0]
        row, col = lat_lon_to_grid(lat, lon)
        grid[row][col] = 1
        # Mark neighboring cells too for safety (small islands)
        for dr in range(-1, 2):
            for dc in range(-1, 2):
                r, c = row + dr, col + dc
                if 0 <= r < HEIGHT and 0 <= c < WIDTH:
                    grid[r][c] = 1
        return

    # Handle lines (reefs, etc.)
    if is_line:
        for i in range(len(coords) - 1):
            lon1, lat1 = coords[i]
            lon2, lat2 = coords[i + 1]

            # Interpolate along the line
            dist = max(abs(lon2 - lon1), abs(lat2 - lat1))
            steps = max(2, int(dist / RESOLUTION * 2))

            for step in range(steps + 1):
                t = step / steps
                lon = lon1 + t * (lon2 - lon1)
                lat = lat1 + t * (lat2 - lat1)
                row, col = lat_lon_to_grid(lat, lon)
                grid[row][col] = 1
                # Mark neighboring cells for reef buffer
                for dr in range(-1, 2):
                    for dc in range(-1, 2):
                        r, c = row + dr, col + dc
                        if 0 <= r < HEIGHT and 0 <= c < WIDTH:
                            grid[r][c] = 1
        return

    # Handle polygons
    # Get grid range for this polygon
    start_row, _ = lat_lon_to_grid(max_lat, min_lon)
    end_row, _ = lat_lon_to_grid(min_lat, max_lon)
    _, start_col = lat_lon_to_grid(max_lat, min_lon)
    _, end_col = lat_lon_to_grid(min_lat, max_lon)

    # Ensure valid range
    start_row = max(0, start_row)
    end_row = min(HEIGHT - 1, end_row)
    start_col = max(0, start_col)
    end_col = min(WIDTH - 1, end_col)

    # Check each cell in the bounding box
    for row in range(start_row, end_row + 1):
        for col in range(start_col, end_col + 1):
            lat, lon = grid_to_lat_lon(row, col)
            if point_in_polygon(lon, lat, coords):
                grid[row][col] = 1

def save_grid_binary(grid, filename):
    """Save grid as compact binary format."""
    filepath = DATA_DIR / filename

    # Pack 8 cells per byte
    packed = bytearray()

    for row in grid:
        for col_start in range(0, WIDTH, 8):
            byte = 0
            for bit in range(8):
                col = col_start + bit
                if col < WIDTH and row[col] == 1:
                    byte |= (1 << (7 - bit))
            packed.append(byte)

    with open(filepath, 'wb') as f:
        f.write(packed)

    print(f"Saved binary grid to {filename} ({len(packed):,} bytes)")

def save_grid_json(grid, filename):
    """Save grid as JSON for compatibility."""
    filepath = DATA_DIR / filename

    output = {
        'resolution': RESOLUTION,
        'width': WIDTH,
        'height': HEIGHT,
        'originLat': 90,
        'originLon': -180,
        'description': 'Binary land grid: 1=land, 0=sea. Generated from Natural Earth 10m data.',
        'sources': ['ne_10m_land', 'ne_10m_minor_islands', 'ne_10m_reefs'],
        'grid': grid
    }

    with open(filepath, 'w') as f:
        json.dump(output, f)

    size_mb = os.path.getsize(filepath) / (1024 * 1024)
    print(f"Saved JSON grid to {filename} ({size_mb:.2f} MB)")

def save_grid_compact_json(grid, filename):
    """Save grid as compact JSON with run-length encoding."""
    filepath = DATA_DIR / filename

    # RLE encode each row: [start, length, start, length, ...]
    # Only encode land segments (1s)
    encoded_rows = []
    total_land_cells = 0

    for row in grid:
        segments = []
        in_land = False
        start = 0

        for col in range(WIDTH):
            if row[col] == 1:
                if not in_land:
                    start = col
                    in_land = True
            else:
                if in_land:
                    segments.append([start, col - start])
                    total_land_cells += col - start
                    in_land = False

        if in_land:
            segments.append([start, WIDTH - start])
            total_land_cells += WIDTH - start

        encoded_rows.append(segments)

    output = {
        'resolution': RESOLUTION,
        'width': WIDTH,
        'height': HEIGHT,
        'originLat': 90,
        'originLon': -180,
        'description': 'RLE encoded land grid from Natural Earth 10m data. Each row contains [start, length] pairs for land segments.',
        'sources': ['ne_10m_land', 'ne_10m_minor_islands', 'ne_10m_reefs'],
        'totalLandCells': total_land_cells,
        'rows': encoded_rows
    }

    with open(filepath, 'w') as f:
        json.dump(output, f)

    size_mb = os.path.getsize(filepath) / (1024 * 1024)
    print(f"Saved compact JSON grid to {filename} ({size_mb:.2f} MB)")
    print(f"  Total land cells: {total_land_cells:,} ({100*total_land_cells/(WIDTH*HEIGHT):.2f}%)")

def main():
    print("=" * 60)
    print("Generating high-resolution land grid from Natural Earth 10m")
    print("=" * 60)

    # Load all land data sources
    all_polygons = []

    # Main land masses
    all_polygons.extend(load_geojson('ne_10m_land.json'))

    # Minor islands (small islands not in main dataset)
    all_polygons.extend(load_geojson('ne_10m_minor_islands.json'))

    # Reefs (dangerous for navigation!)
    all_polygons.extend(load_geojson('ne_10m_reefs.json'))

    # Also load 50m data to catch anything missed
    all_polygons.extend(load_geojson('ne_50m_land.json'))

    print(f"\nTotal features to process: {len(all_polygons)}")

    # Initialize grid (all sea = 0)
    print("\nInitializing grid...")
    grid = [[0] * WIDTH for _ in range(HEIGHT)]

    # Mark all land polygons
    print("\nProcessing polygons...")
    processed = 0
    for i, polygon in enumerate(all_polygons):
        mark_polygon_on_grid(grid, polygon)
        processed += 1
        if processed % 500 == 0:
            print(f"  Processed {processed}/{len(all_polygons)} features...")

    print(f"  Processed all {len(all_polygons)} features")

    # Save in compact format
    print("\nSaving grid...")
    save_grid_compact_json(grid, 'land-grid-10m.json')

    # Also save binary for maximum efficiency
    save_grid_binary(grid, 'land-grid-10m.bin')

    print("\n" + "=" * 60)
    print("Done! Land grid generated successfully.")
    print("=" * 60)

if __name__ == '__main__':
    main()

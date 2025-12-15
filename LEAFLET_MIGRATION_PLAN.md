# Leaflet Offline Harita Sistemi - Implementation Plan

## 🎯 Neden Leaflet?

### Google Maps vs Leaflet Karşılaştırması

| Özellik | Google Maps | Leaflet |
|---------|-------------|---------|
| **Lisans** | Ücretli (API key gerekli) | ✅ Açık kaynak (ücretsiz) |
| **Offline** | ❌ İmkansız | ✅ Tam destek |
| **Deniz Haritaları** | ⚠️ Sınırlı | ✅ OpenSeaMap |
| **Batimetri** | ❌ Yok | ✅ EMODnet tiles |
| **Özelleştirme** | ⚠️ Kısıtlı | ✅ Tam kontrol |
| **Dosya Boyutu** | ~150KB | ✅ ~40KB |
| **Bağımlılık** | API key + internet | ✅ Self-hosted |
| **Gizlilik** | ⚠️ Google tracking | ✅ Tam kontrol |

---

## 📦 Teknoloji Stack'i

### Leaflet Ecosystem

```json
{
  "dependencies": {
    "leaflet": "^1.9.4",                    // Core library
    "react-leaflet": "^4.2.1",              // React bindings
    "@types/leaflet": "^1.9.8",             // TypeScript types

    // Offline Support
    "leaflet.offline": "^2.1.0",            // Offline tile storage
    "localforage": "^1.10.0",               // IndexedDB wrapper

    // Plugins
    "leaflet-polylinedecorator": "^1.6.0",  // Route arrows
    "leaflet.markercluster": "^1.5.3",      // Port clustering
    "leaflet-draw": "^1.0.4",               // Drawing tools
    "leaflet-measure": "^3.1.0"             // Distance measurement
  }
}
```

---

## 🗺️ Tile Kaynakları (Ücretsiz + Offline)

### 1. **OpenStreetMap** - Base Layer
```typescript
// Free, no API key needed
const osmLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors',
  maxZoom: 19
});
```

**Avantajlar**:
- ✅ Ücretsiz, sınırsız
- ✅ Dünya çapında coverage
- ✅ Offline cache edilebilir
- ✅ API key gerektirmez

### 2. **OpenSeaMap** - Nautical Overlay
```typescript
// Marine navigation layer (buoys, lighthouses, depth contours)
const seamapLayer = L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', {
  attribution: '© OpenSeaMap contributors',
  maxZoom: 18,
  opacity: 0.7
});
```

**İçerik**:
- ⚓ Limanlar ve şamandıralar
- 🔦 Deniz fenerleri
- 📏 Derinlik konturları
- 🚢 Deniz yolları
- ⚠️ Tehlike bölgeleri

### 3. **EMODnet Bathymetry** - Depth Data
```typescript
// Real bathymetry tiles (Mediterranean + European waters)
const bathymetryLayer = L.tileLayer('https://tiles.emodnet-bathymetry.eu/2020/baselayer/inspire_quad/{z}/{x}/{y}.png', {
  attribution: '© EMODnet Bathymetry',
  maxZoom: 12,
  opacity: 0.6
});
```

**Avantajlar**:
- ✅ Gerçek derinlik verisi (görsel)
- ✅ Akdeniz + Karadeniz tam kapsamı
- ✅ Ücretsiz WMS tiles
- ✅ Offline cache edilebilir

### 4. **ESRI Satellite** - Satellite View (Optional)
```typescript
const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: '© Esri',
  maxZoom: 18
});
```

---

## 🚀 Implementation

### 1. Base Map Component

**`client/src/components/LeafletMap.tsx`**:

```typescript
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';

// Fix default marker icons (Leaflet bug workaround)
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

interface LeafletMapProps {
  center?: [number, number];
  zoom?: number;
  route?: Array<{ lat: number; lon: number }>;
  startPort?: { lat: number; lon: number; name: string };
  endPort?: { lat: number; lon: number; name: string };
  showBathymetry?: boolean;
  showSeaMap?: boolean;
}

export function LeafletMap({
  center = [40, 20], // Mediterranean center
  zoom = 6,
  route,
  startPort,
  endPort,
  showBathymetry = false,
  showSeaMap = true
}: LeafletMapProps) {
  const mapRef = useRef<L.Map | null>(null);

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      style={{ height: '600px', width: '100%' }}
      ref={mapRef}
    >
      {/* Base Layer: OpenStreetMap */}
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        maxZoom={19}
      />

      {/* OpenSeaMap Layer (Nautical) */}
      {showSeaMap && (
        <TileLayer
          url="https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png"
          attribution='&copy; <a href="http://www.openseamap.org">OpenSeaMap</a>'
          maxZoom={18}
          opacity={0.7}
        />
      )}

      {/* Bathymetry Layer */}
      {showBathymetry && (
        <TileLayer
          url="https://tiles.emodnet-bathymetry.eu/2020/baselayer/inspire_quad/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.emodnet-bathymetry.eu/">EMODnet Bathymetry</a>'
          maxZoom={12}
          opacity={0.6}
        />
      )}

      {/* Start Port Marker */}
      {startPort && (
        <Marker
          position={[startPort.lat, startPort.lon]}
          icon={L.divIcon({
            className: 'custom-marker',
            html: `<div class="w-6 h-6 bg-green-500 rounded-full border-2 border-white shadow-lg"></div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          })}
        />
      )}

      {/* End Port Marker */}
      {endPort && (
        <Marker
          position={[endPort.lat, endPort.lon]}
          icon={L.divIcon({
            className: 'custom-marker',
            html: `<div class="w-6 h-6 bg-red-500 rounded-full border-2 border-white shadow-lg"></div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          })}
        />
      )}

      {/* Route Polyline */}
      {route && route.length > 0 && (
        <Polyline
          positions={route.map(p => [p.lat, p.lon])}
          color="#22c55e"
          weight={4}
          opacity={0.8}
        />
      )}

      {/* Auto Bounds */}
      {route && <AutoBounds route={route} />}
    </MapContainer>
  );
}

// Auto-fit bounds to route
function AutoBounds({ route }: { route: Array<{ lat: number; lon: number }> }) {
  const map = useMap();

  useEffect(() => {
    if (route.length > 0) {
      const bounds = L.latLngBounds(route.map(p => [p.lat, p.lon]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [route, map]);

  return null;
}
```

---

### 2. Offline Tile Caching

**`client/src/lib/offlineTiles.ts`**:

```typescript
import L from 'leaflet';
import localforage from 'localforage';

// IndexedDB store for tiles
const tileStore = localforage.createInstance({
  name: 'maritime-tiles',
  storeName: 'tiles'
});

/**
 * Offline-capable tile layer
 * Downloads and caches tiles for offline use
 */
export class OfflineTileLayer extends L.TileLayer {
  async createTile(coords: L.Coords, done: L.DoneCallback): Promise<HTMLElement> {
    const tile = document.createElement('img');
    const url = this.getTileUrl(coords);
    const key = `${coords.z}/${coords.x}/${coords.y}`;

    try {
      // Try to load from IndexedDB cache first
      const cachedBlob = await tileStore.getItem<Blob>(key);

      if (cachedBlob) {
        // Use cached tile
        tile.src = URL.createObjectURL(cachedBlob);
        console.log(`[Offline] Loaded tile from cache: ${key}`);
      } else {
        // Download tile
        const response = await fetch(url);
        const blob = await response.blob();

        // Cache for offline use
        await tileStore.setItem(key, blob);

        tile.src = URL.createObjectURL(blob);
        console.log(`[Offline] Downloaded and cached tile: ${key}`);
      }

      done(null, tile);
    } catch (error) {
      console.error(`[Offline] Failed to load tile ${key}:`, error);
      done(error as Error, tile);
    }

    return tile;
  }
}

/**
 * Pre-download tiles for a bounding box
 * Call this before going offline
 */
export async function prefetchTiles(
  bounds: L.LatLngBounds,
  minZoom: number,
  maxZoom: number,
  tileUrl: string
): Promise<void> {
  const tiles: string[] = [];

  // Calculate all tile coordinates in bounds
  for (let z = minZoom; z <= maxZoom; z++) {
    const nwTile = latLngToTile(bounds.getNorthWest(), z);
    const seTile = latLngToTile(bounds.getSouthEast(), z);

    for (let x = nwTile.x; x <= seTile.x; x++) {
      for (let y = nwTile.y; y <= seTile.y; y++) {
        tiles.push(`${z}/${x}/${y}`);
      }
    }
  }

  console.log(`[Offline] Pre-fetching ${tiles.length} tiles...`);

  let downloaded = 0;
  for (const tile of tiles) {
    const [z, x, y] = tile.split('/').map(Number);
    const url = L.Util.template(tileUrl, { z, x, y });
    const key = tile;

    // Skip if already cached
    const cached = await tileStore.getItem(key);
    if (cached) continue;

    try {
      const response = await fetch(url);
      const blob = await response.blob();
      await tileStore.setItem(key, blob);
      downloaded++;

      if (downloaded % 10 === 0) {
        console.log(`[Offline] Downloaded ${downloaded}/${tiles.length} tiles`);
      }
    } catch (error) {
      console.error(`[Offline] Failed to download tile ${key}:`, error);
    }

    // Rate limiting (avoid overwhelming server)
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  console.log(`[Offline] Pre-fetch completed! ${downloaded} new tiles downloaded.`);
}

function latLngToTile(latLng: L.LatLng, zoom: number) {
  const x = Math.floor(((latLng.lng + 180) / 360) * Math.pow(2, zoom));
  const y = Math.floor(
    ((1 - Math.log(Math.tan((latLng.lat * Math.PI) / 180) + 1 / Math.cos((latLng.lat * Math.PI) / 180)) / Math.PI) / 2) *
      Math.pow(2, zoom)
  );
  return { x, y };
}

/**
 * Clear all cached tiles
 */
export async function clearTileCache(): Promise<void> {
  await tileStore.clear();
  console.log('[Offline] Tile cache cleared');
}

/**
 * Get cache statistics
 */
export async function getCacheStats() {
  const keys = await tileStore.keys();
  return {
    count: keys.length,
    estimatedSizeMB: (keys.length * 15) / 1024 // ~15KB per tile average
  };
}
```

---

### 3. Route Visualization with Depth Info

**Waypoint markers with depth tooltips**:

```typescript
import { Marker, Tooltip } from 'react-leaflet';
import { checkDepth } from '@/lib/bathymetry'; // Your ERDDAP API

function RouteWaypoints({ route }: { route: Array<{ lat: number; lon: number }> }) {
  return (
    <>
      {route.map((point, i) => {
        const depth = checkDepth(point.lat, point.lon); // Real NOAA data!

        return (
          <Marker
            key={i}
            position={[point.lat, point.lon]}
            icon={L.divIcon({
              className: 'waypoint-marker',
              html: `<div class="w-4 h-4 bg-blue-500 rounded-full border border-white"></div>`,
              iconSize: [16, 16],
              iconAnchor: [8, 8]
            })}
          >
            <Tooltip permanent={false}>
              <div>
                <strong>Waypoint {i + 1}</strong><br />
                Depth: {depth}m<br />
                {point.lat.toFixed(4)}, {point.lon.toFixed(4)}
              </div>
            </Tooltip>
          </Marker>
        );
      })}
    </>
  );
}
```

---

## 🎨 Layer Control (User Toggle)

```typescript
import { LayersControl, TileLayer } from 'react-leaflet';

function MapWithLayers() {
  return (
    <MapContainer>
      <LayersControl position="topright">
        {/* Base Layers */}
        <LayersControl.BaseLayer checked name="OpenStreetMap">
          <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
        </LayersControl.BaseLayer>

        <LayersControl.BaseLayer name="Satellite">
          <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
        </LayersControl.BaseLayer>

        {/* Overlays */}
        <LayersControl.Overlay checked name="OpenSeaMap (Nautical)">
          <TileLayer
            url="https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png"
            opacity={0.7}
          />
        </LayersControl.Overlay>

        <LayersControl.Overlay name="Bathymetry (Depth)">
          <TileLayer
            url="https://tiles.emodnet-bathymetry.eu/2020/baselayer/inspire_quad/{z}/{x}/{y}.png"
            opacity={0.6}
          />
        </LayersControl.Overlay>
      </LayersControl>
    </MapContainer>
  );
}
```

---

## 📥 Offline Download UI

**Download manager component**:

```typescript
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useState } from 'react';
import { prefetchTiles, getCacheStats } from '@/lib/offlineTiles';

export function OfflineDownloadPanel() {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState({ count: 0, estimatedSizeMB: 0 });

  const downloadMediterranean = async () => {
    setDownloading(true);

    // Mediterranean bounds
    const bounds = L.latLngBounds(
      [30, 5],   // SW corner
      [46, 37]   // NE corner
    );

    await prefetchTiles(
      bounds,
      5,  // min zoom (overview)
      10, // max zoom (detailed)
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
    );

    // Also download OpenSeaMap
    await prefetchTiles(
      bounds,
      5,
      10,
      'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png'
    );

    const newStats = await getCacheStats();
    setStats(newStats);
    setDownloading(false);
  };

  return (
    <div className="p-4 border rounded">
      <h3 className="font-bold mb-2">Offline Map Cache</h3>
      <p className="text-sm text-muted-foreground mb-4">
        {stats.count} tiles cached (~{stats.estimatedSizeMB.toFixed(1)} MB)
      </p>

      <Button
        onClick={downloadMediterranean}
        disabled={downloading}
      >
        {downloading ? 'Downloading...' : 'Download Mediterranean Maps'}
      </Button>

      {downloading && <Progress value={progress} className="mt-2" />}
    </div>
  );
}
```

---

## 📊 Tile Size Estimates

| Region | Zoom Levels | Tile Count | Size |
|--------|-------------|------------|------|
| **Istanbul-Naples** | 5-12 | ~5,000 | ~75 MB |
| **Mediterranean** | 5-10 | ~50,000 | ~750 MB |
| **Black Sea** | 5-10 | ~15,000 | ~225 MB |
| **Full Europe** | 5-12 | ~500,000 | ~7.5 GB |

**Recommendation**: Download only active route bounds + 2° buffer

---

## ✅ Migration Checklist

### Phase 1: Basic Leaflet (1-2 hours)
- [ ] Install Leaflet dependencies
- [ ] Create LeafletMap component
- [ ] Replace Google Maps in RouteOptimization page
- [ ] Test route rendering

### Phase 2: Offline Support (2-3 hours)
- [ ] Implement OfflineTileLayer
- [ ] Add IndexedDB caching
- [ ] Create download manager UI
- [ ] Test offline functionality

### Phase 3: Features (2-4 hours)
- [ ] Add OpenSeaMap overlay
- [ ] Add EMODnet bathymetry overlay
- [ ] Add waypoint tooltips with depth
- [ ] Add layer control
- [ ] Port clustering (for port list)

### Phase 4: Optimization (1-2 hours)
- [ ] Lazy load tiles
- [ ] Compression (gzip tiles)
- [ ] Cache cleanup strategy
- [ ] Service Worker integration

---

## 🚀 Advantages of Leaflet System

### Technical
✅ **Zero API costs** (no Google Maps billing)
✅ **Offline-first** (works without internet)
✅ **Real nautical data** (OpenSeaMap)
✅ **Real bathymetry** (EMODnet tiles)
✅ **Lightweight** (40KB vs 150KB)
✅ **Fast** (cached tiles load instantly)

### Business
✅ **No vendor lock-in** (open source)
✅ **Privacy** (no tracking)
✅ **Customizable** (full control)
✅ **Maritime-focused** (purpose-built layers)

### User Experience
✅ **Works on ships** (no internet required)
✅ **Depth visualization** (color-coded bathymetry)
✅ **Nautical symbols** (buoys, lighthouses)
✅ **Faster** (local tiles)

---

## 🎯 Recommendation

**Migrate to Leaflet ASAP!**

Reasons:
1. **Current Google Maps limits**: API key, billing, online-only
2. **Maritime focus**: OpenSeaMap + EMODnet perfect for shipping
3. **Offline capability**: Critical for ships at sea
4. **Cost**: $0 vs potential Google Maps charges
5. **Better UX**: Real nautical data vs generic maps

**Implementation time**: ~8-12 hours total (1-2 days)

**Want me to start the migration?** I can:
1. Install Leaflet dependencies
2. Create the new map component
3. Implement offline caching
4. Add bathymetry overlay
5. Test with Istanbul-Naples route

Ready to go? 🚀

/**
 * LEAFLET + OPENSEAMAP ENTEGRASYONU
 *
 * Bu komponent Google Maps yerine Leaflet ve OpenSeaMap kullanır.
 * Özellikler:
 * - OpenSeaMap deniz haritası katmanı
 * - Offline tile caching desteği
 * - Rota çizimi (polyline)
 * - Derinlik görselleştirmesi
 * - Başlangıç/bitiş marker'ları
 * - Waypoint marker'ları
 */

import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { cn } from '@/lib/utils';

// Leaflet icon fix for bundlers
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

// Fix default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
});

// Types
export interface RoutePoint {
  lat: number;
  lon: number;
  depth?: number;
  weather?: {
    windSpeed?: number;
    waveHeight?: number;
  };
}

export interface SeaMapHandle {
  map: L.Map | null;
  setRoute: (path: RoutePoint[]) => void;
  setStartMarker: (lat: number, lon: number, label?: string) => void;
  setEndMarker: (lat: number, lon: number, label?: string) => void;
  fitBounds: (bounds: L.LatLngBoundsExpression) => void;
  clearRoute: () => void;
  addDepthMarker: (lat: number, lon: number, depth: number) => void;
  panTo: (lat: number, lon: number) => void;
}

interface SeaMapViewProps {
  className?: string;
  initialCenter?: { lat: number; lng: number };
  initialZoom?: number;
  onMapReady?: (handle: SeaMapHandle) => void;
  showDepthLayer?: boolean;
  showSeamarks?: boolean;
}

// Custom marker icons
const createCustomIcon = (color: string, size: number = 12) => {
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        width: ${size * 2}px;
        height: ${size * 2}px;
        background: ${color};
        border: 3px solid white;
        border-radius: 50%;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      "></div>
    `,
    iconSize: [size * 2, size * 2],
    iconAnchor: [size, size],
  });
};

const startIcon = createCustomIcon('#22c55e', 12); // Green
const endIcon = createCustomIcon('#ef4444', 12); // Red
const waypointIcon = createCustomIcon('#3b82f6', 6); // Blue, smaller

// Ship icon for route animation
const shipIcon = L.divIcon({
  className: 'ship-marker',
  html: `
    <div style="
      font-size: 24px;
      text-shadow: 0 2px 4px rgba(0,0,0,0.3);
    ">🚢</div>
  `,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

// Tile layer configurations
const TILE_LAYERS = {
  // Base map - OpenStreetMap
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    },
  },
  // OpenSeaMap nautical layer (overlay)
  seamap: {
    url: 'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png',
    options: {
      attribution: '&copy; <a href="http://www.openseamap.org">OpenSeaMap</a> contributors',
      maxZoom: 18,
    },
  },
  // CartoDB dark (for better sea visibility)
  cartoDark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    options: {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20,
    },
  },
  // ESRI Ocean Basemap
  esriOcean: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
    options: {
      attribution: 'Tiles &copy; Esri &mdash; Sources: GEBCO, NOAA, CHS, OSU, UNH, CSUMB, National Geographic, DeLorme, NAVTEQ, and Esri',
      maxZoom: 13,
    },
  },
  // Stamen Terrain (good land visibility)
  terrain: {
    url: 'https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}{r}.png',
    options: {
      attribution: '&copy; <a href="https://www.stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://www.stamen.com/" target="_blank">Stamen Design</a>',
      maxZoom: 18,
    },
  },
};

// IndexedDB for offline tile storage
const DB_NAME = 'seamap-tiles-cache';
const DB_VERSION = 1;
const STORE_NAME = 'tiles';

class TileCache {
  private db: IDBDatabase | null = null;
  private dbReady: Promise<void>;

  constructor() {
    this.dbReady = this.initDB();
  }

  private async initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
    });
  }

  async getTile(key: string): Promise<Blob | null> {
    await this.dbReady;
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async setTile(key: string, blob: Blob): Promise<void> {
    await this.dbReady;
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(blob, key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async clearCache(): Promise<void> {
    await this.dbReady;
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
}

// Custom tile layer with caching
class CachedTileLayer extends L.TileLayer {
  private cache: TileCache;
  private urlTemplate: string;

  constructor(urlTemplate: string, options?: L.TileLayerOptions) {
    super(urlTemplate, options);
    this.cache = new TileCache();
    this.urlTemplate = urlTemplate;
  }

  createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const tile = document.createElement('img');
    const url = this.getTileUrl(coords);
    const cacheKey = `${coords.z}-${coords.x}-${coords.y}-${this.urlTemplate}`;

    // Try to load from cache first
    this.cache.getTile(cacheKey).then(async (cachedBlob) => {
      if (cachedBlob) {
        tile.src = URL.createObjectURL(cachedBlob);
        done(undefined, tile);
      } else {
        // Fetch and cache
        try {
          const response = await fetch(url);
          if (response.ok) {
            const blob = await response.blob();
            tile.src = URL.createObjectURL(blob);
            // Cache in background
            this.cache.setTile(cacheKey, blob).catch(console.warn);
            done(undefined, tile);
          } else {
            done(new Error('Tile load failed'), tile);
          }
        } catch (error) {
          // Offline - tile not available
          done(error as Error, tile);
        }
      }
    }).catch(() => {
      // Fallback to normal loading
      tile.src = url;
      tile.onload = () => done(undefined, tile);
      tile.onerror = () => done(new Error('Tile load failed'), tile);
    });

    return tile;
  }
}

export const SeaMapView = forwardRef<SeaMapHandle, SeaMapViewProps>(({
  className,
  initialCenter = { lat: 40.0, lng: 25.0 }, // Aegean Sea default
  initialZoom = 6,
  onMapReady,
  showDepthLayer = true,
  showSeamarks = true,
}, ref) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const startMarkerRef = useRef<L.Marker | null>(null);
  const endMarkerRef = useRef<L.Marker | null>(null);
  const waypointMarkersRef = useRef<L.Marker[]>([]);
  const depthMarkersRef = useRef<L.CircleMarker[]>([]);
  const [isReady, setIsReady] = useState(false);

  // Create handle for parent component
  const handle: SeaMapHandle = {
    get map() { return mapRef.current; },

    setRoute: (path: RoutePoint[]) => {
      if (!mapRef.current) return;

      // Clear existing route
      if (routeLayerRef.current) {
        routeLayerRef.current.remove();
      }
      waypointMarkersRef.current.forEach(m => m.remove());
      waypointMarkersRef.current = [];

      if (path.length < 2) return;

      const coords = path.map(p => [p.lat, p.lon] as L.LatLngTuple);

      // Main route line
      routeLayerRef.current = L.polyline(coords, {
        color: '#22c55e',
        weight: 5,
        opacity: 0.8,
        lineJoin: 'round',
        lineCap: 'round',
      }).addTo(mapRef.current);

      // Add route shadow for better visibility
      L.polyline(coords, {
        color: '#000000',
        weight: 8,
        opacity: 0.2,
        lineJoin: 'round',
        lineCap: 'round',
      }).addTo(mapRef.current).bringToBack();

      // Add waypoint markers (every 5th point)
      path.forEach((point, index) => {
        if (index > 0 && index < path.length - 1 && index % 5 === 0) {
          const marker = L.marker([point.lat, point.lon], { icon: waypointIcon })
            .addTo(mapRef.current!)
            .bindPopup(`
              <div style="text-align: center;">
                <strong>Waypoint ${index}</strong><br/>
                ${point.lat.toFixed(4)}°, ${point.lon.toFixed(4)}°
                ${point.depth ? `<br/>Derinlik: ${Math.abs(point.depth).toFixed(0)}m` : ''}
              </div>
            `);
          waypointMarkersRef.current.push(marker);
        }
      });

      // Fit map to route
      mapRef.current.fitBounds(routeLayerRef.current.getBounds(), { padding: [50, 50] });
    },

    setStartMarker: (lat: number, lon: number, label?: string) => {
      if (!mapRef.current) return;

      if (startMarkerRef.current) {
        startMarkerRef.current.setLatLng([lat, lon]);
        if (label) {
          startMarkerRef.current.bindPopup(`<strong>Başlangıç:</strong> ${label}`);
        }
      } else {
        startMarkerRef.current = L.marker([lat, lon], { icon: startIcon })
          .addTo(mapRef.current)
          .bindPopup(`<strong>Başlangıç:</strong> ${label || 'Kalkış Noktası'}`);
      }
    },

    setEndMarker: (lat: number, lon: number, label?: string) => {
      if (!mapRef.current) return;

      if (endMarkerRef.current) {
        endMarkerRef.current.setLatLng([lat, lon]);
        if (label) {
          endMarkerRef.current.bindPopup(`<strong>Varış:</strong> ${label}`);
        }
      } else {
        endMarkerRef.current = L.marker([lat, lon], { icon: endIcon })
          .addTo(mapRef.current)
          .bindPopup(`<strong>Varış:</strong> ${label || 'Varış Noktası'}`);
      }
    },

    fitBounds: (bounds: L.LatLngBoundsExpression) => {
      mapRef.current?.fitBounds(bounds, { padding: [50, 50] });
    },

    clearRoute: () => {
      routeLayerRef.current?.remove();
      routeLayerRef.current = null;
      waypointMarkersRef.current.forEach(m => m.remove());
      waypointMarkersRef.current = [];
      depthMarkersRef.current.forEach(m => m.remove());
      depthMarkersRef.current = [];
    },

    addDepthMarker: (lat: number, lon: number, depth: number) => {
      if (!mapRef.current) return;

      // Color based on depth (negative values = underwater)
      const absDepth = Math.abs(depth);
      let color: string;
      if (absDepth < 20) color = '#ef4444'; // Red - dangerous
      else if (absDepth < 50) color = '#f97316'; // Orange - shallow
      else if (absDepth < 100) color = '#eab308'; // Yellow - moderate
      else if (absDepth < 500) color = '#22c55e'; // Green - safe
      else color = '#3b82f6'; // Blue - deep

      const marker = L.circleMarker([lat, lon], {
        radius: 6,
        fillColor: color,
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8,
      })
        .addTo(mapRef.current)
        .bindPopup(`<strong>Derinlik:</strong> ${absDepth.toFixed(0)}m`);

      depthMarkersRef.current.push(marker);
    },

    panTo: (lat: number, lon: number) => {
      mapRef.current?.panTo([lat, lon]);
    },
  };

  // Expose handle via ref
  useImperativeHandle(ref, () => handle, []);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    // Create map
    const map = L.map(mapContainer.current, {
      center: [initialCenter.lat, initialCenter.lng],
      zoom: initialZoom,
      zoomControl: true,
      attributionControl: true,
    });

    mapRef.current = map;

    // Add base layer with caching
    const baseLayer = new CachedTileLayer(TILE_LAYERS.osm.url, TILE_LAYERS.osm.options);
    baseLayer.addTo(map);

    // Add ESRI Ocean layer for better sea visualization
    const oceanLayer = new CachedTileLayer(TILE_LAYERS.esriOcean.url, {
      ...TILE_LAYERS.esriOcean.options,
      opacity: 0.7,
    });
    oceanLayer.addTo(map);

    // Add OpenSeaMap seamark layer if enabled
    if (showSeamarks) {
      const seamarkLayer = new CachedTileLayer(TILE_LAYERS.seamap.url, TILE_LAYERS.seamap.options);
      seamarkLayer.addTo(map);
    }

    // Add layer control
    const baseLayers = {
      'OpenStreetMap': baseLayer,
      'Okyanus': oceanLayer,
    };

    const overlays: Record<string, L.Layer> = {};
    if (showSeamarks) {
      overlays['Deniz İşaretleri'] = new CachedTileLayer(TILE_LAYERS.seamap.url, TILE_LAYERS.seamap.options);
    }

    L.control.layers(baseLayers, overlays, { position: 'topright' }).addTo(map);

    // Add scale control
    L.control.scale({
      metric: true,
      imperial: true,
      position: 'bottomleft'
    }).addTo(map);

    // Add depth legend
    const legend = new L.Control({ position: 'bottomright' });
    legend.onAdd = () => {
      const div = L.DomUtil.create('div', 'leaflet-control-layers leaflet-control');
      div.innerHTML = `
        <div style="padding: 8px; background: white; border-radius: 4px; box-shadow: 0 2px 6px rgba(0,0,0,0.2);">
          <div style="font-weight: bold; margin-bottom: 4px; font-size: 11px;">Derinlik Göstergesi</div>
          <div style="display: flex; align-items: center; gap: 4px; font-size: 10px;">
            <span style="width: 12px; height: 12px; background: #ef4444; border-radius: 50%;"></span>
            <span>&lt;20m (Tehlikeli)</span>
          </div>
          <div style="display: flex; align-items: center; gap: 4px; font-size: 10px;">
            <span style="width: 12px; height: 12px; background: #f97316; border-radius: 50%;"></span>
            <span>20-50m (Sığ)</span>
          </div>
          <div style="display: flex; align-items: center; gap: 4px; font-size: 10px;">
            <span style="width: 12px; height: 12px; background: #eab308; border-radius: 50%;"></span>
            <span>50-100m (Orta)</span>
          </div>
          <div style="display: flex; align-items: center; gap: 4px; font-size: 10px;">
            <span style="width: 12px; height: 12px; background: #22c55e; border-radius: 50%;"></span>
            <span>100-500m (Güvenli)</span>
          </div>
          <div style="display: flex; align-items: center; gap: 4px; font-size: 10px;">
            <span style="width: 12px; height: 12px; background: #3b82f6; border-radius: 50%;"></span>
            <span>&gt;500m (Derin)</span>
          </div>
        </div>
      `;
      return div;
    };
    legend.addTo(map);

    setIsReady(true);

    // Cleanup
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Notify parent when ready
  useEffect(() => {
    if (isReady && onMapReady) {
      onMapReady(handle);
    }
  }, [isReady, onMapReady]);

  return (
    <div
      ref={mapContainer}
      className={cn('w-full h-[500px] rounded-lg overflow-hidden', className)}
      style={{ background: '#a5bfdd' }} // Sea color while loading
    />
  );
});

SeaMapView.displayName = 'SeaMapView';

// Utility functions for route visualization
export function calculateRouteStats(path: RoutePoint[]) {
  if (path.length < 2) return { distance: 0, minDepth: 0, avgDepth: 0 };

  let totalDistance = 0;
  let minDepth = Infinity;
  let totalDepth = 0;
  let depthCount = 0;

  for (let i = 0; i < path.length - 1; i++) {
    const p1 = path[i];
    const p2 = path[i + 1];

    // Haversine distance
    const R = 6371; // km
    const dLat = (p2.lat - p1.lat) * Math.PI / 180;
    const dLon = (p2.lon - p1.lon) * Math.PI / 180;
    const a =
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    totalDistance += R * c;

    if (p1.depth !== undefined) {
      const absDepth = Math.abs(p1.depth);
      minDepth = Math.min(minDepth, absDepth);
      totalDepth += absDepth;
      depthCount++;
    }
  }

  return {
    distance: totalDistance,
    minDepth: minDepth === Infinity ? 0 : minDepth,
    avgDepth: depthCount > 0 ? totalDepth / depthCount : 0,
  };
}

export default SeaMapView;

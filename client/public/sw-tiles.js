/**
 * Service Worker for Offline Tile Caching
 *
 * Bu service worker, harita tile'larını cache'leyerek offline çalışmayı sağlar.
 * OpenSeaMap, OpenStreetMap ve ESRI Ocean tile'larını destekler.
 */

const CACHE_NAME = 'seamap-tiles-v1';
const TILE_DOMAINS = [
  'tile.openstreetmap.org',
  'tiles.openseamap.org',
  'basemaps.cartocdn.com',
  'server.arcgisonline.com',
  'tiles.stadiamaps.com',
];

// Cache duration (7 days)
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000;

// Install event
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker');
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('seamap-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch event - intercept tile requests
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Check if this is a tile request
  const isTileRequest = TILE_DOMAINS.some((domain) => url.hostname.includes(domain));

  if (isTileRequest) {
    event.respondWith(handleTileRequest(event.request));
  }
});

async function handleTileRequest(request) {
  const cache = await caches.open(CACHE_NAME);

  // Try to get from cache first
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    // Check if cache is still valid
    const cachedTime = cachedResponse.headers.get('sw-cached-time');
    if (cachedTime) {
      const age = Date.now() - parseInt(cachedTime, 10);
      if (age < CACHE_DURATION) {
        console.log('[SW] Returning cached tile:', request.url);
        return cachedResponse;
      }
    }
  }

  // Fetch from network
  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      // Clone the response and add timestamp header
      const responseToCache = networkResponse.clone();
      const headers = new Headers(responseToCache.headers);
      headers.set('sw-cached-time', Date.now().toString());

      const cachedResponseWithTime = new Response(await responseToCache.blob(), {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers: headers,
      });

      // Cache the response
      cache.put(request, cachedResponseWithTime);
      console.log('[SW] Cached tile:', request.url);
    }

    return networkResponse;
  } catch (error) {
    // Network failed, return cached version if available
    if (cachedResponse) {
      console.log('[SW] Network failed, returning stale cache:', request.url);
      return cachedResponse;
    }

    // Return a placeholder tile
    return new Response(createPlaceholderTile(), {
      status: 200,
      headers: { 'Content-Type': 'image/png' },
    });
  }
}

// Create a simple placeholder tile for offline mode
function createPlaceholderTile() {
  // 1x1 transparent PNG
  const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Message handler for cache operations
self.addEventListener('message', (event) => {
  const { type, data } = event.data;

  switch (type) {
    case 'CLEAR_CACHE':
      caches.delete(CACHE_NAME).then(() => {
        event.ports[0].postMessage({ success: true });
      });
      break;

    case 'GET_CACHE_SIZE':
      getCacheSize().then((size) => {
        event.ports[0].postMessage({ size });
      });
      break;

    case 'PREFETCH_TILES':
      prefetchTiles(data.urls).then((count) => {
        event.ports[0].postMessage({ count });
      });
      break;
  }
});

async function getCacheSize() {
  const cache = await caches.open(CACHE_NAME);
  const keys = await cache.keys();
  let totalSize = 0;

  for (const request of keys) {
    const response = await cache.match(request);
    if (response) {
      const blob = await response.blob();
      totalSize += blob.size;
    }
  }

  return totalSize;
}

async function prefetchTiles(urls) {
  const cache = await caches.open(CACHE_NAME);
  let count = 0;

  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        await cache.put(url, response);
        count++;
      }
    } catch (error) {
      console.warn('[SW] Failed to prefetch:', url);
    }
  }

  return count;
}

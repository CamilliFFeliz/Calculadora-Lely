const CACHE_NAME = "lely-sublimacao-v1.0.10-order-slip";
const APP_CACHE_PREFIX = "lely-sublimacao-";
const APP_SHELL_URL = "./index.html";
const RUNTIME_CACHE_NAME = "lely-sublimacao-runtime-v1.0.10-order-slip";
const LUCIDE_CDN_URL = "https://unpkg.com/lucide@0.468.0/dist/umd/lucide.min.js";
const JSPDF_CDN_URL = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
const EXTERNAL_ASSET_URLS = [
  LUCIDE_CDN_URL,
  JSPDF_CDN_URL
];
const APP_ASSETS = [
  "./",
  APP_SHELL_URL,
  "./style.css",
  "./app.js",
  "./js/main.js",
  "./js/dom.js",
  "./js/state.js",
  "./js/budget.js",
  "./js/inventory.js",
  "./js/pdf.js",
  "./js/pwa.js",
  "./js/utils.js",
  "./manifest.json",
  "./manifest.webmanifest",
  "./sw.js",
  "./icons/icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(cacheApplicationShell());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(deleteOldCaches());
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (!request || request.method !== "GET") {
    return;
  }

  event.respondWith(handleRequest(request));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

/**
 * Stores the local application shell for instant startup and offline access.
 * @returns {Promise<void>} Resolves when the shell cache is refreshed.
 */
async function cacheApplicationShell() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(APP_ASSETS);
  await Promise.all(EXTERNAL_ASSET_URLS.map(cacheExternalAsset));
}

/**
 * Attempts to cache an approved external asset without blocking installation.
 * @param {string} assetUrl - External asset URL.
 * @returns {Promise<void>} Resolves even when the external CDN is unavailable.
 */
async function cacheExternalAsset(assetUrl) {
  try {
    const response = await fetch(assetUrl, { mode: "cors" });

    if (response && response.ok) {
      const cache = await caches.open(RUNTIME_CACHE_NAME);
      await cache.put(assetUrl, response);
    }
  } catch {
  }
}

/**
 * Removes stale caches while preserving the current shell and runtime icon cache.
 * @returns {Promise<void>} Resolves when outdated caches are deleted.
 */
async function deleteOldCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames
      .filter((cacheName) => cacheName.startsWith(APP_CACHE_PREFIX) && ![CACHE_NAME, RUNTIME_CACHE_NAME].includes(cacheName))
      .map((cacheName) => caches.delete(cacheName))
  );
}

/**
 * Routes navigation, local assets and approved external assets through cache strategies.
 * @param {Request} request - Incoming fetch request.
 * @returns {Promise<Response>} Resolved response from cache or network.
 */
async function handleRequest(request) {
  if (request.mode === "navigate") {
    return getNavigationResponse(request);
  }

  const requestUrl = new URL(request.url);

  if (requestUrl.origin !== self.location.origin) {
    return getExternalAssetResponse(request, requestUrl);
  }

  return getCachedAssetResponse(request);
}

/**
 * Caches Lucide icon assets at runtime without affecting unrelated external requests.
 * @param {Request} request - External asset request.
 * @param {URL} requestUrl - Parsed request URL.
 * @returns {Promise<Response>} Cached or network response.
 */
async function getExternalAssetResponse(request, requestUrl) {
  if (!EXTERNAL_ASSET_URLS.includes(requestUrl.href)) {
    return fetch(request);
  }

  const cachedResponse = await caches.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  const networkResponse = await fetch(request);

  if (networkResponse && networkResponse.ok) {
    const cache = await caches.open(RUNTIME_CACHE_NAME);
    await cache.put(request, networkResponse.clone());
  }

  return networkResponse;
}

/**
 * Uses a network-first strategy for SPA navigation with app shell fallback.
 * @param {Request} request - Navigation request.
 * @returns {Promise<Response>} Network page or cached app shell.
 */
async function getNavigationResponse(request) {
  try {
    const networkResponse = await fetch(request);

    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(APP_SHELL_URL, networkResponse.clone());
    }

    return networkResponse;
  } catch {
    const cachedResponse = await caches.match(APP_SHELL_URL);
    return cachedResponse || Response.error();
  }
}

/**
 * Uses cache-first strategy for local static assets.
 * @param {Request} request - Local asset request.
 * @returns {Promise<Response>} Cached asset, network response or app shell fallback.
 */
async function getCachedAssetResponse(request) {
  const cachedResponse = await caches.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);

    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch {
    const shellResponse = await caches.match(APP_SHELL_URL);
    return shellResponse || Response.error();
  }
}

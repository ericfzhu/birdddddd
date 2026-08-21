const CACHE_NAME = "birdddddd-pwa-v1";
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icons/birdddddd-180.png",
  "/icons/birdddddd-192.png",
  "/icons/birdddddd-512.png",
  "/icons/birdddddd-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_URLS" || !Array.isArray(event.data.urls)) return;
  const urls = [...new Set(event.data.urls)].filter((value) => {
    try {
      return new URL(value, self.location.origin).origin === self.location.origin;
    } catch {
      return false;
    }
  });
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.allSettled(urls.map((url) => cache.add(url))))
      .then((results) => {
        const failed = results.filter((result) => result.status === "rejected").length;
        event.ports[0]?.postMessage({ cached: results.length - failed, failed });
      }),
  );
});

async function cacheResponse(request, response) {
  if (response.ok && response.type === "basic") {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    } catch (error) {
      console.warn("birdddddd could not cache a response for offline play.", error);
    }
  }
  return response;
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put("/", response.clone());
      } catch (error) {
        console.warn("birdddddd could not refresh its offline app shell.", error);
      }
    }
    return response;
  } catch {
    return (await caches.match(request, { ignoreVary: true }))
      ?? (await caches.match("/", { ignoreVary: true }))
      ?? Response.error();
  }
}

async function cacheFirstAsset(request) {
  const cached = await caches.match(request, { ignoreVary: true });
  if (cached) return cached;
  return cacheResponse(request, await fetch(request));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    request.mode === "navigate"
      ? networkFirstNavigation(request)
      : cacheFirstAsset(request),
  );
});

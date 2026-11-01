/* J-SCHOOLS service worker. __BUILD_ID__ is replaced at build time, so every release gets a new worker. */
const BUILD = "__BUILD_ID__";
const SHELL_CACHE = `j-schools-shell-${BUILD}`;
const ASSET_CACHE = "j-schools-assets";
const SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  // No skipWaiting here: the app shows "Update available" and the user chooses when to switch.
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)).catch(() => undefined));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("j-schools-shell-") && key !== SHELL_CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data && event.data.type === "GET_VERSION") event.source && event.source.postMessage({ type: "VERSION", build: BUILD });
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;           // fonts, Supabase etc. go straight to the network
  if (url.pathname.startsWith("/api/")) return;              // live school data is never cached here

  if (request.mode === "navigate") {
    // Network first so a new release is picked up; fall back to the cached shell when offline.
    event.respondWith(fetch(request).then((response) => {
      const copy = response.clone();
      caches.open(SHELL_CACHE).then((cache) => cache.put("/", copy));
      return response;
    }).catch(() => caches.match("/").then((hit) => hit || Response.error())));
    return;
  }

  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/")) {
    // Built files have a hash in their name, so cached copies are always correct.
    event.respondWith(caches.open(ASSET_CACHE).then(async (cache) => {
      const hit = await cache.match(request);
      if (hit) return hit;
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    }));
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/marks";
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) { await client.focus(); if ("navigate" in client) { try { await client.navigate(target); } catch (e) {} } return; }
    }
    await self.clients.openWindow(target);
  })());
});

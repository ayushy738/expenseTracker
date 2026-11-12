"use strict";

const CACHE_NAME = "deposit-flow-static-v2";
const STATIC_PATH = /^\/_next\/static\//;
const ICON_PATH = /^\/icons\//;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith("deposit-flow-static-") && key !== CACHE_NAME).map((key) => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Deliberately use a static-asset allowlist. Documents, RSC requests, API
  // routes, authentication, and every user-specific response pass untouched
  // to the browser's normal network stack.
  if (!STATIC_PATH.test(url.pathname) && !ICON_PATH.test(url.pathname)) return;
  event.respondWith(caches.open(CACHE_NAME).then(async (cache) => {
    try {
      const response = await fetch(request);
      if (response.ok && response.type === "basic") await cache.put(request, response.clone());
      return response;
    } catch {
      return (await cache.match(request)) || Response.error();
    }
  }));
});

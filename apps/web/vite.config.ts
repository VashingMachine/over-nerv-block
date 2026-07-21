import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

const buildManifest = {
  status: "ready",
  app: "over-nerv-block",
  version: "0.1.0",
  environment: process.env.VITE_DEPLOY_ENV ?? "local",
  buildIdentifier: process.env.VITE_BUILD_ID ?? "development",
  schemaVersion: 1,
  processing: "browser-local",
} as const;

const manifestSource = `${JSON.stringify(buildManifest, null, 2)}\n`;

const buildManifestPlugin: Plugin = {
  name: "build-manifest",
  configureServer(server) {
    server.middlewares.use("/build-info.json", (_request, response) => {
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(manifestSource);
    });
  },
  generateBundle() {
    this.emitFile({
      type: "asset",
      fileName: "build-info.json",
      source: manifestSource,
    });
  },
};

const pwaCachePrefix = "over-nerv-block-shell-";
const publicPwaResources = [
  "audio/demo-pulse.wav",
  "icons/app-icon-192.png",
  "icons/app-icon-512.png",
  "manifest.webmanifest",
] as const;

function serviceWorkerSource(resources: readonly string[]): string {
  const buildIdentifier = buildManifest.buildIdentifier;
  const precacheUrls = Array.from(
    new Set(["./", "./index.html", ...resources.map((name) => `./${name}`)]),
  ).sort();
  return `const BUILD_ID = ${JSON.stringify(buildIdentifier)};
const CACHE_PREFIX = ${JSON.stringify(pwaCachePrefix)};
const CACHE_NAME = CACHE_PREFIX + BUILD_ID;
const PRECACHE_URLS = ${JSON.stringify(precacheUrls, null, 2)};

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    event.waitUntil(self.skipWaiting());
    return;
  }
  if (event.data?.type === "CACHE_STATUS") {
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE_NAME);
      const keys = await cache.keys();
      const cached = new Set(keys.map((request) => new URL(request.url).pathname));
      const ready = PRECACHE_URLS.every((resource) => {
        const expected = new URL(resource, self.registration.scope).pathname;
        return cached.has(expected);
      });
      event.ports[0]?.postMessage({
        type: "CACHE_STATUS",
        buildIdentifier: BUILD_ID,
        cacheName: CACHE_NAME,
        ready,
      });
    })());
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const shellUrl = new URL("./index.html", self.registration.scope).href;
      return (await cache.match(shellUrl)) || fetch(request);
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreVary: true });
    return cached || fetch(request);
  })());
});
`;
}

const localPwaPlugin: Plugin = {
  name: "local-installable-pwa",
  apply: "build",
  generateBundle(_options, bundle) {
    const resources = [
      ...Object.keys(bundle).filter((name) => name !== "sw.js"),
      ...publicPwaResources,
    ];
    this.emitFile({
      type: "asset",
      fileName: "sw.js",
      source: serviceWorkerSource(resources),
    });
  },
};

export default defineConfig({
  base: "./",
  plugins: [react(), buildManifestPlugin, localPwaPlugin],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
});

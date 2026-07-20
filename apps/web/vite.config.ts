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

export default defineConfig({
  base: "./",
  plugins: [react(), buildManifestPlugin],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
});

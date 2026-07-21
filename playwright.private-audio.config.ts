import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/private-e2e",
  fullyParallel: false,
  retries: 0,
  reporter: "line",
  timeout: 150_000,
  expect: { timeout: 120_000 },
  outputDir: "test-results/private-audio",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:4176",
    screenshot: "off",
    trace: "off",
    video: "off",
  },
  webServer: {
    command:
      "npm run preview --workspace @rhythm-game/web -- --host 127.0.0.1 --port 4176",
    reuseExistingServer: false,
    timeout: 30_000,
    url: "http://127.0.0.1:4176",
  },
});

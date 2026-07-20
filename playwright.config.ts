import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl = process.env.E2E_BASE_URL;
const baseURL = externalBaseUrl ?? "http://127.0.0.1:4173";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["github"]] : "list",
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: externalBaseUrl
    ? undefined
    : [
        {
          command:
            "uv run --project services/api uvicorn app.main:app --app-dir services/api --host 127.0.0.1 --port 8000",
          reuseExistingServer: !process.env.CI,
          timeout: 30_000,
          url: "http://127.0.0.1:8000/api/health",
        },
        {
          command:
            "npm run preview --workspace @rhythm-game/web -- --host 127.0.0.1 --port 4173",
          reuseExistingServer: !process.env.CI,
          timeout: 30_000,
          url: baseURL,
        },
      ],
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
});

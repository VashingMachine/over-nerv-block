import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const ownedWave = readFileSync(
  path.resolve("apps/web/public/audio/demo-pulse.wav"),
);

async function expectNoWcagViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

async function waitForOfflineReady(page: Page) {
  await expect(page.getByText("Offline ready", { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

async function expectContained(page: Page) {
  const layout = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    outside: [
      ".topbar",
      ".hero",
      ".settings-grid",
      ".pwa-card",
      ".accessibility-card",
      ".local-audio",
      ".track-card",
      ".footer",
    ].filter((selector) => {
      const element = document.querySelector(selector);
      if (!element) return false;
      const bounds = element.getBoundingClientRect();
      return bounds.left < -0.5 || bounds.right > window.innerWidth + 0.5;
    }),
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
  expect(layout.outside).toEqual([]);
}

test("production shell exposes a valid local-install manifest and owned cache", async ({
  page,
}) => {
  await page.goto("./");
  await waitForOfflineReady(page);

  const contract = await page.evaluate(async () => {
    const link = document.querySelector<HTMLLinkElement>(
      'link[rel="manifest"]',
    );
    const response = await fetch(link!.href);
    const manifest = (await response.json()) as {
      name: string;
      short_name: string;
      start_url: string;
      scope: string;
      display: string;
      icons: Array<{
        src: string;
        sizes: string;
        type: string;
        purpose: string;
      }>;
    };
    const workerSource = await fetch("./sw.js").then((workerResponse) =>
      workerResponse.text(),
    );
    const registrations = await navigator.serviceWorker.getRegistrations();
    const cacheNames = await caches.keys();
    const cachedUrls = (
      await Promise.all(
        cacheNames.map(async (name) =>
          (await caches.open(name))
            .keys()
            .then((keys) => keys.map((key) => key.url)),
        ),
      )
    ).flat();
    return {
      contentType: response.headers.get("content-type"),
      manifest,
      registrationCount: registrations.length,
      cacheNames,
      cachedUrls,
      scope: registrations[0]?.scope,
      workerSource,
    };
  });

  expect(contract.contentType).toContain("application/manifest+json");
  expect(contract.manifest).toMatchObject({
    name: "Over Nerv Block",
    short_name: "Nerv Block",
    start_url: "./",
    scope: "./",
    display: "standalone",
  });
  expect(contract.manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sizes: "192x192", type: "image/png" }),
      expect.objectContaining({ sizes: "512x512", type: "image/png" }),
    ]),
  );
  expect(contract.registrationCount).toBe(1);
  expect(contract.scope).toBe(new URL("./", page.url()).href);
  expect(contract.cacheNames).toHaveLength(1);
  expect(contract.cacheNames[0]).toMatch(/^over-nerv-block-shell-/);
  expect(contract.cachedUrls).toEqual(
    expect.arrayContaining([
      expect.stringContaining("/index.html"),
      expect.stringContaining("/audio/demo-pulse.wav"),
      expect.stringContaining("/manifest.webmanifest"),
      expect.stringContaining("/beatAnalysis.worker-"),
    ]),
  );
  expect(contract.cachedUrls.join("\n")).not.toMatch(
    /blob:|private|salt\.mp3/i,
  );
  expect(contract.workerSource).toContain(
    'event.data?.type === "SKIP_WAITING"',
  );
  expect(contract.workerSource).toContain(
    "event.waitUntil(self.skipWaiting())",
  );
  const installHandler = contract.workerSource.slice(
    contract.workerSource.indexOf('addEventListener("install"'),
    contract.workerSource.indexOf('addEventListener("activate"'),
  );
  expect(installHandler).not.toContain("skipWaiting");
});

test("browser-provided install prompt is exposed without being forced", async ({
  page,
}) => {
  await page.goto("./");
  await page.evaluate(() => {
    const testWindow = window as typeof window & {
      __installPromptCalls?: number;
    };
    testWindow.__installPromptCalls = 0;
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt: async () => {
        testWindow.__installPromptCalls =
          (testWindow.__installPromptCalls ?? 0) + 1;
      },
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    window.dispatchEvent(event);
  });
  await page.getByRole("button", { name: "Install app" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __installPromptCalls?: number })
            .__installPromptCalls,
      ),
    )
    .toBe(1);
  await expect(page.getByRole("button", { name: "Install app" })).toHaveCount(
    0,
  );
});

test("a waiting app shell remains pending until the player applies it", async ({
  page,
}) => {
  await page.goto("./");
  await waitForOfflineReady(page);
  const originalController = await page.evaluate(
    () => navigator.serviceWorker.controller?.scriptURL,
  );
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.register(
      "./sw.js?acceptance-update=1",
      { scope: "./" },
    );
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(
        () => reject(new Error("Waiting worker was not installed")),
        8_000,
      );
      const check = () => {
        if (registration.waiting) {
          window.clearTimeout(timeout);
          resolve();
        }
      };
      check();
      registration.installing?.addEventListener("statechange", check);
    });
  });
  await expect(
    page.getByRole("button", { name: "Apply update" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL),
  ).toBe(originalController);

  await Promise.all([
    page.waitForEvent("load"),
    page.getByRole("button", { name: "Apply update" }).click(),
  ]);
  await expect(
    page.getByRole("heading", { name: "Make every beat playable." }),
  ).toBeVisible();
});

test("cached bundled demo starts after an offline reload", async ({
  page,
  context,
}) => {
  await page.goto("./");
  await waitForOfflineReady(page);
  await context.setOffline(true);
  try {
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Circuit Pulse" }),
    ).toBeVisible();
    await expect(page.getByText("Offline", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Start demo" }).click();
    await expect(page.getByText("Get ready")).toBeVisible();
    await expect(
      page.getByTestId("rhythm-canvas").locator("canvas"),
    ).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test("reduced motion and remapped primary key persist and control gameplay", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByLabel("Motion").selectOption("reduce");
  await page.getByLabel("Primary hit key").selectOption("KeyJ");
  await expect(page.getByText(/Hit with J; motion is reduced/)).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");
  await page.reload();
  await expect(page.getByLabel("Primary hit key")).toHaveValue("KeyJ");
  await expect(page.getByText("J, canvas, or Hit")).toBeVisible();

  await page.getByRole("button", { name: "Start demo" }).click();
  await page.waitForFunction(() => {
    const progress = document.querySelector<HTMLProgressElement>(
      'progress[aria-label="Song progress"]',
    );
    return progress !== null && progress.value >= 0.97;
  });
  await page.keyboard.press("Space");
  await expect(page.getByTestId("input-feedback")).toHaveText(
    "Waiting for the first note",
  );
  await page.keyboard.press("KeyJ");
  await expect(page.getByTestId("input-feedback")).toContainText(
    /Perfect|Good/,
  );
  await expectContained(page);
});

test("representative home state has no automated WCAG A or AA violations", async ({
  page,
}) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Make every beat playable." }),
  ).toBeVisible();
  await expectNoWcagViolations(page);
  await expectContained(page);
});

test("selected, analyzed, active, result, and history states pass automated WCAG checks", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "One deterministic browser scans dynamic semantics; mobile containment is scanned separately.",
  );
  await page.goto("./");
  await page.getByLabel("Choose local music file").setInputFiles({
    name: "owned-accessibility-check.wav",
    mimeType: "audio/wav",
    buffer: ownedWave,
  });
  await expect(
    page.getByRole("heading", { name: "Ready for analysis" }),
  ).toBeVisible();
  await expectNoWcagViolations(page);

  await page.getByRole("button", { name: "Analyze beats" }).click();
  await expect(page.getByTestId("correction-editor")).toBeVisible();
  await expectNoWcagViolations(page);

  await page.getByRole("button", { name: "Start Easy chart" }).click();
  await expect(page.getByText("Get ready")).toBeVisible();
  await expectNoWcagViolations(page);
  await expect(page.getByText("Track complete")).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByRole("status", { name: "Track results" }),
  ).toBeVisible();
  await expect(page.getByText("Generated Easy chart")).toBeVisible();
  await expectNoWcagViolations(page);
});

import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

const ownedWave = readFileSync(
  path.resolve("apps/web/public/audio/demo-pulse.wav"),
);
const privateFilename = "private-history-song.wav";

async function selectAndAnalyzeOwnedAudio(page: Page) {
  await page.getByLabel("Choose local music file").setInputFiles({
    name: privateFilename,
    mimeType: "audio/wav",
    buffer: ownedWave,
  });
  await expect(
    page.getByRole("heading", { name: "Ready for analysis" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Analyze beats" }).click();
  await expect(page.getByTestId("generated-difficulties")).toBeVisible();
}

async function readRawHistory(page: Page): Promise<unknown> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("rhythm-game-history", 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          const transaction = database.transaction("chart-results", "readonly");
          const request = transaction
            .objectStore("chart-results")
            .get("recent");
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);
          transaction.oncomplete = () => database.close();
        };
      }),
  );
}

async function writeRawHistory(page: Page, value: unknown): Promise<void> {
  await page.evaluate(
    (document) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("rhythm-game-history", 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          const transaction = database.transaction(
            "chart-results",
            "readwrite",
          );
          transaction.objectStore("chart-results").put(document, "recent");
          transaction.onerror = () => reject(transaction.error);
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
        };
      }),
    value,
  );
}

function legacyTwinDocument(value: unknown): unknown {
  const document = structuredClone(value) as {
    historyVersion: number;
    kind?: string;
    entries: Array<{
      entryVersion?: number;
      kind?: string;
      id?: string;
      savedAtEpochMs: number;
      result: { playedAt: string };
    }>;
  };
  const older = document.entries[0]!;
  const newer = structuredClone(older);
  const newerPlayedAt = new Date(older.savedAtEpochMs + 1_000).toISOString();
  newer.savedAtEpochMs += 1_000;
  newer.result.playedAt = newerPlayedAt;
  for (const entry of [newer, older]) {
    delete entry.entryVersion;
    delete entry.kind;
    delete entry.id;
  }
  document.historyVersion = 0;
  delete document.kind;
  document.entries = [newer, older];
  return document;
}

function corruptNestedDocument(value: unknown): unknown {
  const document = structuredClone(value) as {
    entries: Array<{ chart: { notes: Array<Record<string, unknown>> } }>;
  };
  document.entries[0]!.chart.notes[0]!.filename = privateFilename;
  return document;
}

async function expectHorizontalContainment(page: Page) {
  const layout = await page.evaluate(() => {
    const outsideViewport = [
      ".chart-history",
      ".chart-history__privacy",
      ".chart-history__entry",
      ".chart-history__facts",
      ".chart-history__actions",
    ].flatMap((selector) =>
      [...document.querySelectorAll(selector)].flatMap((element, index) => {
        const bounds = element.getBoundingClientRect();
        return bounds.left < -0.5 || bounds.right > window.innerWidth + 0.5
          ? [`${selector}[${index}]`]
          : [];
      }),
    );
    return {
      clientWidth: document.documentElement.clientWidth,
      outsideViewport,
      scrollWidth: document.documentElement.scrollWidth,
      scrollX: window.scrollX,
    };
  });
  expect(layout.scrollX).toBe(0);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
  expect(layout.outsideViewport).toEqual([]);
}

test("returning player reviews audio-free history and controls its lifecycle", async ({
  page,
}) => {
  const applicationWrites: string[] = [];
  const consoleMessages: string[] = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD"].includes(request.method())) {
      applicationWrites.push(`${request.method()} ${request.url()}`);
    }
  });
  page.on("console", (message) => consoleMessages.push(message.text()));

  await page.goto("./");
  await selectAndAnalyzeOwnedAudio(page);
  const generated = page.getByTestId("generated-difficulties");
  await generated.getByRole("button", { name: "Start Easy chart" }).click();
  await expect(generated.getByText("Track complete")).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    generated.getByText(
      "Chart and result saved to recent history. Audio and filename were not saved.",
    ),
  ).toBeVisible();

  const saved = await readRawHistory(page);
  const savedText = JSON.stringify(saved);
  expect(savedText).not.toMatch(
    new RegExp(`${privateFilename}|blob:|objecturl|mime|decoded|worker`, "i"),
  );

  await page.reload();
  await expect(page.getByText("No song selected")).toBeVisible();
  const history = page.getByRole("region", {
    name: "Recent charts and results",
  });
  await expect(history.getByText("Generated Easy chart")).toBeVisible();
  await expect(
    history.getByText("Audio and filenames are never saved."),
  ).toBeVisible();
  await expect(history.getByText(/Accuracy/)).toBeVisible();
  await expect(history.getByText(/quality-dsp-v1/)).toBeVisible();
  await expect(history.getByText(/difficulty-generator-v1/)).toBeVisible();
  await expect(history.getByRole("button", { name: /Start|Play/ })).toHaveCount(
    0,
  );
  await expect(page.getByText(privateFilename)).toHaveCount(0);
  await expectHorizontalContainment(page);

  const chooserPromise = page.waitForEvent("filechooser");
  await history
    .getByRole("button", { name: "Select and analyze local song again" })
    .click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: privateFilename,
    mimeType: "audio/wav",
    buffer: ownedWave,
  });
  await expect(
    page.getByRole("heading", { name: "Ready for analysis" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start Easy chart" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Analyze beats" }).click();
  await expect(
    page.getByRole("button", { name: "Start Easy chart" }),
  ).toBeEnabled();

  await writeRawHistory(page, legacyTwinDocument(saved));
  await page.reload();
  await expect(
    page.getByText("Chart-only history was migrated and restored."),
  ).toBeVisible();
  await expect(page.locator(".chart-history__entry")).toHaveCount(2);
  const migrated = await readRawHistory(page);

  await page
    .locator(".chart-history__entry")
    .first()
    .getByRole("button", {
      name: "Delete entry",
    })
    .click();
  await expect(
    page.getByText(
      "Chart/result entry deleted. Music, recovery, corrections, and calibration were not changed.",
    ),
  ).toBeVisible();
  await expect(page.locator(".chart-history__entry")).toHaveCount(1);
  await page.getByRole("button", { name: "Clear chart history" }).click();
  await expect(
    page.getByText(
      "Chart-only history cleared. Music, recovery, corrections, and calibration were not changed.",
    ),
  ).toBeVisible();
  await expect(page.locator(".chart-history__entry")).toHaveCount(0);

  await writeRawHistory(page, corruptNestedDocument(migrated));
  await page.reload();
  await expect(
    page.getByText(
      "Invalid chart history was discarded. Current music and recovery data were not changed.",
    ),
  ).toBeVisible();
  await expect(page.locator(".chart-history__entry")).toHaveCount(0);
  await expect(page.getByText(privateFilename)).toHaveCount(0);
  await expectHorizontalContainment(page);

  const privacy = await page.evaluate(async () => ({
    cacheKeys: "caches" in window ? await caches.keys() : [],
    databaseNames:
      typeof indexedDB.databases === "function"
        ? (await indexedDB.databases()).map((database) => database.name).sort()
        : [],
    localStorageKeys: Object.keys(localStorage),
    registrations:
      "serviceWorker" in navigator
        ? (await navigator.serviceWorker.getRegistrations()).length
        : 0,
  }));
  expect(privacy).toEqual({
    cacheKeys: [],
    databaseNames: ["rhythm-game-history", "rhythm-game-recovery"],
    localStorageKeys: [],
    registrations: 0,
  });
  expect(applicationWrites).toEqual([]);
  expect(consoleMessages.join("\n")).not.toContain(privateFilename);
});

test("history storage denial is visible and does not block the game", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto("./");
  await expect(
    page.getByText(
      "Chart history storage is unavailable. The game still works, but new local results may not survive reload.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Start demo" })).toBeEnabled();
  await expectHorizontalContainment(page);
});

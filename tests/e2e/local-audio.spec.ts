import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

const ownedWave = readFileSync(
  path.resolve("apps/web/public/audio/demo-pulse.wav"),
);
const privateFilename = "private-selection.wav";

async function expectHorizontalContainment(page: Page) {
  const layout = await page.evaluate(() => {
    const selectors = [
      ".topbar",
      ".hero",
      ".status-card",
      ".local-audio",
      ".local-audio__state",
      ".track-card",
      ".footer",
    ];
    const outsideViewport = selectors.filter((selector) => {
      const element = document.querySelector(selector);
      if (!element) {
        return false;
      }
      const bounds = element.getBoundingClientRect();
      return bounds.left < -0.5 || bounds.right > window.innerWidth + 0.5;
    });
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

async function selectPayload(
  page: Page,
  name: string,
  mimeType: string,
  buffer: Buffer,
) {
  await page.getByLabel("Choose local music file").setInputFiles({
    name,
    mimeType,
    buffer,
  });
}

test("player privately prepares and clears a valid local song", async ({
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
  await expect(
    page.getByText(
      "Decoded only in this tab. Nothing is uploaded. Audio is not saved.",
    ),
  ).toBeVisible();
  await expect(page.getByText(/up to 25 MB and 10 minutes/)).toBeVisible();

  await selectPayload(page, privateFilename, "audio/wav", ownedWave);
  await expect(
    page.getByRole("heading", { name: "Ready for analysis" }),
  ).toBeVisible();
  await expect(page.getByText("ready_for_analysis")).toBeVisible();
  await expect(page.getByText("8.0 seconds")).toBeVisible();
  await expect(page.getByText("WAV", { exact: true })).toBeVisible();
  await expect(page.getByText(/^1 channel · \d+ Hz$/)).toBeVisible();
  await expect(page.getByLabel("Local audio preview")).toBeVisible();
  await expect(page.getByText(privateFilename)).toHaveCount(0);
  await expectHorizontalContainment(page);

  const persistence = await page.evaluate(async () => ({
    cacheKeys: "caches" in window ? await caches.keys() : [],
    databaseNames:
      typeof indexedDB.databases === "function"
        ? (await indexedDB.databases()).map((database) => database.name)
        : [],
    localStorageKeys: Object.keys(localStorage),
    registrations:
      "serviceWorker" in navigator
        ? (await navigator.serviceWorker.getRegistrations()).length
        : 0,
  }));
  expect(persistence).toEqual({
    cacheKeys: [],
    databaseNames: [],
    localStorageKeys: [],
    registrations: 0,
  });
  expect(applicationWrites).toEqual([]);
  expect(consoleMessages.join("\n")).not.toContain(privateFilename);

  await page.getByRole("button", { name: "Clear selection" }).click();
  await expect(
    page.getByText("Selection cleared. No audio was retained."),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Ready for analysis" }),
  ).toHaveCount(0);
});

test("player recovers after selecting corrupt supported audio", async ({
  page,
}) => {
  await page.goto("./");
  await selectPayload(
    page,
    "private-corrupt.wav",
    "audio/wav",
    Buffer.from("not a wave file"),
  );

  await expect(page.getByRole("alert")).toContainText(
    "This audio could not be decoded by this browser. Choose another file.",
  );
  await expect(page.getByText("private-corrupt.wav")).toHaveCount(0);
  await page.getByRole("button", { name: "Choose another file" }).click();
  await selectPayload(page, "private-retry.wav", "audio/wav", ownedWave);
  await expect(
    page.getByRole("heading", { name: "Ready for analysis" }),
  ).toBeVisible();
  await expect(page.getByText("private-retry.wav")).toHaveCount(0);
  await expectHorizontalContainment(page);
});

test("player sees pre-decode errors for unsupported, empty, and oversized files", async ({
  page,
}) => {
  await page.goto("./");

  await selectPayload(
    page,
    "private-unsupported.txt",
    "audio/wav",
    Buffer.from("content"),
  );
  await expect(page.getByRole("alert")).toContainText(
    "Choose a WAV, MP3, M4A, AAC, OGG, Opus, FLAC, or WebM audio file.",
  );
  await expect(page.getByText("private-unsupported.txt")).toHaveCount(0);

  await selectPayload(page, "private-empty.wav", "audio/wav", Buffer.alloc(0));
  await expect(page.getByRole("alert")).toContainText("This file is empty.");
  await expect(page.getByText("private-empty.wav")).toHaveCount(0);

  await selectPayload(
    page,
    "private-oversized.wav",
    "audio/wav",
    Buffer.alloc(25 * 1024 * 1024 + 1),
  );
  await expect(page.getByRole("alert")).toContainText(
    "This file is larger than 25 MB.",
  );
  await expect(page.getByText("private-oversized.wav")).toHaveCount(0);
  await expectHorizontalContainment(page);
});

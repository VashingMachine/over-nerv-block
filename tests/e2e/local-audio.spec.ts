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
      ".beat-analysis",
      ".beat-grid__timeline",
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

function silentWave(durationSeconds = 2, sampleRate = 22_050) {
  const sampleCount = durationSeconds * sampleRate;
  const dataSize = sampleCount * 2;
  const wave = Buffer.alloc(44 + dataSize);
  wave.write("RIFF", 0);
  wave.writeUInt32LE(36 + dataSize, 4);
  wave.write("WAVE", 8);
  wave.write("fmt ", 12);
  wave.writeUInt32LE(16, 16);
  wave.writeUInt16LE(1, 20);
  wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(sampleRate, 24);
  wave.writeUInt32LE(sampleRate * 2, 28);
  wave.writeUInt16LE(2, 32);
  wave.writeUInt16LE(16, 34);
  wave.write("data", 36);
  wave.writeUInt32LE(dataSize, 40);
  return wave;
}

function flatAccentPulseWave(durationSeconds = 8, sampleRate = 22_050) {
  const sampleCount = durationSeconds * sampleRate;
  const dataSize = sampleCount * 2;
  const samples = new Float64Array(sampleCount);
  for (let beatTime = 1; beatTime <= durationSeconds - 1; beatTime += 0.5) {
    const start = Math.round(beatTime * sampleRate);
    const pulseLength = Math.round(0.17 * sampleRate);
    for (let offset = 0; offset < pulseLength; offset += 1) {
      const elapsed = offset / sampleRate;
      samples[start + offset] =
        Math.sin(2 * Math.PI * (80 - elapsed * 140) * elapsed) *
        Math.exp(-elapsed * 27) *
        0.72;
    }
  }
  const wave = Buffer.alloc(44 + dataSize);
  wave.write("RIFF", 0);
  wave.writeUInt32LE(36 + dataSize, 4);
  wave.write("WAVE", 8);
  wave.write("fmt ", 12);
  wave.writeUInt32LE(16, 16);
  wave.writeUInt16LE(1, 20);
  wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(sampleRate, 24);
  wave.writeUInt32LE(sampleRate * 2, 28);
  wave.writeUInt16LE(2, 32);
  wave.writeUInt16LE(16, 34);
  wave.write("data", 36);
  wave.writeUInt32LE(dataSize, 40);
  samples.forEach((sample, index) => {
    wave.writeInt16LE(Math.round(sample * 32_767), 44 + index * 2);
  });
  return wave;
}

async function startHeartbeat(page: Page) {
  await page.evaluate(() => {
    const testWindow = window as typeof window & {
      __beatHeartbeat?: number;
      __beatHeartbeatTimer?: number;
    };
    testWindow.__beatHeartbeat = 0;
    testWindow.__beatHeartbeatTimer = window.setInterval(() => {
      testWindow.__beatHeartbeat = (testWindow.__beatHeartbeat ?? 0) + 1;
    }, 25);
  });
}

async function stopHeartbeat(page: Page) {
  return page.evaluate(() => {
    const testWindow = window as typeof window & {
      __beatHeartbeat?: number;
      __beatHeartbeatTimer?: number;
    };
    if (testWindow.__beatHeartbeatTimer !== undefined) {
      window.clearInterval(testWindow.__beatHeartbeatTimer);
    }
    return testWindow.__beatHeartbeat ?? 0;
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
  await expect(
    page.getByRole("button", { name: "Analyze beats" }),
  ).toBeVisible();
  await expect(page.getByText(privateFilename)).toHaveCount(0);
  await expectHorizontalContainment(page);

  await startHeartbeat(page);
  await page.getByRole("button", { name: "Analyze beats" }).click();
  await expect(
    page.getByRole("progressbar", { name: "Beat analysis progress" }),
  ).toBeVisible();
  await expect(page.getByTestId("beat-grid")).toBeVisible();
  expect(await stopHeartbeat(page)).toBeGreaterThanOrEqual(3);
  const tempo = Number(
    (
      await page
        .getByText("Estimated tempo", { exact: true })
        .locator("..")
        .locator("dd")
        .innerText()
    ).split(" ")[0],
  );
  expect(tempo).toBeGreaterThanOrEqual(115);
  expect(tempo).toBeLessThanOrEqual(125);
  const beatCount = Number(
    await page
      .getByText("Detected beats")
      .locator("..")
      .locator("dd")
      .innerText(),
  );
  expect(beatCount).toBeGreaterThanOrEqual(12);
  expect(beatCount).toBeLessThanOrEqual(14);
  await expect(page.getByText("quality-dsp-v1")).toBeVisible();
  await expect(
    page.getByText("Meter", { exact: true }).locator("..").locator("dd"),
  ).toHaveText("4/4");
  await expect(
    page.getByText("Downbeats", { exact: true }).locator("..").locator("dd"),
  ).toHaveText("4");
  await expect(
    page.getByRole("img", {
      name: /detected beats with 4 downbeats across 8.0 seconds/,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/Quality interpretation agrees 100% with baseline-dsp-v1/),
  ).toBeVisible();
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

test("player cancels and retries real worker analysis without reselecting", async ({
  page,
}) => {
  await page.goto("./");
  await selectPayload(page, "private-cancel.wav", "audio/wav", ownedWave);
  await expect(
    page.getByRole("heading", { name: "Ready for analysis" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Analyze beats" }).click();
  await expect(
    page.getByRole("progressbar", { name: "Beat analysis progress" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel analysis" }).click();
  await expect(
    page.getByText(
      "Beat analysis cancelled. The local preview is still ready.",
    ),
  ).toBeVisible();
  await expect(page.getByText("private-cancel.wav")).toHaveCount(0);

  await page.getByRole("button", { name: "Analyze beats" }).click();
  await expect(page.getByTestId("beat-grid")).toBeVisible();
  await expect(page.getByLabel("Local audio preview")).toBeVisible();
  await expectHorizontalContainment(page);
});

test("player sees a stable real-worker failure and can retry", async ({
  page,
}) => {
  await page.goto("./");
  await selectPayload(page, "private-silence.wav", "audio/wav", silentWave());
  await expect(
    page.getByRole("heading", { name: "Ready for analysis" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Analyze beats" }).click();

  await expect(page.getByRole("alert")).toContainText(
    "No clear rhythmic onsets were found in this audio.",
  );
  await expect(page.getByText("private-silence.wav")).toHaveCount(0);
  await page.getByRole("button", { name: "Retry analysis" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "No clear rhythmic onsets were found in this audio.",
  );
  await expect(page.getByLabel("Local audio preview")).toBeVisible();
  await expectHorizontalContainment(page);
});

test("player sees honest meter uncertainty without invented downbeats", async ({
  page,
}) => {
  await page.goto("./");
  await selectPayload(
    page,
    "private-flat-accents.wav",
    "audio/wav",
    flatAccentPulseWave(),
  );
  await expect(
    page.getByRole("heading", { name: "Ready for analysis" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Analyze beats" }).click();

  await expect(page.getByTestId("beat-grid")).toBeVisible();
  await expect(
    page.getByText("Meter", { exact: true }).locator("..").locator("dd"),
  ).toHaveText("Uncertain");
  await expect(
    page.getByText("Downbeats", { exact: true }).locator("..").locator("dd"),
  ).toHaveText("0");
  await expect(
    page.getByText(
      "Meter and downbeats are uncertain. The detected beat timing may still be usable.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Baseline beat timing retained; meter and downbeats were not asserted.",
    ),
  ).toBeVisible();
  await expect(page.getByText("private-flat-accents.wav")).toHaveCount(0);
  await expectHorizontalContainment(page);
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

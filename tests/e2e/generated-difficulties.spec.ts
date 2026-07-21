import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

const ownedWave = readFileSync(
  path.resolve("apps/web/public/audio/demo-pulse.wav"),
);
const privateFilename = "private-generated-play.wav";

function shortPulseWave(durationSeconds = 2.2, sampleRate = 22_050) {
  const sampleCount = Math.round(durationSeconds * sampleRate);
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
  for (let beatTime = 0.5; beatTime <= 2; beatTime += 0.5) {
    const start = Math.round(beatTime * sampleRate);
    const pulseLength = Math.round(0.15 * sampleRate);
    for (let offset = 0; offset < pulseLength; offset += 1) {
      const index = start + offset;
      if (index >= sampleCount) {
        break;
      }
      const elapsed = offset / sampleRate;
      const sample =
        Math.sin(2 * Math.PI * (85 - elapsed * 120) * elapsed) *
        Math.exp(-elapsed * 28) *
        0.75;
      wave.writeInt16LE(Math.round(sample * 32_767), 44 + index * 2);
    }
  }
  return wave;
}

async function selectOwnedAudio(page: Page) {
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

function noteCount(card: Locator) {
  return card
    .locator("small")
    .evaluate((label) => Number.parseInt(label.textContent ?? "", 10));
}

async function waitForSongTime(page: Page, minimumSeconds: number) {
  await page.waitForFunction(
    (minimum) => {
      const progress = document.querySelector<HTMLProgressElement>(
        '.generated-difficulties progress[aria-label="Song progress"]',
      );
      return progress !== null && progress.value >= minimum;
    },
    minimumSeconds,
    { timeout: 8_000 },
  );
}

async function expectHorizontalContainment(page: Page) {
  const layout = await page.evaluate(() => {
    const selectors = [
      ".topbar",
      ".hero",
      ".status-card",
      ".local-audio",
      ".local-audio__state",
      ".generated-difficulties",
      ".difficulty-picker",
      ".generated-chart",
      ".track-card",
      ".play-stage",
      ".footer",
    ];
    const outsideViewport = selectors.flatMap((selector) =>
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

test("player compares all deterministic generated difficulties", async ({
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
  await selectOwnedAudio(page);

  const picker = page.getByLabel("Chart difficulty");
  const easy = picker.getByRole("button", { name: /Bar starts/ });
  const medium = picker.getByRole("button", { name: /Adds alternating/ });
  const hard = picker.getByRole("button", { name: /Uses every safe/ });
  const easyCount = await noteCount(easy);
  const mediumCount = await noteCount(medium);
  const hardCount = await noteCount(hard);

  expect(easyCount).toBeGreaterThanOrEqual(2);
  expect(mediumCount).toBeGreaterThan(easyCount);
  expect(hardCount).toBeGreaterThan(mediumCount);
  await expect(easy).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("difficulty-generator-v1")).toBeVisible();
  await expect(page.getByText("quality-dsp-v1")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Start Easy chart" }),
  ).toBeEnabled();

  await medium.click();
  await expect(medium).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Start Medium chart" }),
  ).toBeEnabled();
  await hard.click();
  await expect(hard).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("img", {
      name: new RegExp(`Hard chart with ${hardCount} notes`),
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start Hard chart" }),
  ).toBeEnabled();
  await expect(page.getByText(privateFilename)).toHaveCount(0);
  await expectHorizontalContainment(page);

  expect(applicationWrites).toEqual([]);
  expect(consoleMessages.join("\n")).not.toContain(privateFilename);
});

test("player completes and tears down a generated local chart", async ({
  page,
}) => {
  await page.goto("./");
  await selectOwnedAudio(page);
  const generated = page.getByTestId("generated-difficulties");

  await generated.getByRole("button", { name: /Uses every safe/ }).click();
  await generated.getByRole("button", { name: "Start Hard chart" }).click();
  await expect(generated.getByText("Get ready")).toBeVisible();
  await expect(
    generated.getByTestId("rhythm-canvas").locator("canvas"),
  ).toBeVisible();

  await waitForSongTime(page, 0.3);
  await generated.getByRole("button", { name: "Pause" }).click();
  await expect(generated.getByText("Paused")).toBeVisible();
  await generated.getByRole("button", { name: "Resume" }).click();
  await waitForSongTime(page, 0.8);
  await generated.getByRole("button", { name: "Restart" }).click();
  await expect(generated.getByText("Get ready")).toBeVisible();
  await expect(generated.getByTestId("scoreboard")).toContainText("Score 0");

  await waitForSongTime(page, 0.97);
  await generated.getByRole("button", { name: "Hit", exact: true }).click();
  await expect(generated.getByTestId("input-feedback")).toContainText(
    /Perfect|Good/,
  );
  await expect(generated.getByText("Track complete")).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    generated.getByRole("status", { name: "Track results" }),
  ).toContainText("Accuracy");
  await expect(
    generated.getByRole("button", { name: "Retry run" }),
  ).toBeEnabled();

  const localState = await page.evaluate(async () => ({
    databaseNames:
      typeof indexedDB.databases === "function"
        ? (await indexedDB.databases()).map((database) => database.name)
        : [],
    localStorageKeys: Object.keys(localStorage),
  }));
  expect(localState).toEqual({ databaseNames: [], localStorageKeys: [] });

  await generated.getByRole("button", { name: "Play again" }).click();
  await expect(generated.getByText("Get ready")).toBeVisible();
  await page.getByRole("button", { name: "Clear selection" }).click();
  await expect(
    page.getByText("Selection cleared. No audio was retained."),
  ).toBeVisible();
  await expect(page.getByTestId("generated-difficulties")).toHaveCount(0);
  await expectHorizontalContainment(page);
});

test("player recovers when a short rhythm cannot support three safe levels", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByLabel("Choose local music file").setInputFiles({
    name: "private-too-short-for-chart.wav",
    mimeType: "audio/wav",
    buffer: shortPulseWave(),
  });
  await expect(
    page.getByRole("heading", { name: "Ready for analysis" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Analyze beats" }).click();

  await expect(page.getByTestId("beat-grid")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "No safe playable chart" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "Not enough safe rhythmic anchors",
  );
  await expect(
    page.getByRole("button", { name: "Start Easy chart" }),
  ).toHaveCount(0);
  await expect(page.getByText("private-too-short-for-chart.wav")).toHaveCount(
    0,
  );

  await page.getByRole("button", { name: "Replace music" }).click();
  await page.getByLabel("Choose local music file").setInputFiles({
    name: "private-recovered-chart.wav",
    mimeType: "audio/wav",
    buffer: ownedWave,
  });
  await page.getByRole("button", { name: "Analyze beats" }).click();
  await expect(
    page.getByRole("button", { name: "Start Easy chart" }),
  ).toBeEnabled();
  await expect(page.getByText("private-recovered-chart.wav")).toHaveCount(0);
  await expectHorizontalContainment(page);
});

test("starting another game transfers the single playback owner", async ({
  page,
}) => {
  await page.goto("./");
  await selectOwnedAudio(page);
  const generated = page.getByTestId("generated-difficulties");
  const demo = page.getByRole("region", { name: "Circuit Pulse" });

  await generated.getByRole("button", { name: /Uses every safe/ }).click();
  await generated.getByRole("button", { name: "Start Hard chart" }).click();
  await waitForSongTime(page, 0.3);
  await demo.getByRole("button", { name: "Start demo" }).click();

  await expect(generated.getByTestId("scoreboard")).toHaveCount(0);
  await expect(
    generated.getByRole("button", { name: "Start Hard chart" }),
  ).toBeEnabled();
  await expect(demo.getByText("Get ready")).toBeVisible();
  await expect(page.locator(".play-stage")).toHaveCount(1);
  await page.waitForFunction(() => {
    const progress = document.querySelector<HTMLProgressElement>(
      'progress[aria-label="Song progress"]',
    );
    return progress !== null && progress.value >= 0.97;
  });
  await page.keyboard.press("Space");
  await expect(demo.getByTestId("scoreboard")).toContainText("Score 1,000");
  await expect(generated.getByTestId("scoreboard")).toHaveCount(0);
});

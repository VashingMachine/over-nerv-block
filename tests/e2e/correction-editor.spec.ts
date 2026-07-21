import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

const ownedWave = readFileSync(
  path.resolve("apps/web/public/audio/demo-pulse.wav"),
);
const privateFilename = "private-correction-journey.wav";

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
    for (let offset = 0; offset < Math.round(0.15 * sampleRate); offset += 1) {
      const index = start + offset;
      if (index >= sampleCount) break;
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

async function selectAndAnalyze(
  page: Page,
  buffer = ownedWave,
  name = privateFilename,
) {
  await page.getByLabel("Choose local music file").setInputFiles({
    name,
    mimeType: "audio/wav",
    buffer,
  });
  await expect(
    page.getByRole("heading", { name: "Ready for analysis" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Analyze beats" }).click();
  await expect(page.getByTestId("correction-editor")).toBeVisible();
}

async function expectHorizontalContainment(page: Page) {
  const layout = await page.evaluate(() => {
    const selectors = [
      ".topbar",
      ".hero",
      ".local-audio",
      ".correction-editor",
      ".correction-comparison",
      ".correction-controls",
      ".correction-history",
      ".generated-difficulties",
      ".difficulty-picker",
      ".generated-chart",
      ".track-card",
      ".play-stage",
      ".footer",
    ];
    return {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      scrollX: window.scrollX,
      outside: selectors.flatMap((selector) =>
        [...document.querySelectorAll(selector)].flatMap((element, index) => {
          const bounds = element.getBoundingClientRect();
          return bounds.left < -0.5 || bounds.right > window.innerWidth + 0.5
            ? [`${selector}[${index}]`]
            : [];
        }),
      ),
    };
  });
  expect(layout.scrollX).toBe(0);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
  expect(layout.outside).toEqual([]);
}

test("player corrects a grid and plays regenerated difficulties", async ({
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
  await selectAndAnalyze(page);
  const editor = page.getByTestId("correction-editor");
  await expect(
    editor.getByText("Correction revision").locator(".."),
  ).toContainText("0");
  await editor.getByLabel("Offset in milliseconds").fill("100");
  await editor.getByRole("button", { name: "Apply offset" }).click();
  await expect(editor.getByText("Offset +100 ms")).toBeVisible();
  await expect(
    editor.getByText(/revision 1 · correction-editor-v1/),
  ).toBeVisible();

  await editor.getByRole("button", { name: "Use half tempo" }).click();
  await expect(
    editor
      .locator(".correction-comparison")
      .getByText("Working", { exact: true })
      .locator(".."),
  ).toContainText("60.0 BPM");
  await editor.getByRole("button", { name: "Use double tempo" }).click();
  await editor.getByRole("button", { name: "Use 3/4" }).click();
  const beatSelect = editor.getByLabel("Selected beat");
  const fourthBeat = await beatSelect.evaluate(
    (select: HTMLSelectElement) => select.options[3]!.value,
  );
  await beatSelect.selectOption(fourthBeat);
  await editor.getByRole("button", { name: "Set as first downbeat" }).click();

  await editor.getByLabel("New beat time in seconds").fill("0.75");
  await editor.getByRole("button", { name: "Add beat" }).click();
  await expect(editor.getByText("Add beat at 0.75 s")).toBeVisible();
  await beatSelect.selectOption("0.75");
  await editor.getByRole("button", { name: "Remove selected beat" }).click();
  await expect(editor.getByText("Remove beat at 0.75 s")).toBeVisible();

  const picker = editor.getByLabel("Chart difficulty");
  await expect(
    picker.getByRole("button", { name: /Bar starts/ }),
  ).toBeEnabled();
  await expect(
    picker.getByRole("button", { name: /Adds alternating/ }),
  ).toBeEnabled();
  await picker.getByRole("button", { name: /Uses every safe/ }).click();
  await expect(
    editor.getByText(/revision 7 · correction-editor-v1/),
  ).toBeVisible();
  await editor.getByRole("button", { name: "Start Hard chart" }).click();
  await expect(editor.getByText("Get ready")).toBeVisible();
  await expect(editor.getByText("Track complete")).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    editor.getByRole("status", { name: "Track results" }),
  ).toContainText("Accuracy");

  const privacy = await page.evaluate(async () => {
    const entries = Object.entries(localStorage);
    return {
      entries,
      databaseNames:
        typeof indexedDB.databases === "function"
          ? (await indexedDB.databases()).map((database) => database.name)
          : [],
      cacheKeys: "caches" in window ? await caches.keys() : [],
    };
  });
  expect(privacy.entries).toHaveLength(1);
  expect(privacy.entries[0]![0]).toMatch(/^over-nerv-block:rhythm-correction:/);
  expect(privacy.entries[0]![1]).not.toContain("beats");
  expect(privacy.entries[0]![1]).not.toContain(privateFilename);
  expect(privacy.databaseNames).toEqual([]);
  expect(privacy.cacheKeys).toEqual([]);
  expect(applicationWrites).toEqual([]);
  expect(consoleMessages.join("\n")).not.toContain(privateFilename);
  await expect(page.getByText(privateFilename)).toHaveCount(0);
  await expectHorizontalContainment(page);
});

test("saved corrections restore only after matching local reanalysis", async ({
  page,
}) => {
  await page.goto("./");
  await selectAndAnalyze(page);
  const editor = page.getByTestId("correction-editor");
  await editor.getByLabel("Offset in milliseconds").fill("100");
  await editor.getByRole("button", { name: "Apply offset" }).click();
  const saved = await page.evaluate(() => Object.entries(localStorage));
  expect(saved).toHaveLength(1);

  await page.reload();
  await expect(page.getByText("No song selected")).toBeVisible();
  await expect(page.getByTestId("correction-editor")).toHaveCount(0);
  expect(await page.evaluate(() => Object.entries(localStorage))).toEqual(
    saved,
  );

  await selectAndAnalyze(page);
  await expect(editor.getByRole("status")).toContainText(
    "Saved corrections restored for this matching analysis",
  );
  await expect(
    page.getByTestId("correction-editor").getByText("Offset +100 ms"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Replace music" }).click();
  await selectAndAnalyze(
    page,
    shortPulseWave(),
    "private-different-correction.wav",
  );
  const differentEditor = page.getByTestId("correction-editor");
  await expect(differentEditor.getByRole("status")).toContainText(
    "No correction is saved",
  );
  await expect(page.getByText("Offset +100 ms")).toHaveCount(0);
  await expect(page.getByText(privateFilename)).toHaveCount(0);
  await expect(page.getByText("private-different-correction.wav")).toHaveCount(
    0,
  );
  await expectHorizontalContainment(page);
});

test("player taps a new grid, validates mistakes, undoes, and resets", async ({
  page,
}) => {
  await page.goto("./");
  await selectAndAnalyze(page);
  const editor = page.getByTestId("correction-editor");
  const preview = page.getByLabel("Local audio preview");
  for (const timeSeconds of [1, 1.5, 2, 2.5]) {
    await preview.evaluate((audio: HTMLAudioElement, time) => {
      audio.currentTime = time;
    }, timeSeconds);
    await editor.getByRole("button", { name: "Tap beat" }).click();
  }
  await expect(editor.getByText(/4 taps recorded/)).toBeVisible();
  await editor.getByRole("button", { name: "Apply tap grid" }).click();
  await expect(
    editor.getByText("Tap tempo and phase from 4 taps"),
  ).toBeVisible();

  const firstBeat = await editor.getByLabel("Selected beat").inputValue();
  await editor.getByLabel("New beat time in seconds").fill(firstBeat);
  await editor.getByRole("button", { name: "Add beat" }).click();
  await expect(editor.getByRole("alert")).toContainText(
    "A beat already exists within 10 milliseconds",
  );
  await expect(
    editor.getByText("Correction revision").locator(".."),
  ).toContainText("1");

  await editor.getByRole("button", { name: "Undo last correction" }).click();
  await expect(
    editor.getByText("Correction revision").locator(".."),
  ).toContainText("0");
  await editor.getByLabel("Offset in milliseconds").fill("100");
  await editor.getByRole("button", { name: "Apply offset" }).click();
  await editor.getByRole("button", { name: "Reset all corrections" }).click();
  await expect(
    editor
      .locator(".correction-comparison")
      .getByText("Working", { exact: true })
      .locator(".."),
  ).toContainText("120.0 BPM");
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  await expectHorizontalContainment(page);
});

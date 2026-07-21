import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

const ownedWave = readFileSync(
  path.resolve("apps/web/public/audio/demo-pulse.wav"),
);
const privateFilename = "private-recovery.wav";

async function select(page: Page, buffer = ownedWave, name = privateFilename) {
  await page.getByLabel("Choose local music file").setInputFiles({
    name,
    mimeType: "audio/wav",
    buffer,
  });
}

async function analyze(page: Page) {
  await expect(
    page.getByRole("heading", { name: "Ready for analysis" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Analyze beats" }).click();
  await expect(page.getByTestId("beat-grid")).toBeVisible();
  await expect(page.getByText(/Completed beat grid saved/)).toBeVisible();
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

async function latestCheckpoint(page: Page) {
  return page.evaluate(
    () =>
      new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
        const open = indexedDB.open("rhythm-game-recovery", 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          const transaction = database.transaction(
            "completed-analysis",
            "readonly",
          );
          const request = transaction
            .objectStore("completed-analysis")
            .get("latest");
          request.onerror = () => reject(request.error);
          request.onsuccess = () =>
            resolve(request.result as Record<string, unknown> | undefined);
          transaction.oncomplete = () => database.close();
        };
      }),
  );
}

async function expectContained(page: Page) {
  const layout = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    scrollX: window.scrollX,
    recoveredOutside: (() => {
      const recovered = document.querySelector(".recovered-grid");
      if (!recovered) return false;
      const bounds = recovered.getBoundingClientRect();
      return bounds.left < -0.5 || bounds.right > window.innerWidth + 0.5;
    })(),
  }));
  expect(layout.scrollX).toBe(0);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
  expect(layout.recoveredOutside).toBe(false);
}

test("completed grid reloads without audio and becomes playable only after reanalysis", async ({
  page,
}) => {
  await page.goto("./");
  await select(page);
  await analyze(page);
  const beforeReload = await latestCheckpoint(page);
  expect(beforeReload).toMatchObject({
    checkpointVersion: 1,
    kind: "completed_beat_grid_checkpoint",
    grid: { kind: "quality_rhythm_analysis" },
  });

  await page.reload();
  const recovered = page.getByTestId("recovered-grid");
  await expect(
    recovered.getByRole("heading", { name: "Recovered beat grid" }),
  ).toBeVisible();
  await expect(
    recovered.getByText(/Audio was never saved/).first(),
  ).toBeVisible();
  await expect(page.getByLabel("Local audio preview")).toHaveCount(0);
  await expect(
    recovered.getByRole("button", { name: "Tap beat" }),
  ).toBeDisabled();
  await expect(
    recovered.getByRole("heading", { name: "Choose your difficulty" }),
  ).toBeVisible();
  await expect(
    recovered.getByRole("button", { name: /Start .* chart/ }),
  ).toHaveCount(0);
  await expect(page.getByText(privateFilename)).toHaveCount(0);
  await expectContained(page);

  await select(page);
  await expect(recovered).toBeVisible();
  await analyze(page);
  await expect(page.getByTestId("recovered-grid")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Start Easy chart" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start Easy chart" }).click();
  await expect(page.getByText("Get ready")).toBeVisible();
  await expect(page.getByText(privateFilename)).toHaveCount(0);
  await expectContained(page);
});

test("failure and cancellation preserve the checkpoint until the player forgets it", async ({
  page,
}) => {
  await page.goto("./");
  await select(page);
  await analyze(page);
  await page.getByRole("button", { name: "Clear selection" }).click();
  await expect(page.getByTestId("recovered-grid")).toBeVisible();
  const checkpointBeforeFailure = await latestCheckpoint(page);

  await select(page, silentWave(), "private-recovery-failure.wav");
  await expect(
    page.getByRole("heading", { name: "Ready for analysis" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Analyze beats" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "No clear rhythmic onsets were found",
  );
  await expect(page.getByTestId("recovered-grid")).toBeVisible();
  expect(await latestCheckpoint(page)).toEqual(checkpointBeforeFailure);

  await page.getByRole("button", { name: "Replace music" }).click();
  await select(page, ownedWave, "private-recovery-cancel.wav");
  await expect(
    page.getByRole("heading", { name: "Ready for analysis" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Analyze beats" }).click();
  await expect(
    page.getByRole("progressbar", { name: "Beat analysis progress" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel analysis" }).click();
  await expect(page.getByTestId("recovered-grid")).toBeVisible();

  await page
    .getByTestId("recovered-grid")
    .getByRole("button", { name: "Forget recovered grid" })
    .click();
  await expect(page.getByTestId("recovered-grid")).toHaveCount(0);
  await expect(page.getByText(/Recovered beat grid forgotten/)).toBeVisible();
  expect(await latestCheckpoint(page)).toBeUndefined();
  await expect(page.getByText(/private-recovery/)).toHaveCount(0);
  await expectContained(page);
});

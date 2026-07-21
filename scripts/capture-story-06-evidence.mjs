import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { chromium, devices } from "@playwright/test";

const baseURL = process.env.EVIDENCE_BASE_URL;
const expectedBuild = process.env.EVIDENCE_BUILD_ID;
const storyEvidenceDirectory = path.resolve(
  "story/06-automatic-playable-difficulties/evidence",
);
const outputDirectory = path.resolve(
  process.env.EVIDENCE_DIR ?? storyEvidenceDirectory,
);
const temporaryRoot = path.resolve(tmpdir());
const ownedWave = await readFile(
  path.resolve("apps/web/public/audio/demo-pulse.wav"),
);

if (!baseURL || !expectedBuild) {
  throw new Error(
    "EVIDENCE_BASE_URL and EVIDENCE_BUILD_ID are required so evidence is tied to one production preview.",
  );
}

if (
  outputDirectory !== storyEvidenceDirectory &&
  !outputDirectory.startsWith(`${temporaryRoot}${path.sep}`)
) {
  throw new Error(
    "EVIDENCE_DIR must be the Sprint 06 evidence directory or a child of the operating-system temporary directory.",
  );
}

await mkdir(path.dirname(outputDirectory), { recursive: true });
const captureDirectory = await mkdtemp(
  path.join(path.dirname(outputDirectory), ".evidence-capture-"),
);
const temporaryVideoDirectory = await mkdtemp(
  path.join(tmpdir(), "over-nerv-block-story-06-"),
);
const browser = await chromium.launch();
const artifacts = [];
let captureComplete = false;

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

async function hashFile(filePath) {
  const digest = createHash("sha256");
  digest.update(await readFile(filePath));
  return digest.digest("hex");
}

async function recordArtifact(fileName, scenario, viewport) {
  const filePath = path.join(captureDirectory, fileName);
  const fileStats = await stat(filePath);
  artifacts.push({
    file: fileName,
    scenario,
    viewport,
    bytes: fileStats.size,
    sha256: await hashFile(filePath),
  });
}

async function selectPayload(page, name, buffer) {
  await page.getByLabel("Choose local music file").setInputFiles({
    name,
    mimeType: "audio/wav",
    buffer,
  });
}

function watchPage(page) {
  const applicationWrites = [];
  const unexpectedRequests = [];
  const consoleMessages = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD"].includes(request.method())) {
      applicationWrites.push(`${request.method()} ${request.url()}`);
    }
    const requestUrl = request.url();
    if (
      requestUrl.startsWith("http") &&
      !["127.0.0.1", "localhost"].includes(new URL(requestUrl).hostname)
    ) {
      unexpectedRequests.push(requestUrl);
    }
  });
  page.on("console", (message) => consoleMessages.push(message.text()));
  return { applicationWrites, unexpectedRequests, consoleMessages };
}

async function assertNoPrivateFootprint(page, traffic, privateNames) {
  const bodyText = await page.locator("body").innerText();
  for (const privateName of privateNames) {
    if (
      bodyText.includes(privateName) ||
      traffic.consoleMessages.join("\n").includes(privateName)
    ) {
      throw new Error("A private local-audio filename reached product output.");
    }
  }
  if (
    traffic.applicationWrites.length > 0 ||
    traffic.unexpectedRequests.length > 0
  ) {
    throw new Error("A generated-chart scenario made an unexpected request.");
  }
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
  if (
    persistence.cacheKeys.length > 0 ||
    persistence.databaseNames.length > 0 ||
    persistence.localStorageKeys.length > 0 ||
    persistence.registrations > 0
  ) {
    throw new Error(
      `Generated-chart capture found unexpected persistence: ${JSON.stringify(persistence)}`,
    );
  }
}

async function assertNarrowLayout(page) {
  await page.evaluate(() => window.scrollTo(0, 0));
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
  if (
    layout.scrollX !== 0 ||
    layout.scrollWidth > layout.clientWidth ||
    layout.outsideViewport.length > 0
  ) {
    throw new Error(`Narrow layout escaped: ${JSON.stringify(layout)}`);
  }
}

async function waitForSongTime(page, minimumSeconds) {
  await page.waitForFunction(
    (minimum) => {
      const progress = document.querySelector(
        '.generated-difficulties progress[aria-label="Song progress"]',
      );
      return progress !== null && progress.value >= minimum;
    },
    minimumSeconds,
    { timeout: 8_000 },
  );
}

async function difficultyCount(picker, description) {
  return picker
    .getByRole("button", { name: new RegExp(description) })
    .locator("small")
    .evaluate((label) => Number.parseInt(label.textContent ?? "", 10));
}

try {
  const desktopContext = await browser.newContext({
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
    screen: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    recordVideo: {
      dir: temporaryVideoDirectory,
      size: { width: 1280, height: 800 },
    },
  });
  const desktopPage = await desktopContext.newPage();
  const desktopTraffic = watchPage(desktopPage);
  await desktopPage.goto(baseURL, { waitUntil: "networkidle" });
  await desktopPage.getByText("System online").waitFor();
  const buildManifest = await desktopPage.request
    .get(new URL("build-info.json", baseURL).toString())
    .then((response) => response.json());
  if (buildManifest.buildIdentifier !== expectedBuild) {
    throw new Error(
      `Preview build mismatch: expected ${expectedBuild}, received ${buildManifest.buildIdentifier}`,
    );
  }

  await selectPayload(desktopPage, "private-generated-desktop.wav", ownedWave);
  await desktopPage.getByRole("button", { name: "Analyze beats" }).click();
  await desktopPage.getByTestId("generated-difficulties").waitFor();
  const picker = desktopPage.getByLabel("Chart difficulty");
  const counts = {
    easy: await difficultyCount(picker, "Bar starts"),
    medium: await difficultyCount(picker, "Adds alternating"),
    hard: await difficultyCount(picker, "Uses every safe"),
  };
  if (!(
    counts.easy >= 2 &&
    counts.easy < counts.medium &&
    counts.medium < counts.hard
  )) {
    throw new Error(
      `Difficulty density contract failed: ${JSON.stringify(counts)}`,
    );
  }
  await desktopPage.getByText("difficulty-generator-v1").waitFor();
  await desktopPage.screenshot({
    fullPage: true,
    path: path.join(captureDirectory, "desktop-easy.png"),
  });
  await recordArtifact(
    "desktop-easy.png",
    "Easy selected with safe anchors, rules, versions, and playable action",
    "1280x800",
  );

  await picker.getByRole("button", { name: /Adds alternating/ }).click();
  await desktopPage
    .getByRole("button", { name: "Start Medium chart" })
    .waitFor();
  await desktopPage.screenshot({
    fullPage: true,
    path: path.join(captureDirectory, "desktop-medium.png"),
  });
  await recordArtifact(
    "desktop-medium.png",
    "Medium selected with increased nested note count and playable action",
    "1280x800",
  );

  await picker.getByRole("button", { name: /Uses every safe/ }).click();
  await desktopPage.getByRole("button", { name: "Start Hard chart" }).waitFor();
  await desktopPage.screenshot({
    fullPage: true,
    path: path.join(captureDirectory, "desktop-hard.png"),
  });
  await recordArtifact(
    "desktop-hard.png",
    "Hard selected with highest safe density and playable action",
    "1280x800",
  );

  const generated = desktopPage.getByTestId("generated-difficulties");
  await generated.getByRole("button", { name: "Start Hard chart" }).click();
  await generated.getByTestId("rhythm-canvas").locator("canvas").waitFor();
  await waitForSongTime(desktopPage, 0.3);
  await generated.getByRole("button", { name: "Pause" }).click();
  await generated.getByText("Paused").waitFor();
  await desktopPage.waitForTimeout(1_200);
  await generated.getByRole("button", { name: "Resume" }).click();
  await waitForSongTime(desktopPage, 0.55);
  await generated.getByRole("button", { name: "Restart" }).click();
  await generated.getByText("Get ready").waitFor();
  await waitForSongTime(desktopPage, 0.8);
  await generated.locator(".play-stage").screenshot({
    path: path.join(captureDirectory, "desktop-hard-playing.png"),
  });
  await recordArtifact(
    "desktop-hard-playing.png",
    "selected local Hard chart playing through pause, resume, restart, and the one-button audio-clock stage",
    "1280x800 section",
  );
  await generated.getByRole("button", { name: "Hit", exact: true }).click();
  await generated.getByText("Track complete").waitFor({ timeout: 15_000 });
  await generated.getByRole("status", { name: "Track results" }).screenshot({
    path: path.join(captureDirectory, "desktop-generated-results.png"),
  });
  await recordArtifact(
    "desktop-generated-results.png",
    "generated local chart completed with score, judgments, and retry action",
    "1280x800 section",
  );

  await desktopPage.getByRole("button", { name: "Clear selection" }).click();
  await selectPayload(
    desktopPage,
    "private-insufficient-chart.wav",
    shortPulseWave(),
  );
  await desktopPage.getByRole("button", { name: "Analyze beats" }).click();
  await desktopPage
    .getByRole("heading", { name: "No safe playable chart" })
    .waitFor();
  await desktopPage.locator(".local-audio").screenshot({
    path: path.join(captureDirectory, "desktop-insufficient-rhythm.png"),
  });
  await recordArtifact(
    "desktop-insufficient-rhythm.png",
    "short detected rhythm is declined with a recoverable message and no play action",
    "1280x800 section",
  );
  await assertNoPrivateFootprint(desktopPage, desktopTraffic, [
    "private-generated-desktop.wav",
    "private-insufficient-chart.wav",
  ]);
  const video = desktopPage.video();
  await desktopContext.close();
  await rename(
    await video.path(),
    path.join(captureDirectory, "generated-difficulties-loop.webm"),
  );
  await recordArtifact(
    "generated-difficulties-loop.webm",
    "local analysis, all three difficulties, generated gameplay/results, and safe failure",
    "1280x800",
  );

  const mobileContext = await browser.newContext({ ...devices["Pixel 7"] });
  const mobilePage = await mobileContext.newPage();
  const mobileTraffic = watchPage(mobilePage);
  await mobilePage.goto(baseURL, { waitUntil: "networkidle" });
  await selectPayload(mobilePage, "private-generated-mobile.wav", ownedWave);
  await mobilePage.getByRole("button", { name: "Analyze beats" }).click();
  await mobilePage.getByTestId("generated-difficulties").waitFor();
  await mobilePage
    .getByLabel("Chart difficulty")
    .getByRole("button", { name: /Adds alternating/ })
    .click();
  await mobilePage
    .getByRole("button", { name: "Start Medium chart" })
    .waitFor();
  await assertNarrowLayout(mobilePage);
  await mobilePage.screenshot({
    fullPage: true,
    path: path.join(captureDirectory, "mobile-medium.png"),
  });
  await assertNoPrivateFootprint(mobilePage, mobileTraffic, [
    "private-generated-mobile.wav",
  ]);
  await mobileContext.close();
  await recordArtifact(
    "mobile-medium.png",
    "412-pixel Medium selection with readable chart facts, versions, and play action",
    "412x915",
  );

  const evidenceManifest = {
    storyId: "06",
    previewUrl: baseURL,
    buildIdentifier: expectedBuild,
    capturedAt: new Date().toISOString(),
    previewType: "loopback production build",
    externalDeployment: "not required",
    privacy:
      "repository-owned synthesized inputs only; no filenames, object URLs, raw samples, generated chart files, or result records",
    generationAssertions: {
      analyzerVersion: "quality-dsp-v1",
      generatorVersion: "difficulty-generator-v1",
      seed: 0,
      noteCounts: counts,
      strictlyIncreasingDensity: true,
      completedGeneratedGameplay: true,
      insufficientRhythmDeclined: true,
    },
    artifacts,
  };
  await writeFile(
    path.join(captureDirectory, "manifest.json"),
    `${JSON.stringify(evidenceManifest, null, 2)}\n`,
  );
  captureComplete = true;
} finally {
  await browser.close();
  await rm(temporaryVideoDirectory, { recursive: true, force: true });
  if (captureComplete) {
    await rm(outputDirectory, { recursive: true, force: true });
    await rename(captureDirectory, outputDirectory);
  } else {
    await rm(captureDirectory, { recursive: true, force: true });
  }
}

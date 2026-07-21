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
  "story/04-baseline-beat-grid/evidence",
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
    "EVIDENCE_BASE_URL and EVIDENCE_BUILD_ID are required so evidence can be tied to the designated production preview.",
  );
}

if (
  outputDirectory !== storyEvidenceDirectory &&
  !outputDirectory.startsWith(`${temporaryRoot}${path.sep}`)
) {
  throw new Error(
    "EVIDENCE_DIR must be the Sprint 04 evidence directory or a child of the operating-system temporary directory.",
  );
}

await mkdir(path.dirname(outputDirectory), { recursive: true });
const captureDirectory = await mkdtemp(
  path.join(path.dirname(outputDirectory), ".evidence-capture-"),
);
const temporaryVideoDirectory = await mkdtemp(
  path.join(tmpdir(), "over-nerv-block-story-04-"),
);
const browser = await chromium.launch();
const artifacts = [];
let captureComplete = false;

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

async function selectPayload(page, name, mimeType, buffer) {
  await page.getByLabel("Choose local music file").setInputFiles({
    name,
    mimeType,
    buffer,
  });
}

async function assertNarrowLayoutAtOrigin(page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const result = await page.evaluate(() => {
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
  if (
    result.scrollX !== 0 ||
    result.scrollWidth > result.clientWidth ||
    result.outsideViewport.length > 0
  ) {
    throw new Error(
      `Narrow layout escaped its viewport: ${JSON.stringify(result)}`,
    );
  }
}

async function startHeartbeat(page) {
  await page.evaluate(() => {
    window.__evidenceHeartbeat = 0;
    window.__evidenceHeartbeatTimer = window.setInterval(() => {
      window.__evidenceHeartbeat += 1;
    }, 25);
  });
}

async function stopHeartbeat(page) {
  return page.evaluate(() => {
    window.clearInterval(window.__evidenceHeartbeatTimer);
    return window.__evidenceHeartbeat;
  });
}

async function assertNoPrivateFootprint(
  page,
  applicationWrites,
  unexpectedRequests,
  consoleMessages,
  privateNames,
) {
  const bodyText = await page.locator("body").innerText();
  for (const privateName of privateNames) {
    if (
      bodyText.includes(privateName) ||
      consoleMessages.join("\n").includes(privateName)
    ) {
      throw new Error("A private local-audio filename reached product output.");
    }
  }
  if (applicationWrites.length > 0 || unexpectedRequests.length > 0) {
    throw new Error("A local-analysis scenario made an unexpected request.");
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
      `Beat-analysis capture found unexpected persistence: ${JSON.stringify(persistence)}`,
    );
  }
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
  const applicationWrites = [];
  const unexpectedRequests = [];
  const consoleMessages = [];
  desktopPage.on("request", (request) => {
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
  desktopPage.on("console", (message) => consoleMessages.push(message.text()));

  await desktopPage.goto(baseURL, { waitUntil: "networkidle" });
  await desktopPage.getByText("System online").waitFor();
  const manifest = await desktopPage.request
    .get(new URL("build-info.json", baseURL).toString())
    .then((response) => response.json());
  if (manifest.buildIdentifier !== expectedBuild) {
    throw new Error(
      `Preview build mismatch: expected ${expectedBuild}, received ${manifest.buildIdentifier}`,
    );
  }

  await selectPayload(
    desktopPage,
    "private-ready-for-analysis.wav",
    "audio/wav",
    ownedWave,
  );
  await desktopPage
    .getByRole("heading", { name: "Ready for analysis" })
    .waitFor();
  await desktopPage.screenshot({
    fullPage: true,
    path: path.join(captureDirectory, "desktop-ready-to-analyze.png"),
  });
  await recordArtifact(
    "desktop-ready-to-analyze.png",
    "private local preview with explicit off-main-thread Analyze beats action",
    "1280x800",
  );

  await desktopPage.getByRole("button", { name: "Analyze beats" }).click();
  await desktopPage
    .getByRole("progressbar", { name: "Beat analysis progress" })
    .waitFor();
  await desktopPage.locator(".local-audio").screenshot({
    path: path.join(captureDirectory, "desktop-analysis-progress.png"),
  });
  await recordArtifact(
    "desktop-analysis-progress.png",
    "named local worker progress, percentage, responsiveness copy, and cancel action",
    "1280x800 section",
  );
  await desktopPage.getByRole("button", { name: "Cancel analysis" }).click();
  await desktopPage
    .getByText("Beat analysis cancelled. The local preview is still ready.")
    .waitFor();

  await startHeartbeat(desktopPage);
  await desktopPage.getByRole("button", { name: "Analyze beats" }).click();
  await desktopPage.getByTestId("beat-grid").waitFor();
  const heartbeatTicks = await stopHeartbeat(desktopPage);
  if (heartbeatTicks < 3) {
    throw new Error(
      `Main-thread heartbeat advanced only ${heartbeatTicks} times.`,
    );
  }
  const tempo = Number(
    (await desktopPage.getByText(/^[0-9]+\.[0-9] BPM$/).innerText()).split(
      " ",
    )[0],
  );
  if (tempo < 115 || tempo > 125) {
    throw new Error(`Owned-fixture tempo escaped its contract: ${tempo}`);
  }
  await desktopPage.screenshot({
    fullPage: true,
    path: path.join(captureDirectory, "desktop-beat-grid.png"),
  });
  await recordArtifact(
    "desktop-beat-grid.png",
    "versioned baseline tempo, beat count, timeline, representative times, and retained preview",
    "1280x800",
  );

  await desktopPage.getByRole("button", { name: "Clear selection" }).click();
  await selectPayload(
    desktopPage,
    "private-no-onsets.wav",
    "audio/wav",
    silentWave(),
  );
  await desktopPage
    .getByRole("heading", { name: "Ready for analysis" })
    .waitFor();
  await desktopPage.getByRole("button", { name: "Analyze beats" }).click();
  await desktopPage.getByRole("alert").waitFor();
  await desktopPage.screenshot({
    fullPage: true,
    path: path.join(captureDirectory, "desktop-analysis-error.png"),
  });
  await recordArtifact(
    "desktop-analysis-error.png",
    "stable no-onsets classification with filename-free Retry analysis action",
    "1280x800",
  );

  await assertNoPrivateFootprint(
    desktopPage,
    applicationWrites,
    unexpectedRequests,
    consoleMessages,
    ["private-ready-for-analysis.wav", "private-no-onsets.wav"],
  );
  const video = desktopPage.video();
  await desktopContext.close();
  await rename(
    await video.path(),
    path.join(captureDirectory, "baseline-analysis-loop.webm"),
  );
  await recordArtifact(
    "baseline-analysis-loop.webm",
    "ready, progress, cancel, retry, completed baseline grid, clear, and recoverable failure",
    "1280x800",
  );

  const mobileContext = await browser.newContext({ ...devices["Pixel 7"] });
  const mobilePage = await mobileContext.newPage();
  const mobileWrites = [];
  const mobileUnexpectedRequests = [];
  const mobileConsoleMessages = [];
  mobilePage.on("request", (request) => {
    if (!["GET", "HEAD"].includes(request.method())) {
      mobileWrites.push(`${request.method()} ${request.url()}`);
    }
    const requestUrl = request.url();
    if (
      requestUrl.startsWith("http") &&
      !["127.0.0.1", "localhost"].includes(new URL(requestUrl).hostname)
    ) {
      mobileUnexpectedRequests.push(requestUrl);
    }
  });
  mobilePage.on("console", (message) =>
    mobileConsoleMessages.push(message.text()),
  );
  await mobilePage.goto(baseURL, { waitUntil: "networkidle" });
  await selectPayload(
    mobilePage,
    "private-mobile-analysis.wav",
    "audio/wav",
    ownedWave,
  );
  await mobilePage
    .getByRole("heading", { name: "Ready for analysis" })
    .waitFor();
  await mobilePage.getByRole("button", { name: "Analyze beats" }).click();
  await mobilePage.getByTestId("beat-grid").waitFor();
  await assertNarrowLayoutAtOrigin(mobilePage);
  await mobilePage.screenshot({
    fullPage: true,
    path: path.join(captureDirectory, "mobile-beat-grid.png"),
  });
  await assertNoPrivateFootprint(
    mobilePage,
    mobileWrites,
    mobileUnexpectedRequests,
    mobileConsoleMessages,
    ["private-mobile-analysis.wav"],
  );
  await mobileContext.close();
  await recordArtifact(
    "mobile-beat-grid.png",
    "412-pixel baseline tempo, timeline, beat times, preview, and controls at natural origin",
    "412x915",
  );

  const evidenceManifest = {
    storyId: "04",
    previewUrl: baseURL,
    buildIdentifier: expectedBuild,
    capturedAt: new Date().toISOString(),
    previewType: "loopback production build",
    privacy:
      "repository-owned synthesized inputs only; no filenames, object URLs, raw samples, or beat-grid data files",
    responsiveness: {
      intervalMilliseconds: 25,
      minimumTicks: 3,
      observedTicks: heartbeatTicks,
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

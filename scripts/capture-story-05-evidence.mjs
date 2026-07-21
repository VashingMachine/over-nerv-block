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
  "story/05-quality-downbeats-confidence/evidence",
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
    "EVIDENCE_DIR must be the Sprint 05 evidence directory or a child of the operating-system temporary directory.",
  );
}

await mkdir(path.dirname(outputDirectory), { recursive: true });
const captureDirectory = await mkdtemp(
  path.join(path.dirname(outputDirectory), ".evidence-capture-"),
);
const temporaryVideoDirectory = await mkdtemp(
  path.join(tmpdir(), "over-nerv-block-story-05-"),
);
const browser = await chromium.launch();
const artifacts = [];
let captureComplete = false;

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

async function definitionText(page, term) {
  return page
    .getByText(term, { exact: true })
    .locator("..")
    .locator("dd")
    .innerText();
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
      ".beat-grid__confidence",
      ".beat-grid__alternatives",
      ".footer",
    ];
    const outsideViewport = selectors.filter((selector) => {
      const element = document.querySelector(selector);
      if (!element) return false;
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
      `Quality capture found unexpected persistence: ${JSON.stringify(persistence)}`,
    );
  }
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
  const manifest = await desktopPage.request
    .get(new URL("build-info.json", baseURL).toString())
    .then((response) => response.json());
  if (manifest.buildIdentifier !== expectedBuild) {
    throw new Error(
      `Preview build mismatch: expected ${expectedBuild}, received ${manifest.buildIdentifier}`,
    );
  }

  await selectPayload(desktopPage, "private-quality-ready.wav", ownedWave);
  await desktopPage
    .getByRole("heading", { name: "Ready for analysis" })
    .waitFor();
  await desktopPage.screenshot({
    fullPage: true,
    path: path.join(captureDirectory, "desktop-ready-quality.png"),
  });
  await recordArtifact(
    "desktop-ready-quality.png",
    "private local preview with explicit quality beat and downbeat action",
    "1280x800",
  );

  await desktopPage.getByRole("button", { name: "Analyze beats" }).click();
  await desktopPage
    .getByRole("progressbar", { name: "Beat analysis progress" })
    .waitFor();
  await desktopPage.locator(".local-audio").screenshot({
    path: path.join(captureDirectory, "desktop-quality-progress.png"),
  });
  await recordArtifact(
    "desktop-quality-progress.png",
    "named local quality-analysis progress with cancel action",
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
    (await definitionText(desktopPage, "Estimated tempo")).split(" ")[0],
  );
  const meter = await definitionText(desktopPage, "Meter");
  const beatCount = Number(await definitionText(desktopPage, "Detected beats"));
  const downbeatCount = Number(await definitionText(desktopPage, "Downbeats"));
  const analyzer = await definitionText(desktopPage, "Analyzer");
  if (
    tempo < 115 ||
    tempo > 125 ||
    meter !== "4/4" ||
    beatCount !== 13 ||
    downbeatCount !== 4 ||
    analyzer !== "quality-dsp-v1"
  ) {
    throw new Error(
      `Owned-fixture quality contract failed: ${JSON.stringify({ tempo, meter, beatCount, downbeatCount, analyzer })}`,
    );
  }
  await desktopPage
    .getByText(/Quality interpretation agrees 100% with baseline-dsp-v1/)
    .waitFor();
  await desktopPage.screenshot({
    fullPage: true,
    path: path.join(captureDirectory, "desktop-quality-grid.png"),
  });
  await recordArtifact(
    "desktop-quality-grid.png",
    "quality tempo, 4/4 meter, named downbeats, confidence, alternatives, and baseline agreement",
    "1280x800",
  );

  await desktopPage.getByRole("button", { name: "Clear selection" }).click();
  await selectPayload(
    desktopPage,
    "private-flat-accents.wav",
    flatAccentPulseWave(),
  );
  await desktopPage.getByRole("button", { name: "Analyze beats" }).click();
  await desktopPage.getByTestId("beat-grid").waitFor();
  if (
    (await definitionText(desktopPage, "Meter")) !== "Uncertain" ||
    (await definitionText(desktopPage, "Downbeats")) !== "0"
  ) {
    throw new Error("Weak metrical evidence produced invented downbeats.");
  }
  await desktopPage
    .getByText(
      "Meter and downbeats are uncertain. The detected beat timing may still be usable.",
    )
    .waitFor();
  await desktopPage.screenshot({
    fullPage: true,
    path: path.join(captureDirectory, "desktop-meter-uncertain.png"),
  });
  await recordArtifact(
    "desktop-meter-uncertain.png",
    "honest uncertain-meter result with no asserted downbeats and visible fallback guidance",
    "1280x800",
  );

  await assertNoPrivateFootprint(
    desktopPage,
    desktopTraffic.applicationWrites,
    desktopTraffic.unexpectedRequests,
    desktopTraffic.consoleMessages,
    ["private-quality-ready.wav", "private-flat-accents.wav"],
  );
  const video = desktopPage.video();
  await desktopContext.close();
  await rename(
    await video.path(),
    path.join(captureDirectory, "quality-analysis-loop.webm"),
  );
  await recordArtifact(
    "quality-analysis-loop.webm",
    "ready, progress, cancel, retry, confident quality grid, and honest uncertain-meter result",
    "1280x800",
  );

  const mobileContext = await browser.newContext({ ...devices["Pixel 7"] });
  const mobilePage = await mobileContext.newPage();
  const mobileTraffic = watchPage(mobilePage);
  await mobilePage.goto(baseURL, { waitUntil: "networkidle" });
  await selectPayload(mobilePage, "private-mobile-quality.wav", ownedWave);
  await mobilePage.getByRole("button", { name: "Analyze beats" }).click();
  await mobilePage.getByTestId("beat-grid").waitFor();
  await assertNarrowLayoutAtOrigin(mobilePage);
  await mobilePage.screenshot({
    fullPage: true,
    path: path.join(captureDirectory, "mobile-quality-grid.png"),
  });
  await assertNoPrivateFootprint(
    mobilePage,
    mobileTraffic.applicationWrites,
    mobileTraffic.unexpectedRequests,
    mobileTraffic.consoleMessages,
    ["private-mobile-quality.wav"],
  );
  await mobileContext.close();
  await recordArtifact(
    "mobile-quality-grid.png",
    "412-pixel quality grid with non-color-only downbeats, confidence, alternatives, and controls",
    "412x915",
  );

  const evidenceManifest = {
    storyId: "05",
    previewUrl: baseURL,
    buildIdentifier: expectedBuild,
    capturedAt: new Date().toISOString(),
    previewType: "loopback production build",
    privacy:
      "repository-owned synthesized inputs only; no filenames, object URLs, raw samples, or rhythm-result files",
    qualityAssertions: {
      analyzer,
      tempo,
      meter,
      beatCount,
      downbeatCount,
      baselineAgreementPercent: 100,
      uncertainMeter: true,
      uncertainDownbeatCount: 0,
    },
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

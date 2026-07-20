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
  "story/03-private-local-audio/evidence",
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
    "EVIDENCE_DIR must be the Sprint 03 evidence directory or a child of the operating-system temporary directory.",
  );
}

await mkdir(path.dirname(outputDirectory), { recursive: true });
const captureDirectory = await mkdtemp(
  path.join(path.dirname(outputDirectory), ".evidence-capture-"),
);
const temporaryVideoDirectory = await mkdtemp(
  path.join(tmpdir(), "over-nerv-block-story-03-"),
);
const browser = await chromium.launch();
const artifacts = [];
let captureComplete = false;

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

async function assertNoPrivateFootprint(
  page,
  applicationWrites,
  consoleMessages,
  privateNames,
) {
  const bodyText = await page.locator("body").innerText();
  for (const privateName of privateNames) {
    if (bodyText.includes(privateName)) {
      throw new Error(
        "A private local-audio filename reached visible evidence.",
      );
    }
    if (consoleMessages.join("\n").includes(privateName)) {
      throw new Error("A private local-audio filename reached browser logs.");
    }
  }
  if (applicationWrites.length > 0) {
    throw new Error(
      "A selected-audio scenario made an application write request.",
    );
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
      `Private-audio capture found unexpected persistence: ${JSON.stringify(persistence)}`,
    );
  }
}

try {
  const desktopContext = await browser.newContext({
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
    recordVideo: {
      dir: temporaryVideoDirectory,
      size: { width: 1440, height: 900 },
    },
  });
  const desktopPage = await desktopContext.newPage();
  const applicationWrites = [];
  const consoleMessages = [];
  desktopPage.on("request", (request) => {
    if (!["GET", "HEAD"].includes(request.method())) {
      applicationWrites.push(`${request.method()} ${request.url()}`);
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

  await desktopPage.screenshot({
    fullPage: true,
    path: path.join(captureDirectory, "desktop-idle.png"),
  });
  await recordArtifact(
    "desktop-idle.png",
    "private local-audio promise, supported formats, limits, and idle action",
    "1440x900",
  );

  await selectPayload(
    desktopPage,
    "private-evidence-selection.wav",
    "audio/wav",
    ownedWave,
  );
  await desktopPage
    .getByRole("progressbar", { name: "Local audio preparation progress" })
    .waitFor();
  await desktopPage.locator(".local-audio").screenshot({
    path: path.join(captureDirectory, "desktop-progress.png"),
  });
  await recordArtifact(
    "desktop-progress.png",
    "visible browser-local preparation progress and cancellation action",
    "1440x900 section",
  );
  await desktopPage.getByRole("button", { name: "Cancel preparation" }).click();
  await desktopPage
    .getByText("Selection cancelled. No audio was retained.")
    .waitFor();

  await selectPayload(
    desktopPage,
    "private-ready-selection.wav",
    "audio/wav",
    ownedWave,
  );
  await desktopPage
    .getByRole("heading", { name: "Ready for analysis" })
    .waitFor();
  await desktopPage.screenshot({
    fullPage: true,
    path: path.join(captureDirectory, "desktop-ready.png"),
  });
  await recordArtifact(
    "desktop-ready.png",
    "filename-free ready state with duration, size, format, audio facts, preview, replace, and clear",
    "1440x900",
  );
  await desktopPage.getByRole("button", { name: "Clear selection" }).click();
  await desktopPage
    .getByText("Selection cleared. No audio was retained.")
    .waitFor();

  await selectPayload(
    desktopPage,
    "private-corrupt-selection.wav",
    "audio/wav",
    Buffer.from("not a valid wave file"),
  );
  await desktopPage.getByRole("alert").waitFor();
  await desktopPage.screenshot({
    fullPage: true,
    path: path.join(captureDirectory, "desktop-error.png"),
  });
  await recordArtifact(
    "desktop-error.png",
    "generic corrupt-audio failure with a filename-free retry action",
    "1440x900",
  );
  await assertNoPrivateFootprint(
    desktopPage,
    applicationWrites,
    consoleMessages,
    [
      "private-evidence-selection.wav",
      "private-ready-selection.wav",
      "private-corrupt-selection.wav",
    ],
  );

  const video = desktopPage.video();
  await desktopContext.close();
  await rename(
    await video.path(),
    path.join(captureDirectory, "private-audio-loop.webm"),
  );
  await recordArtifact(
    "private-audio-loop.webm",
    "idle, local progress, cancellation, valid ready, clear, and corrupt retry flow",
    "1440x900",
  );

  const mobileContext = await browser.newContext({ ...devices["Pixel 7"] });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(baseURL, { waitUntil: "networkidle" });
  await selectPayload(
    mobilePage,
    "private-mobile-selection.wav",
    "audio/wav",
    ownedWave,
  );
  await mobilePage
    .getByRole("heading", { name: "Ready for analysis" })
    .waitFor();
  await assertNarrowLayoutAtOrigin(mobilePage);
  await mobilePage.screenshot({
    fullPage: true,
    path: path.join(captureDirectory, "mobile-ready.png"),
  });
  await mobileContext.close();
  await recordArtifact(
    "mobile-ready.png",
    "412-pixel filename-free ready state at the natural horizontal origin",
    "412x915",
  );

  const evidenceManifest = {
    storyId: "03",
    previewUrl: baseURL,
    buildIdentifier: expectedBuild,
    capturedAt: new Date().toISOString(),
    previewType: "loopback production build",
    privacy:
      "repository-owned synthesized audio only; no filenames or object URLs",
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

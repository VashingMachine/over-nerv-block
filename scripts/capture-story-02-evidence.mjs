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
  "story/02-fair-scoring-calibration/evidence",
);
const outputDirectory = path.resolve(
  process.env.EVIDENCE_DIR ?? storyEvidenceDirectory,
);
const temporaryRoot = path.resolve(tmpdir());

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
    "EVIDENCE_DIR must be the Sprint 02 evidence directory or a child of the operating-system temporary directory.",
  );
}

await mkdir(path.dirname(outputDirectory), { recursive: true });
const captureDirectory = await mkdtemp(
  path.join(path.dirname(outputDirectory), ".evidence-capture-"),
);
const temporaryVideoDirectory = await mkdtemp(
  path.join(tmpdir(), "over-nerv-block-story-02-"),
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

async function waitForSongTime(page, minimumSeconds) {
  await page.waitForFunction(
    (minimum) => {
      const progress = document.querySelector(
        'progress[aria-label="Song progress"]',
      );
      return (
        progress instanceof HTMLProgressElement && progress.value >= minimum
      );
    },
    minimumSeconds,
    { timeout: 10_000 },
  );
}

async function assertNarrowLayoutAtOrigin(page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const result = await page.evaluate(() => {
    const selectors = [
      ".topbar",
      ".hero",
      ".status-card",
      ".track-card",
      ".calibration-panel",
      ".play-stage",
      ".results-panel",
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

  await desktopPage.getByRole("button", { name: "Calibrate device" }).click();
  await desktopPage.getByRole("slider").fill("80");
  await desktopPage.screenshot({
    fullPage: true,
    path: path.join(captureDirectory, "desktop-calibration.png"),
  });
  await recordArtifact(
    "desktop-calibration.png",
    "visible device-offset explanation and positive 80 millisecond setting",
    "1440x900",
  );
  await desktopPage.getByRole("button", { name: "Save calibration" }).click();
  await desktopPage.reload({ waitUntil: "networkidle" });
  await desktopPage.getByText("+80 ms", { exact: true }).waitFor();

  await desktopPage.getByRole("button", { name: "Start demo" }).click();
  await desktopPage.getByText("Get ready").waitFor();
  await desktopPage.getByTestId("rhythm-canvas").locator("canvas").waitFor();
  await waitForSongTime(desktopPage, 1.06);
  await desktopPage.keyboard.press("Space");
  await desktopPage
    .getByTestId("input-feedback")
    .filter({ hasText: /Perfect|Good/ })
    .waitFor();
  await waitForSongTime(desktopPage, 1.56);
  await desktopPage.getByRole("button", { name: "Hit", exact: true }).click();
  await desktopPage.screenshot({
    fullPage: true,
    path: path.join(captureDirectory, "desktop-scoring.png"),
  });
  await recordArtifact(
    "desktop-scoring.png",
    "live judgment, score, combo, misses, and three supported controls",
    "1440x900",
  );

  await waitForSongTime(desktopPage, 2.2);
  await desktopPage.getByRole("button", { name: "Pause" }).click();
  await desktopPage.getByText("Paused").waitFor();
  await desktopPage.screenshot({
    fullPage: true,
    path: path.join(captureDirectory, "desktop-paused.png"),
  });
  await recordArtifact(
    "desktop-paused.png",
    "paused transport retaining score and song position after an expired note",
    "1440x900",
  );

  await desktopPage.getByRole("button", { name: "Resume" }).click();
  await waitForSongTime(desktopPage, 3.06);
  await desktopPage
    .getByTestId("rhythm-canvas")
    .locator("canvas")
    .click({ position: { x: 20, y: 20 } });
  await desktopPage.getByText("Track complete").waitFor({ timeout: 15_000 });
  await desktopPage.screenshot({
    fullPage: true,
    path: path.join(captureDirectory, "desktop-results.png"),
  });
  await recordArtifact(
    "desktop-results.png",
    "derived score, accuracy, max combo, judgment counts, and retry action",
    "1440x900",
  );

  await desktopPage.getByRole("button", { name: "Retry run" }).click();
  await desktopPage.getByText("Get ready").waitFor();
  await desktopPage.screenshot({
    fullPage: true,
    path: path.join(captureDirectory, "desktop-retry.png"),
  });
  await recordArtifact(
    "desktop-retry.png",
    "clean retry countdown with zero score",
    "1440x900",
  );

  const video = desktopPage.video();
  await desktopContext.close();
  await rename(
    await video.path(),
    path.join(captureDirectory, "scored-loop.webm"),
  );
  await recordArtifact(
    "scored-loop.webm",
    "calibration, reload, scored input, miss, pause, resume, results, and retry",
    "1440x900",
  );

  const mobileContext = await browser.newContext({ ...devices["Pixel 7"] });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(baseURL, { waitUntil: "networkidle" });
  await mobilePage.getByRole("button", { name: "Start demo" }).click();
  await mobilePage.getByTestId("rhythm-canvas").locator("canvas").waitFor();
  await waitForSongTime(mobilePage, 1.0);
  await mobilePage.getByRole("button", { name: "Hit", exact: true }).click();
  await assertNarrowLayoutAtOrigin(mobilePage);
  await mobilePage.screenshot({
    fullPage: true,
    path: path.join(captureDirectory, "mobile-scoring.png"),
  });
  await mobileContext.close();
  await recordArtifact(
    "mobile-scoring.png",
    "touch-sized mobile scoring controls at the natural horizontal origin",
    "412x915",
  );

  const failureContext = await browser.newContext({
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 720 },
  });
  const failurePage = await failureContext.newPage();
  let audioUnavailable = true;
  await failurePage.route("**/audio/demo-pulse.wav", (route) => {
    if (audioUnavailable) {
      return route.fulfill({ status: 503, body: "temporarily unavailable" });
    }
    return route.continue();
  });
  await failurePage.goto(baseURL, { waitUntil: "networkidle" });
  await failurePage.getByRole("button", { name: "Start demo" }).click();
  await failurePage.getByRole("alert").waitFor();
  await failurePage.screenshot({
    fullPage: true,
    path: path.join(captureDirectory, "audio-unavailable.png"),
  });
  await recordArtifact(
    "audio-unavailable.png",
    "failed audio request with concise retry action",
    "1280x720",
  );

  audioUnavailable = false;
  await failurePage.getByRole("button", { name: "Retry demo" }).click();
  await failurePage.getByText("Get ready").waitFor();
  await failurePage.screenshot({
    fullPage: true,
    path: path.join(captureDirectory, "audio-recovered.png"),
  });
  await failureContext.close();
  await recordArtifact(
    "audio-recovered.png",
    "successful audio retry enters countdown",
    "1280x720",
  );

  const evidenceManifest = {
    storyId: "02",
    previewUrl: baseURL,
    buildIdentifier: expectedBuild,
    capturedAt: new Date().toISOString(),
    previewType: "loopback production build",
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

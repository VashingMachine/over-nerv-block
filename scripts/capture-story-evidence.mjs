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
const apiBaseURL = process.env.EVIDENCE_API_BASE_URL;
const expectedBuild = process.env.EVIDENCE_BUILD_ID;
const outputDirectory = path.resolve(
  process.env.EVIDENCE_DIR ?? "story/00-system-heartbeat/evidence",
);
const storyEvidenceDirectory = path.resolve(
  "story/00-system-heartbeat/evidence",
);
const temporaryRoot = path.resolve(tmpdir());

if (!baseURL || !apiBaseURL || !expectedBuild) {
  throw new Error(
    "EVIDENCE_BASE_URL, EVIDENCE_API_BASE_URL, and EVIDENCE_BUILD_ID are required so local builds cannot be recorded as deployed evidence.",
  );
}

if (
  outputDirectory !== storyEvidenceDirectory &&
  !outputDirectory.startsWith(`${temporaryRoot}${path.sep}`)
) {
  throw new Error(
    "EVIDENCE_DIR must be the Sprint 00 evidence directory or a child of the operating-system temporary directory.",
  );
}

await mkdir(path.dirname(outputDirectory), { recursive: true });
const captureDirectory = await mkdtemp(
  path.join(path.dirname(outputDirectory), ".evidence-capture-"),
);
const browser = await chromium.launch();
const temporaryVideoDirectory = await mkdtemp(
  path.join(tmpdir(), "over-nerv-block-evidence-"),
);

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

try {
  const desktopContext = await browser.newContext({
    ...devices["Desktop Chrome"],
    recordVideo: {
      dir: temporaryVideoDirectory,
      size: { width: 1440, height: 900 },
    },
    viewport: { width: 1440, height: 900 },
  });
  const desktopPage = await desktopContext.newPage();
  await desktopPage.goto(baseURL, { waitUntil: "networkidle" });
  await desktopPage.getByText("System online").waitFor();

  const health = await desktopPage.request
    .get(`${apiBaseURL.replace(/\/$/, "")}/health`)
    .then((response) => response.json());

  if (health.commit !== expectedBuild) {
    throw new Error(
      `Preview build mismatch: expected ${expectedBuild}, received ${health.commit}`,
    );
  }

  await desktopPage.screenshot({
    fullPage: true,
    path: path.join(captureDirectory, "desktop.png"),
  });
  const video = desktopPage.video();
  await desktopContext.close();
  await rename(await video.path(), path.join(captureDirectory, "demo.webm"));

  await recordArtifact("desktop.png", "healthy system on desktop", "1440x900");
  await recordArtifact(
    "demo.webm",
    "healthy system end-to-end load",
    "1440x900",
  );

  const mobileContext = await browser.newContext({ ...devices["Pixel 7"] });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(baseURL, { waitUntil: "networkidle" });
  await mobilePage.getByText("System online").waitFor();
  await mobilePage.screenshot({
    fullPage: true,
    path: path.join(captureDirectory, "mobile.png"),
  });
  await mobileContext.close();
  await recordArtifact("mobile.png", "healthy system on mobile", "412x915");

  const failureContext = await browser.newContext({
    ...devices["Desktop Chrome"],
  });
  const failurePage = await failureContext.newPage();
  let apiUnavailable = true;
  await failurePage.route("**/api/health", (route) => {
    if (apiUnavailable) {
      return route.abort("connectionfailed");
    }

    return route.continue();
  });
  await failurePage.goto(baseURL, { waitUntil: "networkidle" });
  await failurePage.getByText("System unavailable").waitFor();
  await failurePage.screenshot({
    fullPage: true,
    path: path.join(captureDirectory, "unavailable.png"),
  });
  await recordArtifact(
    "unavailable.png",
    "API connection failure with retry action",
    "1280x720",
  );

  apiUnavailable = false;
  await failurePage.getByRole("button", { name: "Try again" }).click();
  await failurePage.getByText("System online").waitFor();
  await failurePage.screenshot({
    fullPage: true,
    path: path.join(captureDirectory, "recovered.png"),
  });
  await failureContext.close();
  await recordArtifact(
    "recovered.png",
    "successful retry after API connection recovery",
    "1280x720",
  );

  const manifest = {
    storyId: "00",
    previewUrl: baseURL,
    buildIdentifier: expectedBuild,
    capturedAt: new Date().toISOString(),
    source: "immutable deployed preview",
    artifacts,
  };
  await writeFile(
    path.join(captureDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
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

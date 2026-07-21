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
  "story/08-leave-return-recover-retry/evidence",
);
const outputDirectory = path.resolve(
  process.env.EVIDENCE_DIR ?? storyEvidenceDirectory,
);
const temporaryRoot = path.resolve(tmpdir());
const ownedWave = await readFile(
  path.resolve("apps/web/public/audio/demo-pulse.wav"),
);
const privateNames = [
  "private-recovery-evidence.wav",
  "private-recovery-failure.wav",
  "private-recovery-cancel.wav",
  "private-recovery-crash.wav",
  "private-recovery-denied.wav",
  "private-recovery-mobile.wav",
];

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
    "EVIDENCE_DIR must be the Sprint 08 evidence directory or a child of the operating-system temporary directory.",
  );
}

await mkdir(path.dirname(outputDirectory), { recursive: true });
const captureDirectory = await mkdtemp(
  path.join(path.dirname(outputDirectory), ".evidence-capture-"),
);
const videoDirectory = await mkdtemp(
  path.join(tmpdir(), "over-nerv-block-story-08-"),
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

async function recordArtifact(file, scenario, viewport) {
  const filePath = path.join(captureDirectory, file);
  const fileStats = await stat(filePath);
  artifacts.push({
    file,
    scenario,
    viewport,
    bytes: fileStats.size,
    sha256: await hashFile(filePath),
  });
}

async function screenshot(page, file, scenario, viewport, locator) {
  const filePath = path.join(captureDirectory, file);
  if (locator) {
    await locator.screenshot({ path: filePath });
  } else {
    await page.screenshot({ fullPage: true, path: filePath });
  }
  await recordArtifact(file, scenario, viewport);
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

async function assertBuild(page) {
  const manifest = await page.evaluate(async () => {
    const response = await fetch("./build-info.json", { cache: "no-store" });
    return response.json();
  });
  if (manifest.buildIdentifier !== expectedBuild) {
    throw new Error(
      `Expected build ${expectedBuild}, received ${manifest.buildIdentifier}`,
    );
  }
}

async function select(page, name, buffer = ownedWave) {
  await page.getByLabel("Choose local music file").setInputFiles({
    name,
    mimeType: "audio/wav",
    buffer,
  });
  await page.getByRole("heading", { name: "Ready for analysis" }).waitFor();
}

async function waitForSavedGrid(page) {
  await page.getByTestId("beat-grid").waitFor();
  await page.getByText(/Completed beat grid saved/).waitFor();
}

async function localPersistence(page) {
  return page.evaluate(async () => {
    const names =
      typeof indexedDB.databases === "function"
        ? (await indexedDB.databases()).map((database) => database.name)
        : [];
    let checkpoint;
    if (names.includes("rhythm-game-recovery")) {
      checkpoint = await new Promise((resolve, reject) => {
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
          request.onsuccess = () => resolve(request.result);
          transaction.oncomplete = () => database.close();
        };
      });
    }
    return {
      cacheKeys: "caches" in window ? await caches.keys() : [],
      checkpoint,
      databaseNames: names,
      localStorageEntries: Object.entries(localStorage),
      registrations:
        "serviceWorker" in navigator
          ? (await navigator.serviceWorker.getRegistrations()).length
          : 0,
    };
  });
}

function assertTraffic(traffic) {
  if (
    traffic.applicationWrites.length > 0 ||
    traffic.unexpectedRequests.length > 0
  ) {
    throw new Error(
      `Unexpected traffic: ${JSON.stringify({ writes: traffic.applicationWrites, external: traffic.unexpectedRequests })}`,
    );
  }
  const combined = traffic.consoleMessages.join("\n");
  for (const privateName of privateNames) {
    if (combined.includes(privateName)) {
      throw new Error("A private filename reached the browser console.");
    }
  }
}

async function assertCheckpointPrivacy(page, expected, traffic) {
  assertTraffic(traffic);
  const persistence = await localPersistence(page);
  if (persistence.cacheKeys.length > 0 || persistence.registrations !== 0) {
    throw new Error(
      "Recovery evidence unexpectedly used a cache or service worker.",
    );
  }
  for (const [key, value] of persistence.localStorageEntries) {
    if (!key.startsWith("over-nerv-block:rhythm-correction:")) {
      throw new Error(`Unexpected localStorage key ${key}`);
    }
    if (/beats|filename|blob:|objecturl/i.test(value)) {
      throw new Error(
        "A correction document contains forbidden recovery data.",
      );
    }
  }
  if (!expected) {
    if (persistence.checkpoint !== undefined) {
      throw new Error("A recovery checkpoint exists when none was expected.");
    }
    return;
  }
  if (persistence.databaseNames.join(",") !== "rhythm-game-recovery") {
    throw new Error("The exact recovery database was not present.");
  }
  const checkpoint = persistence.checkpoint;
  if (!checkpoint || typeof checkpoint !== "object") {
    throw new Error("The completed recovery checkpoint is missing.");
  }
  const keys = Object.keys(checkpoint).sort();
  const expectedKeys = [
    "checkpointVersion",
    "grid",
    "kind",
    "savedAtEpochMs",
    "sourceFingerprint",
  ];
  if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
    throw new Error(`Unexpected checkpoint fields ${JSON.stringify(keys)}`);
  }
  const serialized = JSON.stringify(checkpoint);
  if (
    privateNames.some((name) => serialized.includes(name)) ||
    /blob:|objecturl|filename|mimetype|generated_rhythm_chart|game_result/i.test(
      serialized,
    )
  ) {
    throw new Error("The checkpoint contains forbidden private/runtime data.");
  }
}

async function assertNoPrivateFilename(page) {
  for (const privateName of privateNames) {
    if ((await page.getByText(privateName).count()) !== 0) {
      throw new Error("A private filename reached visible evidence.");
    }
  }
}

async function assertNarrowLayout(page) {
  const layout = await page.evaluate(() => {
    const recovered = document.querySelector(".recovered-grid");
    const bounds = recovered?.getBoundingClientRect();
    return {
      clientWidth: document.documentElement.clientWidth,
      recoveredOutside:
        bounds === undefined
          ? true
          : bounds.left < -0.5 || bounds.right > window.innerWidth + 0.5,
      scrollWidth: document.documentElement.scrollWidth,
      scrollX: window.scrollX,
    };
  });
  if (
    layout.scrollX !== 0 ||
    layout.scrollWidth > layout.clientWidth ||
    layout.recoveredOutside
  ) {
    throw new Error(
      `Mobile recovery layout overflow: ${JSON.stringify(layout)}`,
    );
  }
}

try {
  const desktopContext = await browser.newContext({
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: videoDirectory, size: { width: 1280, height: 800 } },
  });
  const desktopPage = await desktopContext.newPage();
  const desktopTraffic = watchPage(desktopPage);
  await desktopPage.goto(baseURL, { waitUntil: "networkidle" });
  await assertBuild(desktopPage);
  await select(desktopPage, privateNames[0]);
  await desktopPage.getByRole("button", { name: "Analyze beats" }).click();
  await desktopPage
    .getByRole("progressbar", { name: "Beat analysis progress" })
    .waitFor();
  await screenshot(
    desktopPage,
    "desktop-analysis-attempt-1.png",
    "local analysis is visibly bounded as attempt 1 of 2 and remains cancellable",
    "1280x800 analysis section",
    desktopPage.locator(".local-audio__state"),
  );
  await desktopPage.getByRole("button", { name: "Cancel analysis" }).click();
  await desktopPage
    .getByText("Beat analysis cancelled. The local preview is still ready.")
    .waitFor();
  await screenshot(
    desktopPage,
    "desktop-analysis-cancelled.png",
    "cancellation returns to a retryable ready state while retaining only the in-tab preview",
    "1280x800 analysis section",
    desktopPage.locator(".local-audio__state"),
  );
  await assertCheckpointPrivacy(desktopPage, false, desktopTraffic);

  await desktopPage.getByRole("button", { name: "Analyze beats" }).click();
  await waitForSavedGrid(desktopPage);
  const currentEditor = desktopPage.getByTestId("correction-editor");
  await currentEditor.getByLabel("Offset in milliseconds").fill("20");
  await currentEditor.getByRole("button", { name: "Apply offset" }).click();
  await currentEditor.getByText("Offset +20 ms").waitFor();
  await screenshot(
    desktopPage,
    "desktop-checkpoint-saved.png",
    "a valid completed beat grid is checkpointed while audio remains local to the tab",
    "1280x800 local-song workspace",
    desktopPage.locator(".local-audio__state"),
  );
  await assertCheckpointPrivacy(desktopPage, true, desktopTraffic);

  await desktopPage.reload({ waitUntil: "networkidle" });
  const recovered = desktopPage.getByTestId("recovered-grid");
  await recovered.waitFor();
  await recovered.getByText("Offset +20 ms").waitFor();
  if (
    (await desktopPage.getByLabel("Local audio preview").count()) !== 0 ||
    (await recovered
      .getByRole("button", { name: /Start .* chart/ })
      .count()) !== 0 ||
    !(await recovered.getByRole("button", { name: "Tap beat" }).isDisabled())
  ) {
    throw new Error("Recovered state incorrectly exposed audio-only controls.");
  }
  await screenshot(
    desktopPage,
    "desktop-recovered-no-audio.png",
    "reload restores grid, correction, and difficulty summaries while clearly requiring local re-analysis for audio",
    "1280x800 recovered workspace",
    recovered,
  );

  await select(desktopPage, privateNames[1], silentWave());
  await desktopPage.getByRole("button", { name: "Analyze beats" }).click();
  await desktopPage
    .getByRole("alert")
    .filter({ hasText: "No clear rhythmic onsets" })
    .waitFor();
  await recovered.waitFor();
  await screenshot(
    desktopPage,
    "desktop-failure-retains-grid.png",
    "a new local-analysis failure leaves the previous completed checkpoint reviewable and unchanged",
    "1280x800",
  );
  await assertCheckpointPrivacy(desktopPage, true, desktopTraffic);

  await desktopPage.getByRole("button", { name: "Replace music" }).click();
  await select(desktopPage, privateNames[2]);
  await desktopPage.getByRole("button", { name: "Analyze beats" }).click();
  await desktopPage
    .getByRole("progressbar", { name: "Beat analysis progress" })
    .waitFor();
  await desktopPage.getByRole("button", { name: "Cancel analysis" }).click();
  await recovered.waitFor();
  await screenshot(
    desktopPage,
    "desktop-cancel-retains-grid.png",
    "cancelling replacement analysis preserves the last valid recovered grid",
    "1280x800",
  );
  await assertCheckpointPrivacy(desktopPage, true, desktopTraffic);

  await desktopPage.getByRole("button", { name: "Analyze beats" }).click();
  await waitForSavedGrid(desktopPage);
  await desktopPage.getByRole("button", { name: "Start Easy chart" }).click();
  await desktopPage.getByText("Get ready").waitFor();
  await screenshot(
    desktopPage,
    "desktop-reanalysis-playable.png",
    "only a fresh valid re-analysis binds current-tab audio and restores the play action",
    "1280x800 generated chart",
    desktopPage.getByTestId("generated-difficulties"),
  );
  await assertCheckpointPrivacy(desktopPage, true, desktopTraffic);

  await desktopPage.getByRole("button", { name: "Clear selection" }).click();
  await desktopPage.getByTestId("recovered-grid").waitFor();
  await desktopPage
    .getByTestId("recovered-grid")
    .getByRole("button", { name: "Forget recovered grid" })
    .click();
  await desktopPage.getByText(/Recovered beat grid forgotten/).waitFor();
  await screenshot(
    desktopPage,
    "desktop-recovery-forgotten.png",
    "the player can delete the singleton recovery checkpoint without a server or audio cleanup claim",
    "1280x800",
  );
  await assertCheckpointPrivacy(desktopPage, false, desktopTraffic);
  await assertNoPrivateFilename(desktopPage);
  const desktopVideo = desktopPage.video();
  await desktopContext.close();
  await rename(
    await desktopVideo.path(),
    path.join(captureDirectory, "recovery-to-play-loop.webm"),
  );
  await recordArtifact(
    "recovery-to-play-loop.webm",
    "start, cancel, retry, checkpoint, reload without audio, retained recovery through failure/cancel, re-analysis to play, and forget",
    "1280x800",
  );

  const crashContext = await browser.newContext({
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
  });
  await crashContext.addInitScript(() => {
    const NativeWorker = window.Worker;
    let workerCount = 0;
    class CrashOnceWorker extends EventTarget {
      inner;
      constructor(...arguments_) {
        super();
        workerCount += 1;
        if (workerCount > 1) {
          this.inner = new NativeWorker(...arguments_);
          this.inner.addEventListener("message", (event) =>
            this.dispatchEvent(
              new MessageEvent("message", { data: event.data }),
            ),
          );
          this.inner.addEventListener("error", (event) =>
            this.dispatchEvent(
              new ErrorEvent("error", { message: event.message }),
            ),
          );
        }
      }
      postMessage(message, transfer) {
        if (!this.inner) {
          queueMicrotask(() =>
            this.dispatchEvent(new Event("error", { cancelable: true })),
          );
          return;
        }
        this.inner.postMessage(message, transfer);
      }
      terminate() {
        this.inner?.terminate();
      }
    }
    window.Worker = CrashOnceWorker;
  });
  const crashPage = await crashContext.newPage();
  const crashTraffic = watchPage(crashPage);
  await crashPage.goto(baseURL, { waitUntil: "networkidle" });
  await select(crashPage, privateNames[3]);
  await crashPage.getByRole("button", { name: "Analyze beats" }).click();
  await crashPage.getByText(/attempt 2 of 2/).waitFor();
  await screenshot(
    crashPage,
    "desktop-automatic-crash-retry.png",
    "a worker crash is cleaned up and visibly retried once with a fresh attempt 2 of 2",
    "1280x800 analysis section",
    crashPage.locator(".local-audio__state"),
  );
  await waitForSavedGrid(crashPage);
  await assertCheckpointPrivacy(crashPage, true, crashTraffic);
  await assertNoPrivateFilename(crashPage);
  await crashContext.close();

  const deniedContext = await browser.newContext({
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
  });
  await deniedContext.addInitScript(() => {
    IDBFactory.prototype.open = function openDenied() {
      throw new DOMException("Recovery storage denied", "SecurityError");
    };
  });
  const deniedPage = await deniedContext.newPage();
  const deniedTraffic = watchPage(deniedPage);
  await deniedPage.goto(baseURL, { waitUntil: "networkidle" });
  await select(deniedPage, privateNames[4]);
  await deniedPage.getByRole("button", { name: "Analyze beats" }).click();
  await deniedPage.getByTestId("beat-grid").waitFor();
  await deniedPage
    .getByText(/Browser recovery storage is unavailable/)
    .waitFor();
  await deniedPage.getByRole("button", { name: "Start Easy chart" }).waitFor();
  await screenshot(
    deniedPage,
    "desktop-recovery-storage-denied.png",
    "IndexedDB denial is nonfatal: the in-tab chart remains playable with a truthful reload warning",
    "1280x800 local-song workspace",
    deniedPage.locator(".local-audio__state"),
  );
  assertTraffic(deniedTraffic);
  await assertNoPrivateFilename(deniedPage);
  await deniedContext.close();

  const mobileContext = await browser.newContext({ ...devices["Pixel 7"] });
  const mobilePage = await mobileContext.newPage();
  const mobileTraffic = watchPage(mobilePage);
  await mobilePage.goto(baseURL, { waitUntil: "networkidle" });
  await select(mobilePage, privateNames[5]);
  await mobilePage.getByRole("button", { name: "Analyze beats" }).click();
  await waitForSavedGrid(mobilePage);
  await mobilePage.reload({ waitUntil: "networkidle" });
  const mobileRecovered = mobilePage.getByTestId("recovered-grid");
  await mobileRecovered.waitFor();
  await assertNarrowLayout(mobilePage);
  await screenshot(
    mobilePage,
    "mobile-recovered-grid.png",
    "412-pixel recovered grid, correction controls, difficulties, and audio-reselection explanation remain contained",
    "412x915 recovered workspace",
    mobileRecovered,
  );
  await assertCheckpointPrivacy(mobilePage, true, mobileTraffic);
  await assertNoPrivateFilename(mobilePage);
  await mobileContext.close();

  const expectedArtifacts = [
    "desktop-analysis-attempt-1.png",
    "desktop-analysis-cancelled.png",
    "desktop-checkpoint-saved.png",
    "desktop-recovered-no-audio.png",
    "desktop-failure-retains-grid.png",
    "desktop-cancel-retains-grid.png",
    "desktop-reanalysis-playable.png",
    "desktop-recovery-forgotten.png",
    "recovery-to-play-loop.webm",
    "desktop-automatic-crash-retry.png",
    "desktop-recovery-storage-denied.png",
    "mobile-recovered-grid.png",
  ];
  if (
    artifacts.length !== expectedArtifacts.length ||
    expectedArtifacts.some(
      (file) => !artifacts.some((artifact) => artifact.file === file),
    )
  ) {
    throw new Error("Sprint 08 evidence inventory is incomplete.");
  }

  const manifest = {
    storyId: "08",
    previewUrl: baseURL,
    buildIdentifier: expectedBuild,
    capturedAt: new Date().toISOString(),
    previewType: "loopback production build",
    externalDeployment: "not required",
    privacy:
      "repository-owned synthesized input only; one strict completed-grid checkpoint; no audio, filename, File, MIME metadata, object URL, decoded/worker buffers, generated chart, correction, or result in IndexedDB",
    recoveryAssertions: {
      maximumWorkerAttempts: 2,
      attemptTimeoutMilliseconds: 90_000,
      automaticCrashRetry: true,
      cancellationWithoutCheckpoint: true,
      completedCheckpointSaved: true,
      checkpointFields: [
        "checkpointVersion",
        "grid",
        "kind",
        "savedAtEpochMs",
        "sourceFingerprint",
      ],
      reloadRestoresGrid: true,
      reloadRestoresMatchingCorrection: true,
      reloadRestoresDifficultySummaries: true,
      reloadRestoresAudio: false,
      playRequiresReanalysis: true,
      priorCheckpointSurvivesFailure: true,
      priorCheckpointSurvivesCancellation: true,
      storageDeniedNonfatal: true,
      forgetDeletesLatest: true,
      desktopAndMobileContained: true,
    },
    artifacts,
  };
  await writeFile(
    path.join(captureDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  captureComplete = true;
} finally {
  await browser.close();
  await rm(videoDirectory, { recursive: true, force: true });
  if (captureComplete) {
    await rm(outputDirectory, { recursive: true, force: true });
    await rename(captureDirectory, outputDirectory);
  } else {
    await rm(captureDirectory, { recursive: true, force: true });
  }
}

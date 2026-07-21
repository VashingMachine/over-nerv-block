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
  "story/09-chart-result-history/evidence",
);
const outputDirectory = path.resolve(
  process.env.EVIDENCE_DIR ?? storyEvidenceDirectory,
);
const temporaryRoot = path.resolve(tmpdir());
const ownedWave = await readFile(
  path.resolve("apps/web/public/audio/demo-pulse.wav"),
);
const privateNames = [
  "private-history-evidence.wav",
  "private-history-mobile.wav",
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
    "EVIDENCE_DIR must be the Sprint 09 evidence directory or a child of the operating-system temporary directory.",
  );
}

await mkdir(path.dirname(outputDirectory), { recursive: true });
const captureDirectory = await mkdtemp(
  path.join(path.dirname(outputDirectory), ".evidence-capture-"),
);
const videoDirectory = await mkdtemp(
  path.join(tmpdir(), "over-nerv-block-story-09-"),
);
const browser = await chromium.launch();
const artifacts = [];
let captureComplete = false;

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

function assertTraffic(traffic) {
  if (
    traffic.applicationWrites.length > 0 ||
    traffic.unexpectedRequests.length > 0
  ) {
    throw new Error(
      `Unexpected traffic: ${JSON.stringify({ writes: traffic.applicationWrites, external: traffic.unexpectedRequests })}`,
    );
  }
  const consoleText = traffic.consoleMessages.join("\n");
  if (privateNames.some((name) => consoleText.includes(name))) {
    throw new Error("A private filename reached the browser console.");
  }
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

async function selectAndAnalyze(page, name) {
  await page.getByLabel("Choose local music file").setInputFiles({
    name,
    mimeType: "audio/wav",
    buffer: ownedWave,
  });
  await page.getByRole("heading", { name: "Ready for analysis" }).waitFor();
  await page.getByRole("button", { name: "Analyze beats" }).click();
  await page.getByTestId("generated-difficulties").waitFor();
}

async function readHistory(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("rhythm-game-history", 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          const transaction = database.transaction("chart-results", "readonly");
          const request = transaction
            .objectStore("chart-results")
            .get("recent");
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);
          transaction.oncomplete = () => database.close();
        };
      }),
  );
}

async function writeHistory(page, document) {
  await page.evaluate(
    (value) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("rhythm-game-history", 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          const transaction = database.transaction(
            "chart-results",
            "readwrite",
          );
          transaction.objectStore("chart-results").put(value, "recent");
          transaction.onerror = () => reject(transaction.error);
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
        };
      }),
    document,
  );
}

function legacyTwinDocument(value) {
  const document = structuredClone(value);
  const older = document.entries[0];
  const newer = structuredClone(older);
  const newerPlayedAt = new Date(older.savedAtEpochMs + 1_000).toISOString();
  newer.savedAtEpochMs += 1_000;
  newer.result.playedAt = newerPlayedAt;
  for (const entry of [newer, older]) {
    delete entry.entryVersion;
    delete entry.kind;
    delete entry.id;
  }
  document.historyVersion = 0;
  delete document.kind;
  document.entries = [newer, older];
  return document;
}

function corruptNestedDocument(value) {
  const document = structuredClone(value);
  document.entries[0].chart.notes[0].filename = privateNames[0];
  return document;
}

async function persistenceInventory(page) {
  return page.evaluate(async () => {
    const names =
      typeof indexedDB.databases === "function"
        ? (await indexedDB.databases()).map((database) => database.name).sort()
        : [];
    let history;
    if (names.includes("rhythm-game-history")) {
      history = await new Promise((resolve, reject) => {
        const open = indexedDB.open("rhythm-game-history", 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          const transaction = database.transaction("chart-results", "readonly");
          const request = transaction
            .objectStore("chart-results")
            .get("recent");
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);
          transaction.oncomplete = () => database.close();
        };
      });
    }
    return {
      cacheKeys: "caches" in window ? await caches.keys() : [],
      databaseNames: names,
      history,
      localStorageEntries: Object.entries(localStorage),
      registrations:
        "serviceWorker" in navigator
          ? (await navigator.serviceWorker.getRegistrations()).length
          : 0,
    };
  });
}

async function assertHistoryPrivacy(page, expectedEntryCount, traffic) {
  assertTraffic(traffic);
  const inventory = await persistenceInventory(page);
  if (inventory.cacheKeys.length > 0 || inventory.registrations !== 0) {
    throw new Error(
      "History evidence unexpectedly used a cache or service worker.",
    );
  }
  for (const [key, value] of inventory.localStorageEntries) {
    if (!key.startsWith("over-nerv-block:rhythm-correction:")) {
      throw new Error(`Unexpected localStorage key ${key}`);
    }
    if (/beats|filename|blob:|objecturl/i.test(value)) {
      throw new Error("A correction document contains forbidden history data.");
    }
  }
  if (expectedEntryCount === 0) {
    if (inventory.history !== undefined) {
      throw new Error("Chart history exists when none was expected.");
    }
    return;
  }
  const history = inventory.history;
  if (!history || history.entries?.length !== expectedEntryCount) {
    throw new Error(`Expected ${expectedEntryCount} chart-history entries.`);
  }
  const serialized = JSON.stringify(history);
  if (
    privateNames.some((name) => serialized.includes(name)) ||
    /blob:|objecturl|filename|mimetype|filesize|decoded|worker/i.test(
      serialized,
    )
  ) {
    throw new Error("Chart history contains forbidden private/runtime data.");
  }
}

async function assertNoPrivateFilename(page) {
  for (const privateName of privateNames) {
    if ((await page.getByText(privateName).count()) !== 0) {
      throw new Error("A private filename reached visible evidence.");
    }
  }
}

async function assertNarrowHistoryLayout(page) {
  const layout = await page.evaluate(() => {
    const selectors = [
      ".chart-history",
      ".chart-history__entry",
      ".chart-history__facts",
      ".chart-history__actions",
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
    throw new Error(`Mobile history overflow: ${JSON.stringify(layout)}`);
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
  await selectAndAnalyze(desktopPage, privateNames[0]);
  const generated = desktopPage.getByTestId("generated-difficulties");
  await generated.getByRole("button", { name: "Start Easy chart" }).click();
  await generated.getByText("Track complete").waitFor({ timeout: 15_000 });
  await generated
    .getByText(
      "Chart and result saved to recent history. Audio and filename were not saved.",
    )
    .waitFor();
  await screenshot(
    desktopPage,
    "desktop-result-saved.png",
    "a completed generated chart remains visible while its audio-free chart/result history save is confirmed",
    "1280x800 generated chart",
    generated,
  );
  await assertHistoryPrivacy(desktopPage, 1, desktopTraffic);
  const saved = await readHistory(desktopPage);

  await desktopPage.reload({ waitUntil: "networkidle" });
  const history = desktopPage.locator(".chart-history");
  await history.getByText("Generated Easy chart").waitFor();
  if (
    (await desktopPage.getByLabel("Local audio preview").count()) !== 0 ||
    (await history.getByRole("button", { name: /Start|Play/ }).count()) !== 0
  ) {
    throw new Error("Audio-absent history incorrectly exposed playback.");
  }
  await screenshot(
    desktopPage,
    "desktop-history-no-audio.png",
    "reload restores chart/result facts and retention/privacy guidance without audio or a historical play action",
    "1280x800 history",
    history,
  );
  await assertHistoryPrivacy(desktopPage, 1, desktopTraffic);

  const chooserPromise = desktopPage.waitForEvent("filechooser");
  await history
    .getByRole("button", { name: "Select and analyze local song again" })
    .click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: privateNames[0],
    mimeType: "audio/wav",
    buffer: ownedWave,
  });
  await desktopPage
    .getByRole("heading", { name: "Ready for analysis" })
    .waitFor();
  await screenshot(
    desktopPage,
    "desktop-history-reselect-ready.png",
    "history reselect opens the private chooser but does not enable playback before successful analysis",
    "1280x800 local-song workspace",
    desktopPage.locator(".local-audio"),
  );
  if (
    (await desktopPage
      .getByRole("button", { name: /Start .* chart/ })
      .count()) !== 0
  ) {
    throw new Error("Reselection enabled playback before re-analysis.");
  }

  await desktopPage.getByRole("button", { name: "Analyze beats" }).click();
  await desktopPage.getByRole("button", { name: "Start Easy chart" }).waitFor();
  await screenshot(
    desktopPage,
    "desktop-history-reanalysis-playable.png",
    "successful local re-analysis regenerates the chart and restores the normal playable flow",
    "1280x800 generated chart",
    desktopPage.getByTestId("generated-difficulties"),
  );

  await writeHistory(desktopPage, legacyTwinDocument(saved));
  await desktopPage.reload({ waitUntil: "networkidle" });
  await desktopPage
    .getByText("Chart-only history was migrated and restored.")
    .waitFor();
  await screenshot(
    desktopPage,
    "desktop-history-migrated.png",
    "a strict version-zero chart-only envelope migrates once into two newest-first entries",
    "1280x800 history",
    desktopPage.locator(".chart-history"),
  );
  await assertHistoryPrivacy(desktopPage, 2, desktopTraffic);
  const migrated = await readHistory(desktopPage);

  await desktopPage
    .locator(".chart-history__entry")
    .first()
    .getByRole("button", { name: "Delete entry" })
    .click();
  await desktopPage
    .getByText(
      "Chart/result entry deleted. Music, recovery, corrections, and calibration were not changed.",
    )
    .waitFor();
  await screenshot(
    desktopPage,
    "desktop-history-one-deleted.png",
    "targeted deletion removes one durable chart/result entry and leaves the other visible",
    "1280x800 history",
    desktopPage.locator(".chart-history"),
  );
  await assertHistoryPrivacy(desktopPage, 1, desktopTraffic);

  await desktopPage
    .getByRole("button", { name: "Clear chart history" })
    .click();
  await desktopPage
    .getByText(
      "Chart-only history cleared. Music, recovery, corrections, and calibration were not changed.",
    )
    .waitFor();
  await screenshot(
    desktopPage,
    "desktop-history-cleared.png",
    "clear-all removes only chart/result history and returns to the truthful empty state",
    "1280x800 history",
    desktopPage.locator(".chart-history"),
  );
  await assertHistoryPrivacy(desktopPage, 0, desktopTraffic);

  await writeHistory(desktopPage, corruptNestedDocument(migrated));
  await desktopPage.reload({ waitUntil: "networkidle" });
  await desktopPage
    .getByText(
      "Invalid chart history was discarded. Current music and recovery data were not changed.",
    )
    .waitFor();
  await screenshot(
    desktopPage,
    "desktop-history-corrupt-discarded.png",
    "unknown nested state is never rendered and is discarded with a truthful isolation notice",
    "1280x800 history",
    desktopPage.locator(".chart-history"),
  );
  await assertHistoryPrivacy(desktopPage, 0, desktopTraffic);
  await assertNoPrivateFilename(desktopPage);
  const desktopVideo = desktopPage.video();
  await desktopContext.close();
  await rename(
    await desktopVideo.path(),
    path.join(captureDirectory, "result-to-return-loop.webm"),
  );
  await recordArtifact(
    "result-to-return-loop.webm",
    "completion, chart-only save, audio-absent reload, explicit reselect, re-analysis, migration, delete, clear, and corruption recovery",
    "1280x800",
  );

  const deniedContext = await browser.newContext({
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
  });
  await deniedContext.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      value: undefined,
    });
  });
  const deniedPage = await deniedContext.newPage();
  const deniedTraffic = watchPage(deniedPage);
  await deniedPage.goto(baseURL, { waitUntil: "networkidle" });
  await deniedPage
    .getByText(
      "Chart history storage is unavailable. The game still works, but new local results may not survive reload.",
    )
    .waitFor();
  if (
    !(await deniedPage.getByRole("button", { name: "Start demo" }).isEnabled())
  ) {
    throw new Error("History storage denial blocked the bundled game.");
  }
  await screenshot(
    deniedPage,
    "desktop-history-storage-denied.png",
    "browser storage denial is nonfatal and visibly scoped to chart-history durability",
    "1280x800",
  );
  assertTraffic(deniedTraffic);
  await deniedContext.close();

  const mobileContext = await browser.newContext({ ...devices["Pixel 7"] });
  const mobilePage = await mobileContext.newPage();
  const mobileTraffic = watchPage(mobilePage);
  await mobilePage.goto(baseURL, { waitUntil: "networkidle" });
  await assertBuild(mobilePage);
  await writeHistory(mobilePage, migrated);
  await mobilePage.reload({ waitUntil: "networkidle" });
  await mobilePage.locator(".chart-history__entry").first().waitFor();
  await assertNarrowHistoryLayout(mobilePage);
  await screenshot(
    mobilePage,
    "mobile-chart-history.png",
    "412-pixel chart-only history keeps facts, privacy copy, timeline, reselect, delete, and clear controls contained",
    "412x915 history",
    mobilePage.locator(".chart-history"),
  );
  await assertHistoryPrivacy(mobilePage, 2, mobileTraffic);
  await assertNoPrivateFilename(mobilePage);
  await mobileContext.close();

  const expectedArtifacts = [
    "desktop-result-saved.png",
    "desktop-history-no-audio.png",
    "desktop-history-reselect-ready.png",
    "desktop-history-reanalysis-playable.png",
    "desktop-history-migrated.png",
    "desktop-history-one-deleted.png",
    "desktop-history-cleared.png",
    "desktop-history-corrupt-discarded.png",
    "result-to-return-loop.webm",
    "desktop-history-storage-denied.png",
    "mobile-chart-history.png",
  ];
  if (
    artifacts.length !== expectedArtifacts.length ||
    expectedArtifacts.some(
      (file) => !artifacts.some((artifact) => artifact.file === file),
    )
  ) {
    throw new Error("Sprint 09 evidence inventory is incomplete.");
  }

  const manifest = {
    storyId: "09",
    previewUrl: baseURL,
    buildIdentifier: expectedBuild,
    capturedAt: new Date().toISOString(),
    previewType: "loopback production build",
    externalDeployment: "not required",
    privacy:
      "repository-owned synthesized input only; strict bounded chart/result metadata only; no audio, filename, File, path, MIME metadata, file size, object URL, decoded samples, or worker buffers",
    historyAssertions: {
      storageVersion: 1,
      maximumEntries: 20,
      completionSaved: true,
      reloadRestoresChartAndResult: true,
      reloadRestoresAudio: false,
      historicalPlayAction: false,
      reselectRequiresAnalysis: true,
      successfulAnalysisRestoresPlay: true,
      versionZeroMigration: true,
      targetedDelete: true,
      clearAll: true,
      unknownNestedFieldDiscarded: true,
      storageDeniedNonfatal: true,
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

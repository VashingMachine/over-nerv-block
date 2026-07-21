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
  "story/07-correct-imperfect-chart/evidence",
);
const outputDirectory = path.resolve(
  process.env.EVIDENCE_DIR ?? storyEvidenceDirectory,
);
const temporaryRoot = path.resolve(tmpdir());
const ownedWave = await readFile(
  path.resolve("apps/web/public/audio/demo-pulse.wav"),
);
const privateNames = [
  "private-correction-owned.wav",
  "private-different-owned.wav",
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
    "EVIDENCE_DIR must be the Sprint 07 evidence directory or a child of the operating-system temporary directory.",
  );
}

await mkdir(path.dirname(outputDirectory), { recursive: true });
const captureDirectory = await mkdtemp(
  path.join(path.dirname(outputDirectory), ".evidence-capture-"),
);
const temporaryVideoDirectory = await mkdtemp(
  path.join(tmpdir(), "over-nerv-block-story-07-"),
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

async function selectAndAnalyze(
  page,
  buffer = ownedWave,
  name = privateNames[0],
) {
  await page.getByLabel("Choose local music file").setInputFiles({
    name,
    mimeType: "audio/wav",
    buffer,
  });
  await page.getByRole("heading", { name: "Ready for analysis" }).waitFor();
  await page.getByRole("button", { name: "Analyze beats" }).click();
  await page.getByTestId("correction-editor").waitFor();
}

async function assertEditorRevision(editor, expectedRevision) {
  const comparison = await editor.locator(".correction-comparison").innerText();
  const history = await editor.locator(".correction-history").innerText();
  if (
    !comparison
      .toLowerCase()
      .includes(`correction revision\n${expectedRevision}`) ||
    !history.includes(`${expectedRevision} committed operations`)
  ) {
    throw new Error(
      `Expected correction revision ${expectedRevision}, received ${JSON.stringify({ comparison, history })}`,
    );
  }
}

async function difficultyCount(picker, description) {
  return picker
    .getByRole("button", { name: new RegExp(description) })
    .locator("small")
    .evaluate((label) => Number.parseInt(label.textContent ?? "", 10));
}

async function assertNarrowLayout(page) {
  await page.evaluate(() => window.scrollTo(0, 0));
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
  if (
    layout.scrollX !== 0 ||
    layout.scrollWidth > layout.clientWidth ||
    layout.outside.length > 0
  ) {
    throw new Error(`Narrow layout escaped: ${JSON.stringify(layout)}`);
  }
}

async function assertPrivacy(page, traffic, expectedCorrectionDocuments) {
  const bodyText = await page.locator("body").innerText();
  const consoleText = traffic.consoleMessages.join("\n");
  if (
    privateNames.some(
      (privateName) =>
        bodyText.includes(privateName) || consoleText.includes(privateName),
    )
  ) {
    throw new Error("A private local-audio filename reached product output.");
  }
  if (
    traffic.applicationWrites.length > 0 ||
    traffic.unexpectedRequests.length > 0
  ) {
    throw new Error("A correction scenario made an unexpected request.");
  }
  const persistence = await page.evaluate(async () => ({
    cacheKeys: "caches" in window ? await caches.keys() : [],
    databaseNames:
      typeof indexedDB.databases === "function"
        ? (await indexedDB.databases()).map((database) => database.name)
        : [],
    localStorageEntries: Object.entries(localStorage),
    registrations:
      "serviceWorker" in navigator
        ? (await navigator.serviceWorker.getRegistrations()).length
        : 0,
  }));
  if (
    persistence.cacheKeys.length > 0 ||
    persistence.databaseNames.length > 0 ||
    persistence.registrations > 0
  ) {
    throw new Error(
      `Correction capture found unexpected durable storage: ${JSON.stringify(persistence)}`,
    );
  }
  if (persistence.localStorageEntries.length !== expectedCorrectionDocuments) {
    throw new Error(
      `Expected ${expectedCorrectionDocuments} compact correction documents, found ${persistence.localStorageEntries.length}.`,
    );
  }
  for (const [key, value] of persistence.localStorageEntries) {
    if (
      !key.startsWith("over-nerv-block:rhythm-correction:") ||
      value.includes('"beats"') ||
      value.includes('"tempoBpm"') ||
      privateNames.some((privateName) => value.includes(privateName))
    ) {
      throw new Error("Correction storage contains disallowed product data.");
    }
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

  await selectAndAnalyze(desktopPage);
  const editor = desktopPage.getByTestId("correction-editor");
  await screenshot(
    desktopPage,
    "desktop-original-grid.png",
    "immutable original and matching working grid before correction",
    "1280x800",
  );

  await editor.getByLabel("Offset in milliseconds").fill("-1000");
  await editor.getByRole("button", { name: "Apply offset" }).click();
  await editor
    .getByRole("alert")
    .filter({ hasText: "outside the song" })
    .waitFor();
  await assertEditorRevision(editor, 0);
  await screenshot(
    desktopPage,
    "desktop-invalid-offset.png",
    "out-of-bounds offset is rejected with an actionable error and revision/history remain zero",
    "1280x800 section",
    editor,
  );

  await editor.getByRole("button", { name: "Apply tap grid" }).click();
  await editor
    .getByRole("alert")
    .filter({ hasText: "Record at least three taps" })
    .waitFor();
  await assertEditorRevision(editor, 0);
  await screenshot(
    desktopPage,
    "desktop-invalid-taps.png",
    "too-few taps are rejected without changing the working grid, charts, revision, or history",
    "1280x800 section",
    editor,
  );

  const initialBeat = await editor.getByLabel("Selected beat").inputValue();
  await editor.getByLabel("New beat time in seconds").fill(initialBeat);
  await editor.getByRole("button", { name: "Add beat" }).click();
  await editor
    .getByRole("alert")
    .filter({ hasText: "already exists" })
    .waitFor();
  await assertEditorRevision(editor, 0);
  await screenshot(
    desktopPage,
    "desktop-invalid-duplicate.png",
    "duplicate beat is rejected while original/working facts and revision remain unchanged",
    "1280x800 section",
    editor,
  );

  await editor.getByRole("button", { name: "Use double tempo" }).click();
  await assertEditorRevision(editor, 1);
  await editor.getByRole("button", { name: "Use double tempo" }).click();
  await editor
    .getByRole("alert")
    .filter({ hasText: "40–240 BPM range" })
    .waitFor();
  await assertEditorRevision(editor, 1);
  await screenshot(
    desktopPage,
    "desktop-invalid-tempo.png",
    "second double-tempo request is rejected at 240 BPM without adding a revision",
    "1280x800 section",
    editor,
  );
  await editor.getByRole("button", { name: "Reset all corrections" }).click();
  await assertEditorRevision(editor, 0);

  await editor.getByLabel("Offset in milliseconds").fill("20");
  await editor.getByRole("button", { name: "Apply offset" }).click();
  await editor.getByText("Offset +20 ms").waitFor();
  await screenshot(
    desktopPage,
    "desktop-offset-correction.png",
    "owned pulse fixture shifted 20 ms to its known beat times with saved revision",
    "1280x800",
    editor,
  );

  await editor.getByRole("button", { name: "Use half tempo" }).click();
  await editor.getByText("60.0 BPM").last().waitFor();
  await screenshot(
    desktopPage,
    "desktop-tempo-correction.png",
    "half-tempo reinterpretation with original-versus-working facts and undo controls",
    "1280x800",
    editor,
  );

  await editor.getByRole("button", { name: "Use double tempo" }).click();
  await editor.getByRole("button", { name: "Use 3/4" }).click();
  const beatSelect = editor.getByLabel("Selected beat");
  const fourthBeat = await beatSelect.evaluate(
    (select) => select.options[3].value,
  );
  await beatSelect.selectOption(fourthBeat);
  await editor.getByRole("button", { name: "Set as first downbeat" }).click();
  await editor.getByLabel("New beat time in seconds").fill("0.75");
  await editor.getByRole("button", { name: "Add beat" }).click();
  await beatSelect.selectOption("0.75");
  await editor.getByRole("button", { name: "Remove selected beat" }).click();
  await editor.getByText(/revision 7 · correction-editor-v1/).waitFor();

  const picker = editor.getByLabel("Chart difficulty");
  const counts = {
    easy: await difficultyCount(picker, "Bar starts"),
    medium: await difficultyCount(picker, "Adds alternating"),
    hard: await difficultyCount(picker, "Uses every safe"),
  };
  if (!(counts.easy < counts.medium && counts.medium < counts.hard)) {
    throw new Error(
      `Corrected difficulty density contract failed: ${JSON.stringify(counts)}`,
    );
  }
  await picker.getByRole("button", { name: /Uses every safe/ }).click();
  await screenshot(
    desktopPage,
    "desktop-corrected-difficulties.png",
    "meter, downbeat, add/remove history and all regenerated difficulties at correction revision 7",
    "1280x800",
    editor,
  );

  await editor.getByRole("button", { name: "Start Hard chart" }).click();
  await editor.getByText("Get ready").waitFor();
  await waitForSongTime(desktopPage, 0.7);
  await editor.getByRole("button", { name: "Pause" }).click();
  await editor.getByText("Paused").waitFor();
  const pausedAt = await editor
    .getByRole("progressbar", { name: "Song progress" })
    .evaluate((progress) => progress.value);
  await desktopPage.waitForTimeout(1_200);
  const stillPausedAt = await editor
    .getByRole("progressbar", { name: "Song progress" })
    .evaluate((progress) => progress.value);
  if (Math.abs(stillPausedAt - pausedAt) > 0.03) {
    throw new Error("Corrected gameplay progressed while visibly paused.");
  }
  await screenshot(
    desktopPage,
    "desktop-corrected-paused.png",
    "corrected Hard chart visibly paused for more than one second with Resume and stable progress",
    "1280x800 section",
    editor.locator(".play-stage"),
  );
  await editor.getByRole("button", { name: "Resume" }).click();
  await waitForSongTime(desktopPage, pausedAt + 0.25);
  await editor.getByRole("button", { name: "Restart" }).click();
  await editor.getByText("Get ready").waitFor();
  await waitForSongTime(desktopPage, 0.7);
  await screenshot(
    desktopPage,
    "desktop-corrected-playing.png",
    "corrected Hard chart running from a fresh countdown after pause, resume, and restart",
    "1280x800 section",
    editor.locator(".play-stage"),
  );
  await editor.getByText("Track complete").waitFor({ timeout: 15_000 });
  const results = editor.getByRole("status", { name: "Track results" });
  await screenshot(
    desktopPage,
    "desktop-corrected-results.png",
    "corrected chart completed with score, judgments, accuracy, and retry",
    "1280x800 section",
    results,
  );

  const preview = desktopPage.getByLabel("Local audio preview");
  for (const timeSeconds of [1, 1.5, 2, 2.5]) {
    await preview.evaluate((audio, time) => {
      audio.currentTime = time;
    }, timeSeconds);
    await editor.getByRole("button", { name: "Tap beat" }).click();
  }
  await editor.getByRole("button", { name: "Apply tap grid" }).click();
  await editor.getByText("Tap tempo and phase from 4 taps").waitFor();
  await screenshot(
    desktopPage,
    "desktop-tap-grid.png",
    "tap tempo and phase committed as revision 8",
    "1280x800 section",
    editor,
  );
  await editor.getByRole("button", { name: "Undo last correction" }).click();
  await editor.getByText(/revision 7 · correction-editor-v1/).waitFor();
  await assertEditorRevision(editor, 7);
  await screenshot(
    desktopPage,
    "desktop-undo-revision-7.png",
    "first Undo replays revision 7 and regenerates its prior chart identity",
    "1280x800 section",
    editor,
  );
  await editor.getByRole("button", { name: "Undo last correction" }).click();
  await editor.getByText(/revision 6 · correction-editor-v1/).waitFor();
  await assertEditorRevision(editor, 6);
  await screenshot(
    desktopPage,
    "desktop-undo-revision-6.png",
    "second Undo independently replays revision 6 with its added beat and regenerated chart identity",
    "1280x800 section",
    editor,
  );
  await editor.getByRole("button", { name: "Reset all corrections" }).click();
  await editor
    .getByText("Working grid matches the original analysis")
    .waitFor();
  await screenshot(
    desktopPage,
    "desktop-reset.png",
    "reset restored the immutable original and removed correction storage",
    "1280x800 section",
    editor,
  );

  await editor.getByLabel("Offset in milliseconds").fill("20");
  await editor.getByRole("button", { name: "Apply offset" }).click();
  await desktopPage.reload({ waitUntil: "networkidle" });
  await desktopPage.getByText("No song selected").waitFor();
  await screenshot(
    desktopPage,
    "desktop-reload-no-audio.png",
    "reload retains no music and asks the player to select the file again",
    "1280x800",
  );
  await selectAndAnalyze(desktopPage);
  await desktopPage
    .getByTestId("correction-editor")
    .getByRole("status")
    .filter({ hasText: "Saved corrections restored" })
    .waitFor();
  await screenshot(
    desktopPage,
    "desktop-restored-correction.png",
    "matching private reanalysis restores only the compact correction revision",
    "1280x800",
  );

  const storedCorrection = await desktopPage.evaluate(() => {
    const [entry] = Object.entries(localStorage);
    if (!entry) throw new Error("Expected a saved correction document.");
    const [key, serialized] = entry;
    return { key, document: JSON.parse(serialized) };
  });
  await desktopPage.evaluate(({ key, document }) => {
    localStorage.setItem(
      key,
      JSON.stringify({
        storageVersion: 0,
        sourceFingerprint: document.sourceFingerprint,
        operations: document.operations,
      }),
    );
  }, storedCorrection);
  await desktopPage.reload({ waitUntil: "networkidle" });
  await selectAndAnalyze(desktopPage);
  await desktopPage
    .getByTestId("correction-editor")
    .getByRole("status")
    .filter({ hasText: "migrated and restored" })
    .waitFor();
  await screenshot(
    desktopPage,
    "desktop-migrated-correction.png",
    "version-zero correction state migrates once and visibly restores the matching revision",
    "1280x800",
  );

  await desktopPage.evaluate(
    (key) => localStorage.setItem(key, "not-json"),
    storedCorrection.key,
  );
  await desktopPage.reload({ waitUntil: "networkidle" });
  await selectAndAnalyze(desktopPage);
  await desktopPage
    .getByTestId("correction-editor")
    .getByRole("status")
    .filter({ hasText: "Invalid saved corrections were discarded" })
    .waitFor();
  await screenshot(
    desktopPage,
    "desktop-corrupt-correction.png",
    "corrupt saved correction is discarded nonfatally while the original analysis remains usable",
    "1280x800",
  );

  const recoveryEditor = desktopPage.getByTestId("correction-editor");
  await recoveryEditor.getByLabel("Offset in milliseconds").fill("20");
  await recoveryEditor.getByRole("button", { name: "Apply offset" }).click();
  const foreignCorrection = await desktopPage.evaluate(() => {
    const [entry] = Object.entries(localStorage);
    if (!entry)
      throw new Error("Expected a correction to prepare foreign state.");
    const [key, serialized] = entry;
    return { key, document: JSON.parse(serialized) };
  });
  await desktopPage.evaluate(({ key, document }) => {
    localStorage.setItem(
      key,
      JSON.stringify({ ...document, sourceFingerprint: "foreign" }),
    );
  }, foreignCorrection);
  await desktopPage.reload({ waitUntil: "networkidle" });
  await selectAndAnalyze(desktopPage);
  await desktopPage
    .getByTestId("correction-editor")
    .getByRole("status")
    .filter({ hasText: "Invalid saved corrections were discarded" })
    .waitFor();
  await screenshot(
    desktopPage,
    "desktop-foreign-correction.png",
    "foreign-fingerprint correction is discarded and cannot alter the matching original grid",
    "1280x800",
  );

  const foreignRecoveryEditor = desktopPage.getByTestId("correction-editor");
  await foreignRecoveryEditor.getByLabel("Offset in milliseconds").fill("20");
  await foreignRecoveryEditor
    .getByRole("button", { name: "Apply offset" })
    .click();
  const originalIsolationDocument = await desktopPage.evaluate(() => {
    const [entry] = Object.entries(localStorage);
    if (!entry) throw new Error("Expected the original correction document.");
    return { key: entry[0], serialized: entry[1] };
  });

  await desktopPage.getByRole("button", { name: "Replace music" }).click();
  await selectAndAnalyze(desktopPage, shortPulseWave(), privateNames[1]);
  const differentEditor = desktopPage.getByTestId("correction-editor");
  await differentEditor
    .getByRole("status")
    .filter({ hasText: "No correction is saved" })
    .waitFor();
  await screenshot(
    desktopPage,
    "desktop-different-analysis.png",
    "visibly different owned analysis receives no correction from the prior song fingerprint",
    "1280x800",
  );

  const isolatedBeforeEdit = await desktopPage.evaluate(() =>
    Object.entries(localStorage),
  );
  if (
    isolatedBeforeEdit.length !== 1 ||
    isolatedBeforeEdit[0][0] !== originalIsolationDocument.key ||
    isolatedBeforeEdit[0][1] !== originalIsolationDocument.serialized
  ) {
    throw new Error(
      "Selecting a different analysis changed the original correction document.",
    );
  }

  await differentEditor.getByLabel("Offset in milliseconds").fill("10");
  await differentEditor.getByRole("button", { name: "Apply offset" }).click();
  await assertEditorRevision(differentEditor, 1);

  const differentBeatSelect = differentEditor.getByLabel("Selected beat");
  const initialDifferentBeatCount = await differentBeatSelect
    .locator("option")
    .count();
  while ((await differentBeatSelect.locator("option").count()) > 2) {
    await differentEditor
      .getByRole("button", { name: "Remove selected beat" })
      .click();
  }
  const expectedMinimumRevision =
    1 + Math.max(0, initialDifferentBeatCount - 2);
  await assertEditorRevision(differentEditor, expectedMinimumRevision);
  await differentEditor
    .getByRole("button", { name: "Remove selected beat" })
    .click();
  await differentEditor
    .getByRole("alert")
    .filter({ hasText: "at least two beats" })
    .waitFor();
  await assertEditorRevision(differentEditor, expectedMinimumRevision);
  await screenshot(
    desktopPage,
    "desktop-minimum-beats.png",
    "removing below two beats is rejected without adding another revision",
    "1280x800 section",
    differentEditor,
  );

  const coexistingDocuments = await desktopPage.evaluate(() =>
    Object.entries(localStorage),
  );
  if (
    coexistingDocuments.length !== 2 ||
    !coexistingDocuments.some(
      ([key, serialized]) =>
        key === originalIsolationDocument.key &&
        serialized === originalIsolationDocument.serialized,
    )
  ) {
    throw new Error(
      "Per-fingerprint correction documents did not coexist without changing the original.",
    );
  }

  await desktopPage.getByRole("button", { name: "Replace music" }).click();
  await selectAndAnalyze(desktopPage);
  const originalAfterDifferent = desktopPage.getByTestId("correction-editor");
  await originalAfterDifferent
    .getByRole("status")
    .filter({ hasText: "Saved corrections restored" })
    .waitFor();
  await assertEditorRevision(originalAfterDifferent, 1);
  await screenshot(
    desktopPage,
    "desktop-original-after-different.png",
    "returning to the original analysis restores its unchanged revision while the second fingerprint remains isolated",
    "1280x800",
  );
  await assertPrivacy(desktopPage, desktopTraffic, 2);
  const desktopVideo = desktopPage.video();
  await desktopContext.close();
  await rename(
    await desktopVideo.path(),
    path.join(captureDirectory, "correction-to-play-loop.webm"),
  );
  await recordArtifact(
    "correction-to-play-loop.webm",
    "invalid no-change states, all correction families, corrected pause/resume/restart and results, repeated undo/reset, reload/restore, migration/corruption/foreign recovery, and different-analysis isolation",
    "1280x800",
  );

  const deniedContext = await browser.newContext({
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
  });
  await deniedContext.addInitScript(() => {
    const prefix = "over-nerv-block:rhythm-correction:";
    for (const methodName of ["getItem", "setItem", "removeItem"]) {
      const original = Storage.prototype[methodName];
      Object.defineProperty(Storage.prototype, methodName, {
        configurable: true,
        value(key, ...values) {
          if (String(key).startsWith(prefix)) {
            throw new DOMException("Storage denied", "SecurityError");
          }
          return original.call(this, key, ...values);
        },
      });
    }
  });
  const deniedPage = await deniedContext.newPage();
  const deniedTraffic = watchPage(deniedPage);
  await deniedPage.goto(baseURL, { waitUntil: "networkidle" });
  await selectAndAnalyze(deniedPage);
  const deniedEditor = deniedPage.getByTestId("correction-editor");
  await deniedEditor
    .getByRole("status")
    .filter({ hasText: "Browser storage is unavailable" })
    .waitFor();
  await deniedEditor.getByLabel("Offset in milliseconds").fill("20");
  await deniedEditor.getByRole("button", { name: "Apply offset" }).click();
  await assertEditorRevision(deniedEditor, 1);
  await screenshot(
    deniedPage,
    "desktop-storage-denied.png",
    "storage denial remains nonfatal: correction revision 1 works in-tab with truthful no-reload warning",
    "1280x800 section",
    deniedEditor,
  );
  await assertPrivacy(deniedPage, deniedTraffic, 0);
  await deniedContext.close();

  const mobileContext = await browser.newContext({ ...devices["Pixel 7"] });
  const mobilePage = await mobileContext.newPage();
  const mobileTraffic = watchPage(mobilePage);
  await mobilePage.goto(baseURL, { waitUntil: "networkidle" });
  await selectAndAnalyze(mobilePage);
  const mobileEditor = mobilePage.getByTestId("correction-editor");
  await mobileEditor.getByLabel("Offset in milliseconds").fill("20");
  await mobileEditor.getByRole("button", { name: "Apply offset" }).click();
  await mobileEditor.getByText("Offset +20 ms").waitFor();
  await assertNarrowLayout(mobilePage);
  await screenshot(
    mobilePage,
    "mobile-correction-workspace.png",
    "412-pixel correction workspace with comparison, controls, history, save state, and regenerated play action",
    "412x915",
  );
  await assertPrivacy(mobilePage, mobileTraffic, 1);
  await mobileContext.close();

  const expectedArtifacts = [
    "desktop-original-grid.png",
    "desktop-invalid-offset.png",
    "desktop-invalid-taps.png",
    "desktop-invalid-duplicate.png",
    "desktop-invalid-tempo.png",
    "desktop-offset-correction.png",
    "desktop-tempo-correction.png",
    "desktop-corrected-difficulties.png",
    "desktop-corrected-paused.png",
    "desktop-corrected-playing.png",
    "desktop-corrected-results.png",
    "desktop-tap-grid.png",
    "desktop-undo-revision-7.png",
    "desktop-undo-revision-6.png",
    "desktop-reset.png",
    "desktop-reload-no-audio.png",
    "desktop-restored-correction.png",
    "desktop-migrated-correction.png",
    "desktop-corrupt-correction.png",
    "desktop-foreign-correction.png",
    "desktop-different-analysis.png",
    "desktop-minimum-beats.png",
    "desktop-original-after-different.png",
    "correction-to-play-loop.webm",
    "desktop-storage-denied.png",
    "mobile-correction-workspace.png",
  ];
  if (
    artifacts.length !== expectedArtifacts.length ||
    expectedArtifacts.some(
      (file) => !artifacts.some((item) => item.file === file),
    )
  ) {
    throw new Error("Sprint 07 evidence inventory is incomplete.");
  }

  const evidenceManifest = {
    storyId: "07",
    previewUrl: baseURL,
    buildIdentifier: expectedBuild,
    capturedAt: new Date().toISOString(),
    previewType: "loopback production build",
    externalDeployment: "not required",
    privacy:
      "repository-owned synthesized input only; compact correction operations only; no audio, filename, object URL, samples, analyzer output, generated chart, or result record",
    correctionAssertions: {
      sourceFixtureGroundTruthSeconds: [1, 1.5, 2, 2.5],
      demonstratedOffsetMilliseconds: 20,
      demonstratedRevision: 8,
      invalidNoMutationStates: [
        "offset_out_of_bounds",
        "insufficient_taps",
        "duplicate_beat",
        "tempo_out_of_bounds",
        "minimum_beats",
      ],
      repeatedUndoRevisions: [8, 7, 6],
      resetToOriginal: true,
      reloadWithoutAudio: true,
      matchingReanalysisRestore: true,
      differentAnalysisIsolation: true,
      differentAnalysisCoexistingDocuments: 2,
      originalRestoredAfterDifferentAnalysis: true,
      storageRecoveryStates: [
        "migrated_v0",
        "corrupt_discarded",
        "foreign_discarded",
        "denied_nonfatal",
      ],
      editorVersion: "correction-editor-v1",
      difficultyNoteCountsAtRevision7: counts,
      correctedTransport: ["pause", "resume", "restart"],
      correctedGameplayCompleted: true,
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

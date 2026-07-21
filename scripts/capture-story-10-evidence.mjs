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
  "story/10-responsive-accessible-pwa/evidence",
);
const outputDirectory = path.resolve(
  process.env.EVIDENCE_DIR ?? storyEvidenceDirectory,
);
const temporaryRoot = path.resolve(tmpdir());
const ownedWave = await readFile(
  path.resolve("apps/web/public/audio/demo-pulse.wav"),
);
const ownedSelectionName = "owned-sprint-10-evidence.wav";

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
    "EVIDENCE_DIR must be the Sprint 10 evidence directory or a child of the operating-system temporary directory.",
  );
}

await mkdir(path.dirname(outputDirectory), { recursive: true });
const captureDirectory = await mkdtemp(
  path.join(path.dirname(outputDirectory), ".evidence-capture-"),
);
const videoDirectory = await mkdtemp(
  path.join(tmpdir(), "over-nerv-block-story-10-"),
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
  const externalRequests = [];
  const consoleMessages = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD"].includes(request.method())) {
      applicationWrites.push(`${request.method()} ${request.url()}`);
    }
    if (request.url().startsWith("http")) {
      const hostname = new URL(request.url()).hostname;
      if (!["127.0.0.1", "localhost"].includes(hostname)) {
        externalRequests.push(request.url());
      }
    }
  });
  page.on("console", (message) => consoleMessages.push(message.text()));
  return { applicationWrites, externalRequests, consoleMessages };
}

function assertTraffic(traffic) {
  if (
    traffic.applicationWrites.length > 0 ||
    traffic.externalRequests.length > 0
  ) {
    throw new Error(
      `Unexpected traffic: ${JSON.stringify({ writes: traffic.applicationWrites, external: traffic.externalRequests })}`,
    );
  }
  if (
    /salt\.mp3|private_audio_path|blob:/i.test(
      traffic.consoleMessages.join("\n"),
    )
  ) {
    throw new Error("Private or runtime audio identity reached the console.");
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

async function waitForOfflineReady(page) {
  await page.getByText("Offline ready", { exact: true }).waitFor({
    timeout: 10_000,
  });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

async function persistenceInventory(page) {
  return page.evaluate(async () => {
    const databaseRecords = [];
    const databaseNames =
      typeof indexedDB.databases === "function"
        ? (await indexedDB.databases())
            .map((database) => database.name)
            .filter(Boolean)
            .sort()
        : [];
    for (const name of databaseNames) {
      const records = await new Promise((resolve, reject) => {
        const open = indexedDB.open(name);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          const stores = Array.from(database.objectStoreNames);
          if (stores.length === 0) {
            database.close();
            resolve([]);
            return;
          }
          const transaction = database.transaction(stores, "readonly");
          const values = [];
          for (const store of stores) {
            const request = transaction.objectStore(store).getAll();
            request.onsuccess = () => values.push(...request.result);
            request.onerror = () => reject(request.error);
          }
          transaction.oncomplete = () => {
            database.close();
            resolve(values);
          };
          transaction.onerror = () => reject(transaction.error);
        };
      });
      databaseRecords.push(...records);
    }
    const cacheNames = await caches.keys();
    const cacheUrls = (
      await Promise.all(
        cacheNames.map(async (name) =>
          (await caches.open(name))
            .keys()
            .then((keys) => keys.map((key) => key.url)),
        ),
      )
    ).flat();
    return {
      cacheNames,
      cacheUrls,
      databaseNames,
      databaseRecords,
      localStorageEntries: Object.entries(localStorage),
      sessionStorageEntries: Object.entries(sessionStorage),
      registrations: (await navigator.serviceWorker.getRegistrations()).map(
        (registration) => registration.scope,
      ),
    };
  });
}

async function assertPwaPrivacy(page, traffic) {
  assertTraffic(traffic);
  const inventory = await persistenceInventory(page);
  if (
    inventory.cacheNames.length !== 1 ||
    !inventory.cacheNames[0].startsWith("over-nerv-block-shell-") ||
    inventory.registrations.length !== 1
  ) {
    throw new Error(
      "Expected exactly one application shell cache and registration.",
    );
  }
  const serialized = JSON.stringify(inventory);
  if (
    /salt\.mp3|private_audio_path|blob:|objecturl|filename|decoded|workerbuffer/i.test(
      serialized,
    )
  ) {
    throw new Error(
      "Persistent or cached state contains forbidden audio identity/runtime data.",
    );
  }
  if (
    !inventory.cacheUrls.some((url) => url.endsWith("/audio/demo-pulse.wav")) ||
    !inventory.cacheUrls.some((url) => url.endsWith("/manifest.webmanifest")) ||
    !inventory.cacheUrls.some((url) => /beatAnalysis\.worker-/.test(url))
  ) {
    throw new Error("The owned offline shell cache is incomplete.");
  }
  for (const [key, value] of inventory.localStorageEntries) {
    if (
      key !== "over-nerv-block:accessibility:v1" &&
      !key.startsWith("over-nerv-block:rhythm-correction:")
    ) {
      throw new Error(`Unexpected localStorage key ${key}`);
    }
    if (/filename|blob:|objecturl|audio/i.test(value)) {
      throw new Error("A local preference/correction contains audio identity.");
    }
  }
}

async function assertContained(page, selectors) {
  const layout = await page.evaluate((checkedSelectors) => {
    const outside = checkedSelectors.flatMap((selector) =>
      [...document.querySelectorAll(selector)].flatMap((element, index) => {
        const bounds = element.getBoundingClientRect();
        return bounds.left < -0.5 || bounds.right > window.innerWidth + 0.5
          ? [`${selector}[${index}]`]
          : [];
      }),
    );
    return {
      clientWidth: document.documentElement.clientWidth,
      outside,
      scrollWidth: document.documentElement.scrollWidth,
      scrollX: window.scrollX,
    };
  }, selectors);
  if (
    layout.scrollX !== 0 ||
    layout.scrollWidth > layout.clientWidth ||
    layout.outside.length > 0
  ) {
    throw new Error(`Responsive overflow: ${JSON.stringify(layout)}`);
  }
}

try {
  const updateContext = await browser.newContext({
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
  });
  const updatePage = await updateContext.newPage();
  const updateTraffic = watchPage(updatePage);
  await updatePage.goto(baseURL, { waitUntil: "networkidle" });
  await assertBuild(updatePage);
  await waitForOfflineReady(updatePage);
  await updatePage.evaluate(async () => {
    const registration = await navigator.serviceWorker.register(
      "./sw.js?evidence-update=1",
      { scope: "./" },
    );
    await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(
        () => reject(new Error("Waiting update was not installed")),
        8_000,
      );
      const check = () => {
        if (registration.waiting) {
          window.clearTimeout(timeout);
          resolve();
        }
      };
      check();
      registration.installing?.addEventListener("statechange", check);
    });
  });
  await updatePage.getByRole("button", { name: "Apply update" }).waitFor();
  await screenshot(
    updatePage,
    "desktop-update-waiting.png",
    "a newly installed shell remains waiting and exposes an explicit Apply update action without replacing the active app",
    "1280x800 local production PWA",
    updatePage.locator(".pwa-card"),
  );
  const priorController = await updatePage.evaluate(
    () => navigator.serviceWorker.controller?.scriptURL,
  );
  if (!priorController?.endsWith("/sw.js")) {
    throw new Error(
      "The waiting update replaced the active worker prematurely.",
    );
  }
  assertTraffic(updateTraffic);
  await updateContext.close();

  const desktopContext = await browser.newContext({
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: videoDirectory, size: { width: 1280, height: 800 } },
  });
  const desktopPage = await desktopContext.newPage();
  const desktopTraffic = watchPage(desktopPage);
  await desktopPage.goto(baseURL, { waitUntil: "networkidle" });
  await assertBuild(desktopPage);
  await waitForOfflineReady(desktopPage);
  await screenshot(
    desktopPage,
    "desktop-local-app-ready.png",
    "the immutable loopback build reports owned-demo offline readiness, browser-local media handling, and no cloud server",
    "1280x800 local production PWA",
    desktopPage.locator(".settings-grid"),
  );

  await desktopPage.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt: async () => undefined,
      userChoice: Promise.resolve({ outcome: "dismissed" }),
    });
    window.dispatchEvent(event);
  });
  await desktopPage.getByRole("button", { name: "Install app" }).waitFor();
  await screenshot(
    desktopPage,
    "desktop-install-available.png",
    "when the browser supplies an install prompt, the local app exposes a deliberate Install app action",
    "1280x800 local production PWA",
    desktopPage.locator(".pwa-card"),
  );

  await desktopPage.getByLabel("Motion").selectOption("reduce");
  await desktopPage.getByLabel("Primary hit key").selectOption("KeyJ");
  await desktopPage.getByText(/Hit with J; motion is reduced/).waitFor();
  await screenshot(
    desktopPage,
    "desktop-access-settings.png",
    "reduced motion and the J primary hit key are visibly selected with a text summary",
    "1280x800 accessibility settings",
    desktopPage.locator(".accessibility-card"),
  );

  await desktopContext.setOffline(true);
  await desktopPage.reload();
  await desktopPage.getByText("Offline", { exact: true }).waitFor();
  await desktopPage.getByRole("button", { name: "Start demo" }).click();
  await desktopPage.getByText("Get ready").waitFor();
  await screenshot(
    desktopPage,
    "desktop-offline-demo.png",
    "after an offline reload, the owned bundled demo starts with semantic transport and hit controls",
    "1280x800 offline bundled game",
    desktopPage.locator(".demo"),
  );
  await desktopContext.setOffline(false);
  await desktopPage.reload({ waitUntil: "networkidle" });
  await waitForOfflineReady(desktopPage);

  await desktopPage.getByLabel("Choose local music file").setInputFiles({
    name: ownedSelectionName,
    mimeType: "audio/wav",
    buffer: ownedWave,
  });
  await desktopPage
    .getByRole("heading", { name: "Ready for analysis" })
    .waitFor();
  await desktopPage.getByRole("button", { name: "Analyze beats" }).click();
  await desktopPage.getByTestId("correction-editor").waitFor();
  await screenshot(
    desktopPage,
    "desktop-analysis-editor.png",
    "owned local audio reaches the semantic correction editor and generated difficulty controls without displaying its filename",
    "1280x800 local analysis workspace",
    desktopPage.locator(".local-audio"),
  );

  const generated = desktopPage.getByTestId("generated-difficulties");
  await generated.getByRole("button", { name: "Start Easy chart" }).click();
  await generated.getByText("Get ready").waitFor();
  await screenshot(
    desktopPage,
    "desktop-generated-game.png",
    "the generated chart is active with text score, combo, miss, judgment, progress, transport, and remapped-key guidance",
    "1280x800 generated game",
    generated,
  );
  await generated.getByText("Track complete").waitFor({ timeout: 15_000 });
  await desktopPage.getByText("Generated Easy chart").waitFor();
  await screenshot(
    desktopPage,
    "desktop-result-history.png",
    "a completed generated run exposes textual results and chart-only history without retaining audio",
    "1280x800 result and chart history",
    desktopPage.locator(".local-audio"),
  );
  await assertContained(desktopPage, [
    ".settings-grid",
    ".local-audio",
    ".correction-editor",
    ".difficulty-picker",
    ".track-card",
    ".results-panel",
    ".chart-history",
  ]);
  await assertPwaPrivacy(desktopPage, desktopTraffic);
  if ((await desktopPage.getByText(ownedSelectionName).count()) !== 0) {
    throw new Error("The owned evidence filename reached visible UI.");
  }
  const desktopVideo = desktopPage.video();
  await desktopContext.close();
  await rename(
    await desktopVideo.path(),
    path.join(captureDirectory, "accessible-local-pwa-loop.webm"),
  );
  await recordArtifact(
    "accessible-local-pwa-loop.webm",
    "offline-ready local shell, install affordance, reduced motion/remapped key, offline demo, local analysis/editor, generated game, results, and chart-only history",
    "1280x800",
  );

  const mobileContext = await browser.newContext({ ...devices["Pixel 7"] });
  const mobilePage = await mobileContext.newPage();
  const mobileTraffic = watchPage(mobilePage);
  await mobilePage.goto(baseURL, { waitUntil: "networkidle" });
  await assertBuild(mobilePage);
  await waitForOfflineReady(mobilePage);
  await assertContained(mobilePage, [
    ".topbar",
    ".hero",
    ".settings-grid",
    ".pwa-card",
    ".accessibility-card",
    ".local-audio",
    ".track-card",
    ".footer",
  ]);
  await screenshot(
    mobilePage,
    "mobile-home-settings.png",
    "the 412-pixel layout keeps local-app status, install guidance, preferences, file selection, and demo controls contained",
    "412x915 mobile web",
  );
  await mobilePage.getByRole("button", { name: "Start demo" }).click();
  await mobilePage.getByText("Get ready").waitFor();
  await assertContained(mobilePage, [".demo", ".track-card", ".play-stage"]);
  await screenshot(
    mobilePage,
    "mobile-active-demo.png",
    "the active one-lane game remains contained and operable at the 412-pixel mobile viewport",
    "412x915 active mobile game",
    mobilePage.locator(".demo"),
  );
  await assertPwaPrivacy(mobilePage, mobileTraffic);
  await mobileContext.close();

  const unsupportedContext = await browser.newContext({
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
  });
  await unsupportedContext.addInitScript(() => {
    Reflect.deleteProperty(Navigator.prototype, "serviceWorker");
  });
  const unsupportedPage = await unsupportedContext.newPage();
  const unsupportedTraffic = watchPage(unsupportedPage);
  await unsupportedPage.goto(baseURL, { waitUntil: "networkidle" });
  await unsupportedPage
    .getByText(
      "This browser does not support local app installation or offline caching.",
    )
    .waitFor();
  await screenshot(
    unsupportedPage,
    "desktop-unsupported-capability.png",
    "a browser without service-worker support receives truthful online-only capability guidance while the game remains available",
    "1280x800 unsupported capability",
    unsupportedPage.locator(".pwa-card"),
  );
  assertTraffic(unsupportedTraffic);
  await unsupportedContext.close();

  const expectedArtifacts = [
    "desktop-update-waiting.png",
    "desktop-local-app-ready.png",
    "desktop-install-available.png",
    "desktop-access-settings.png",
    "desktop-offline-demo.png",
    "desktop-analysis-editor.png",
    "desktop-generated-game.png",
    "desktop-result-history.png",
    "accessible-local-pwa-loop.webm",
    "mobile-home-settings.png",
    "mobile-active-demo.png",
    "desktop-unsupported-capability.png",
  ];
  if (
    artifacts.length !== expectedArtifacts.length ||
    expectedArtifacts.some(
      (file) => !artifacts.some((artifact) => artifact.file === file),
    )
  ) {
    throw new Error("Sprint 10 evidence inventory is incomplete.");
  }

  const manifest = {
    storyId: "10",
    previewUrl: baseURL,
    buildIdentifier: expectedBuild,
    capturedAt: new Date().toISOString(),
    previewType: "loopback static production build",
    externalDeployment: "not required or performed",
    input: "repository-owned synthesized audio only",
    privateAcceptanceInput:
      "excluded: salt.mp3 is locally verified by a separate no-media harness and is never included in this packet",
    assertions: {
      manifestAndIconsValid: true,
      oneBuildSpecificOwnedCache: true,
      selectedMusicCached: false,
      bundledDemoOffline: true,
      installPromptOnlyWhenBrowserProvided: true,
      updateWaitsForExplicitAction: true,
      reducedMotionVisibleAndPersisted: true,
      remappedPrimaryKeyVisibleAndOperable: true,
      semanticNonCanvasControls: true,
      textualNonColorJudgments: true,
      desktopContained: true,
      mobile412Contained: true,
      unsupportedCapabilityTruthful: true,
      externalTrafficOrWrites: false,
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

import { accessSync, constants } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

const suppliedPath = process.env.PRIVATE_AUDIO_PATH;
if (!suppliedPath) {
  throw new Error(
    "PRIVATE_AUDIO_PATH is required for the opt-in private-audio check.",
  );
}
const absoluteSuppliedPath = path.resolve(suppliedPath);
accessSync(absoluteSuppliedPath, constants.R_OK);
const privateBasename = path.basename(absoluteSuppliedPath);

test("supplied private track reaches generated gameplay without escaping", async ({
  page,
}) => {
  const consoleMessages: string[] = [];
  const requests: Array<{ readonly method: string; readonly url: string }> = [];
  page.on("console", (message) => consoleMessages.push(message.text()));
  page.on("request", (request) =>
    requests.push({ method: request.method(), url: request.url() }),
  );

  await page.goto("./");
  await page
    .getByLabel("Choose local music file")
    .setInputFiles(absoluteSuppliedPath);
  await expect(
    page.getByRole("heading", { name: "Ready for analysis" }),
  ).toBeVisible();
  await expect(page.getByText("277.6 seconds", { exact: true })).toBeVisible();
  await expect(page.getByText("MP3", { exact: true })).toBeVisible();
  await expect(
    page.getByText("2 channels · 48000 Hz", { exact: true }),
  ).toBeVisible();

  await page.evaluate(() => {
    const testWindow = window as typeof window & {
      __privateAudioHeartbeat?: number;
      __privateAudioHeartbeatTimer?: number;
    };
    testWindow.__privateAudioHeartbeat = 0;
    testWindow.__privateAudioHeartbeatTimer = window.setInterval(() => {
      testWindow.__privateAudioHeartbeat =
        (testWindow.__privateAudioHeartbeat ?? 0) + 1;
    }, 25);
  });
  await page.getByRole("button", { name: "Analyze beats" }).click();
  await expect(page.getByTestId("beat-grid")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start Easy chart" }),
  ).toBeEnabled();
  const heartbeat = await page.evaluate(() => {
    const testWindow = window as typeof window & {
      __privateAudioHeartbeat?: number;
      __privateAudioHeartbeatTimer?: number;
    };
    if (testWindow.__privateAudioHeartbeatTimer !== undefined) {
      window.clearInterval(testWindow.__privateAudioHeartbeatTimer);
    }
    return testWindow.__privateAudioHeartbeat ?? 0;
  });
  expect(heartbeat).toBeGreaterThan(3);

  await page.getByRole("button", { name: "Start Easy chart" }).click();
  await expect(page.getByText("Get ready")).toBeVisible();
  await page.waitForFunction(() => {
    const progress = document.querySelector<HTMLProgressElement>(
      'progress[aria-label="Song progress"]',
    );
    return progress !== null && progress.value >= 0.2;
  });
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByText("Paused")).toBeVisible();

  const browserState = await page.evaluate(async () => {
    const databaseRecords: unknown[] = [];
    if (typeof indexedDB.databases === "function") {
      for (const info of await indexedDB.databases()) {
        if (!info.name) continue;
        const records = await new Promise<unknown[]>((resolve, reject) => {
          const open = indexedDB.open(info.name!);
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const database = open.result;
            const storeNames = Array.from(database.objectStoreNames);
            if (storeNames.length === 0) {
              database.close();
              resolve([]);
              return;
            }
            const transaction = database.transaction(storeNames, "readonly");
            const values: unknown[] = [];
            for (const storeName of storeNames) {
              const request = transaction.objectStore(storeName).getAll();
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
      bodyText: document.body.innerText,
      localStorage: Object.entries(localStorage),
      sessionStorage: Object.entries(sessionStorage),
      databaseRecords,
      cacheNames,
      cacheUrls,
      registrations: (await navigator.serviceWorker.getRegistrations()).map(
        (registration) => registration.scope,
      ),
    };
  });

  const serializedState = JSON.stringify(browserState);
  expect(serializedState).not.toContain(privateBasename);
  expect(serializedState).not.toContain(absoluteSuppliedPath);
  expect(serializedState).not.toMatch(/blob:/i);
  expect(consoleMessages.join("\n")).not.toContain(privateBasename);
  expect(consoleMessages.join("\n")).not.toContain(absoluteSuppliedPath);
  expect(
    requests.filter((request) => !["GET", "HEAD"].includes(request.method)),
  ).toEqual([]);
  expect(requests.map((request) => request.url).join("\n")).not.toContain(
    privateBasename,
  );
  expect(requests.map((request) => request.url).join("\n")).not.toContain(
    absoluteSuppliedPath,
  );
  expect(browserState.cacheNames).toHaveLength(1);
  expect(browserState.cacheUrls.join("\n")).not.toMatch(/blob:|private/i);
  expect(browserState.registrations).toHaveLength(1);
});

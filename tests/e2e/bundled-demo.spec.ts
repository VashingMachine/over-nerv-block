import { expect, test, type Page } from "@playwright/test";

async function expectHorizontalContainment(page: Page) {
  const layout = await page.evaluate(() => {
    const selectors = [
      ".topbar",
      ".hero",
      ".status-card",
      ".track-card",
      ".play-stage",
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

  expect(layout.scrollX).toBe(0);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
  expect(layout.outsideViewport).toEqual([]);
}

async function waitForSongTime(page: Page, minimumSeconds: number) {
  await page.waitForFunction(
    (minimum) => {
      const progress = document.querySelector<HTMLProgressElement>(
        'progress[aria-label="Song progress"]',
      );
      return progress !== null && progress.value >= minimum;
    },
    minimumSeconds,
    { timeout: 8_000 },
  );
}

async function songTime(page: Page) {
  return page
    .getByRole("progressbar", { name: "Song progress" })
    .evaluate((progress: HTMLProgressElement) => progress.value);
}

test("player completes the bundled demo with keyboard and pointer input", async ({
  page,
}) => {
  await page.goto("./");

  await expect(
    page.getByRole("heading", { name: "Circuit Pulse" }),
  ).toBeVisible();
  await expect(page.getByText("8 seconds")).toBeVisible();
  await expect(page.getByText("Original percussion synthesized")).toBeVisible();

  await page.getByRole("button", { name: "Start demo" }).click();
  await expect(page.getByText("Get ready")).toBeVisible();
  await expect(
    page.getByTestId("rhythm-canvas").locator("canvas"),
  ).toBeVisible();

  await waitForSongTime(page, 0.97);
  await page.keyboard.press("Space");
  await expect(page.getByTestId("input-feedback")).toContainText(
    /Perfect|Good/,
  );
  const firstScore = Number(
    (
      await page.getByTestId("scoreboard").locator("strong").first().innerText()
    ).replaceAll(",", ""),
  );

  await waitForSongTime(page, 1.47);
  await page.getByRole("button", { name: "Hit", exact: true }).click();
  await expect
    .poll(async () =>
      Number(
        (
          await page
            .getByTestId("scoreboard")
            .locator("strong")
            .first()
            .innerText()
        ).replaceAll(",", ""),
      ),
    )
    .toBeGreaterThan(firstScore);

  await waitForSongTime(page, 1.97);
  await page
    .getByTestId("rhythm-canvas")
    .locator("canvas")
    .click({
      position: { x: 20, y: 20 },
    });
  await expect(page.getByTestId("input-feedback")).toContainText(
    /Perfect|Good/,
  );
  await expectHorizontalContainment(page);

  await expect(page.getByText("Track complete")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("button", { name: "Play again" })).toBeEnabled();
  await expect(
    page.getByRole("status", { name: "Track results" }),
  ).toContainText("Accuracy");
  await expect(
    page.getByRole("status", { name: "Track results" }),
  ).toContainText("Miss");
  await page.getByRole("button", { name: "Retry run" }).click();
  await expect(page.getByText("Get ready")).toBeVisible();
  await expect(page.getByTestId("scoreboard")).toContainText("Score 0");
  await expectHorizontalContainment(page);
});

test("player can persist calibration and control the transport", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Calibrate device" }).click();
  await expect(
    page.getByRole("heading", { name: "Calibrate this device" }),
  ).toBeVisible();
  await page.getByRole("slider").fill("80");
  await page.getByRole("button", { name: "Save calibration" }).click();
  await expect(page.getByText("+80 ms", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText("+80 ms", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start demo" }).click();
  await waitForSongTime(page, 0.25);
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByText("Paused")).toBeVisible();
  const pausedAt = await songTime(page);
  await page.waitForTimeout(350);
  expect(await songTime(page)).toBe(pausedAt);

  await page.getByRole("button", { name: "Resume" }).click();
  await waitForSongTime(page, pausedAt + 0.15);
  await page.getByRole("button", { name: "Restart" }).click();
  await expect(page.getByText("Get ready")).toBeVisible();
  await expect(page.getByTestId("scoreboard")).toContainText("Score 0");
  await expectHorizontalContainment(page);
});

test("player can retry after the demo audio fails", async ({ page }) => {
  let audioUnavailable = true;
  await page.route("**/audio/demo-pulse.wav", async (route) => {
    if (audioUnavailable) {
      await route.fulfill({ status: 503, body: "temporarily unavailable" });
      return;
    }
    await route.continue();
  });

  await page.goto("./");
  await page.getByRole("button", { name: "Start demo" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Demo audio could not be loaded (503)",
  );

  audioUnavailable = false;
  await page.getByRole("button", { name: "Retry demo" }).click();
  await expect(page.getByText("Get ready")).toBeVisible();
  await expect(
    page.getByTestId("rhythm-canvas").locator("canvas"),
  ).toBeVisible();
});

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

  await page.keyboard.press("Space");
  await expect(page.getByTestId("input-feedback")).toHaveText(
    "Input 1 received",
  );
  await page.getByRole("button", { name: "Hit", exact: true }).click();
  await expect(page.getByTestId("input-feedback")).toHaveText(
    "Input 2 received",
  );
  await page
    .getByTestId("rhythm-canvas")
    .locator("canvas")
    .click({
      position: { x: 20, y: 20 },
    });
  await expect(page.getByTestId("input-feedback")).toHaveText(
    "Input 3 received",
  );
  await expectHorizontalContainment(page);

  await expect(page.getByText("Track complete")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("button", { name: "Play again" })).toBeEnabled();
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

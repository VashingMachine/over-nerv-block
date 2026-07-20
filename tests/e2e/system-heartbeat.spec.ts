import { expect, test } from "@playwright/test";

const apiBaseUrl = (process.env.E2E_API_BASE_URL ?? "/api").replace(/\/$/, "");

test("web and API report the deployed system heartbeat", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Make every beat playable." }),
  ).toBeVisible();
  await expect(page.getByText("System online")).toBeVisible();
  await expect(
    page.getByText("Web and API are speaking in tempo."),
  ).toBeVisible();
  await expect(page.getByText("v1")).toBeVisible();

  const healthResponse = await page.request.get(`${apiBaseUrl}/health`);
  expect(healthResponse.ok()).toBeTruthy();
  await expect(healthResponse.json()).resolves.toMatchObject({
    status: "ok",
    service: "api",
  });
});

test("player can retry after the API becomes reachable", async ({ page }) => {
  let apiUnavailable = true;

  await page.route("**/api/health", async (route) => {
    if (apiUnavailable) {
      await route.abort("connectionfailed");
      return;
    }

    await route.continue();
  });

  await page.goto("/");
  await expect(page.getByText("System unavailable")).toBeVisible();

  apiUnavailable = false;
  await page.getByRole("button", { name: "Try again" }).click();

  await expect(page.getByText("System online")).toBeVisible();
});

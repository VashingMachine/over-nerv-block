import { expect, test } from "@playwright/test";

test("the production build reports its heartbeat", async ({ page }) => {
  await page.goto("./");

  await expect(
    page.getByRole("heading", { name: "Make every beat playable." }),
  ).toBeVisible();
  await expect(page.getByText("System online")).toBeVisible();
  await expect(
    page.getByText("Game files are ready. Your music stays in this browser."),
  ).toBeVisible();
  await expect(page.getByText("v1")).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);

  const manifestResponse = await page.request.get(
    new URL("build-info.json", page.url()).toString(),
  );
  expect(manifestResponse.ok()).toBeTruthy();
  await expect(manifestResponse.json()).resolves.toMatchObject({
    status: "ready",
    app: "over-nerv-block",
    processing: "browser-local",
  });
});

test("player can retry after the build manifest becomes reachable", async ({
  page,
}) => {
  let manifestUnavailable = true;

  await page.route("**/build-info.json", async (route) => {
    if (manifestUnavailable) {
      await route.abort("connectionfailed");
      return;
    }

    await route.continue();
  });

  await page.goto("./");
  await expect(page.getByText("System unavailable")).toBeVisible();

  manifestUnavailable = false;
  await page.getByRole("button", { name: "Try again" }).click();

  await expect(page.getByText("System online")).toBeVisible();
});

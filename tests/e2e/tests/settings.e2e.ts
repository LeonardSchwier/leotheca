import { expect, test } from "../support/fixtures.js";
import { CONFIG_DIR } from "../support/workspace.js";

const openSettings = (page: import("@playwright/test").Page) =>
  page.getByRole("navigation", { name: "Primary navigation" }).getByRole("button", { name: "Settings" }).click();

test.describe("theme", () => {
  test.use({ bridge: { theme: "light" } });

  test("the saved theme applies at boot and a change is persisted", async ({ app }) => {
    const { page } = app;
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await openSettings(page);
    await page.getByRole("button", { name: "Appearance", exact: true }).click();
    await page.getByRole("button", { name: "Dark", exact: true }).click();

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect
      .poll(async () => JSON.parse((await app.file(`${CONFIG_DIR}/config.json`)) ?? "{}").theme, {
        message: "theme written to the native config file",
      })
      .toBe("dark");
  });
});

test("settings opens on the workspace root and asks the native side for statistics", async ({ app }) => {
  const { page } = app;
  await page.goto("/");
  await openSettings(page);
  await expect(page.getByText("/e2e/notes", { exact: true })).toBeVisible();
  await expect.poll(async () => (await app.calls("workspace_stats")).length).toBeGreaterThan(0);
  const [stats] = await app.calls("workspace_stats");
  expect(stats.args.path).toBe("/e2e/notes");
});

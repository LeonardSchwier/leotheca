import { expect, test } from "../support/fixtures.js";
import { CONFIG_DIR } from "../support/workspace.js";

const openSettings = (page: import("@playwright/test").Page) =>
  page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Settings" })
    .click();

test.describe("theme", () => {
  test.use({ bridge: { theme: "light" } });

  test("the saved theme applies at boot and a change is persisted", async ({
    app,
  }) => {
    const { page } = app;
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await openSettings(page);
    await page.getByRole("button", { name: "Appearance", exact: true }).click();
    await page.getByRole("button", { name: "Dark", exact: true }).click();

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect
      .poll(
        async () =>
          JSON.parse((await app.file(`${CONFIG_DIR}/config.json`)) ?? "{}")
            .theme,
        {
          message: "theme written to the native config file",
        },
      )
      .toBe("dark");
  });
});

test("choosing German switches the language, sets the document language and is persisted", async ({
  app,
}) => {
  const { page } = app;
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  await openSettings(page);
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page.getByRole("button", { name: "Deutsch", exact: true }).click();

  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  // The row is now labelled in German, and the language names stay as they were.
  // The Theme row has a "System folgen" button too, so look inside the Language row.
  await expect(page.getByText("Sprache", { exact: true })).toBeVisible();
  const languageRow = page
    .locator(".settings-row")
    .filter({ has: page.getByText("Sprache", { exact: true }) });
  await expect(
    languageRow.getByRole("button", { name: "System folgen", exact: true }),
  ).toBeVisible();
  await expect(
    languageRow.getByRole("button", { name: "Deutsch", exact: true }),
  ).toBeVisible();
  await expect
    .poll(
      async () =>
        JSON.parse((await app.file(`${CONFIG_DIR}/config.json`)) ?? "{}")
          .language,
      { message: "language written to the native config file" },
    )
    .toBe("de");
});

test("settings opens on the workspace root and asks the native side for statistics", async ({
  app,
}) => {
  const { page } = app;
  await page.goto("/");
  await openSettings(page);
  await expect(page.getByText("/e2e/notes", { exact: true })).toBeVisible();
  await expect
    .poll(async () => (await app.calls("workspace_stats")).length)
    .toBeGreaterThan(0);
  const [stats] = await app.calls("workspace_stats");
  expect(stats.args.path).toBe("/e2e/notes");
});

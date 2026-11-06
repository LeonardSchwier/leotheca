import { expect, test } from "../support/fixtures.js";
import { abs, treeItem } from "../support/helpers.js";

test("boots into the saved workspace and lists its notes", async ({ app }) => {
  const { page } = app;
  await page.goto("/");

  await expect(page.locator(".workspace-switcher-name")).toHaveText("E2E Notes");
  for (const note of ["welcome.md", "projects/plan.md", "projects/retro.md", "research/walrus.md", "inbox/draft.md"]) {
    await expect(treeItem(page, note), note).toBeVisible();
  }
  await expect(page.locator(`[data-tree-path="${abs("empty-folder")}"]`)).toBeVisible();
  // Nothing is open yet: the empty state shows, not an editor.
  await expect(page.locator(".editor-empty")).toBeVisible();
  await expect(page.locator(".cm-content")).toHaveCount(0);

  // The app asked the native side for the workspace, not some other root.
  const listings = await app.calls("list_dir");
  expect(listings.length).toBeGreaterThan(0);
  expect(listings.every((c) => c.args.workspaceRoot === "/e2e/notes")).toBe(true);
});

test("primary navigation switches between sidebar views", async ({ app }) => {
  const { page } = app;
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Primary navigation" });

  await expect(nav.getByRole("button", { name: "Files" })).toHaveAttribute("aria-current", "true");
  await nav.getByRole("button", { name: "Tags" }).click();
  await expect(nav.getByRole("button", { name: "Tags" })).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("tree", { name: "File tree" })).toHaveCount(0);
  await nav.getByRole("button", { name: "Files" }).click();
  await expect(page.getByRole("tree", { name: "File tree" })).toBeVisible();
});

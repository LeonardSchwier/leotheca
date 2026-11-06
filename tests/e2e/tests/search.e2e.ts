import { expect, test } from "../support/fixtures.js";
import { buildIndexViaTagsPanel, openNote, searchBox, searchResultNames, treeItem } from "../support/helpers.js";

/** Types a query, then waits for the debounced search to settle on `names`. */
async function expectResults(app: { page: import("@playwright/test").Page }, query: string, names: string[]) {
  await searchBox(app.page).fill(query);
  await expect.poll(() => searchResultNames(app.page), { message: `results for "${query}"` }).toEqual(names);
}

test("full-text search with operators, empty state and clear", async ({ app }) => {
  const { page } = app;
  await page.goto("/");
  await buildIndexViaTagsPanel(page);

  await expectResults(app, "walrus", ["walrus.md", "retro.md"]);
  await expectResults(app, "walrus -retro", ["walrus.md"]);
  await expectResults(app, "tag:pelican", ["plan.md"]);
  await expectResults(app, "path:research", ["walrus.md"]);
  await expectResults(app, "tusks OR pelican", ["walrus.md", "plan.md", "retro.md"]);

  await searchBox(page).fill("zzzznomatchzzzz");
  await expect(page.locator(".search-results .file-tree-item")).toHaveCount(0);
  await expect(page.locator(".sidebar-inner")).toContainText(/no (results|matches)/i);

  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(searchBox(page)).toHaveValue("");
  await expect(treeItem(page, "welcome.md")).toBeVisible();
  await expect(page.locator(".search-results")).toHaveCount(0);
});

test("clicking a search result opens that note", async ({ app }) => {
  const { page } = app;
  await page.goto("/");
  await searchBox(page).fill("tusks");
  await page.locator(".search-results .file-tree-item", { hasText: "walrus.md" }).click();
  await expect(page.locator(".tab-active .tab-name")).toHaveText("walrus.md");
  await expect(page.locator(".cm-content")).toContainText("The walrus has tusks.");
  // Opening it read the real file from the mocked workspace.
  const reads = await app.calls("read_text_file");
  expect(reads.some((c) => c.args.path === "/e2e/notes/research/walrus.md")).toBe(true);
  await openNote(page, "welcome.md");
});

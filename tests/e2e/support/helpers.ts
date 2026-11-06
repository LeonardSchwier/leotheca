import type { Page } from "@playwright/test";
import { WORKSPACE_ROOT } from "./workspace.js";

/** Absolute mocked path for a workspace-relative note path. */
export const abs = (relative: string) => `${WORKSPACE_ROOT}/${relative}`;

/** A file-tree row, addressed by its workspace-relative path. */
export const treeItem = (page: Page, relative: string) =>
  page.locator(`[data-tree-path="${abs(relative)}"]`);

export async function openNote(page: Page, relative: string) {
  await treeItem(page, relative).click();
}

export async function setViewMode(page: Page, mode: "Source" | "Split" | "Preview") {
  await page.getByRole("radio", { name: mode }).click();
}

export const searchBox = (page: Page) => page.getByPlaceholder("Search notes...");

/** Names shown by the search results list, in order. */
export const searchResultNames = (page: Page) =>
  page.locator(".search-results .file-tree-item").evaluateAll((items) =>
    items.map((item) => (item.childNodes[0]?.textContent ?? "").trim()),
  );

/**
 * Opens the Tags panel and returns to Files. The app builds its link/tag index
 * when a panel that needs it opens, so wikilink resolution and `tag:` search
 * both depend on this having happened, exactly as for a real user.
 */
export async function buildIndexViaTagsPanel(page: Page) {
  const nav = page.getByRole("navigation", { name: "Primary navigation" });
  await nav.getByRole("button", { name: "Tags" }).click();
  await page.getByText("pelican", { exact: true }).first().waitFor();
  await nav.getByRole("button", { name: "Files" }).click();
}

import { expect, test } from "../support/fixtures.js";
import { buildIndexViaTagsPanel, openNote, setViewMode } from "../support/helpers.js";

test("preview renders the markdown features a note uses", async ({ app }) => {
  const { page } = app;
  await page.goto("/");
  await openNote(page, "welcome.md");
  await setViewMode(page, "Preview");

  const preview = page.locator(".markdown-preview");
  await expect(preview.locator("h1")).toHaveText("Welcome");
  await expect(preview.locator("strong")).toHaveText("bold");
  await expect(preview.locator("em")).toHaveText("italic");
  await expect(preview.locator("mark")).toHaveText("highlighted words");
  await expect(preview.locator('input[type="checkbox"]')).toHaveCount(2);
  await expect(preview.locator('input[type="checkbox"]:checked')).toHaveCount(1);
  await expect(preview.locator("table tr")).toHaveCount(2);
  await expect(preview.locator("table th")).toHaveText(["Col1", "Col2"]);
  await expect(preview.locator(".katex")).toHaveCount(2);
  await expect(preview.locator(".katex-display")).toHaveCount(1);
  await expect(preview.getByRole("link", { name: "plan", exact: true })).toBeVisible();
});

test("a wikilink in the preview opens the linked note", async ({ app }) => {
  const { page } = app;
  await page.goto("/");
  await buildIndexViaTagsPanel(page);
  await openNote(page, "welcome.md");
  await setViewMode(page, "Preview");

  await page.locator(".markdown-preview").getByRole("link", { name: "plan", exact: true }).click();
  await expect(page.locator(".tab-active .tab-name")).toHaveText("plan.md");
  await expect(page.locator(".markdown-preview h1")).toHaveText("Project Plan");
});

test("view modes switch between source, split and preview", async ({ app }) => {
  const { page } = app;
  await page.goto("/");
  await openNote(page, "welcome.md");

  await expect(page.locator(".cm-content")).toBeVisible();
  await expect(page.locator(".markdown-preview")).toHaveCount(0);

  await setViewMode(page, "Split");
  await expect(page.locator(".cm-content")).toBeVisible();
  await expect(page.locator(".markdown-preview h1")).toHaveText("Welcome");

  await setViewMode(page, "Preview");
  await expect(page.locator(".cm-content")).toHaveCount(0);
  await expect(page.locator(".markdown-preview h1")).toHaveText("Welcome");

  await setViewMode(page, "Source");
  await expect(page.getByRole("radio", { name: "Source" })).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".cm-content")).toContainText("# Welcome");
});

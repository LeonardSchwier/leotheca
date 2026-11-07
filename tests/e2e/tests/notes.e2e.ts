import { expect, test } from "../support/fixtures.js";
import { abs, openNote, treeItem } from "../support/helpers.js";

test("opening a note shows it in a tab with its text", async ({ app }) => {
  const { page } = app;
  await page.goto("/");
  await openNote(page, "projects/retro.md");

  await expect(page.locator(".tab-active .tab-name")).toHaveText("retro.md");
  await expect(page.locator(".cm-content")).toContainText("The pelican team met.");
  await expect(treeItem(page, "projects/retro.md")).toHaveAttribute("aria-selected", "true");

  await page.getByRole("button", { name: "Close retro.md" }).click();
  await expect(page.locator(".tab")).toHaveCount(0);
  await expect(page.locator(".editor-empty")).toBeVisible();
});

test("creating a note writes a new file and opens it", async ({ app }) => {
  const { page } = app;
  await page.goto("/");

  await page.locator(".sidebar-toolbar").getByRole("button", { name: "New note" }).click();
  const prompt = page.locator(".name-prompt");
  await expect(prompt.getByRole("heading", { name: "New note" })).toBeVisible();
  await prompt.getByPlaceholder("note-name").fill("fresh-idea");
  await prompt.getByRole("button", { name: "Create" }).click();

  await expect(treeItem(page, "fresh-idea.md")).toBeVisible();
  await expect(page.locator(".tab-active .tab-name")).toHaveText("fresh-idea.md");
  expect(await app.file(abs("fresh-idea.md"))).toBeDefined();
});

test("typing in the editor autosaves to the native file", async ({ app }) => {
  const { page } = app;
  await page.goto("/");
  await openNote(page, "inbox/draft.md");

  const editor = page.locator(".cm-content");
  await editor.click();
  await page.keyboard.press("Control+End");
  // insertText sends one input event. Pressing several keys one after another freezes headless
  // Chromium once an edit is pending (see the handoff for rm-57a389f7112eb947); not hidden, tracked.
  await page.keyboard.insertText(" Autosaved sentence about pelicans.");

  await expect
    .poll(() => app.file(abs("inbox/draft.md")), { message: "autosave reached the native side" })
    .toContain("Autosaved sentence about pelicans.");
  // The original text was kept, not replaced.
  expect(await app.file(abs("inbox/draft.md"))).toContain("Disposable note.");
  await expect(page.locator(".document-header-savestate")).toHaveClass(/savestate-clean/);
});

test("renaming a note moves the file and keeps the content", async ({ app }) => {
  const { page } = app;
  await page.goto("/");

  await treeItem(page, "inbox/draft.md").click({ button: "right" });
  await page.getByRole("button", { name: "Rename" }).click();
  const prompt = page.locator(".name-prompt");
  await prompt.getByRole("textbox").fill("renamed.md");
  await prompt.getByRole("button", { name: "Rename" }).click();

  await expect(treeItem(page, "inbox/renamed.md")).toBeVisible();
  await expect(treeItem(page, "inbox/draft.md")).toHaveCount(0);
  expect(await app.file(abs("inbox/draft.md"))).toBeUndefined();
  expect(await app.file(abs("inbox/renamed.md"))).toContain("Disposable note.");
});

test("deleting a note moves it to the workspace trash", async ({ app }) => {
  const { page } = app;
  await page.goto("/");
  await openNote(page, "inbox/draft.md");
  await expect(page.locator(".tab-active .tab-name")).toHaveText("draft.md");

  await treeItem(page, "inbox/draft.md").click({ button: "right" });
  await page.getByRole("button", { name: "Delete" }).click();

  await expect(treeItem(page, "inbox/draft.md")).toHaveCount(0);
  await expect(page.locator(".tab")).toHaveCount(0);
  expect(await app.file(abs("inbox/draft.md"))).toBeUndefined();
  expect(await app.file(abs(".trash/inbox/draft.md"))).toContain("Disposable note.");
  expect((await app.calls("trash_path")).length).toBe(1);
});

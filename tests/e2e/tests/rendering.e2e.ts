import { expect, test } from "../support/fixtures.js";
import { NOTE_FILES } from "../support/workspace.js";
import {
  buildIndexViaTagsPanel,
  openNote,
  setViewMode,
} from "../support/helpers.js";

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
  await expect(preview.locator('input[type="checkbox"]:checked')).toHaveCount(
    1,
  );
  await expect(preview.locator("table tr")).toHaveCount(2);
  await expect(preview.locator("table th")).toHaveText(["Col1", "Col2"]);
  await expect(preview.locator(".katex")).toHaveCount(2);
  await expect(preview.locator(".katex-display")).toHaveCount(1);
  await expect(
    preview.getByRole("link", { name: "plan", exact: true }),
  ).toBeVisible();
});

test("a wikilink in the preview opens the linked note", async ({ app }) => {
  const { page } = app;
  await page.goto("/");
  await buildIndexViaTagsPanel(page);
  await openNote(page, "welcome.md");
  await setViewMode(page, "Preview");

  await page
    .locator(".markdown-preview")
    .getByRole("link", { name: "plan", exact: true })
    .click();
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
  await expect(page.getByRole("radio", { name: "Source" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.locator(".cm-content")).toContainText("# Welcome");
});

test("a mermaid diagram renders as a zoomable figure that follows the theme", async ({
  app,
}) => {
  const { page } = app;
  await page.goto("/");
  await openNote(page, "projects/plan.md");
  await setViewMode(page, "Preview");

  const figure = page.locator(".markdown-preview .mermaid-figure");
  await expect(figure.locator(".mermaid-canvas svg")).toBeVisible();

  await figure.getByRole("button", { name: "Zoom in" }).click();
  await expect(figure.locator(".mermaid-canvas")).toHaveCSS(
    "transform",
    /^matrix\(1\.25, 0, 0, 1\.25, /,
  );
  await figure.getByRole("button", { name: "Reset zoom" }).click();
  await expect(figure).toHaveAttribute("data-zoomed", "false");

  await figure.getByRole("button", { name: "Full screen" }).click();
  await expect(figure).toHaveClass(/mermaid-fullscreen/);
  await page.keyboard.press("Escape");
  await expect(figure).not.toHaveClass(/mermaid-fullscreen/);

  // Flipping the app theme redraws the diagram in the matching mermaid theme.
  const before = await figure.locator(".mermaid-canvas svg").innerHTML();
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-theme", "dark"),
  );
  await expect
    .poll(async () => figure.locator(".mermaid-canvas svg").innerHTML())
    .not.toBe(before);
});

test.describe("text structure", () => {
  test.use({
    bridge: {
      files: {
        ...NOTE_FILES,
        "syntax.md": [
          "# Top",
          "",
          "## Second level",
          "",
          "### Third level",
          "",
          "Use `npm ci` before the build.",
          "",
          "> A quoted remark",
          "",
        ].join("\n"),
      },
    },
  });

  test("preview renders nested headings, inline code and block quotes", async ({
    app,
  }) => {
    const { page } = app;
    await page.goto("/");
    await openNote(page, "syntax.md");
    await setViewMode(page, "Preview");

    const preview = page.locator(".markdown-preview");
    await expect(preview.locator("h1")).toHaveText("Top");
    await expect(preview.locator("h2")).toHaveText("Second level");
    await expect(preview.locator("h3")).toHaveText("Third level");
    await expect(preview.locator("p code")).toHaveText("npm ci");
    await expect(preview.locator("blockquote")).toContainText(
      "A quoted remark",
    );
  });
});

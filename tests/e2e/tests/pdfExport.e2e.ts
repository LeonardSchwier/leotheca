import { expect, test } from "../support/fixtures.js";
import { openNote, setViewMode } from "../support/helpers.js";

test("Export note to PDF opens the print dialog on a paginated document with rendered math", async ({
  app,
}) => {
  const { page } = app;
  // Chromium headless has no print dialog: record what the throwaway print
  // iframe would have printed instead of calling the real window.print().
  await page.addInitScript(() => {
    const w = window as unknown as { __printed: unknown[] };
    w.__printed = [];
    const original = Node.prototype.appendChild;
    Node.prototype.appendChild = function <T extends Node>(
      this: Node,
      node: T,
    ): T {
      const result = original.call(this, node) as T;
      if (node instanceof HTMLIFrameElement && node.contentWindow) {
        const frame = node;
        (frame.contentWindow as Window).print = () => {
          const d = frame.contentDocument!;
          w.__printed.push({
            title: d.title,
            html: d.documentElement.outerHTML,
            katex: d.querySelectorAll(".katex").length,
          });
        };
      }
      return result;
    };
  });
  await page.goto("/");
  await openNote(page, "welcome.md");
  await setViewMode(page, "Preview");
  await expect(page.locator(".markdown-preview .katex").first()).toBeVisible();

  await page.keyboard.press("Control+k");
  await page.getByPlaceholder("Type a command...").fill("Export note to PDF");
  await expect(page.getByText("Export note to PDF…")).toBeVisible();
  await page.keyboard.press("Enter");

  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __printed: unknown[] }).__printed.length,
      ),
    )
    .toBe(1);
  const printed = await page.evaluate(
    () =>
      (
        window as unknown as {
          __printed: Array<{ title: string; html: string; katex: number }>;
        }
      ).__printed[0],
  );
  expect(printed.title).toBe("welcome.md");
  expect(printed.html).toContain("@page");
  expect(printed.html).toContain("break-after: avoid");
  expect(printed.html).toContain(".katex");
  expect(printed.katex).toBe(2);
});

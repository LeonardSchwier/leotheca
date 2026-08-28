/** @vitest-environment jsdom */
/* global document */
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(async () => {
  await import("./clipperCore.js");
});

function fragment(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template.content;
}

describe("web clipper core", () => {
  it("turns selected headings, text, links, and list items into Markdown", () => {
    const markdown = globalThis.LeothecaClipperCore.fragmentToMarkdown(
      fragment("<h2>Heading</h2><p>Hello <strong>world</strong> <a href='https://example.test/path'>link</a>.</p><script>ignored()</script><ul><li>One</li><li>Two</li></ul>"),
    );

    expect(markdown).toContain("## Heading");
    expect(markdown).toContain("Hello **world** [link](https://example.test/path).");
    expect(markdown).toContain("- One");
    expect(markdown).toContain("- Two");
    expect(markdown).not.toContain("ignored()");
  });

  it("does not preserve unsafe links and rejects an empty selection", () => {
    expect(globalThis.LeothecaClipperCore.fragmentToMarkdown(fragment("<a href='javascript:alert(1)'>text</a>"))).toBe("text");
    expect(() => globalThis.LeothecaClipperCore.buildClip({ title: "Empty", fragment: fragment("  "), sourceUrl: "https://example.test", includeSource: true })).toThrow("Select some readable page content");
  });

  it("creates a portable Markdown note with an optional safe source link", () => {
    const clip = globalThis.LeothecaClipperCore.buildClip({
      title: "A / useful clip",
      fragment: fragment("<p>Selected text</p>"),
      sourceUrl: "https://example.test/article",
      includeSource: true,
    });

    expect(clip.filename).toBe("A - useful clip.md");
    expect(clip.markdown).toBe("# A / useful clip\n\nSelected text\n\nSource: https://example.test/article\n");
  });

  it("omits an unsafe source URL instead of preserving it in a note", () => {
    const clip = globalThis.LeothecaClipperCore.buildClip({
      title: "Safe source",
      fragment: fragment("<p>Selected text</p>"),
      sourceUrl: "javascript:alert(1)",
      includeSource: true,
    });

    expect(clip.markdown).toBe("# Safe source\n\nSelected text\n");
  });
});

// Smoke test for the mermaid extension: verifies the marked tokenizer fires
// and the renderer emits a placeholder div (not [object Promise]).
// Full async rendering is exercised by the browser/electron runtime via
// renderMermaidToSvg; this test only checks the sync parse path.
import { describe, expect, it, vi } from "vitest";
import DOMPurify from "dompurify";
import { marked } from "marked";
import {
  setMermaidRenderingEnabled,
  sanitizeMermaidSvg,
  renderMermaidToSvg,
} from "./src/markdown/mermaid";

// Mock the mermaid module so renderMermaidToSvg can be tested without a
// real DOM or browser runtime.
vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(),
  },
}));

import mermaid from "mermaid";

describe("sanitizeMermaidSvg", () => {
  it("strips onerror and onclick event-handler attributes", () => {
    const input = '<svg onerror="alert(1)" onclick="steal()"><circle onmouseover="x"/></svg>';
    const output = sanitizeMermaidSvg(input);
    expect(output).not.toContain("onerror");
    expect(output).not.toContain("onclick");
    expect(output).not.toContain("onmouseover");
    expect(output).not.toContain("alert");
  });

  it("rewrites javascript: and data:text/html hrefs to #", () => {
    const input =
      '<a href="javascript:alert(1)">x</a><img src="data:text/html,<script>alert(1)</script>" />';
    const output = sanitizeMermaidSvg(input);
    expect(output).not.toContain("javascript:");
    expect(output).not.toContain("data:text/html");
    expect(output).toContain('href="#"');
    expect(output).toContain('src="#"');
  });

  it("leaves safe href and src values untouched", () => {
    const input = '<a href="https://example.com">link</a><img src="data:image/png;base64,AA==" />';
    const output = sanitizeMermaidSvg(input);
    expect(output).toContain('href="https://example.com"');
    expect(output).toContain('src="data:image/png;base64,AA=="');
  });
});

describe("foreignObject injection (security regression)", () => {
  // A hostile Mermaid source can produce SVG containing <foreignObject>,
  // which can carry live HTML (script, onerror handlers) that executes in
  // the document context when inserted. Two layers must block it:
  //   1. sanitizeMermaidSvg -- the helper's own defense in depth (regex
  //      layer, strips on* handlers and javascript:/data:text/html refs).
  //   2. DOMPurify -- MarkdownPreview's final sanitize pass, which drops
  //      <foreignObject> wholesale (it is not in the default allowlist).
  //
  // The layer split matters and is tested precisely:
  //   - sanitizeMermaidSvg is a regex pass. It removes inline event
  //     handlers (onerror/onclick/on*) and rewrites dangerous URL schemes
  //     on href/src attributes, but it does NOT remove <script> tags
  //     themselves. That is DOMPurify's job.
  //   - DOMPurify's default profile removes <foreignObject> and <script>
  //     entirely, so no live HTML survives to execute.
  // This is a security invariant test: it records the responsibility split
  // so a future change that moves <script> stripping out of DOMPurify (or
  // adds foreignObject to the allowlist) fails loudly here.

  const maliciousSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" onclick="pwn()">' +
    "<foreignObject width=\"100%\" height=\"100%\">" +
    '<div xmlns="http://www.w3.org/1999/xhtml">' +
    '<script>window.pwned = true</script>' +
    '<img src="x" onerror="window.pwned = true" />' +
    '<a href="javascript:alert(1)">x</a>' +
    "</div>" +
    "</foreignObject>" +
    "</svg>";

  it("sanitizeMermaidSvg strips inline event handlers, rewrites javascript: URLs, AND removes foreignObject/script (its DOMPurify-SVG-profile contract)", () => {
    const output = sanitizeMermaidSvg(maliciousSvg);
    // Regex layer: no inline event handlers anywhere in the SVG.
    expect(output).not.toMatch(/\son\w+\s*=/i);
    // Regex layer: javascript: URLs are neutralized to "#".
    expect(output).not.toContain("javascript:");
    // DOMPurify SVG-profile layer: <script> and <foreignObject> are
    // removed entirely — this is now the single point of sanitization,
    // so the "responsibility split" with MarkdownPreview's final pass
    // no longer applies: sanitizeMermaidSvg is sufficient on its own.
    expect(output).not.toContain("<script");
    expect(output).not.toContain("foreignObject");
  });

  it("DOMPurify (MarkdownPreview's final pass) removes foreignObject and script entirely", () => {
    // Note: sanitizeMermaidSvg now includes DOMPurify internally, so the
    // output is already fully sanitized. Running DOMPurify again is
    // idempotent — this test documents that the combined pipeline is safe.
    const sanitized = DOMPurify.sanitize(sanitizeMermaidSvg(maliciousSvg));
    // No foreignObject, no live script, no event handlers, no dangerous URLs.
    expect(sanitized).not.toContain("foreignObject");
    expect(sanitized).not.toContain("<script");
    expect(sanitized).not.toMatch(/\son\w+\s*=/i);
    expect(sanitized).not.toContain("javascript:");
    expect(sanitized).not.toContain("window.pwned");
  });

  it("full renderMermaidToSvg pipeline: hostile SVG output is fully neutralized", async () => {
    vi.mocked(mermaid.render).mockResolvedValueOnce({ svg: maliciousSvg } as never);
    const html = await renderMermaidToSvg("graph TD\n  A-->B");
    // The regex layer ran (event handlers and javascript: URLs scrubbed).
    expect(html).not.toMatch(/\son\w+\s*=/i);
    expect(html).not.toContain("javascript:");
    // DOMPurify SVG-profile layer (now inside renderMermaidToSvg)
    // removed the rest.
    expect(html).not.toContain("foreignObject");
    expect(html).not.toContain("<script");
    expect(html).not.toMatch(/\son\w+\s*=/i);
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("window.pwned");
    // The fallback code block must not be triggered: the SVG rendered
    // successfully, it was just hostile content.
    expect(html).not.toContain('<pre><code class="language-mermaid">');
  });
});

describe("renderMermaidToSvg fallback path", () => {
  it("returns a <pre><code class=language-mermaid> block with the original source when mermaid.render rejects", async () => {
    vi.mocked(mermaid.render).mockRejectedValueOnce(new Error("parse error"));
    const source = "not a valid diagram";
    const html = await renderMermaidToSvg(source);
    expect(html).toContain("<pre><code class=\"language-mermaid\">");
    expect(html).toContain("not a valid diagram");
    expect(html).not.toContain("<svg");
  });

  it("returns the code-block fallback when mermaid.render produces no SVG", async () => {
    vi.mocked(mermaid.render).mockResolvedValueOnce({ svg: "" } as never);
    const source = "graph TD\n  A-->B";
    const html = await renderMermaidToSvg(source);
    expect(html).toContain("<pre><code class=\"language-mermaid\">");
    expect(html).toContain("graph TD");
  });
});

describe("mermaid extension (sync parse path)", () => {
  it("renders a ```mermaid fence to a placeholder div", () => {
    setMermaidRenderingEnabled(true);
    const html = marked.parse("```mermaid\ngraph TD\n  A-->B\n```", {
      async: false,
    }) as string;
    expect(html).toContain('class="mermaid-placeholder"');
    expect(html).toContain("data-mermaid-source=");
    expect(html).not.toContain("[object Promise]");
    expect(html).not.toContain("```mermaid");
  });

  it("renders a plain code block when mermaid is disabled", () => {
    setMermaidRenderingEnabled(false);
    const html = marked.parse("```mermaid\ngraph TD\n  A-->B\n```", {
      async: false,
    }) as string;
    setMermaidRenderingEnabled(true);
    expect(html).toContain("language-mermaid");
    expect(html).not.toContain("mermaid-placeholder");
  });

  it("encodes non-Latin1 diagram labels without throwing and round-trips the source", () => {
    setMermaidRenderingEnabled(true);
    const source = "graph TD\n  A[café ☕ 日本語]-->B";
    // Regression: the original implementation used btoa(), which throws
    // InvalidCharacterError on any character above U+00FF, so a label like
    // this produced an empty code block in Preview instead of the diagram.
    let html = "";
    expect(() => {
      html = marked.parse(`\`\`\`mermaid\n${source}\n\`\`\``, {
        async: false,
      }) as string;
    }).not.toThrow();
    expect(html).toContain('class="mermaid-placeholder"');
    const match = /data-mermaid-source="([^"]*)"/.exec(html);
    expect(match).not.toBeNull();
    const encoded = match![1];
    expect(() => decodeURIComponent(encoded)).not.toThrow();
    expect(decodeURIComponent(encoded)).toBe(source);
  });
});

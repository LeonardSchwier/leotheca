// Smoke test for the mermaid extension: verifies the marked tokenizer fires
// and the renderer emits a placeholder div (not [object Promise]).
// Full async rendering is exercised by the browser/electron runtime via
// renderMermaidToSvg; this test only checks the sync parse path.
import { describe, expect, it, vi } from "vitest";
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

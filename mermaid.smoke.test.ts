// Smoke test for the mermaid extension: verifies the marked tokenizer fires
// and the renderer emits a placeholder div (not [object Promise]).
// Full async rendering is exercised by the browser/electron runtime via
// renderMermaidToSvg; this test only checks the sync parse path.
import { describe, expect, it } from "vitest";
import { marked } from "marked";
import { setMermaidRenderingEnabled } from "./src/markdown/mermaid";

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

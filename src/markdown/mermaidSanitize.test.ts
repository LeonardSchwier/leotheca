/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import DOMPurify from "dompurify";
import { sanitizeMermaidSvg, sanitizeMermaidSvgForInjection } from "./mermaid";

// The injection-site guard (sanitizeMermaidSvgForInjection) is the last line
// of defense in MarkdownPreview's mermaid effect (W-2026-11-01-2): the SVG it
// returns is written to the DOM via outerHTML *after* the main DOMPurify pass.
describe("sanitizeMermaidSvgForInjection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("strips a <script> tag from SVG", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`;
    const out = sanitizeMermaidSvgForInjection(svg);
    expect(out).not.toContain("<script");
    expect(DOMPurify.sanitize(out, { USE_PROFILES: { svg: true } })).toBe(out);
  });

  it("strips inline on* event handlers", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><rect onmouseover="alert(1)" width="1" height="1"/></svg>`;
    const out = sanitizeMermaidSvgForInjection(svg);
    expect(out).not.toMatch(/on\w+\s*=/i);
  });

  it("neutralizes javascript: and data:text/html hrefs", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)">x</a><a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">y</a></svg>`;
    const out = sanitizeMermaidSvgForInjection(svg);
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("data:text/html");
  });

  it("strips foreignObject and object/embed/iframe payloads", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><img src=x onerror=alert(1)></body></foreignObject><object data="javascript:alert(1)"></object></svg>`;
    const out = sanitizeMermaidSvgForInjection(svg);
    expect(out).not.toContain("foreignObject");
    expect(out).not.toContain("<object");
    expect(out).not.toContain("onerror");
  });

  it("keeps a benign diagram SVG intact (rect + text)", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 10"><rect x="1" y="1" width="98" height="8" fill="#fff" stroke="#000"/><text x="5" y="7">hello</text></svg>`;
    const out = sanitizeMermaidSvgForInjection(svg);
    expect(out).toContain("<rect");
    expect(out).toContain("<text");
    expect(out).toContain("hello");
  });

  it("is idempotent: sanitizing its own output changes nothing", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><script>bad()</script><a href="javascript:alert(1)">x</a><rect width="1" height="1" onclick="p()"/></svg>`;
    const once = sanitizeMermaidSvgForInjection(svg);
    expect(sanitizeMermaidSvgForInjection(once)).toBe(once);
  });

  it("still sanitizes via the existing defense-in-depth helper", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="1" height="1"/></svg>`;
    expect(sanitizeMermaidSvg(svg)).not.toContain("<script");
  });
});

/** @vitest-environment node */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./mermaid.css", import.meta.url), "utf8");
const main = readFileSync(new URL("../main.tsx", import.meta.url), "utf8");

describe("mermaid.css", () => {
  it("is loaded by the app entry", () => {
    expect(main).toContain('import "./styles/mermaid.css"');
  });

  it("scales the diagram to the note width and keeps its aspect ratio", () => {
    const rule = /\.mermaid-canvas svg\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toMatch(/width:\s*100%/);
    expect(rule).toMatch(/max-width:\s*100%/);
    expect(rule).toMatch(/height:\s*auto/);
  });

  it("uses app tokens, not fixed colors, so it follows light and dark", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).toContain("var(--color-border)");
  });
});

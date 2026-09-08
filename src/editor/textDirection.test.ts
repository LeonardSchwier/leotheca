/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { applyBlockDirectionAttributes, buildLineDirectionDecorations, detectTextDirection } from "./textDirection";

const HEBREW = "שלום עולם";
const ARABIC = "مرحبا بالعالم";

describe("detectTextDirection", () => {
  it("returns ltr for plain English text", () => {
    expect(detectTextDirection("hello world")).toBe("ltr");
  });

  it("returns ltr for an empty string", () => {
    expect(detectTextDirection("")).toBe("ltr");
  });

  it("returns ltr when the text has no strong-directional character at all", () => {
    expect(detectTextDirection("123 456 -- ** ##")).toBe("ltr");
  });

  it("returns rtl for Hebrew text", () => {
    expect(detectTextDirection(HEBREW)).toBe("rtl");
  });

  it("returns rtl for Arabic text", () => {
    expect(detectTextDirection(ARABIC)).toBe("rtl");
  });

  it("skips leading markdown syntax and whitespace to find the first strong character", () => {
    expect(detectTextDirection(`- ${HEBREW}`)).toBe("rtl");
    expect(detectTextDirection(`## ${ARABIC}`)).toBe("rtl");
    expect(detectTextDirection("- hello world")).toBe("ltr");
  });

  it("skips leading digits and punctuation to find the first strong character", () => {
    expect(detectTextDirection(`123: ${HEBREW}`)).toBe("rtl");
  });

  it("decides by whichever strong character comes first when text is mixed", () => {
    expect(detectTextDirection(`hello ${HEBREW}`)).toBe("ltr");
    expect(detectTextDirection(`${HEBREW} hello`)).toBe("rtl");
  });
});

describe("buildLineDirectionDecorations", () => {
  function lineDirections(doc: string): string[] {
    const state = EditorState.create({ doc });
    const decorations = buildLineDirectionDecorations(state);
    const dirs: string[] = [];
    decorations.between(0, state.doc.length, (_from, _to, value) => {
      const spec = value.spec as { attributes?: { dir?: string } };
      dirs.push(spec.attributes?.dir ?? "");
    });
    return dirs;
  }

  it("assigns one direction decoration per line, independently", () => {
    expect(lineDirections(`hello\n${HEBREW}\nworld`)).toEqual(["ltr", "rtl", "ltr"]);
  });

  it("handles a single-line document", () => {
    expect(lineDirections(HEBREW)).toEqual(["rtl"]);
  });

  it("only decorates lines within the given visible ranges", () => {
    const doc = `hello\n${HEBREW}\nworld\n${ARABIC}`;
    const state = EditorState.create({ doc });
    // Restrict to just the first line.
    const firstLine = state.doc.line(1);
    const decorations = buildLineDirectionDecorations(state, [{ from: firstLine.from, to: firstLine.to }]);
    const dirs: string[] = [];
    decorations.between(0, state.doc.length, (_from, _to, value) => {
      const spec = value.spec as { attributes?: { dir?: string } };
      dirs.push(spec.attributes?.dir ?? "");
    });
    expect(dirs).toEqual(["ltr"]);
  });
});

describe("applyBlockDirectionAttributes", () => {
  it("sets dir on each block-level element from its own text content", () => {
    const container = document.createElement("div");
    container.innerHTML = `<p>hello</p><p>${HEBREW}</p><h1>${ARABIC}</h1>`;
    applyBlockDirectionAttributes(container);
    const [p1, p2, h1] = Array.from(container.querySelectorAll("p, h1"));
    expect(p1.getAttribute("dir")).toBe("ltr");
    expect(p2.getAttribute("dir")).toBe("rtl");
    expect(h1.getAttribute("dir")).toBe("rtl");
  });

  it("never touches code blocks, which always stay left-to-right", () => {
    const container = document.createElement("div");
    container.innerHTML = `<pre><code>${ARABIC}</code></pre>`;
    applyBlockDirectionAttributes(container);
    const code = container.querySelector("code");
    expect(code?.getAttribute("dir")).toBeNull();
  });

  it("gives a nested paragraph inside a blockquote its own direction", () => {
    const container = document.createElement("div");
    container.innerHTML = `<blockquote><p>${HEBREW}</p></blockquote>`;
    applyBlockDirectionAttributes(container);
    const blockquote = container.querySelector("blockquote");
    const p = container.querySelector("p");
    expect(blockquote?.getAttribute("dir")).toBe("rtl");
    expect(p?.getAttribute("dir")).toBe("rtl");
  });
});

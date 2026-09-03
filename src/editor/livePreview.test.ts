/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { linkIndex } from "../linking/store";
import { scanHeadings } from "../markdown/headings";

/** CodeMirror only tracks one selection range unless this facet is
 * explicitly enabled — without it, EditorState silently collapses any
 * extra ranges passed to EditorSelection.create down to just the main
 * one, which would make these tests pass or fail for the wrong reason. */
const allowMultipleSelections = EditorState.allowMultipleSelections.of(true);
import { markdown } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { buildLiveDecorations, overlapsSelectedLines } from "./livePreview";

function stateFor(doc: string, selection?: { anchor: number; head?: number }): EditorState {
  const state = EditorState.create({
    doc,
    extensions: [markdown()],
    selection: selection && { anchor: selection.anchor, head: selection.head ?? selection.anchor },
  });
  // Force full synchronous parsing so the syntax tree actually has the
  // heading/emphasis/code nodes this test asserts against, rather than
  // whatever partial tree happens to be ready yet.
  ensureSyntaxTree(state, doc.length, 5000);
  return state;
}

/** Collects the decoration ranges built for a state into a simpler,
 * assertion-friendly shape: which text is hidden (replaced with nothing),
 * which text is marked with a class, and which text is replaced with a
 * widget (rendered to its DOM text so a test can assert on it), all keyed
 * by the original substring they replace or style. */
function summarize(state: EditorState, visibleRange?: { from: number; to: number }) {
  const decorations = buildLiveDecorations(state, visibleRange ? [visibleRange] : undefined);
  const hidden: string[] = [];
  const marked: { text: string; class: string }[] = [];
  const widgets: { text: string; rendered: string }[] = [];
  decorations.between(0, state.doc.length, (from, to, value) => {
    const text = state.doc.sliceString(from, to);
    const spec = value.spec as { class?: string; widget?: { toDOM(): HTMLElement } };
    if (spec.class) marked.push({ text, class: spec.class });
    else if (spec.widget) widgets.push({ text, rendered: spec.widget.toDOM().textContent ?? "" });
    else hidden.push(text);
  });
  return { hidden, marked, widgets };
}

describe("overlapsSelectedLines", () => {
  it("is true when a selection range is on the same line as the target range", () => {
    const doc = EditorState.create({ doc: "line one\nline two\nline three" }).doc;
    const line2Start = doc.line(2).from;
    expect(overlapsSelectedLines(doc, [{ from: line2Start, to: line2Start }], line2Start, line2Start + 5)).toBe(true);
  });

  it("is false when no selection range touches the target's line(s)", () => {
    const doc = EditorState.create({ doc: "line one\nline two\nline three" }).doc;
    const line1 = doc.line(1);
    const line3 = doc.line(3);
    expect(overlapsSelectedLines(doc, [{ from: line1.from, to: line1.from }], line3.from, line3.to)).toBe(false);
  });
});

describe("buildLiveDecorations: headings", () => {
  it("hides the '# ' marker and styles the heading text when the cursor is elsewhere", () => {
    const state = stateFor("# Title\n\nSome body text.", { anchor: 20 });
    const { hidden, marked } = summarize(state);
    expect(hidden).toContain("# ");
    expect(marked).toContainEqual({ text: "# Title", class: "cm-live-heading-1" });
  });

  it("keeps the marker visible while the cursor is on the heading's own line", () => {
    const state = stateFor("# Title\n\nSome body text.", { anchor: 3 });
    const { hidden } = summarize(state);
    expect(hidden).not.toContain("# ");
  });

  it("maps heading levels 1-6 to distinct classes", () => {
    const doc = "###### Deep heading";
    const state = stateFor(doc, { anchor: doc.length });
    const { marked } = summarize(state);
    expect(marked).toContainEqual({ text: "###### Deep heading", class: "cm-live-heading-6" });
  });
});

describe("buildLiveDecorations: emphasis", () => {
  it("hides ** markers and styles bold text when not on that line", () => {
    const state = stateFor("Some **bold** text.\n\nOther line.", { anchor: 25 });
    const { hidden, marked } = summarize(state);
    expect(hidden).toContain("**");
    expect(marked).toContainEqual({ text: "**bold**", class: "cm-live-strong" });
  });

  it("hides single * markers and styles italic text when not on that line", () => {
    const state = stateFor("Some *italic* text.\n\nOther line.", { anchor: 25 });
    const { hidden, marked } = summarize(state);
    expect(hidden).toContain("*");
    expect(marked).toContainEqual({ text: "*italic*", class: "cm-live-em" });
  });

  it("keeps ** markers visible while actively editing that line", () => {
    const state = stateFor("Some **bold** text.", { anchor: 8 });
    const { hidden } = summarize(state);
    expect(hidden).not.toContain("**");
  });
});

describe("buildLiveDecorations: inline code", () => {
  it("hides backtick markers and styles the code span when not on that line", () => {
    const state = stateFor("Run `npm test` please.\n\nOther line.", { anchor: 25 });
    const { hidden, marked } = summarize(state);
    expect(hidden).toContain("`");
    expect(marked).toContainEqual({ text: "`npm test`", class: "cm-live-code" });
  });
});

describe("buildLiveDecorations: bullet lists", () => {
  it("replaces a '-' marker with a bullet widget when not on that line", () => {
    const state = stateFor("- one\n- two\n\nOther line.", { anchor: 20 });
    const { hidden, widgets } = summarize(state);
    expect(hidden).not.toContain("- ");
    expect(widgets.map((w) => w.text)).toEqual(expect.arrayContaining(["- ", "- "]));
    for (const w of widgets) expect(w.rendered).toBe("• ");
  });

  it("renders '*' and '+' markers as the same bullet glyph", () => {
    const state = stateFor("* star\n+ plus\n\nOther line.", { anchor: 20 });
    const { widgets } = summarize(state);
    expect(widgets).toHaveLength(2);
    expect(widgets.map((w) => w.rendered)).toEqual(["• ", "• "]);
  });

  it("keeps the raw marker visible while actively editing that line", () => {
    const state = stateFor("- one\n- two", { anchor: 2 });
    const { widgets } = summarize(state);
    // Only "- two"'s marker (the line the cursor isn't on) becomes a widget.
    expect(widgets).toHaveLength(1);
  });

  it("leaves ordered list markers alone (the number is meaningful content)", () => {
    const state = stateFor("1. first\n2. second\n\nOther line.", { anchor: 30 });
    const { hidden, widgets } = summarize(state);
    expect(widgets).toHaveLength(0);
    expect(hidden).not.toContain("1.");
    expect(hidden).not.toContain("2.");
  });

  it("handles a nested bullet list under a non-active parent item", () => {
    const doc = "- one\n  - nested\n\nOther line.";
    const state = stateFor(doc, { anchor: doc.length });
    const { widgets } = summarize(state);
    expect(widgets).toHaveLength(2);
  });
});

describe("buildLiveDecorations: wikilinks", () => {
  beforeEach(() => {
    linkIndex.value = {
      backlinksByPath: new Map(),
      pathsByNoteName: new Map([["beta", ["/workspace/Beta.md"]]]),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map(),
      tasksByPath: new Map(),
    };
  });

  it("hides the [[ ]] markers and styles a resolved link's target when not on that line", () => {
    const state = stateFor("See [[Beta]] for details.\n\nOther line.", { anchor: 30 });
    const { hidden, marked } = summarize(state);
    expect(hidden).toContain("[[");
    expect(hidden).toContain("]]");
    expect(marked).toContainEqual({ text: "[[Beta]]", class: "cm-live-wikilink-resolved" });
  });

  it("styles an unresolved link's target with the broken class", () => {
    const state = stateFor("See [[Nope]] for details.\n\nOther line.", { anchor: 30 });
    const { marked } = summarize(state);
    expect(marked).toContainEqual({ text: "[[Nope]]", class: "cm-live-wikilink-broken" });
  });

  it("keeps the [[ ]] markers visible while actively editing that line", () => {
    const state = stateFor("See [[Beta]] for details.", { anchor: 8 });
    const { hidden } = summarize(state);
    expect(hidden).not.toContain("[[");
    expect(hidden).not.toContain("]]");
  });

  it("does not treat [[...]] inside an inline code span as a wikilink", () => {
    const state = stateFor("Use `[[Beta]]` literally.\n\nOther line.", { anchor: 30 });
    const { hidden, marked } = summarize(state);
    expect(hidden).not.toContain("[[");
    expect(marked).not.toContainEqual({ text: "[[Beta]]", class: "cm-live-wikilink-resolved" });
  });

  it("does not match an unterminated [[ across the rest of the document", () => {
    const doc = "Broken [[ marker with no close.\n\nSome **bold** text.";
    const state = stateFor(doc, { anchor: doc.length });
    const { marked } = summarize(state);
    expect(marked.some((m) => m.class.startsWith("cm-live-wikilink"))).toBe(false);
    // The rest of the document should still parse normally.
    expect(marked).toContainEqual({ text: "**bold**", class: "cm-live-strong" });
  });
});

describe("buildLiveDecorations: heading-links (F04 Phase 2)", () => {
  beforeEach(() => {
    linkIndex.value = {
      backlinksByPath: new Map(),
      pathsByNoteName: new Map([["beta", ["/workspace/Beta.md"]]]),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map(),
      tasksByPath: new Map(),
    };
  });

  it("styles a same-note [[#Heading]] link as resolved when the heading exists", () => {
    const doc = "# Intro\n\nSee [[#Intro]] here.\n\nOther line.";
    const state = stateFor(doc, { anchor: doc.length });
    const { hidden, marked } = summarize(state);
    expect(hidden).toContain("[[");
    expect(hidden).toContain("]]");
    expect(marked).toContainEqual({ text: "[[#Intro]]", class: "cm-live-wikilink-resolved" });
  });

  it("styles a same-note [[#Heading]] link as heading-missing when no heading matches", () => {
    const doc = "# Intro\n\nSee [[#Nope]] here.\n\nOther line.";
    const state = stateFor(doc, { anchor: doc.length });
    const { marked } = summarize(state);
    expect(marked).toContainEqual({ text: "[[#Nope]]", class: "cm-live-wikilink-heading-missing" });
  });

  it("styles a same-note [[#Heading]] link as heading-ambiguous when more than one heading shares the name", () => {
    const doc = "# Intro\n\n# Intro\n\nSee [[#Intro]] here.\n\nOther line.";
    const state = stateFor(doc, { anchor: doc.length });
    const { marked } = summarize(state);
    expect(marked).toContainEqual({ text: "[[#Intro]]", class: "cm-live-wikilink-heading-ambiguous" });
  });

  it("styles a cross-note [[Note#Heading]] link as resolved when the target note actually has that heading (F04 Phase 5a)", () => {
    linkIndex.value = {
      ...linkIndex.value,
      headingsByPath: new Map([["/workspace/Beta.md", scanHeadings("# Roadmap\n\ntext")]]),
    };
    const doc = "See [[Beta#Roadmap]] here.\n\nOther line.";
    const state = stateFor(doc, { anchor: doc.length });
    const { marked } = summarize(state);
    expect(marked).toContainEqual({ text: "[[Beta#Roadmap]]", class: "cm-live-wikilink-resolved" });
  });

  it("styles a cross-note [[Note#Heading]] link as heading-missing when the target note has no such heading (F04 Phase 5a)", () => {
    linkIndex.value = {
      ...linkIndex.value,
      headingsByPath: new Map([["/workspace/Beta.md", scanHeadings("# Roadmap\n\ntext")]]),
    };
    const doc = "See [[Beta#Nonexistent Heading]] here.\n\nOther line.";
    const state = stateFor(doc, { anchor: doc.length });
    const { marked } = summarize(state);
    expect(marked).toContainEqual({ text: "[[Beta#Nonexistent Heading]]", class: "cm-live-wikilink-heading-missing" });
  });

  it("styles a cross-note [[Note#Heading]] link as heading-ambiguous when the target note has duplicate headings (F04 Phase 5a)", () => {
    linkIndex.value = {
      ...linkIndex.value,
      headingsByPath: new Map([["/workspace/Beta.md", scanHeadings("## Design\n\ntext\n\n## Design\n\nmore")]]),
    };
    const doc = "See [[Beta#Design]] here.\n\nOther line.";
    const state = stateFor(doc, { anchor: doc.length });
    const { marked } = summarize(state);
    expect(marked).toContainEqual({ text: "[[Beta#Design]]", class: "cm-live-wikilink-heading-ambiguous" });
  });

  it("styles a cross-note [[Note#Heading]] link as broken when the note itself does not exist", () => {
    const doc = "See [[Nope#Heading]] here.\n\nOther line.";
    const state = stateFor(doc, { anchor: doc.length });
    const { marked } = summarize(state);
    expect(marked).toContainEqual({ text: "[[Nope#Heading]]", class: "cm-live-wikilink-broken" });
  });

  it("keeps the [[ ]] markers visible while actively editing a heading-link's own line", () => {
    const doc = "# Intro\n\nSee [[#Intro]] here.";
    const state = stateFor(doc, { anchor: 20 });
    const { hidden } = summarize(state);
    expect(hidden).not.toContain("[[");
    expect(hidden).not.toContain("]]");
  });

  it("decorates a heading-link exactly once, never also with a plain-wikilink class", () => {
    const doc = "# Intro\n\nSee [[#Intro]] here.\n\nOther line.";
    const state = stateFor(doc, { anchor: doc.length });
    const { marked } = summarize(state);
    const forThisLink = marked.filter((m) => m.text === "[[#Intro]]");
    expect(forThisLink).toHaveLength(1);
  });

  it("does not treat a heading-link inside an inline code span as a real link", () => {
    const doc = "# Intro\n\nUse `[[#Intro]]` literally.\n\nOther line.";
    const state = stateFor(doc, { anchor: doc.length });
    const { hidden, marked } = summarize(state);
    expect(hidden).not.toContain("[[");
    expect(marked).not.toContainEqual({ text: "[[#Intro]]", class: "cm-live-wikilink-resolved" });
  });

  it("leaves a plain [[Note]] link's own decoration unaffected alongside a heading-link in the same document", () => {
    const doc = "# Intro\n\nSee [[Beta]] and [[#Intro]] here.\n\nOther line.";
    const state = stateFor(doc, { anchor: doc.length });
    const { marked } = summarize(state);
    expect(marked).toContainEqual({ text: "[[Beta]]", class: "cm-live-wikilink-resolved" });
    expect(marked).toContainEqual({ text: "[[#Intro]]", class: "cm-live-wikilink-resolved" });
  });

  it("finds a heading-link within the visible lines without scanning the rest of the document", () => {
    const doc = "# Intro\n\n[[#Intro]]\n\nOther content";
    const state = stateFor(doc, { anchor: doc.length });
    const linkStart = doc.indexOf("[[#Intro]]");
    const { hidden, marked } = summarize(state, { from: linkStart, to: linkStart + "[[#Intro]]".length });

    expect(hidden).toEqual(expect.arrayContaining(["[[", "]]"]));
    expect(marked).toContainEqual({ text: "[[#Intro]]", class: "cm-live-wikilink-resolved" });
  });
});

describe("buildLiveDecorations: block-links (F04 Phase 3c)", () => {
  beforeEach(() => {
    linkIndex.value = {
      backlinksByPath: new Map(),
      pathsByNoteName: new Map([["beta", ["/workspace/Beta.md"]]]),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map(),
      tasksByPath: new Map(),
    };
  });

  it("styles a same-note [[#^block-id]] link as resolved when the block exists", () => {
    const doc = "The decision is final. ^decision\n\nSee [[#^decision]] here.\n\nOther line.";
    const state = stateFor(doc, { anchor: doc.length });
    const { hidden, marked } = summarize(state);
    expect(hidden).toContain("[[");
    expect(hidden).toContain("]]");
    expect(marked).toContainEqual({ text: "[[#^decision]]", class: "cm-live-wikilink-resolved" });
  });

  it("styles a same-note [[#^block-id]] link as block-missing when no block matches", () => {
    const doc = "See [[#^nope]] here.\n\nOther line.";
    const state = stateFor(doc, { anchor: doc.length });
    const { marked } = summarize(state);
    expect(marked).toContainEqual({ text: "[[#^nope]]", class: "cm-live-wikilink-block-missing" });
  });

  it("styles a same-note [[#^block-id]] link as block-ambiguous when more than one block shares the id", () => {
    const doc = "One. ^dup\n\nTwo. ^dup\n\nSee [[#^dup]] here.\n\nOther line.";
    const state = stateFor(doc, { anchor: doc.length });
    const { marked } = summarize(state);
    expect(marked).toContainEqual({ text: "[[#^dup]]", class: "cm-live-wikilink-block-ambiguous" });
  });

  it("styles a cross-note [[Note#^block-id]] link as resolved once the note exists, without verifying the block", () => {
    // "nonexistent-block" is never scanned anywhere: this phase does not
    // read Beta.md's content just to decorate Source mode, matching
    // MarkdownPreview's own disclosed cross-note scope narrowing.
    const doc = "See [[Beta#^nonexistent-block]] here.\n\nOther line.";
    const state = stateFor(doc, { anchor: doc.length });
    const { marked } = summarize(state);
    expect(marked).toContainEqual({ text: "[[Beta#^nonexistent-block]]", class: "cm-live-wikilink-resolved" });
  });

  it("styles a cross-note [[Note#^block-id]] link as broken when the note itself does not exist", () => {
    const doc = "See [[Nope#^some-block]] here.\n\nOther line.";
    const state = stateFor(doc, { anchor: doc.length });
    const { marked } = summarize(state);
    expect(marked).toContainEqual({ text: "[[Nope#^some-block]]", class: "cm-live-wikilink-broken" });
  });

  it("decorates a block-link exactly once, never also with a plain-wikilink class", () => {
    const doc = "The decision is final. ^decision\n\nSee [[#^decision]] here.\n\nOther line.";
    const state = stateFor(doc, { anchor: doc.length });
    const { marked } = summarize(state);
    const forThisLink = marked.filter((m) => m.text === "[[#^decision]]");
    expect(forThisLink).toHaveLength(1);
  });

  it("does not treat a block-link inside an inline code span as a real link", () => {
    const doc = "The decision is final. ^decision\n\nUse `[[#^decision]]` literally.\n\nOther line.";
    const state = stateFor(doc, { anchor: doc.length });
    const { hidden, marked } = summarize(state);
    expect(hidden).not.toContain("[[");
    expect(marked).not.toContainEqual({ text: "[[#^decision]]", class: "cm-live-wikilink-resolved" });
  });

  it("leaves a heading-link's own decoration unaffected alongside a block-link in the same document", () => {
    const doc = "# Intro\n\nThe decision is final. ^decision\n\nSee [[#Intro]] and [[#^decision]] here.\n\nOther line.";
    const state = stateFor(doc, { anchor: doc.length });
    const { marked } = summarize(state);
    expect(marked).toContainEqual({ text: "[[#Intro]]", class: "cm-live-wikilink-resolved" });
    expect(marked).toContainEqual({ text: "[[#^decision]]", class: "cm-live-wikilink-resolved" });
  });
});

describe("buildLiveDecorations: embeds (F04 Phase 3f)", () => {
  beforeEach(() => {
    linkIndex.value = {
      backlinksByPath: new Map(),
      pathsByNoteName: new Map([["beta", ["/workspace/Beta.md"]]]),
      pathsByAlias: new Map(),
      aliasesByPath: new Map(),
      pathsByTag: new Map(),
      tagsByPath: new Map(),
      tasksByPath: new Map(),
    };
  });

  it("hides only the '[[' and ']]' markers, never the leading '!', and leaves no stray bracket behind", () => {
    // Regression for a real bug this phase fixes: before it, a heading- or
    // block-fragment embed fell through to the heading/block link passes,
    // which hid `from, from + 2` assuming that's always "[[" — for an
    // embed, whose source range includes the leading "!", that instead hid
    // "![" and left a stray "[" visible in front of the fragment text.
    const doc = "# Intro\n\nSee ![[#Intro]] here.\n\nOther line.";
    const state = stateFor(doc, { anchor: doc.length });
    const { hidden, marked } = summarize(state);
    expect(hidden).toContain("[[");
    expect(hidden).toContain("]]");
    expect(hidden).not.toContain("![");
    expect(marked).toContainEqual({ text: "![[#Intro]]", class: "cm-live-embed-resolved" });
  });

  it("styles a same-note ![[#Heading]] embed as resolved when the heading exists", () => {
    const doc = "# Intro\n\nSee ![[#Intro]] here.\n\nOther line.";
    const state = stateFor(doc, { anchor: doc.length });
    const { marked } = summarize(state);
    expect(marked).toContainEqual({ text: "![[#Intro]]", class: "cm-live-embed-resolved" });
  });

  it("styles a same-note ![[#Heading]] embed as heading-missing when no heading matches, reusing the link pass's own class", () => {
    const doc = "# Intro\n\nSee ![[#Nope]] here.\n\nOther line.";
    const state = stateFor(doc, { anchor: doc.length });
    const { marked } = summarize(state);
    expect(marked).toContainEqual({ text: "![[#Nope]]", class: "cm-live-wikilink-heading-missing" });
  });

  it("styles a same-note ![[#Heading]] embed as heading-ambiguous when more than one heading shares the name", () => {
    const doc = "# Intro\n\n# Intro\n\nSee ![[#Intro]] here.\n\nOther line.";
    const state = stateFor(doc, { anchor: doc.length });
    const { marked } = summarize(state);
    expect(marked).toContainEqual({ text: "![[#Intro]]", class: "cm-live-wikilink-heading-ambiguous" });
  });

  it("styles a same-note ![[#^block-id]] embed as resolved when the block exists", () => {
    const doc = "The decision is final. ^decision\n\nSee ![[#^decision]] here.\n\nOther line.";
    const state = stateFor(doc, { anchor: doc.length });
    const { marked } = summarize(state);
    expect(marked).toContainEqual({ text: "![[#^decision]]", class: "cm-live-embed-resolved" });
  });

  it("styles a same-note ![[#^block-id]] embed as block-missing when no block matches, reusing the link pass's own class", () => {
    const doc = "See ![[#^nope]] here.\n\nOther line.";
    const state = stateFor(doc, { anchor: doc.length });
    const { marked } = summarize(state);
    expect(marked).toContainEqual({ text: "![[#^nope]]", class: "cm-live-wikilink-block-missing" });
  });

  it("styles a same-note ![[#^block-id]] embed as block-ambiguous when more than one block shares the id", () => {
    const doc = "One. ^dup\n\nTwo. ^dup\n\nSee ![[#^dup]] here.\n\nOther line.";
    const state = stateFor(doc, { anchor: doc.length });
    const { marked } = summarize(state);
    expect(marked).toContainEqual({ text: "![[#^dup]]", class: "cm-live-wikilink-block-ambiguous" });
  });

  it("styles a whole-note ![[Note]] embed as resolved once the note exists", () => {
    const doc = "See ![[Beta]] here.\n\nOther line.";
    const state = stateFor(doc, { anchor: doc.length });
    const { hidden, marked } = summarize(state);
    expect(hidden).toContain("[[");
    expect(hidden).toContain("]]");
    expect(marked).toContainEqual({ text: "![[Beta]]", class: "cm-live-embed-resolved" });
  });

  it("styles a whole-note ![[Note]] embed as broken when the note does not exist", () => {
    const doc = "See ![[Nope]] here.\n\nOther line.";
    const state = stateFor(doc, { anchor: doc.length });
    const { marked } = summarize(state);
    expect(marked).toContainEqual({ text: "![[Nope]]", class: "cm-live-embed-broken" });
  });

  it("styles a cross-note ![[Note#Heading]] embed as resolved when the target note actually has that heading (F04 Phase 5a)", () => {
    linkIndex.value = {
      ...linkIndex.value,
      headingsByPath: new Map([["/workspace/Beta.md", scanHeadings("# Roadmap\n\ntext")]]),
    };
    const doc = "See ![[Beta#Roadmap]] here.\n\nOther line.";
    const state = stateFor(doc, { anchor: doc.length });
    const { marked } = summarize(state);
    expect(marked).toContainEqual({ text: "![[Beta#Roadmap]]", class: "cm-live-embed-resolved" });
  });

  it("styles a cross-note ![[Note#Heading]] embed with the heading-missing class when the target note has no such heading (F04 Phase 5a)", () => {
    linkIndex.value = {
      ...linkIndex.value,
      headingsByPath: new Map([["/workspace/Beta.md", scanHeadings("# Roadmap\n\ntext")]]),
    };
    const doc = "See ![[Beta#Nonexistent Heading]] here.\n\nOther line.";
    const state = stateFor(doc, { anchor: doc.length });
    const { marked } = summarize(state);
    expect(marked).toContainEqual({
      text: "![[Beta#Nonexistent Heading]]",
      class: "cm-live-wikilink-heading-missing",
    });
  });

  it("styles a cross-note ![[Note#Heading]] embed as broken when the note itself does not exist", () => {
    const doc = "See ![[Nope#Heading]] here.\n\nOther line.";
    const state = stateFor(doc, { anchor: doc.length });
    const { marked } = summarize(state);
    expect(marked).toContainEqual({ text: "![[Nope#Heading]]", class: "cm-live-embed-broken" });
  });

  it("decorates an embed exactly once, never also with a plain-wikilink or heading/block-link class", () => {
    const doc = "# Intro\n\nSee ![[#Intro]] here.\n\nOther line.";
    const state = stateFor(doc, { anchor: doc.length });
    const { marked } = summarize(state);
    const forThisEmbed = marked.filter((m) => m.text === "![[#Intro]]" || m.text === "[[#Intro]]");
    expect(forThisEmbed).toHaveLength(1);
    expect(forThisEmbed[0]).toEqual({ text: "![[#Intro]]", class: "cm-live-embed-resolved" });
  });

  it("keeps the '!', '[[', and ']]' markers visible while actively editing an embed's own line", () => {
    const doc = "# Intro\n\nSee ![[#Intro]] here.";
    const state = stateFor(doc, { anchor: 20 });
    const { hidden } = summarize(state);
    expect(hidden).not.toContain("[[");
    expect(hidden).not.toContain("]]");
  });

  it("does not treat an embed inside an inline code span as a real embed", () => {
    const doc = "# Intro\n\nUse `![[#Intro]]` literally.\n\nOther line.";
    const state = stateFor(doc, { anchor: doc.length });
    const { hidden, marked } = summarize(state);
    expect(hidden).not.toContain("[[");
    expect(marked).not.toContainEqual({ text: "![[#Intro]]", class: "cm-live-embed-resolved" });
  });

  it("leaves a plain [[Note]] link's own decoration unaffected alongside an embed in the same document", () => {
    const doc = "# Intro\n\nSee [[Beta]] and ![[#Intro]] here.\n\nOther line.";
    const state = stateFor(doc, { anchor: doc.length });
    const { marked } = summarize(state);
    expect(marked).toContainEqual({ text: "[[Beta]]", class: "cm-live-wikilink-resolved" });
    expect(marked).toContainEqual({ text: "![[#Intro]]", class: "cm-live-embed-resolved" });
  });

  it("leaves a heading-link's own decoration unaffected alongside an embed in the same document", () => {
    const doc = "# Intro\n\nSee [[#Intro]] and ![[#Intro]] here.\n\nOther line.";
    const state = stateFor(doc, { anchor: doc.length });
    const { marked } = summarize(state);
    expect(marked).toContainEqual({ text: "[[#Intro]]", class: "cm-live-wikilink-resolved" });
    expect(marked).toContainEqual({ text: "![[#Intro]]", class: "cm-live-embed-resolved" });
  });
});

describe("buildLiveDecorations: multiple cursors", () => {
  it("keeps a line's markup visible if any selection range (not just the first) touches it", () => {
    const doc = "# One\n\n# Two";
    const line3Start = doc.indexOf("# Two");
    const state = EditorState.create({
      doc,
      extensions: [markdown(), allowMultipleSelections],
      selection: EditorSelection.create([
        EditorSelection.cursor(0), // on "# One"'s line
        EditorSelection.cursor(line3Start), // on "# Two"'s line
      ]),
    });
    ensureSyntaxTree(state, doc.length, 5000);
    const { hidden, marked } = summarize(state);
    // Both headings' lines are touched by some range in the selection, so
    // neither marker should be hidden.
    expect(hidden).not.toContain("# ");
    expect(marked.filter((m) => m.class === "cm-live-heading-1")).toHaveLength(2);
  });

  it("hides a line's markup when no selection range touches it, even with multiple cursors elsewhere", () => {
    const doc = "# One\n\n# Two\n\n# Three";
    const state = EditorState.create({
      doc,
      extensions: [markdown(), allowMultipleSelections],
      selection: EditorSelection.create([
        EditorSelection.cursor(0), // "# One"
        EditorSelection.cursor(doc.indexOf("# Two")),
        // "# Three" is not touched by either cursor.
      ]),
    });
    ensureSyntaxTree(state, doc.length, 5000);
    const { hidden } = summarize(state);
    expect(hidden).toContain("# ");
  });
});

describe("buildLiveDecorations: visible ranges", () => {
  it("only decorates lines in the supplied visible range", () => {
    const doc = "# First\n\n**middle**\n\n# Last";
    const state = stateFor(doc, { anchor: doc.length });
    const middleStart = doc.indexOf("**middle**");
    const { hidden, marked } = summarize(state, { from: middleStart, to: middleStart + "**middle**".length });

    expect(hidden).toContain("**");
    expect(marked).toContainEqual({ text: "**middle**", class: "cm-live-strong" });
    expect(marked).not.toContainEqual({ text: "# First", class: "cm-live-heading-1" });
    expect(marked).not.toContainEqual({ text: "# Last", class: "cm-live-heading-1" });
  });

  it("includes the whole line when a visible range starts or ends mid-line", () => {
    const doc = "# First heading\n\nSecond **bold** line";
    const state = stateFor(doc, { anchor: 0 });
    const boldStart = doc.indexOf("**bold**");
    const { hidden, marked } = summarize(state, { from: boldStart + 2, to: boldStart + 5 });

    expect(hidden).toContain("**");
    expect(marked).toContainEqual({ text: "**bold**", class: "cm-live-strong" });
    expect(marked).not.toContainEqual({ text: "# First heading", class: "cm-live-heading-1" });
  });

  it("finds wikilinks within the visible lines without scanning the rest of the document", () => {
    const doc = "[[Beta]]\n\nOther content";
    const state = stateFor(doc, { anchor: doc.length });
    const { hidden, marked } = summarize(state, { from: 0, to: "[[Beta]]".length });

    expect(hidden).toEqual(expect.arrayContaining(["[[", "]]" ]));
    expect(marked).toContainEqual({ text: "[[Beta]]", class: "cm-live-wikilink-resolved" });
  });
});

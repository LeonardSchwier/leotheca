import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";

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
 * assertion-friendly shape: which text is hidden (replaced with nothing)
 * vs. which text is marked with a class, both as substrings. */
function summarize(state: EditorState) {
  const decorations = buildLiveDecorations(state);
  const hidden: string[] = [];
  const marked: { text: string; class: string }[] = [];
  decorations.between(0, state.doc.length, (from, to, value) => {
    const text = state.doc.sliceString(from, to);
    const spec = value.spec as { class?: string };
    if (spec.class) marked.push({ text, class: spec.class });
    else hidden.push(text);
  });
  return { hidden, marked };
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

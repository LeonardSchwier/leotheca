import { describe, expect, it } from "vitest";
import { minimalChange } from "./textDiff";

/** Applies a TextChange the same way `EditorView.dispatch({ changes })`
 * would, so tests can assert on the resulting text rather than hand-
 * checking from/to/insert individually. */
function applyChange(oldText: string, change: ReturnType<typeof minimalChange>): string {
  return oldText.slice(0, change.from) + change.insert + oldText.slice(change.to);
}

describe("minimalChange", () => {
  it("returns a no-op change (empty range, empty insert) for identical text", () => {
    const change = minimalChange("hello", "hello");
    expect(change).toEqual({ from: 5, to: 5, insert: "" });
    expect(applyChange("hello", change)).toBe("hello");
  });

  it("finds a change confined to the middle, preserving prefix and suffix", () => {
    const oldText = "hello world";
    const change = minimalChange(oldText, "hello brave world");
    expect(applyChange(oldText, change)).toBe("hello brave world");
    // The unchanged "hello " prefix and "world" suffix should be excluded
    // from the replaced range, which is what lets CodeMirror keep a
    // cursor position inside them stable.
    expect(oldText.slice(0, change.from)).toBe("hello ");
    expect(oldText.slice(change.to)).toBe("world");
  });

  it("handles a pure insertion (old is a prefix of new)", () => {
    const change = minimalChange("hello", "hello world");
    expect(change).toEqual({ from: 5, to: 5, insert: " world" });
  });

  it("handles a pure deletion (new is a prefix of old)", () => {
    const change = minimalChange("hello world", "hello");
    expect(change).toEqual({ from: 5, to: 11, insert: "" });
  });

  it("handles a full replacement with nothing in common", () => {
    const change = minimalChange("abc", "xyz");
    expect(change).toEqual({ from: 0, to: 3, insert: "xyz" });
  });

  it("handles an empty old string", () => {
    expect(minimalChange("", "new")).toEqual({ from: 0, to: 0, insert: "new" });
  });

  it("handles an empty new string", () => {
    expect(minimalChange("old", "")).toEqual({ from: 0, to: 3, insert: "" });
  });

  it("handles two empty strings", () => {
    expect(minimalChange("", "")).toEqual({ from: 0, to: 0, insert: "" });
  });

  it("does not let overlapping prefix/suffix scans double-count on a short, repetitive change", () => {
    // "aaa" -> "aa": naive independent prefix/suffix scans could each
    // claim more of the string than actually differs; from must never
    // exceed to.
    const change = minimalChange("aaa", "aa");
    expect(change.from).toBeLessThanOrEqual(change.to);
    expect(applyChange("aaa", change)).toBe("aa");
  });

  it("matches the real frontmatter-edit shape: a change confined to the top of the document", () => {
    const oldText = '---\ntitle: "Old"\n---\n\nBody text the user is editing, cursor down here.';
    const newText = '---\ntitle: "New"\n---\n\nBody text the user is editing, cursor down here.';
    const change = minimalChange(oldText, newText);
    expect(applyChange(oldText, change)).toBe(newText);
    // The body (everything from the blank line on) must be entirely
    // outside the replaced range, so CodeMirror can map a cursor there
    // through the change unaffected.
    const bodyStart = oldText.indexOf("\n\nBody");
    expect(change.to).toBeLessThanOrEqual(bodyStart);
  });
});

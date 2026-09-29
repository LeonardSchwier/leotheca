import { describe, expect, it } from "vitest";
import { HIGHLIGHT_COLOR_EMOJI } from "../markdown/highlight";
import { HIGHLIGHT_COLOR_CHOICES, highlightColorEmoji, insertHighlightColor } from "./highlightColors";

const RED = "\u{1F534}"; // 🔴
const ORANGE = "\u{1F7E0}"; // 🟠
const GREEN = "\u{1F7E2}"; // 🟢
const BLUE = "\u{1F535}"; // 🔵
const PURPLE = "\u{1F7E3}"; // 🟣
const BLACK_HEART = "\u{1F5A4}"; // 🖤 (Extended_Pictographic, not a recognized color)

describe("highlightColorEmoji", () => {
  it("maps every recognized color name to its emoji from the shared map", () => {
    for (const [emoji, color] of Object.entries(HIGHLIGHT_COLOR_EMOJI)) {
      expect(highlightColorEmoji(color)).toBe(emoji);
    }
  });

  it("returns undefined for unknown colors", () => {
    expect(highlightColorEmoji("magenta")).toBeUndefined();
  });
});

describe("HIGHLIGHT_COLOR_CHOICES", () => {
  it("offers exactly the shared color set, red first, labels capitalized", () => {
    expect(HIGHLIGHT_COLOR_CHOICES.map((c) => c.color)).toEqual(["red", "orange", "green", "blue", "purple"]);
    expect(HIGHLIGHT_COLOR_CHOICES.map((c) => c.label)).toEqual(["Red", "Orange", "Green", "Blue", "Purple"]);
  });

  it("is frozen, like the other shared constant sets", () => {
    expect(Object.isFrozen(HIGHLIGHT_COLOR_CHOICES)).toBe(true);
  });
});

describe("insertHighlightColor", () => {
  it("inserts a fresh colored highlight with the caret after the marker", () => {
    expect(insertHighlightColor("important", "red")).toEqual({
      text: `==${RED} important==`,
      caretOffset: RED.length + 3, // == 🔴 (marker + emoji + space)
    });
  });

  it("inserts a plain (uncolored) highlight with the caret right after ==", () => {
    expect(insertHighlightColor("important")).toEqual({ text: "==important==", caretOffset: 2 });
  });

  it("keeps the user's own leading spaces after the emoji, never trimmed", () => {
    // detectHighlightColor's own doc comment: a space the author typed
    // after the emoji is left in place, not silently eaten.
    expect(insertHighlightColor("  spaced", "blue").text).toBe(`==${BLUE}   spaced==`);
  });

  it("re-colors an existing emoji prefix in place, never stacking markers", () => {
    const existing = `==${RED} text==`;
    const body = existing.slice(2, -2); // "🔴 text"
    expect(insertHighlightColor(body, "green").text).toBe(`==${GREEN} text==`);
  });

  it("re-coloring replaces a previous color emoji but keeps the rest verbatim", () => {
    const body = `${ORANGE} keep  double  spaces`;
    expect(insertHighlightColor(body, "purple").text).toBe(`==${PURPLE} keep  double  spaces==`);
  });

  it("removes the emoji prefix when switching to plain, keeping the body", () => {
    const body = `${BLUE} text`;
    expect(insertHighlightColor(body).text).toBe("==text==");
  });

  it("treats an unrecognized leading emoji as content, never a second marker", () => {
    // ❤ is Extended_Pictographic but not in HIGHLIGHT_COLOR_EMOJI, so
    // detectHighlightColor would render it as literal text. Re-coloring
    // must not strip it (it would then color "text" while dropping the
    // author's own emoji) — the insertion rule only rewrites a
    // recognized color prefix.
    const body = `${BLACK_HEART} text`;
    const result = insertHighlightColor(body, "red");
    expect(result.text).toBe(`==${RED} ${BLACK_HEART} text==`);
    // And uncoloring must not eat it either:
    expect(insertHighlightColor(body).text).toBe(`==${BLACK_HEART} text==`);
  });

  it("handles an empty body", () => {
    expect(insertHighlightColor("", "orange")).toEqual({ text: `==${ORANGE} ==`, caretOffset: ORANGE.length + 3 });
    expect(insertHighlightColor("")).toEqual({ text: "====", caretOffset: 2 });
  });

  it("handles a body that is only a color emoji (detector's emoji-only edge case)", () => {
    // detectHighlightColor treats ==🔴== as literal text (nothing to
    // color). The writer's rule "only strip a recognized color prefix"
    // still applies on re-color: the lone emoji is recognized, so it is
    // replaced rather than stacked.
    expect(insertHighlightColor(RED, "blue").text).toBe(`==${BLUE} ==`);
    expect(insertHighlightColor(RED).text).toBe("====");
  });

  it("places the caret so continued typing lands inside the highlight", () => {
    for (const color of ["red", "orange", "green", "blue", "purple"]) {
      const { text, caretOffset } = insertHighlightColor("body", color);
      expect(text.slice(caretOffset - 1, caretOffset)).toBe(" "); // just before the body
      expect(text.slice(caretOffset, caretOffset + 4)).toBe("body");
    }
  });
});

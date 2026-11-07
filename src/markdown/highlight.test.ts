import { describe, expect, it } from "vitest";
import { detectHighlightColor, HIGHLIGHT_COLORS, HIGHLIGHT_COLOR_EMOJI, highlightClassName } from "./highlight";

describe("detectHighlightColor", () => {
  it("returns no color for plain text", () => {
    expect(detectHighlightColor("plain text")).toEqual({ text: "plain text" });
  });

  it("returns no color for an empty string", () => {
    expect(detectHighlightColor("")).toEqual({ text: "" });
  });

  for (const [emoji, color] of Object.entries(HIGHLIGHT_COLOR_EMOJI)) {
    it(`detects the ${color} color from its emoji prefix (${emoji}) and strips it`, () => {
      expect(detectHighlightColor(`${emoji}rest of text`)).toEqual({ color, text: "rest of text" });
    });
  }

  it("keeps a space that immediately follows the emoji prefix", () => {
    expect(detectHighlightColor("\u{1F534} rest")).toEqual({ color: "red", text: " rest" });
  });

  it("does not treat an unrecognized emoji as a color", () => {
    // 😀 (U+1F600) is a real emoji but not one of the five recognized
    // color codes.
    expect(detectHighlightColor("\u{1F600}rest")).toEqual({ text: "\u{1F600}rest" });
  });

  it("does not strip the emoji when nothing but whitespace follows it", () => {
    expect(detectHighlightColor("\u{1F534}")).toEqual({ text: "\u{1F534}" });
    expect(detectHighlightColor("\u{1F534}   ")).toEqual({ text: "\u{1F534}   " });
  });

  it("only inspects the first codepoint: a color emoji later in the text is ordinary content", () => {
    expect(detectHighlightColor("text \u{1F534} more")).toEqual({ text: "text \u{1F534} more" });
  });

  it("only strips the first emoji when two color emoji are adjacent at the start", () => {
    expect(detectHighlightColor("\u{1F534}\u{1F7E2}rest")).toEqual({ color: "red", text: "\u{1F7E2}rest" });
  });

  it("handles a lone high surrogate at the start without throwing", () => {
    // An unpaired surrogate is technically invalid Unicode but must never
    // crash the renderer on user-typed content.
    expect(() => detectHighlightColor("\uD83D")).not.toThrow();
    expect(detectHighlightColor("\uD83D").color).toBeUndefined();
  });
});

describe("HIGHLIGHT_COLORS", () => {
  it("lists exactly the five documented colors, each once", () => {
    expect(new Set(HIGHLIGHT_COLORS)).toEqual(new Set(["red", "orange", "green", "blue", "purple"]));
    expect(HIGHLIGHT_COLORS.length).toBe(5);
  });
});

describe("highlightClassName", () => {
  it("returns the base class alone when there is no color", () => {
    expect(highlightClassName("lt-highlight", undefined)).toBe("lt-highlight");
  });

  it("appends a color-suffixed class when a color is given", () => {
    expect(highlightClassName("lt-highlight", "red")).toBe("lt-highlight lt-highlight-red");
  });
});

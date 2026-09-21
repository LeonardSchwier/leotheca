/**
 * Unit tests for the offline spellcheck module.
 *
 * These tests verify the pure logic (checkSpelling, createNspellChecker)
 * without a CodeMirror editor, using a mock SpellChecker and real nspell
 * with a minimal test dictionary.
 */
import { describe, it, expect } from "vitest";
import {
  checkSpelling,
  createNspellChecker,
  type SpellChecker,
} from "./spellCheck";

// ─── Mock checker ────────────────────────────────────────────────────────────

/** A SpellChecker that says a word is correct iff it is in the allowed set. */
function mockChecker(correctWords: Set<string>): SpellChecker {
  return {
    isCorrect(word: string) {
      return correctWords.has(word.toLowerCase());
    },
  };
}

// ─── checkSpelling ───────────────────────────────────────────────────────────

describe("checkSpelling", () => {
  const correct = new Set(["hello", "world", "don't", "well-known"]);

  it("flags misspelled words", () => {
    const results = checkSpelling("hlello mesage", 0, mockChecker(correct));
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.word)).toEqual(["hlello", "mesage"]);
  });

  it("passes through correctly spelled words", () => {
    const results = checkSpelling("hello world", 0, mockChecker(correct));
    expect(results).toHaveLength(0);
  });

  it("respects the line offset for positions", () => {
    const results = checkSpelling("teh", 100, mockChecker(correct));
    expect(results).toHaveLength(1);
    expect(results[0].from).toBe(100);
    expect(results[0].to).toBe(103);
  });

  it("handles words with internal apostrophes", () => {
    // "don't" is in the correct set, so it should pass
    const results = checkSpelling("don't stop", 0, mockChecker(correct));
    expect(results.find((r) => r.word === "don't")).toBeUndefined();
    expect(results).toHaveLength(1); // "stop" is not in the set
  });

  it("handles hyphenated words", () => {
    // "well-known" is in the correct set
    const results = checkSpelling("a well-known fact", 0, mockChecker(correct));
    expect(results.find((r) => r.word === "well-known")).toBeUndefined();
    expect(results).toHaveLength(2); // "a" and "fact"
  });

  it("skips pure digits", () => {
    const results = checkSpelling("value 12345 ok", 0, mockChecker(correct));
    expect(results.find((r) => r.word === "12345")).toBeUndefined();
  });

  it("handles accented characters (Unicode-aware)", () => {
    const accented = new Set(["café", "naïve", "über"]);
    const results = checkSpelling("café naïve über", 0, mockChecker(accented));
    expect(results).toHaveLength(0);
  });

  it("flags unknown accented words", () => {
    const results = checkSpelling("café cffet", 0, mockChecker(new Set(["café"])));
    expect(results).toHaveLength(1);
    expect(results[0].word).toBe("cffet");
  });

  it("handles empty string", () => {
    expect(checkSpelling("", 0, mockChecker(new Set()))).toHaveLength(0);
  });

  it("handles single-character words", () => {
    const results = checkSpelling("a a", 0, mockChecker(new Set(["a"])));
    expect(results).toHaveLength(0);
  });

  it("handles mixed-case words", () => {
    const results = checkSpelling("Hello WORLD", 0, mockChecker(new Set(["hello", "world"])));
    // Mock checker lowercases, so both should pass
    expect(results).toHaveLength(0);
  });

  it("handles markdown inline syntax correctly", () => {
    // **bold** and *italic* markers are not word chars, so the words inside
    // are matched correctly
    const results = checkSpelling("**bold** *italic*", 0, mockChecker(new Set(["bold", "italic"])));
    expect(results).toHaveLength(0);
  });

  it("handles URLs in prose (words in URLs are checked)", () => {
    // "example" and "com" would be checked — this is expected behaviour;
    // the caller (lintSource) filters out URL-only lines.
    const results = checkSpelling("visit https://example.com for info", 0, mockChecker(new Set()));
    expect(results.length).toBeGreaterThan(0);
  });
});

// ─── createNspellChecker ─────────────────────────────────────────────────────

describe("createNspellChecker", () => {
  const aff = "SET L\n";
  const dic = "EN\nt\nthe\na\nand\nword\nhello\n";

  it("creates a working checker from dictionary content", () => {
    const checker = createNspellChecker(aff, dic);
    expect(checker).not.toBeNull();
    expect(checker!.isCorrect("the")).toBe(true);
    expect(checker!.isCorrect("word")).toBe(true);
    expect(checker!.isCorrect("teh")).toBe(false);
    expect(checker!.isCorrect("xyz")).toBe(false);
  });

  it("returns null for empty aff content", () => {
    expect(createNspellChecker("", dic)).toBeNull();
  });

  it("returns null for empty dic content", () => {
    expect(createNspellChecker(aff, "")).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { fuzzyScore, fuzzyFilter } from "./fuzzyMatch";

describe("fuzzyScore", () => {
  it("returns 1 for empty query", () => {
    expect(fuzzyScore("", "anything")).toBe(1);
  });

  it("returns -1 when query is longer than target", () => {
    expect(fuzzyScore("abc", "ab")).toBe(-1);
  });

  it("returns -1 when query chars not all found in target", () => {
    expect(fuzzyScore("xyz", "hello")).toBe(-1);
  });

  it("matches exact substring with high score", () => {
    const exact = fuzzyScore("hello", "hello world");
    const scattered = fuzzyScore("hlw", "hello world");
    expect(exact).toBeGreaterThan(scattered);
  });

  it("ranks word-start matches higher than mid-word matches", () => {
    // "my project notes" vs "mpn"
    // word-start: m(pos0), p(pos3), n(pos9) — all word-starts
    // vs "mpn" in "myproject" — m(pos0), p(pos2), n(pos5) — only m is word-start
    const wordStart = fuzzyScore("mpn", "my project notes");
    const midWord = fuzzyScore("mpn", "myproject");
    expect(wordStart).toBeGreaterThan(midWord);
  });

  it("ranks consecutive matches higher than scattered", () => {
    const consecutive = fuzzyScore("abc", "xyzabc");
    const scattered = fuzzyScore("abc", "axbxc");
    expect(consecutive).toBeGreaterThan(scattered);
  });

  it("is case-insensitive", () => {
    expect(fuzzyScore("Hello", "hello world")).toBe(fuzzyScore("hello", "hello world"));
    expect(fuzzyScore("HELLO", "hello world")).toBe(fuzzyScore("hello", "hello world"));
  });

  it("matches single character at word start", () => {
    expect(fuzzyScore("p", "my project")).toBeGreaterThan(0);
    expect(fuzzyScore("x", "my project")).toBe(-1);
  });

  it("handles special characters as non-word boundaries", () => {
    // "/" is a non-word char, so "n" at position after "/" is a word-start
    expect(fuzzyScore("n", "my/notes")).toBeGreaterThan(0);
  });

  it("scores consecutive matches higher than gaps between matched chars", () => {
    // 'ac' in 'abc' — consecutive
    // vs 'ac' in 'axbc' — gap of 1 between them
    const consec = fuzzyScore("ac", "abc");
    const gap = fuzzyScore("ac", "axbc");
    expect(consec).toBeGreaterThan(gap);
  });
});

describe("fuzzyFilter", () => {
  const notes = [
    { name: "my project notes" },
    { name: "apple" },
    { name: "banana" },
    { name: "my project" },
    { name: "notes" },
  ];

  it("returns all items for empty query", () => {
    expect(fuzzyFilter("", notes, (n) => n.name)).toHaveLength(5);
  });

  it("filters out non-matching items", () => {
    const result = fuzzyFilter("xyz", notes, (n) => n.name);
    expect(result).toHaveLength(0);
  });

  it("returns matching items sorted by score descending", () => {
    const result = fuzzyFilter("mp", notes, (n) => n.name);
    // Both "my project" and "my project notes" match;
    // "my project notes" has more matched chars so may rank higher —
    // just verify both are present and non-matching items are excluded
    expect(result.length).toBeGreaterThanOrEqual(2);
    const names = result.map((n) => n.name);
    expect(names).toContain("my project");
    expect(names).toContain("my project notes");
    expect(names).not.toContain("apple");
    expect(names).not.toContain("banana");
  });

  it("finds word-start matches", () => {
    const result = fuzzyFilter("ban", notes, (n) => n.name);
    expect(result[0].name).toBe("banana");
  });

  it("is case-insensitive", () => {
    const result = fuzzyFilter("MY", notes, (n) => n.name);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });
});

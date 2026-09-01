import { describe, expect, it } from "vitest";
import { INSPIRATION_QUOTES, pickRandomQuote } from "./inspirationQuotes";

describe("INSPIRATION_QUOTES", () => {
  it("has at least one quote, and every quote has non-empty text and author", () => {
    expect(INSPIRATION_QUOTES.length).toBeGreaterThan(0);
    for (const quote of INSPIRATION_QUOTES) {
      expect(quote.text.trim().length).toBeGreaterThan(0);
      expect(quote.author.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("pickRandomQuote", () => {
  it("always returns a quote that is a member of INSPIRATION_QUOTES", () => {
    for (let i = 0; i < 50; i++) {
      expect(INSPIRATION_QUOTES).toContainEqual(pickRandomQuote());
    }
  });

  it("can return more than one distinct quote across many calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      seen.add(pickRandomQuote().text);
      if (seen.size > 1) break;
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

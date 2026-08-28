import { describe, expect, it } from "vitest";
import { matchesSearchQuery, needsContent, parseSearchQuery, type MatchableNote } from "./searchQuery";

function note(overrides: Partial<MatchableNote> = {}): MatchableNote {
  return { name: "note.md", path: "/vault/note.md", content: null, tags: [], ...overrides };
}

describe("parseSearchQuery", () => {
  it("returns an empty array for a blank query", () => {
    expect(parseSearchQuery("")).toEqual([]);
    expect(parseSearchQuery("   ")).toEqual([]);
  });

  it("parses a single plain term as text, lowercased", () => {
    expect(parseSearchQuery("Foo")).toEqual([{ kind: "text", value: "foo", negate: false }]);
  });

  it("parses multiple space-separated terms", () => {
    expect(parseSearchQuery("foo bar")).toEqual([
      { kind: "text", value: "foo", negate: false },
      { kind: "text", value: "bar", negate: false },
    ]);
  });

  it("parses a tag: term", () => {
    expect(parseSearchQuery("tag:work")).toEqual([{ kind: "tag", value: "work", negate: false }]);
  });

  it("parses a tag: prefix case-insensitively", () => {
    expect(parseSearchQuery("TAG:Work")).toEqual([{ kind: "tag", value: "work", negate: false }]);
  });

  it("parses a path: term", () => {
    expect(parseSearchQuery("path:journal")).toEqual([{ kind: "path", value: "journal", negate: false }]);
  });

  it("parses a negated text term", () => {
    expect(parseSearchQuery("-foo")).toEqual([{ kind: "text", value: "foo", negate: true }]);
  });

  it("parses a negated tag: term", () => {
    expect(parseSearchQuery("-tag:archived")).toEqual([{ kind: "tag", value: "archived", negate: true }]);
  });

  it("treats a bare 'tag:' with nothing after it as literal text", () => {
    expect(parseSearchQuery("tag:")).toEqual([{ kind: "text", value: "tag:", negate: false }]);
  });

  it("treats a lone '-' as literal text, not an empty negation", () => {
    expect(parseSearchQuery("-")).toEqual([{ kind: "text", value: "-", negate: false }]);
  });

  it("combines text, tag, and path terms in one query", () => {
    expect(parseSearchQuery("foo tag:work path:journal")).toEqual([
      { kind: "text", value: "foo", negate: false },
      { kind: "tag", value: "work", negate: false },
      { kind: "path", value: "journal", negate: false },
    ]);
  });
});

describe("needsContent", () => {
  it("is true for a text term", () => {
    expect(needsContent({ kind: "text", value: "foo", negate: false })).toBe(true);
  });

  it("is false for a tag or path term", () => {
    expect(needsContent({ kind: "tag", value: "work", negate: false })).toBe(false);
    expect(needsContent({ kind: "path", value: "journal", negate: false })).toBe(false);
  });
});

describe("matchesSearchQuery", () => {
  it("returns false for an empty terms array", () => {
    expect(matchesSearchQuery([], note())).toBe(false);
  });

  it("matches a text term by file name", () => {
    const terms = parseSearchQuery("note");
    expect(matchesSearchQuery(terms, note({ name: "note.md" }))).toBe(true);
  });

  it("matches a text term by content when the name doesn't match", () => {
    const terms = parseSearchQuery("hello");
    expect(matchesSearchQuery(terms, note({ name: "other.md", content: "hello world" }))).toBe(true);
  });

  it("does not match a text term when neither name nor content contain it", () => {
    const terms = parseSearchQuery("hello");
    expect(matchesSearchQuery(terms, note({ name: "other.md", content: "goodbye" }))).toBe(false);
  });

  it("a text term never matches null content, only the name", () => {
    const terms = parseSearchQuery("hello");
    expect(matchesSearchQuery(terms, note({ name: "other.md", content: null }))).toBe(false);
  });

  it("matches a tag: term against the note's own tags", () => {
    const terms = parseSearchQuery("tag:work");
    expect(matchesSearchQuery(terms, note({ tags: ["work"] }))).toBe(true);
    expect(matchesSearchQuery(terms, note({ tags: ["journal"] }))).toBe(false);
  });

  it("a tag: term also matches a more specific nested tag", () => {
    const terms = parseSearchQuery("tag:work");
    expect(matchesSearchQuery(terms, note({ tags: ["work/project"] }))).toBe(true);
  });

  it("a tag: term does not match an unrelated tag that merely shares a prefix", () => {
    const terms = parseSearchQuery("tag:work");
    expect(matchesSearchQuery(terms, note({ tags: ["workshop"] }))).toBe(false);
  });

  it("matches a path: term as a substring of the full path", () => {
    const terms = parseSearchQuery("path:journal");
    expect(matchesSearchQuery(terms, note({ path: "/vault/journal/today.md" }))).toBe(true);
    expect(matchesSearchQuery(terms, note({ path: "/vault/work/today.md" }))).toBe(false);
  });

  it("a negated term inverts the match", () => {
    const terms = parseSearchQuery("-tag:archived");
    expect(matchesSearchQuery(terms, note({ tags: ["archived"] }))).toBe(false);
    expect(matchesSearchQuery(terms, note({ tags: ["active"] }))).toBe(true);
  });

  it("combines multiple terms with AND semantics", () => {
    const terms = parseSearchQuery("tag:work path:journal");
    expect(
      matchesSearchQuery(terms, note({ path: "/vault/journal/note.md", tags: ["work"] })),
    ).toBe(true);
    expect(
      matchesSearchQuery(terms, note({ path: "/vault/other/note.md", tags: ["work"] })),
    ).toBe(false);
    expect(
      matchesSearchQuery(terms, note({ path: "/vault/journal/note.md", tags: ["journal"] })),
    ).toBe(false);
  });

  it("a query with a negated term and a positive term requires both to hold", () => {
    const terms = parseSearchQuery("tag:work -tag:archived");
    expect(matchesSearchQuery(terms, note({ tags: ["work"] }))).toBe(true);
    expect(matchesSearchQuery(terms, note({ tags: ["work", "archived"] }))).toBe(false);
  });
});

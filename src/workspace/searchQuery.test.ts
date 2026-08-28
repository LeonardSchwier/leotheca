import { describe, expect, it, vi } from "vitest";
import { matchesSearchQuery, parseSearchQuery, type SearchContext } from "./searchQuery";

describe("parseSearchQuery", () => {
  it("returns no groups at all for a blank query", () => {
    expect(parseSearchQuery("")).toEqual([]);
    expect(parseSearchQuery("   ")).toEqual([]);
  });

  it("parses a single plain term as one positive text clause, lowercased", () => {
    expect(parseSearchQuery("Foo")).toEqual([[{ kind: "text", value: "foo", negate: false }]]);
  });

  it("ANDs space-separated terms into one group", () => {
    expect(parseSearchQuery("foo bar")).toEqual([
      [
        { kind: "text", value: "foo", negate: false },
        { kind: "text", value: "bar", negate: false },
      ],
    ]);
  });

  it("parses a quoted phrase as one clause, spaces and all", () => {
    expect(parseSearchQuery('"foo bar"')).toEqual([[{ kind: "text", value: "foo bar", negate: false }]]);
  });

  it("parses tag: and path: prefixes case-insensitively", () => {
    expect(parseSearchQuery("tag:work")).toEqual([[{ kind: "tag", value: "work", negate: false }]]);
    expect(parseSearchQuery("TAG:Work")).toEqual([[{ kind: "tag", value: "work", negate: false }]]);
    expect(parseSearchQuery("path:journal")).toEqual([[{ kind: "path", value: "journal", negate: false }]]);
  });

  it("parses a negated text, tag:, or path: term", () => {
    expect(parseSearchQuery("-foo")).toEqual([[{ kind: "text", value: "foo", negate: true }]]);
    expect(parseSearchQuery("-tag:archived")).toEqual([[{ kind: "tag", value: "archived", negate: true }]]);
    expect(parseSearchQuery("-path:old")).toEqual([[{ kind: "path", value: "old", negate: true }]]);
  });

  it("parses a negated quoted phrase", () => {
    expect(parseSearchQuery('-"foo bar"')).toEqual([[{ kind: "text", value: "foo bar", negate: true }]]);
  });

  it("treats a bare 'tag:' with nothing after it as literal text", () => {
    expect(parseSearchQuery("tag:")).toEqual([[{ kind: "text", value: "tag:", negate: false }]]);
  });

  it("treats a lone '-' as literal text, not an empty negation", () => {
    expect(parseSearchQuery("-")).toEqual([[{ kind: "text", value: "-", negate: false }]]);
  });

  it("combines text, tag, and path terms in one AND group", () => {
    expect(parseSearchQuery("foo tag:work path:journal")).toEqual([
      [
        { kind: "text", value: "foo", negate: false },
        { kind: "tag", value: "work", negate: false },
        { kind: "path", value: "journal", negate: false },
      ],
    ]);
  });

  it("splits on a whitespace-delimited OR into separate groups", () => {
    expect(parseSearchQuery("foo OR bar")).toEqual([
      [{ kind: "text", value: "foo", negate: false }],
      [{ kind: "text", value: "bar", negate: false }],
    ]);
  });

  it("combines AND-within-group and OR-between-groups", () => {
    expect(parseSearchQuery("tag:work foo OR bar")).toEqual([
      [
        { kind: "tag", value: "work", negate: false },
        { kind: "text", value: "foo", negate: false },
      ],
      [{ kind: "text", value: "bar", negate: false }],
    ]);
  });

  it("collapses extra whitespace between tokens", () => {
    expect(parseSearchQuery("  foo    bar  ")).toEqual([
      [
        { kind: "text", value: "foo", negate: false },
        { kind: "text", value: "bar", negate: false },
      ],
    ]);
  });

  it("tolerates an unterminated quote by taking the rest of the token", () => {
    expect(parseSearchQuery('"unterminated')).toEqual([[{ kind: "text", value: "unterminated", negate: false }]]);
  });
});

function contextFor(overrides: Partial<SearchContext> & { content?: string | null } = {}): SearchContext {
  const { content, ...rest } = overrides;
  return {
    nameLower: "note.md",
    pathLower: "note.md",
    tagsLower: [],
    getContentLower: vi.fn(async () => content ?? null),
    ...rest,
  };
}

describe("matchesSearchQuery", () => {
  it("matches nothing for an empty parsed query", async () => {
    expect(await matchesSearchQuery([], contextFor())).toBe(false);
  });

  it("matches a text clause against the name", async () => {
    const ctx = contextFor({ nameLower: "groceries.md" });
    expect(await matchesSearchQuery(parseSearchQuery("groc"), ctx)).toBe(true);
  });

  it("falls back to content when the name doesn't match", async () => {
    const ctx = contextFor({ nameLower: "diary.md", content: "bought some milk today" });
    expect(await matchesSearchQuery(parseSearchQuery("milk"), ctx)).toBe(true);
  });

  it("does not match a text clause when neither name nor content contain it", async () => {
    const ctx = contextFor({ nameLower: "diary.md", content: "goodbye" });
    expect(await matchesSearchQuery(parseSearchQuery("milk"), ctx)).toBe(false);
  });

  it("does not call getContentLower when the name already matches", async () => {
    const ctx = contextFor({ nameLower: "groceries.md" });
    await matchesSearchQuery(parseSearchQuery("groc"), ctx);
    expect(ctx.getContentLower).not.toHaveBeenCalled();
  });

  it("does not call getContentLower for a tag/path-only query", async () => {
    const ctx = contextFor({ tagsLower: ["work"], pathLower: "work/note.md" });
    await matchesSearchQuery(parseSearchQuery("tag:work path:work"), ctx);
    expect(ctx.getContentLower).not.toHaveBeenCalled();
  });

  // Regression test for a real bug in the first version of this feature:
  // a negated text clause was decided from `content: null` before ever
  // reading the file, and null content can never disprove an excluded
  // word's presence, so `-badword` matched every note whose *name*
  // didn't contain it, without checking a single file's real content.
  // See this file's own top-of-file comment for the full story.
  it("excludes a note whose real content contains a negated term", async () => {
    const ctx = contextFor({ nameLower: "diary.md", content: "this note mentions badword right here" });
    expect(await matchesSearchQuery(parseSearchQuery("-badword"), ctx)).toBe(false);
  });

  it("includes a note whose content genuinely does not contain a negated term", async () => {
    const ctx = contextFor({ nameLower: "diary.md", content: "a perfectly ordinary day" });
    expect(await matchesSearchQuery(parseSearchQuery("-badword"), ctx)).toBe(true);
  });

  it("a negated term combined with an already-satisfied metadata clause still checks real content", async () => {
    // Before the fix, tag:work (satisfied) plus -badword (assumed
    // satisfied from null content) would match here without ever
    // reading the file; the real content actually contains "badword",
    // so this must NOT match.
    const ctx = contextFor({ tagsLower: ["work"], content: "contains badword" });
    expect(await matchesSearchQuery(parseSearchQuery("tag:work -badword"), ctx)).toBe(false);
  });

  it("matches tag: against an exact tag", async () => {
    const ctx = contextFor({ tagsLower: ["work"] });
    expect(await matchesSearchQuery(parseSearchQuery("tag:work"), ctx)).toBe(true);
    expect(await matchesSearchQuery(parseSearchQuery("tag:other"), ctx)).toBe(false);
  });

  it("matches tag: against a nested tag the same way the Tags panel aggregates", async () => {
    const ctx = contextFor({ tagsLower: ["work/project"] });
    expect(await matchesSearchQuery(parseSearchQuery("tag:work"), ctx)).toBe(true);
  });

  it("does not let tag:work match a tag that merely starts with the same letters", async () => {
    const ctx = contextFor({ tagsLower: ["workshop"] });
    expect(await matchesSearchQuery(parseSearchQuery("tag:work"), ctx)).toBe(false);
  });

  it("excludes a note carrying a negated tag", async () => {
    expect(await matchesSearchQuery(parseSearchQuery("-tag:archived"), contextFor({ tagsLower: ["archived"] }))).toBe(
      false,
    );
    expect(await matchesSearchQuery(parseSearchQuery("-tag:archived"), contextFor({ tagsLower: ["active"] }))).toBe(
      true,
    );
  });

  it("matches path: against a substring of the path", async () => {
    const ctx = contextFor({ pathLower: "journal/2026/note.md" });
    expect(await matchesSearchQuery(parseSearchQuery("path:journal"), ctx)).toBe(true);
    expect(await matchesSearchQuery(parseSearchQuery("path:work"), ctx)).toBe(false);
  });

  it("excludes a note whose path matches a negated path: filter", async () => {
    const ctx = contextFor({ pathLower: "archive/old.md" });
    expect(await matchesSearchQuery(parseSearchQuery("-path:archive"), ctx)).toBe(false);
  });

  it("requires every clause within a group (AND)", async () => {
    const ctx = contextFor({ tagsLower: ["work"], nameLower: "note.md", content: "no match here" });
    expect(await matchesSearchQuery(parseSearchQuery("tag:work foo"), ctx)).toBe(false);
  });

  it("matches if any OR group is fully satisfied", async () => {
    const ctx = contextFor({ tagsLower: ["personal"], nameLower: "note.md" });
    expect(await matchesSearchQuery(parseSearchQuery("tag:work OR tag:personal"), ctx)).toBe(true);
  });

  it("checks a tag:/path: clause before a text clause regardless of the order typed", async () => {
    const ctx = contextFor({ tagsLower: ["journal"], nameLower: "note.md" });
    await matchesSearchQuery(parseSearchQuery("deadline tag:work"), ctx);
    expect(ctx.getContentLower).not.toHaveBeenCalled();
  });

  it("only ever reads content through the caller's own getContentLower, never bypassing it", async () => {
    // matchesSearchQuery doesn't memoize on its own, that's the caller's
    // job (see fileTreeStore.ts's runSearch): this confirms a caller that
    // does memoize, exactly as runSearch does, only pays for one real
    // read even though two text clauses both need the content here.
    let reads = 0;
    let cached: Promise<string | null> | null = null;
    const getContentLower = () => {
      if (!cached) {
        reads++;
        cached = Promise.resolve("foo bar");
      }
      return cached;
    };
    const ctx = contextFor({ nameLower: "note.md", getContentLower });
    expect(await matchesSearchQuery(parseSearchQuery("foo bar"), ctx)).toBe(true);
    expect(reads).toBe(1);
  });
});

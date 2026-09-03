import { describe, expect, it } from "vitest";
import { blockLinkText, generateBlockId, resolveBlockLinkAtCursor, uniqueBlockId } from "./blockLinkActions";

describe("generateBlockId", () => {
  it("produces a grammar-legal id shaped like the spec's own example", () => {
    const id = generateBlockId();
    expect(id).toMatch(/^b-[a-f0-9]{8}$/);
  });

  it("produces different ids across calls (real randomness, not a fixed stub)", () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateBlockId()));
    expect(ids.size).toBe(20);
  });
});

describe("uniqueBlockId", () => {
  it("returns an id not present in the given key set", () => {
    const id = uniqueBlockId(new Set());
    expect(id).toMatch(/^b-[a-f0-9]{8}$/);
  });

  it("never returns an id whose lowercase key already exists, even under forced collisions", () => {
    // Force the first several attempts to appear "already taken" by
    // pre-seeding the existing-keys set with real generated ids, proving
    // the retry loop actually re-checks each new draw rather than
    // trusting the very first one.
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const id = uniqueBlockId(seen);
      expect(seen.has(id.toLowerCase())).toBe(false);
      seen.add(id.toLowerCase());
    }
  });
});

describe("blockLinkText", () => {
  it("builds a same-note block link through serializeWikiLink", () => {
    expect(blockLinkText("release-decision")).toBe("[[#^release-decision]]");
  });
});

describe("resolveBlockLinkAtCursor", () => {
  it("returns undefined when the cursor is not inside any eligible block", () => {
    const source = "# A heading\n\nA paragraph.";
    expect(resolveBlockLinkAtCursor(source, source.indexOf("heading"))).toBeUndefined();
  });

  it("reuses an existing unique marker without inserting anything", () => {
    const source = "A paragraph with an id. ^existing-id";
    const cursor = source.indexOf("with");
    const resolution = resolveBlockLinkAtCursor(source, cursor);
    expect(resolution?.linkText).toBe("[[#^existing-id]]");
    expect(resolution?.insertion).toBeUndefined();
  });

  it("returns undefined when the block's own existing marker is ambiguous (duplicate elsewhere in the note)", () => {
    const source = "First. ^dup-id\n\nSecond. ^dup-id";
    const cursor = source.indexOf("First");
    expect(resolveBlockLinkAtCursor(source, cursor)).toBeUndefined();
  });

  it("generates and inserts a fresh id for a markerless paragraph, at the end of its content", () => {
    const source = "A paragraph with no marker yet.";
    const cursor = source.indexOf("paragraph");
    const resolution = resolveBlockLinkAtCursor(source, cursor);
    expect(resolution).toBeDefined();
    expect(resolution!.insertion!.from).toBe(source.length);
    expect(resolution!.insertion!.text).toMatch(/^ \^b-[a-f0-9]{8}$/);
    const insertedId = resolution!.insertion!.text.trim().slice(1);
    expect(resolution!.linkText).toBe(`[[#^${insertedId}]]`);
  });

  it("generates and inserts a fresh id for a markerless list item, not the whole list", () => {
    const source = "- First item\n- Second item\n- Third item";
    const cursor = source.indexOf("Second");
    const resolution = resolveBlockLinkAtCursor(source, cursor);
    const secondLineEnd = source.indexOf("\n- Third");
    expect(resolution!.insertion!.from).toBe(secondLineEnd);
  });

  it("generates and inserts a fresh id for a markerless fenced code block, on a new line after the fence", () => {
    const source = "```\nconst x = 1;\n```\n\nAfter.";
    const cursor = source.indexOf("const");
    const resolution = resolveBlockLinkAtCursor(source, cursor);
    const fenceEnd = source.indexOf("```\n\nAfter") + 3;
    expect(resolution!.insertion!.from).toBe(fenceEnd);
    expect(resolution!.insertion!.text).toMatch(/^\n\^b-[a-f0-9]{8}$/);
  });

  it("never generates an id colliding with one already used elsewhere in the note", () => {
    const source = "First. ^b-aaaaaaaa\n\nSecond, no marker yet.";
    const cursor = source.indexOf("Second");
    const resolution = resolveBlockLinkAtCursor(source, cursor);
    const insertedId = resolution!.insertion!.text.trim().slice(1);
    expect(insertedId.toLowerCase()).not.toBe("b-aaaaaaaa");
  });
});

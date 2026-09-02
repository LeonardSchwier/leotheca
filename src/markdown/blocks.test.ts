import { describe, expect, it } from "vitest";
import { scanBlockIds } from "./blocks";

describe("scanBlockIds", () => {
  it("returns an empty array for a note with no block ID markers", () => {
    expect(scanBlockIds("Just a paragraph with no marker.")).toEqual([]);
  });

  it("recognizes a block ID on a single-line paragraph", () => {
    const source = "This decision remains valid for the first release. ^release-decision";
    const [block] = scanBlockIds(source);
    expect(block.id).toBe("release-decision");
    expect(block.key).toBe("release-decision");
    expect(block.kind).toBe("paragraph");
    expect(source.slice(block.contentFrom, block.contentTo)).toBe(
      "This decision remains valid for the first release.",
    );
    expect(source.slice(block.sourceFrom, block.sourceTo)).toBe(source);
    expect(source.slice(block.idFrom, block.idTo)).toBe("^release-decision");
  });

  it("recognizes a block ID on the last line of a multi-line paragraph", () => {
    const source = "First line of the paragraph.\nSecond line ends here. ^multi-line-id";
    const [block] = scanBlockIds(source);
    expect(block.id).toBe("multi-line-id");
    expect(source.slice(block.sourceFrom, block.sourceTo)).toBe(source);
    expect(source.slice(block.contentFrom, block.contentTo)).toBe(
      "First line of the paragraph.\nSecond line ends here.",
    );
  });

  it("reports the correct line and column", () => {
    const source = "Intro.\n\nBody with an id. ^body-id";
    const [block] = scanBlockIds(source);
    expect(block.line).toBe(3);
    expect(block.column).toBe(1);
  });

  it("allows digits and hyphens after the leading alphanumeric character", () => {
    const source = "Generated id example. ^b-7k3m2p9d";
    const [block] = scanBlockIds(source);
    expect(block.id).toBe("b-7k3m2p9d");
  });

  it("does not require a marker to be present: plain paragraphs are not recorded", () => {
    const source = "A paragraph.\n\nAnother paragraph.\n\n- A list item, not a paragraph.";
    expect(scanBlockIds(source)).toEqual([]);
  });

  it("rejects a marker with no preceding whitespace", () => {
    expect(scanBlockIds("A sentence ending in a caret^not-an-id")).toEqual([]);
  });

  it("rejects an empty id (bare caret)", () => {
    expect(scanBlockIds("A sentence with a stray caret. ^")).toEqual([]);
  });

  it("rejects an id containing a character outside the grammar", () => {
    expect(scanBlockIds("A sentence. ^has_underscore")).toEqual([]);
    expect(scanBlockIds("A sentence. ^has.dot")).toEqual([]);
  });

  it("rejects an id starting with a hyphen", () => {
    expect(scanBlockIds("A sentence. ^-leading-hyphen")).toEqual([]);
  });

  it("caps the id at 64 characters, matching the grammar's {0,63} tail", () => {
    const id64 = "a" + "b".repeat(63);
    const [block] = scanBlockIds(`A sentence. ^${id64}`);
    expect(block.id).toBe(id64);
  });

  it("does not attach a marker whose block is a heading", () => {
    expect(scanBlockIds("## Architecture boundary ^architecture-boundary")).toEqual([]);
  });

  it("attaches a marker on a single-line list item (F04 Phase 3b)", () => {
    const source = "- The user owns the Markdown files. ^local-first";
    const [block] = scanBlockIds(source);
    expect(block.kind).toBe("list-item");
    expect(block.id).toBe("local-first");
    expect(source.slice(block.contentFrom, block.contentTo)).toBe("The user owns the Markdown files.");
    expect(source.slice(block.sourceFrom, block.sourceTo)).toBe(source);
  });

  it("attaches a marker on a single-line blockquote (F04 Phase 3b)", () => {
    const source = "> A quoted principle. ^principle";
    const [block] = scanBlockIds(source);
    expect(block.kind).toBe("blockquote");
    expect(block.id).toBe("principle");
    expect(source.slice(block.contentFrom, block.contentTo)).toBe("A quoted principle.");
  });

  it("does not attach a marker inside a fenced code block", () => {
    const source = "```\nconst x = 1; ^inside-fence\n```";
    expect(scanBlockIds(source)).toEqual([]);
  });

  it("resumes paragraph scanning correctly after a fenced code block", () => {
    const source = "```\ncode\n```\n\nAfter the fence. ^after-fence";
    const [block] = scanBlockIds(source);
    expect(block.id).toBe("after-fence");
  });

  it("attaches a marker on the line immediately following a closing fence (F04 Phase 3d)", () => {
    const source = "```\nconst x = 1;\n```\n^code-example";
    const [block] = scanBlockIds(source);
    expect(block.kind).toBe("fenced-code");
    expect(block.id).toBe("code-example");
    expect(source.slice(block.contentFrom, block.contentTo)).toBe("```\nconst x = 1;\n```");
    expect(source.slice(block.sourceFrom, block.sourceTo)).toBe(source);
  });

  it("does not attach a fenced-code marker when a blank line separates it from the closing fence", () => {
    const source = "```\ncode\n```\n\n^too-far";
    expect(scanBlockIds(source)).toEqual([]);
  });

  it("does not attach a fenced-code marker when the immediately following line has other content, but still reads it as an ordinary paragraph", () => {
    const source = "```\ncode\n```\nNot just a marker ^not-standalone";
    const [block] = scanBlockIds(source);
    expect(block.kind).toBe("paragraph");
    expect(block.id).toBe("not-standalone");
  });

  it("forfeits the marker opportunity, not retrying a later line, when the immediately following line isn't one", () => {
    const source = "```\ncode\n```\nsome text\n^too-late";
    expect(scanBlockIds(source)).toEqual([]);
  });

  it("allows up to 3 leading spaces before the caret on a fenced-code marker line, matching leaf-block indentation", () => {
    const source = "```\ncode\n```\n   ^indented";
    const [block] = scanBlockIds(source);
    expect(block.id).toBe("indented");
  });

  it("does not let a fence opening immediately after another's close consume that close's marker opportunity", () => {
    const source = "```\nfirst\n```\n```\nsecond\n```\n^after-second";
    const [block] = scanBlockIds(source);
    expect(block.id).toBe("after-second");
    expect(block.contentFrom).toBe(source.indexOf("```\nsecond"));
  });

  it("resumes paragraph scanning correctly after a fenced-code marker line", () => {
    const source = "```\ncode\n```\n^code-id\n\nAfter. ^after-id";
    const blocks = scanBlockIds(source);
    expect(blocks.map((b) => b.id)).toEqual(["code-id", "after-id"]);
    expect(blocks[1].kind).toBe("paragraph");
  });

  it("does not attach a marker inside a block-level HTML comment", () => {
    const source = "<!-- A comment. ^in-comment -->";
    expect(scanBlockIds(source)).toEqual([]);
  });

  it("skips a multi-line HTML comment entirely", () => {
    const source = "<!--\nHidden text. ^hidden-id\n-->\n\nVisible text. ^visible-id";
    const [block] = scanBlockIds(source);
    expect(block.id).toBe("visible-id");
  });

  it("treats a setext heading's title line as consumed, not a paragraph", () => {
    const source = "A Setext Heading ^not-a-block\n===";
    expect(scanBlockIds(source)).toEqual([]);
  });

  it("keeps an earlier paragraph line intact when only the line directly above a setext underline is claimed", () => {
    const source = "Real paragraph content. ^real-id\nSetext Title\n===";
    const [block] = scanBlockIds(source);
    expect(block.id).toBe("real-id");
    expect(source.slice(block.contentFrom, block.contentTo)).toBe("Real paragraph content.");
  });

  it("separates two paragraphs by a blank line, each with its own marker", () => {
    const source = "First paragraph. ^first-id\n\nSecond paragraph. ^second-id";
    const [first, second] = scanBlockIds(source);
    expect(first.id).toBe("first-id");
    expect(second.id).toBe("second-id");
  });

  it("assigns increasing occurrence numbers to duplicate ids, case-insensitively", () => {
    const source = "One. ^dup\n\nTwo. ^DUP\n\nThree. ^dup";
    const [first, second, third] = scanBlockIds(source);
    expect(first.occurrence).toBe(1);
    expect(second.occurrence).toBe(2);
    expect(third.occurrence).toBe(3);
    expect(first.key).toBe("dup");
    expect(second.key).toBe("dup");
    expect(second.id).toBe("DUP");
  });

  it("supports CRLF line endings", () => {
    const source = "First line.\r\nSecond line. ^crlf-id\r\n";
    const [block] = scanBlockIds(source);
    expect(block.id).toBe("crlf-id");
    expect(block.sourceTo).toBeLessThanOrEqual(source.length);
  });

  it("a heading marker stays not-eligible even in a mixed document with other eligible kinds", () => {
    const source = [
      "# Heading ^not-eligible",
      "",
      "A real paragraph with an id. ^eligible-paragraph",
      "",
      "- A list item. ^eligible-list-item",
      "",
      "> A blockquote. ^eligible-blockquote",
    ].join("\n");
    const blocks = scanBlockIds(source);
    expect(blocks.map((b) => b.id)).toEqual(["eligible-paragraph", "eligible-list-item", "eligible-blockquote"]);
    expect(blocks.map((b) => b.kind)).toEqual(["paragraph", "list-item", "blockquote"]);
  });

  it("rejects a list item marker with no real text before it (bullet's own separator space doesn't count)", () => {
    expect(scanBlockIds("- ^orphan-id")).toEqual([]);
  });

  it("rejects a blockquote marker with no real text before it", () => {
    expect(scanBlockIds("> ^orphan-id")).toEqual([]);
  });

  it("attaches a marker on an indented list-item continuation line to the item it continues (F04 Phase 3e)", () => {
    const source = "- First line of the item\n  continuation with the id. ^continued-id";
    const [block] = scanBlockIds(source);
    expect(block.kind).toBe("list-item");
    expect(block.id).toBe("continued-id");
    expect(source.slice(block.contentFrom, block.contentTo)).toBe(
      "First line of the item\n  continuation with the id.",
    );
    expect(source.slice(block.sourceFrom, block.sourceTo)).toBe(source);
  });

  it("continues a list item across more than one continuation line", () => {
    const source = "- First line\n  second line\n  third line with the id. ^three-lines";
    const [block] = scanBlockIds(source);
    expect(block.kind).toBe("list-item");
    expect(block.id).toBe("three-lines");
    expect(source.slice(block.contentFrom, block.contentTo)).toBe(
      "First line\n  second line\n  third line with the id.",
    );
  });

  it("ends list-item continuation at a blank line, not attaching a marker on the far side of it", () => {
    const source = "- First line of the item\n\n  Not a continuation. ^after-blank";
    const [block] = scanBlockIds(source);
    expect(block.kind).toBe("paragraph");
    expect(block.id).toBe("after-blank");
  });

  it("ends list-item continuation on an under-indented non-blank line", () => {
    const source = "- First line of the item\nunder-indented text. ^under-indented";
    const [block] = scanBlockIds(source);
    expect(block.kind).toBe("paragraph");
    expect(block.id).toBe("under-indented");
  });

  it("ends list-item continuation when the continuation line starts a new list item", () => {
    const source = "- First item\n- Second item with the id. ^second-item";
    const blocks = scanBlockIds(source);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe("list-item");
    expect(blocks[0].id).toBe("second-item");
    expect(source.slice(blocks[0].sourceFrom, blocks[0].sourceTo)).toBe("- Second item with the id. ^second-item");
  });

  it("continues a blockquote across a re-prefixed '>' continuation line", () => {
    const source = "> First line of the quote\n> second line with the id. ^quoted-two-lines";
    const [block] = scanBlockIds(source);
    expect(block.kind).toBe("blockquote");
    expect(block.id).toBe("quoted-two-lines");
    expect(source.slice(block.contentFrom, block.contentTo)).toBe(
      "First line of the quote\n> second line with the id.",
    );
  });

  it("continues a blockquote through lazy continuation (a following line with no '>' prefix)", () => {
    const source = "> First line of the quote\nlazy continuation with the id. ^lazy-quote";
    const [block] = scanBlockIds(source);
    expect(block.kind).toBe("blockquote");
    expect(block.id).toBe("lazy-quote");
  });

  it("ends blockquote continuation at a blank line", () => {
    const source = "> First line of the quote\n\nNot part of the quote. ^after-quote-blank";
    const [block] = scanBlockIds(source);
    expect(block.kind).toBe("paragraph");
    expect(block.id).toBe("after-quote-blank");
  });

  it("ends blockquote continuation when the continuation line starts a fenced code block", () => {
    const source = "> First line of the quote\n```\ncode ^inside-fence\n```\n\nAfter. ^after-fence-in-quote";
    const blocks = scanBlockIds(source);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].id).toBe("after-fence-in-quote");
  });

  it("supports *, +, and ordered markers for list-item blocks, not just -", () => {
    const source = "* Star item. ^star-id\n\n+ Plus item. ^plus-id\n\n1. Ordered item. ^ordered-id";
    const blocks = scanBlockIds(source);
    expect(blocks.map((b) => b.id)).toEqual(["star-id", "plus-id", "ordered-id"]);
    expect(blocks.every((b) => b.kind === "list-item")).toBe(true);
  });

  it("trims extra whitespace after the list/blockquote marker from the content range", () => {
    const listSource = "-   Extra spaces after the bullet. ^spaced-list";
    const [listBlock] = scanBlockIds(listSource);
    expect(listSource.slice(listBlock.contentFrom, listBlock.contentTo)).toBe("Extra spaces after the bullet.");
  });
});

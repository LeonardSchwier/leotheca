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

  it("does not attach a marker whose block is a list item", () => {
    expect(scanBlockIds("- The user owns the Markdown files. ^local-first")).toEqual([]);
  });

  it("does not attach a marker whose block is a blockquote", () => {
    expect(scanBlockIds("> A quoted principle. ^principle")).toEqual([]);
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

  it("only the eligible top-level paragraph gets a marker, in a mixed document", () => {
    const source = [
      "# Heading ^not-eligible",
      "",
      "A real paragraph with an id. ^eligible-id",
      "",
      "- A list item. ^also-not-eligible",
      "",
      "> A blockquote. ^still-not-eligible",
    ].join("\n");
    const blocks = scanBlockIds(source);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].id).toBe("eligible-id");
  });
});

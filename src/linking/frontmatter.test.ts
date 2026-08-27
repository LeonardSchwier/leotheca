import { describe, expect, it } from "vitest";
import { extractAliases } from "./frontmatter";

describe("extractAliases", () => {
  it("returns an empty array when there is no frontmatter block", () => {
    expect(extractAliases("# Just a note\n\nNo frontmatter here.")).toEqual([]);
  });

  it("returns an empty array when the frontmatter has no aliases key", () => {
    const source = "---\ncreated: 2026-08-27T10:00:00.000Z\n---\n\nBody text.";
    expect(extractAliases(source)).toEqual([]);
  });

  it("parses a single scalar alias", () => {
    const source = "---\naliases: Foo\n---\n\nBody.";
    expect(extractAliases(source)).toEqual(["Foo"]);
  });

  it("parses a quoted scalar alias, stripping the quotes", () => {
    const source = '---\naliases: "Foo Bar"\n---\n\nBody.';
    expect(extractAliases(source)).toEqual(["Foo Bar"]);
  });

  it("parses an inline list", () => {
    const source = "---\naliases: [Foo, Bar]\n---\n\nBody.";
    expect(extractAliases(source)).toEqual(["Foo", "Bar"]);
  });

  it("parses an inline list with quoted, spaced entries", () => {
    const source = `---\naliases: [ "Foo Bar", 'Baz' ]\n---\n\nBody.`;
    expect(extractAliases(source)).toEqual(["Foo Bar", "Baz"]);
  });

  it("parses a YAML block list", () => {
    const source = "---\naliases:\n  - Foo\n  - Bar\n---\n\nBody.";
    expect(extractAliases(source)).toEqual(["Foo", "Bar"]);
  });

  it("parses a YAML block list with quoted entries", () => {
    const source = `---\naliases:\n  - "Foo Bar"\n  - 'Baz'\n---\n\nBody.`;
    expect(extractAliases(source)).toEqual(["Foo Bar", "Baz"]);
  });

  it("stops the block list at the first non-list-item line", () => {
    const source = "---\naliases:\n  - Foo\ncreated: 2026-08-27\n---\n\nBody.";
    expect(extractAliases(source)).toEqual(["Foo"]);
  });

  it("returns an empty array for an unterminated frontmatter block", () => {
    const source = "---\naliases: Foo\n\nNo closing delimiter, so this is just a note.";
    expect(extractAliases(source)).toEqual([]);
  });

  it("returns an empty array when a document doesn't start with a frontmatter block", () => {
    const source = "Some text first.\n\n---\naliases: Foo\n---\n";
    expect(extractAliases(source)).toEqual([]);
  });

  it("filters out blank list entries", () => {
    const source = "---\naliases: [Foo, , Bar]\n---\n";
    expect(extractAliases(source)).toEqual(["Foo", "Bar"]);
  });

  it("handles CRLF line endings", () => {
    const source = "---\r\naliases: [Foo, Bar]\r\n---\r\n\r\nBody.";
    expect(extractAliases(source)).toEqual(["Foo", "Bar"]);
  });

  it("handles this app's own generated frontmatter shape unaffected", () => {
    const source = "---\ncreated: 2026-08-27T10:00:00.000Z\n---\n\n";
    expect(extractAliases(source)).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import {
  applyFrontmatterFields,
  extractAliases,
  parseFrontmatterFields,
  type FrontmatterField,
} from "./frontmatter";

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

describe("parseFrontmatterFields", () => {
  it("returns no fields and no raw lines when there is no frontmatter block", () => {
    expect(parseFrontmatterFields("# Just a note")).toEqual({ fields: [], rawLines: [] });
  });

  it("parses a scalar, including one containing colons (a timestamp)", () => {
    const source = "---\ncreated: 2026-08-27T10:00:00.000Z\n---\n\nBody.";
    expect(parseFrontmatterFields(source).fields).toEqual([
      { kind: "scalar", key: "created", value: "2026-08-27T10:00:00.000Z" },
    ]);
  });

  it("strips quotes from a quoted scalar", () => {
    const source = '---\ntitle: "My Note"\n---\n';
    expect(parseFrontmatterFields(source).fields).toEqual([
      { kind: "scalar", key: "title", value: "My Note" },
    ]);
  });

  it("unescapes an escaped quote and backslash inside a double-quoted scalar", () => {
    const source = '---\nquote: "She said \\"hi\\" to C:\\\\path"\n---\n';
    expect(parseFrontmatterFields(source).fields).toEqual([
      { kind: "scalar", key: "quote", value: 'She said "hi" to C:\\path' },
    ]);
  });

  it("parses an inline list", () => {
    const source = "---\ntags: [one, two]\n---\n";
    expect(parseFrontmatterFields(source).fields).toEqual([
      { kind: "list", key: "tags", value: ["one", "two"] },
    ]);
  });

  it("parses a YAML block list", () => {
    const source = "---\ntags:\n  - one\n  - two\n---\n";
    expect(parseFrontmatterFields(source).fields).toEqual([
      { kind: "list", key: "tags", value: ["one", "two"] },
    ]);
  });

  it("parses multiple fields in source order", () => {
    const source = "---\ntitle: Foo\ntags: [a, b]\ncreated: 2026-08-27\n---\n";
    expect(parseFrontmatterFields(source).fields.map((f) => f.key)).toEqual([
      "title",
      "tags",
      "created",
    ]);
  });

  it("treats a key with nothing after it and no children as an empty scalar", () => {
    const source = "---\ntitle:\n---\n";
    expect(parseFrontmatterFields(source).fields).toEqual([
      { kind: "scalar", key: "title", value: "" },
    ]);
  });

  it("preserves a nested map as raw lines rather than misparsing or dropping it", () => {
    const source = "---\ncustom:\n  nested: value\n  other: value2\ntitle: Foo\n---\n";
    const parsed = parseFrontmatterFields(source);
    expect(parsed.fields).toEqual([{ kind: "scalar", key: "title", value: "Foo" }]);
    expect(parsed.rawLines).toEqual(["custom:", "  nested: value", "  other: value2"]);
  });

  it("preserves a comment line as raw content", () => {
    const source = "---\n# a comment\ntitle: Foo\n---\n";
    const parsed = parseFrontmatterFields(source);
    expect(parsed.fields).toEqual([{ kind: "scalar", key: "title", value: "Foo" }]);
    expect(parsed.rawLines).toEqual(["# a comment"]);
  });
});

describe("applyFrontmatterFields", () => {
  it("inserts a new frontmatter block into a note that had none", () => {
    const fields: FrontmatterField[] = [{ kind: "scalar", key: "title", value: "Foo" }];
    expect(applyFrontmatterFields("Body text.", fields, [])).toBe(
      '---\ntitle: "Foo"\n---\nBody text.',
    );
  });

  it("replaces an existing frontmatter block, leaving the body untouched", () => {
    const source = "---\ntitle: Old\n---\n\nBody text.";
    const fields: FrontmatterField[] = [{ kind: "scalar", key: "title", value: "New" }];
    expect(applyFrontmatterFields(source, fields, [])).toBe(
      '---\ntitle: "New"\n---\n\nBody text.',
    );
  });

  it("removes the frontmatter block entirely when there are no fields or raw lines left", () => {
    const source = "---\ntitle: Old\n---\n\nBody text.";
    expect(applyFrontmatterFields(source, [], [])).toBe("\nBody text.");
  });

  it("serializes a list as an inline, always-quoted bracket list", () => {
    const fields: FrontmatterField[] = [{ kind: "list", key: "tags", value: ["a", "b"] }];
    expect(applyFrontmatterFields("Body.", fields, [])).toBe(
      '---\ntags: ["a", "b"]\n---\nBody.',
    );
  });

  it("escapes an embedded quote and backslash when writing a scalar", () => {
    const fields: FrontmatterField[] = [
      { kind: "scalar", key: "quote", value: 'She said "hi" to C:\\path' },
    ];
    expect(applyFrontmatterFields("Body.", fields, [])).toBe(
      '---\nquote: "She said \\"hi\\" to C:\\\\path"\n---\nBody.',
    );
  });

  it("keeps raw lines (unparsed content) verbatim, after the structured fields", () => {
    const fields: FrontmatterField[] = [{ kind: "scalar", key: "title", value: "Foo" }];
    const rawLines = ["custom:", "  nested: value"];
    expect(applyFrontmatterFields("Body.", fields, rawLines)).toBe(
      '---\ntitle: "Foo"\ncustom:\n  nested: value\n---\nBody.',
    );
  });

  it("round-trips: parsing what it just serialized reproduces the same fields", () => {
    // A list item containing a literal comma is a known limitation, not
    // covered here: parseInlineAliases (reused for list parsing) splits
    // an inline list on every comma without regard for quoting, the same
    // pre-existing behavior extractAliases above already has.
    const fields: FrontmatterField[] = [
      { kind: "scalar", key: "title", value: 'A "quoted" value with a \\ backslash' },
      { kind: "list", key: "tags", value: ["one", "two words"] },
      { kind: "scalar", key: "empty", value: "" },
    ];
    const source = applyFrontmatterFields("Body.", fields, []);
    expect(parseFrontmatterFields(source).fields).toEqual(fields);
  });

  it("a full edit round trip preserves a nested map it doesn't understand", () => {
    const original = "---\ncustom:\n  nested: value\ntitle: Old\n---\n\nBody.";
    const parsed = parseFrontmatterFields(original);
    const editedFields = parsed.fields.map((f): FrontmatterField =>
      f.kind === "scalar" && f.key === "title" ? { ...f, value: "New" } : f,
    );
    const result = applyFrontmatterFields(original, editedFields, parsed.rawLines);
    expect(result).toBe('---\ntitle: "New"\ncustom:\n  nested: value\n---\n\nBody.');
  });
});

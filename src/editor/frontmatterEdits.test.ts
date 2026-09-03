import { describe, expect, it } from "vitest";
import {
  addFrontmatterProperty,
  frontmatterBodyStart,
  parseFrontmatterProperties,
  removeFrontmatterProperty,
  updateFrontmatterProperty,
} from "./frontmatterEdits";

describe("frontmatterBodyStart", () => {
  it("returns 0 for a note with no frontmatter block", () => {
    expect(frontmatterBodyStart("Just a paragraph.")).toBe(0);
  });

  it("returns the offset right after the closing delimiter for a note with frontmatter", () => {
    const source = "---\ntitle: Plan\n---\nThe body starts here.";
    const start = frontmatterBodyStart(source);
    expect(source.slice(start)).toBe("The body starts here.");
  });

  it("handles CRLF line endings", () => {
    const source = "---\r\ntitle: Plan\r\n---\r\nBody.";
    const start = frontmatterBodyStart(source);
    expect(source.slice(start)).toBe("Body.");
  });

  it("returns 0 for a document that only looks like frontmatter but never closes", () => {
    const source = "---\ntitle: Plan\nno closing delimiter";
    expect(frontmatterBodyStart(source)).toBe(0);
  });
});

describe("source-preserving frontmatter property edits", () => {
  it("changes only the selected scalar range and preserves CRLF, scalar types, comments, and unsupported structures", () => {
    const source = [
      "---",
      "flag: true",
      "count: 42",
      '# keep this comment exactly here',
      'title: "Old"',
      'aliases: ["Last, First", Simple]',
      "custom:",
      "  nested: value",
      "summary: |",
      "  first line",
      "  second line",
      "---",
      "Body text.",
    ].join("\r\n");

    const parsed = parseFrontmatterProperties(source);
    const title = parsed.properties.find((property) => property.key === "title");
    expect(title?.kind).toBe("scalar");
    if (!title || title.kind !== "scalar") throw new Error("title should be editable");

    const result = updateFrontmatterProperty(source, title, "New");
    expect(result).toBe(source.replace('title: "Old"', 'title: "New"'));
    expect(result).toContain("flag: true\r\ncount: 42");
    expect(result).toContain('# keep this comment exactly here\r\ntitle: "New"');
  });

  it("shows quoted-comma lists, nested maps, and multiline values as read-only properties", () => {
    const source = [
      "---",
      'aliases: ["Last, First", Simple]',
      "custom:",
      "  nested: value",
      "summary: |",
      "  first line",
      "  second line",
      "---",
      "Body",
    ].join("\n");
    const properties = parseFrontmatterProperties(source).properties;
    expect(properties.find((property) => property.key === "aliases")?.kind).toBe("readonly");
    expect(properties.find((property) => property.key === "custom")?.kind).toBe("readonly");
    expect(properties.find((property) => property.key === "summary")?.kind).toBe("readonly");
  });

  it("preserves plain boolean and numeric scalar style when those selected values are edited", () => {
    const source = "---\nflag: false\ncount: 41\n---\nBody";
    const parsed = parseFrontmatterProperties(source);
    const flag = parsed.properties.find((property) => property.key === "flag");
    const count = parsed.properties.find((property) => property.key === "count");
    if (!flag || flag.kind !== "scalar" || !count || count.kind !== "scalar") {
      throw new Error("expected editable scalar fields");
    }
    const withFlag = updateFrontmatterProperty(source, flag, "true");
    expect(withFlag).toBe("---\nflag: true\ncount: 41\n---\nBody");
    const reparsedCount = parseFrontmatterProperties(withFlag).properties.find(
      (property) => property.key === "count",
    );
    if (!reparsedCount || reparsedCount.kind !== "scalar") throw new Error("count missing");
    expect(updateFrontmatterProperty(withFlag, reparsedCount, "42")).toBe(
      "---\nflag: true\ncount: 42\n---\nBody",
    );
  });

  it("preserves an edited scalar's existing quote style", () => {
    const source = "---\ndouble: \"Old\"\nsingle: 'Old'\n---\n";
    const properties = parseFrontmatterProperties(source).properties;
    const double = properties.find((property) => property.key === "double");
    const single = properties.find((property) => property.key === "single");
    if (!double || double.kind !== "scalar" || !single || single.kind !== "scalar") {
      throw new Error("expected editable scalars");
    }
    expect(updateFrontmatterProperty(source, double, "New")).toContain('double: "New"');
    expect(updateFrontmatterProperty(source, single, "New")).toContain("single: 'New'");
  });

  it("removes only the selected field without moving neighboring raw content", () => {
    const source = "---\n# before\ntitle: Old\ncustom:\n  nested: value\n---\nBody";
    const title = parseFrontmatterProperties(source).properties.find(
      (property) => property.key === "title",
    );
    if (!title) throw new Error("title missing");
    expect(removeFrontmatterProperty(source, title)).toBe(
      "---\n# before\ncustom:\n  nested: value\n---\nBody",
    );
  });

  it("adds a field using the existing frontmatter line ending", () => {
    const source = "---\r\ntitle: Old\r\n---\r\nBody";
    expect(addFrontmatterProperty(source, "status")).toBe(
      '---\r\ntitle: Old\r\nstatus: ""\r\n---\r\nBody',
    );
  });
});

import { describe, expect, it } from "vitest";
import { insertUnderHeading } from "./headingInsert";

describe("insertUnderHeading", () => {
  it("appends content at the end of the heading's section", () => {
    const doc = [
      "# Doc",
      "",
      "## Meeting Notes",
      "",
      "Old line",
      "",
      "## Other Section",
      "",
      "Other content",
    ].join("\n");

    const result = insertUnderHeading({
      document: doc,
      heading: "Meeting Notes",
      content: "New line",
      position: "append",
    });

    expect(result.inserted).toBe("append");
    expect(result.content).toBe(
      [
        "# Doc",
        "",
        "## Meeting Notes",
        "",
        "Old line",
        "",
        "New line",
        "",
        "## Other Section",
        "",
        "Other content",
      ].join("\n"),
    );
  });

  it("prepends content right after the heading line", () => {
    const doc = [
      "# Doc",
      "",
      "## Meeting Notes",
      "",
      "Old line",
      "",
      "## Other Section",
    ].join("\n");

    const result = insertUnderHeading({
      document: doc,
      heading: "Meeting Notes",
      content: "New line",
      position: "prepend",
    });

    expect(result.inserted).toBe("prepend");
    // "New line" should come right after "## Meeting Notes", before "Old line"
    const lines = result.content.split("\n");
    const headingIdx = lines.findIndex((l) => l === "## Meeting Notes");
    expect(headingIdx).toBe(2);
    // The inserted content should be before "Old line"
    const newLineIdx = lines.indexOf("New line");
    const oldLineIdx = lines.indexOf("Old line");
    expect(newLineIdx).toBeLessThan(oldLineIdx);
  });

  it("handles a heading at the end of the document (append)", () => {
    const doc = [
      "# Doc",
      "",
      "## Last Section",
      "",
      "Body here",
    ].join("\n");

    const result = insertUnderHeading({
      document: doc,
      heading: "Last Section",
      content: "Extra",
      position: "append",
    });

    const lines = result.content.split("\n");
    const extraIdx = lines.indexOf("Extra");
    const bodyIdx = lines.indexOf("Body here");
    expect(extraIdx).toBeGreaterThan(bodyIdx);
  });

  it("handles an empty section (append) by inserting right after the heading", () => {
    const doc = [
      "## Empty",
      "",
      "## Next",
      "",
      "Content",
    ].join("\n");

    const result = insertUnderHeading({
      document: doc,
      heading: "Empty",
      content: "Inserted",
      position: "append",
    });

    const lines = result.content.split("\n");
    const headingIdx = lines.findIndex((l) => l === "## Empty");
    const insertedIdx = lines.indexOf("Inserted");
    const nextIdx = lines.findIndex((l) => l === "## Next");
    // Inserted should be between heading and next section
    expect(insertedIdx).toBeGreaterThan(headingIdx);
    expect(insertedIdx).toBeLessThan(nextIdx);
  });

  it("respects exactLevel when set", () => {
    const doc = [
      "# Title",
      "",
      "## Sub",
      "",
      "Body",
    ].join("\n");

    // exactLevel 1 should match "# Title" not "## Sub"
    const r1 = insertUnderHeading({
      document: doc,
      heading: "Title",
      content: "X",
      exactLevel: 1,
    });
    expect(r1.content).toContain("X");

    // exactLevel 2 with heading "Title" should fail (no ## Title)
    expect(() =>
      insertUnderHeading({
        document: doc,
        heading: "Title",
        content: "X",
        exactLevel: 2,
      }),
    ).toThrow(/no heading matching/i);
  });

  it("matches heading text case-insensitively", () => {
    const doc = ["## Meeting Notes", "", "Body"].join("\n");
    const result = insertUnderHeading({
      document: doc,
      heading: "meeting notes",
      content: "X",
    });
    expect(result.content).toContain("X");
  });

  it("throws when no matching heading is found", () => {
    const doc = ["## Foo", "", "Body"].join("\n");
    expect(() =>
      insertUnderHeading({
        document: doc,
        heading: "Bar",
        content: "X",
      }),
    ).toThrow(/no heading matching "Bar"/i);
  });

  it("throws when heading text is empty", () => {
    expect(() =>
      insertUnderHeading({ document: "# Doc", heading: "  ", content: "X" }),
    ).toThrow(/heading text must be non-empty/i);
  });

  it("throws when content is empty", () => {
    expect(() =>
      insertUnderHeading({ document: "# Doc", heading: "Doc", content: "" }),
    ).toThrow(/content must be non-empty/i);
  });

  it("preserves CRLF line endings", () => {
    const doc = "## Section\r\n\r\nOld";
    const result = insertUnderHeading({
      document: doc,
      heading: "Section",
      content: "New",
      position: "append",
    });
    expect(result.content).toContain("\r\n");
    expect(result.content).not.toMatch(/(?<!\r)\n/); // no bare LF
  });

  it("inserts multi-line content", () => {
    const doc = "## Section\n\nOld line";
    const result = insertUnderHeading({
      document: doc,
      heading: "Section",
      content: "Line 1\nLine 2",
      position: "append",
    });
    expect(result.content).toContain("Line 1");
    expect(result.content).toContain("Line 2");
  });

  it("defaults position to append", () => {
    const doc = "## Section\n\nOld line";
    const result = insertUnderHeading({
      document: doc,
      heading: "Section",
      content: "New",
    });
    expect(result.inserted).toBe("append");
    const lines = result.content.split("\n");
    const newIdx = lines.indexOf("New");
    const oldIdx = lines.indexOf("Old line");
    expect(newIdx).toBeGreaterThan(oldIdx);
  });
});

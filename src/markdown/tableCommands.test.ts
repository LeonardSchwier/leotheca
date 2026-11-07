import { describe, expect, it } from "vitest";
import { tableEditAtCursor } from "./tableCommands";

function apply(source: string, cursorText: string, command: Parameters<typeof tableEditAtCursor>[2]): string | null {
  const cursor = source.indexOf(cursorText);
  const change = tableEditAtCursor(source, cursor, command);
  return change ? source.slice(0, change.from) + change.insert + source.slice(change.to) : null;
}

describe("tableEditAtCursor", () => {
  const source = "before\n| Name | Status |\n| :--- | ---: |\n| Ada | Active |\n| Bea | Away |\nafter";

  it("adds a blank row directly below the current body row", () => {
    expect(apply(source, "Ada", "add-row-below")).toContain("| Ada | Active |\n|  |  |\n| Bea | Away |");
  });

  it("adds a blank row after the header when invoked there", () => {
    expect(apply(source, "Name", "add-row-below")).toContain("| Name | Status |\n| :--- | ---: |\n|  |  |\n| Ada | Active |");
  });

  it("deletes only the current body row and leaves the header safe", () => {
    expect(apply(source, "Bea", "delete-row")).not.toContain("Bea");
    expect(apply(source, "Name", "delete-row")).toBeNull();
  });

  it("adds and deletes the current column while retaining alignment and remaining cells", () => {
    expect(apply(source, "Ada", "add-column-right")).toContain("| Ada |  | Active |");
    expect(apply(source, "Active", "delete-column")).toContain("| Ada |");
  });

  it("does not delete the final remaining column or edit outside a table", () => {
    expect(apply("| A |\n| --- |\n| x |", "x", "delete-column")).toBeNull();
    expect(tableEditAtCursor(source, source.indexOf("before"), "add-row-below")).toBeNull();
  });

  // Maintenance review: cursor boundary and malformed table behavior
  it("handles cursor outside table cells but within table range", () => {
    // Cursor on pipe character between cells - should now return null for column operations
    const tableWithGaps = "| A | B |\n| --- | --- |\n| x | y |";
    const cursorOnPipe = tableWithGaps.indexOf("|", 1); // Find pipe after A (position 4)
    
    // Column operations should return null when cursor is not in any cell
    expect(tableEditAtCursor(tableWithGaps, cursorOnPipe, "add-column-right")).toBeNull();
    expect(tableEditAtCursor(tableWithGaps, cursorOnPipe, "delete-column")).toBeNull();
    // Row operations should still work since they use bodyRowAt
    expect(tableEditAtCursor(tableWithGaps, cursorOnPipe, "add-row-below")).not.toBeNull();
  });

  it("handles malformed table with missing delimiter", () => {
    // This is not a valid markdown table, findMarkdownTableAt should return null
    const malformed = "| A | B |\n| x | y |";
    expect(tableEditAtCursor(malformed, 0, "add-row-below")).toBeNull();
  });

  it("handles cursor in header row for row operations", () => {
    // Cursor in header should not allow delete-row but should allow add-row-below
    const cursorInHeader = source.indexOf("Name");
    expect(tableEditAtCursor(source, cursorInHeader, "delete-row")).toBeNull();
    expect(tableEditAtCursor(source, cursorInHeader, "add-row-below")).not.toBeNull();
  });

  it("handles column operations at table boundaries", () => {
    // Cursor in actual cell content (not in pipe characters)
    const cursorInName = source.indexOf("Name");
    const result = tableEditAtCursor(source, cursorInName, "add-column-right");
    // Should work since cursor is in cell content
    expect(result).not.toBeNull();

    // Cursor on the literal pipe character between cells - not in any cell
    // content. `source.indexOf(" | ", ...)` points at the leading space of
    // that match, i.e. the position right after "Name"'s trimmed content,
    // not the pipe itself one position later; `+ 1` lands on the actual `|`.
    const cursorInPipe = source.indexOf(" | ", source.indexOf("Name")) + 1;
    expect(source[cursorInPipe]).toBe("|");
    const result2 = tableEditAtCursor(source, cursorInPipe, "add-column-right");
    // Should return null since cursor is in pipe, not in cell content
    expect(result2).toBeNull();
  });

  // Maintenance review: a cursor resting immediately after a cell's trimmed
  // text (before its trailing padding space and the delimiter pipe) is the
  // ordinary position left behind by typing or clicking at the end of a
  // word, and must resolve to that cell/row -- not fall through the gap
  // between cells like the literal pipe position above does.
  it("resolves the column when the cursor sits right after the cell's text, before its trailing padding", () => {
    const cursorAfterAda = source.indexOf("Ada") + "Ada".length;
    expect(source[cursorAfterAda]).toBe(" ");
    const added = tableEditAtCursor(source, cursorAfterAda, "add-column-right");
    expect(added).not.toBeNull();
    const result = source.slice(0, added!.from) + added!.insert + source.slice(added!.to);
    expect(result).toContain("| Ada |  | Active |");

    const deleted = tableEditAtCursor(source, cursorAfterAda, "delete-column");
    expect(deleted).not.toBeNull();
    const deletedResult = source.slice(0, deleted!.from) + deleted!.insert + source.slice(deleted!.to);
    expect(deletedResult).not.toContain("Ada");
  });

  it("inserts the new row below the current row, not at the table's top, when the cursor sits right after the last cell's text", () => {
    const cursorAfterActive = source.indexOf("Active") + "Active".length;
    expect(source[cursorAfterActive]).toBe(" ");
    const added = tableEditAtCursor(source, cursorAfterActive, "add-row-below");
    expect(added).not.toBeNull();
    const result = source.slice(0, added!.from) + added!.insert + source.slice(added!.to);
    // The blank row must land directly below "Ada | Active", not before it.
    expect(result).toContain("| Ada | Active |\n|  |  |\n| Bea | Away |");
  });

  // CI regression: UTF-16 surrogate pair handling
  it("handles UTF-16 surrogate pairs in cell content", () => {
    // Test with emoji (surrogate pair) in cell content
    const tableWithEmoji = "| Name | Status |\n| :--- | ---: |\n| Ada | 🎉 Active |\n| Bea | Away |";
    // Find cursor in emoji - should be in the cell
    const emojiStart = tableWithEmoji.indexOf("🎉");
    const result = tableEditAtCursor(tableWithEmoji, emojiStart, "add-column-right");
    expect(result).not.toBeNull();
    
    // Cursor at position after emoji should be outside the cell
    const afterEmoji = emojiStart + "🎉".length; // Position after the emoji
    const result2 = tableEditAtCursor(tableWithEmoji, afterEmoji, "add-column-right");
    expect(result2).not.toBeNull(); // Should still be in the cell or handled appropriately
    // After the emoji is a space, then "Active" - cursor should be in the same cell
    // Actually, the emoji cell is "🎉 Active", so positions after emoji but before "Active" are still in the cell
  });

  it("handles single-code-unit final characters in cell content", () => {
    // Test with single ASCII character at end of cell
    const tableWithSingle = "| A |\n| --- |\n| x |";
    const cursorInCell = tableWithSingle.indexOf("x");
    const result = tableEditAtCursor(tableWithSingle, cursorInCell, "add-column-right");
    expect(result).not.toBeNull();
  });
});

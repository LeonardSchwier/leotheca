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
  it("does not guess the last column for a cursor on the delimiter row", () => {
    const table = "| A | B | C |\n| --- | --- | --- |\n| one | two | three |";
    const delimiterCursor = table.indexOf("---");

    expect(tableEditAtCursor(table, delimiterCursor, "add-column-right")).toBeNull();
    expect(tableEditAtCursor(table, delimiterCursor, "delete-column")).toBeNull();
  });


  it("does not delete the final remaining column or edit outside a table", () => {
    expect(apply("| A |\n| --- |\n| x |", "x", "delete-column")).toBeNull();
    expect(tableEditAtCursor(source, source.indexOf("before"), "add-row-below")).toBeNull();
  });
});

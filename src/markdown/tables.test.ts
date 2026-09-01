import { describe, expect, it } from "vitest";
import {
  findMarkdownTableAt,
  inspectMarkdownTables,
  scanMarkdownTables,
  serializeMarkdownTable,
  type MarkdownTableRecord,
} from "./tables";

function onlyTable(source: string): MarkdownTableRecord {
  const tables = scanMarkdownTables(source);
  expect(tables).toHaveLength(1);
  return tables[0];
}

describe("scanMarkdownTables", () => {
  it("parses outer-pipe tables with alignments and exact source ranges", () => {
    const source = "before\n| Name | Status | Score |\n| :--- | :---: | ---: |\n| Alpha | Active | 10 |\nafter";
    const table = onlyTable(source);
    expect(table.sourceFrom).toBe(source.indexOf("| Name"));
    expect(table.sourceTo).toBe(source.indexOf("\nafter"));
    expect(source.slice(table.sourceFrom, table.sourceTo)).toBe(table.rawSource);
    expect(table.lineFrom).toBe(2);
    expect(table.lineTo).toBe(4);
    expect(table.outerPipeStyle).toBe("both");
    expect(table.columns.map((column) => column.alignment)).toEqual(["left", "center", "right"]);
    expect(table.header.map((cell) => cell.rawMarkdown)).toEqual(["Name", "Status", "Score"]);
    expect(table.rows[0].map((cell) => cell.rawMarkdown)).toEqual(["Alpha", "Active", "10"]);
    expect(table.warnings).toEqual([]);
  });

  it("parses tables without outer pipes", () => {
    const table = onlyTable("Name | Status\n--- | ---:\nAlpha | Active");
    expect(table.outerPipeStyle).toBe("none");
    expect(table.columns.map((column) => column.alignment)).toEqual(["default", "right"]);
  });

  it("records mixed outer-pipe style as a normalization warning", () => {
    const table = onlyTable("| A | B |\n--- | ---\n| one | two |");
    expect(table.outerPipeStyle).toBe("mixed");
    expect(table.warnings).toContain("mixedOuterPipes");
  });

  it("keeps escaped pipes and pipes inside matching inline-code spans inside cells", () => {
    const table = onlyTable("| A | B |\n| --- | --- |\n| left \\| value | `code | value` |");
    expect(table.rows[0].map((cell) => cell.rawMarkdown)).toEqual(["left \\| value", "`code | value`"]);
  });

  it("treats even-backslash pipes as separators and odd-backslash pipes as content", () => {
    const even = onlyTable("| A | B | C |\n| --- | --- | --- |\n| x\\\\ | y | z |");
    expect(even.rows[0]).toHaveLength(3);
    const odd = onlyTable("| A | B |\n| --- | --- |\n| x\\\|y | z |");
    expect(odd.rows[0].map((cell) => cell.rawMarkdown)).toEqual(["x\\\|y", "z"]);
  });

  it("supports variable-length inline-code delimiters", () => {
    const table = onlyTable("| A | B |\n| --- | --- |\n| ``a ` | b`` | c |");
    expect(table.rows[0].map((cell) => cell.rawMarkdown)).toEqual(["``a ` | b``", "c"]);
  });

  it("preserves UTF-16 offsets for Unicode and surrogate pairs", () => {
    const source = "😀 prefix\n| 名 | Value |\n| --- | --- |\n| café | 🐕 |";
    const table = onlyTable(source);
    expect(source.slice(table.sourceFrom, table.sourceTo)).toBe(table.rawSource);
    const dog = table.rows[0][1];
    expect(source.slice(dog.sourceFrom, dog.sourceTo)).toBe("🐕");
  });

  it("preserves CRLF as the table line-ending convention", () => {
    const table = onlyTable("| A | B |\r\n| --- | --- |\r\n| one | two |");
    expect(table.lineEnding).toBe("\r\n");
  });

  it("accepts a one-column table when outer pipes make the structure unambiguous", () => {
    const table = onlyTable("| A |\n| --- |\n| one |");
    expect(table.columns).toHaveLength(1);
    expect(table.rows[0][0].rawMarkdown).toBe("one");
  });

  it("accepts a header plus delimiter with zero body rows", () => {
    const table = onlyTable("| A | B |\n| --- | --- |");
    expect(table.rows).toEqual([]);
    expect(table.lineTo).toBe(2);
  });

  it("records ragged rows and expands structural width without inventing cell text", () => {
    const table = onlyTable("| A | B |\n| --- | --- | --- |\n| one |\n| two | three | four |");
    expect(table.columns).toHaveLength(3);
    expect(table.header.map((cell) => cell.rawMarkdown)).toEqual(["A", "B"]);
    expect(table.rows.map((row) => row.length)).toEqual([1, 3]);
    expect(table.warnings).toContain("raggedRows");
  });

  it("rejects delimiter cells with fewer than three hyphens", () => {
    expect(scanMarkdownTables("| A | B |\n| -- | --- |\n| one | two |")).toEqual([]);
  });

  it("rejects arbitrary pipe text when the next row is not a delimiter", () => {
    expect(scanMarkdownTables("A | B\none | two\nthree | four")).toEqual([]);
  });

  it("ignores fenced-code tables", () => {
    const source = "```md\n| A | B |\n| --- | --- |\n| one | two |\n```";
    expect(scanMarkdownTables(source)).toEqual([]);
  });

  it("ignores indented-code tables", () => {
    const source = "    | A | B |\n    | --- | --- |\n    | one | two |";
    expect(scanMarkdownTables(source)).toEqual([]);
  });

  it("ignores HTML-comment tables", () => {
    const source = "<!--\n| A | B |\n| --- | --- |\n| one | two |\n-->";
    expect(scanMarkdownTables(source)).toEqual([]);
  });

  it("ignores conservative raw-HTML blocks", () => {
    const source = "<div>\n| A | B |\n| --- | --- |\n| one | two |\n\n| C | D |\n| --- | --- |";
    const tables = scanMarkdownTables(source);
    expect(tables).toHaveLength(1);
    expect(tables[0].header.map((cell) => cell.rawMarkdown)).toEqual(["C", "D"]);
  });

  it("ignores blockquote and list-item containers", () => {
    expect(scanMarkdownTables("> A | B\n> --- | ---\n> one | two")).toEqual([]);
    expect(scanMarkdownTables("- A | B\n  --- | ---\n  one | two")).toEqual([]);
  });

  it("finds multiple non-overlapping tables in source order", () => {
    const source = "| A |\n| --- |\n\ntext\n\n| B | C |\n| --- | --- |\n| x | y |";
    const tables = scanMarkdownTables(source);
    expect(tables).toHaveLength(2);
    expect(tables[0].sourceTo).toBeLessThan(tables[1].sourceFrom);
  });

  it("never throws or returns overlapping records for arbitrary short text", () => {
    let seed = 0x5f3759df;
    const alphabet = "|`\\:- abc\n\r<>!*[]012😀";
    for (let sample = 0; sample < 250; sample++) {
      let text = "";
      const length = sample % 80;
      for (let i = 0; i < length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        text += alphabet[seed % alphabet.length];
      }
      const tables = scanMarkdownTables(text);
      for (let i = 1; i < tables.length; i++) {
        expect(tables[i - 1].sourceTo).toBeLessThanOrEqual(tables[i].sourceFrom);
      }
    }
  });
});

describe("findMarkdownTableAt", () => {
  it("returns the table containing the requested UTF-16 offset", () => {
    const source = "before\n| A | B |\n| --- | --- |\n| one | two |\nafter";
    const offset = source.indexOf("one");
    expect(findMarkdownTableAt(source, offset)?.rows[0][0].rawMarkdown).toBe("one");
    expect(findMarkdownTableAt(source, 0)).toBeNull();
    expect(findMarkdownTableAt(source, -1)).toBeNull();
  });
});

describe("serializeMarkdownTable", () => {
  it("writes canonical outer pipes, padding, rectangular rows, and alignments", () => {
    const output = serializeMarkdownTable({
      columns: [{ alignment: "left" }, { alignment: "center" }, { alignment: "right" }],
      header: ["Name", "Status"],
      rows: [["Alpha", "Active", "10"], ["Beta"]],
    });
    expect(output).toBe(
      "| Name | Status |  |\n| :--- | :---: | ---: |\n| Alpha | Active | 10 |\n| Beta |  |  |",
    );
  });

  it("escapes separator pipes exactly once while preserving inline-code pipes", () => {
    const output = serializeMarkdownTable({
      columns: [{ alignment: "default" }, { alignment: "default" }],
      header: ["A | B", "Code"],
      rows: [["already \\| escaped", "`x | y` and z | q"]],
    });
    expect(output).toContain("A \\| B");
    expect(output).toContain("already \\| escaped");
    expect(output).toContain("`x | y` and z \\| q");
    expect(output).not.toContain("already \\\\| escaped");
  });

  it("preserves even-backslash parity by escaping a separator pipe", () => {
    const output = serializeMarkdownTable({
      columns: [{ alignment: "default" }],
      header: ["A"],
      rows: [["x\\\\|y"]],
    });
    expect(output).toContain("x\\\\\\|y");
  });

  it("preserves CRLF and has no trailing whitespace or final newline", () => {
    const output = serializeMarkdownTable({
      columns: [{ alignment: "default" }],
      header: [" A "],
      rows: [[" value "]],
      lineEnding: "\r\n",
    });
    expect(output).toBe("| A |\r\n| --- |\r\n| value |");
  });

  it("supports one column and no body rows", () => {
    expect(
      serializeMarkdownTable({ columns: [{ alignment: "center" }], header: ["Only"], rows: [] }),
    ).toBe("| Only |\n| :---: |");
  });

  it("rejects multiline cells", () => {
    expect(() =>
      serializeMarkdownTable({ columns: [{ alignment: "default" }], header: ["A\nB"], rows: [] }),
    ).toThrow("single-line");
  });

  it("round-trips supported structure through canonical serialization", () => {
    const source = "Name | Status\r\n:---- | ---:\r\nAlpha \\| Beta | `x | y`";
    const parsed = onlyTable(source);
    const canonical = serializeMarkdownTable(parsed);
    const reparsed = onlyTable(canonical);
    expect(reparsed.columns).toEqual(parsed.columns);
    expect(reparsed.header.map((cell) => cell.rawMarkdown)).toEqual(parsed.header.map((cell) => cell.rawMarkdown));
    expect(reparsed.rows.map((row) => row.map((cell) => cell.rawMarkdown))).toEqual(
      parsed.rows.map((row) => row.map((cell) => cell.rawMarkdown)),
    );
    expect(reparsed.lineEnding).toBe("\r\n");
  });
});

describe("inspectMarkdownTables", () => {
  it("returns content-free developer summaries", () => {
    const summary = inspectMarkdownTables("| Secret | Value |\n| --- | --- |\n| hidden | data |");
    expect(summary).toEqual([{ lineFrom: 1, lineTo: 3, columns: 2, bodyRows: 1, warnings: [] }]);
    expect(JSON.stringify(summary)).not.toContain("Secret");
    expect(JSON.stringify(summary)).not.toContain("hidden");
  });
});

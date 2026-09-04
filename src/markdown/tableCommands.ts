import {
  findMarkdownTableAt,
  serializeMarkdownTable,
  type MarkdownTableRecord,
} from "./tables";

export type MarkdownTableCommand =
  | "add-row-below"
  | "delete-row"
  | "add-column-right"
  | "delete-column";

export interface MarkdownTableEdit {
  from: number;
  to: number;
  insert: string;
}

function columnAt(table: MarkdownTableRecord, cursor: number): number {
  const rows = [table.header, ...table.rows];
  for (const row of rows) {
    for (let index = 0; index < row.length; index++) {
      const cell = row[index];
      if (cursor >= (cell.sourceFrom ?? 0) && cursor <= (cell.sourceTo ?? 0)) return index;
    }
  }
  return Math.max(0, table.columns.length - 1);
}

function bodyRowAt(table: MarkdownTableRecord, cursor: number): number | null {
  for (let index = 0; index < table.rows.length; index++) {
    const row = table.rows[index];
    const first = row[0]?.sourceFrom;
    const last = row.at(-1)?.sourceTo;
    if (first !== undefined && last !== undefined && cursor >= first && cursor <= last) return index;
  }
  return null;
}

function edit(table: MarkdownTableRecord, command: MarkdownTableCommand, cursor: number): string | null {
  const columns = [...table.columns];
  const header = table.header.map((cell) => cell.rawMarkdown);
  const rows = table.rows.map((row) => row.map((cell) => cell.rawMarkdown));
  const column = columnAt(table, cursor);

  switch (command) {
    case "add-row-below": {
      const row = bodyRowAt(table, cursor);
      rows.splice((row ?? -1) + 1, 0, Array.from({ length: columns.length }, () => ""));
      break;
    }
    case "delete-row": {
      const row = bodyRowAt(table, cursor);
      if (row === null) return null;
      rows.splice(row, 1);
      break;
    }
    case "add-column-right":
      columns.splice(column + 1, 0, { alignment: "default" });
      header.splice(column + 1, 0, "");
      for (const row of rows) row.splice(column + 1, 0, "");
      break;
    case "delete-column":
      if (columns.length <= 1) return null;
      columns.splice(column, 1);
      header.splice(column, 1);
      for (const row of rows) row.splice(column, 1);
      break;
  }

  return serializeMarkdownTable({ columns, header, rows, lineEnding: table.lineEnding });
}

/** Resolves a table command against the scanner-confirmed table at `cursor`.
 * Unsupported locations and structurally unsafe deletes return null rather
 * than attempting a textual best-effort edit. */
export function tableEditAtCursor(
  source: string,
  cursor: number,
  command: MarkdownTableCommand,
): MarkdownTableEdit | null {
  const table = findMarkdownTableAt(source, cursor);
  if (!table) return null;
  const insert = edit(table, command, cursor);
  return insert === null ? null : { from: table.sourceFrom, to: table.sourceTo, insert };
}

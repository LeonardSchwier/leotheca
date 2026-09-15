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

function columnAt(table: MarkdownTableRecord, cursor: number): number | null {
  const rows = [table.header, ...table.rows];
  for (const row of rows) {
    for (let index = 0; index < row.length; index++) {
      const cell = row[index];
      // Closed interval [sourceFrom, sourceTo]: tables.ts's TableCell.sourceTo
      // is the position right *after* a cell's last trimmed character (before
      // any trailing padding space and the delimiter pipe), so the ordinary
      // cursor rest position right after typing or clicking a word sits
      // exactly at cursor === sourceTo. A strict `<` here excluded that
      // everyday position from every cell, making add-column-right/
      // delete-column silently no-op whenever the cursor was not left inside
      // a cell's trailing padding. Adjacent cells can never collide under a
      // closed interval on both ends: their trimmed spans are always
      // separated by at least the delimiter pipe character itself.
      if (cursor >= (cell.sourceFrom ?? 0) && cursor <= (cell.sourceTo ?? 0)) return index;
    }
  }
  // Return null if cursor is not in any cell, rather than defaulting to last column
  // This allows callers to handle the "no column found" case explicitly
  return null;
}

function bodyRowAt(table: MarkdownTableRecord, cursor: number): number | null {
  for (let index = 0; index < table.rows.length; index++) {
    const row = table.rows[index];
    const first = row[0]?.sourceFrom;
    const last = row.at(-1)?.sourceTo;
    // Closed interval [first, last]; see columnAt's comment above for why a
    // strict `<` against the row's last cell's sourceTo is wrong here too.
    // For this row check the consequence is worse than a silent no-op: when
    // the cursor sits at that ordinary end-of-row position, add-row-below
    // fell through to `(row ?? -1) + 1`, splicing the new blank row in at
    // index 0 (the very top of the table body) instead of below the row the
    // cursor is actually in.
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
      if (column === null) return null; // Cursor not in any cell
      columns.splice(column + 1, 0, { alignment: "default" });
      header.splice(column + 1, 0, "");
      for (const row of rows) row.splice(column + 1, 0, "");
      break;
    case "delete-column":
      if (column === null) return null; // Cursor not in any cell
      if (columns.length <= 1) return null;
      if (column < 0 || column >= columns.length) return null; // Safety check
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

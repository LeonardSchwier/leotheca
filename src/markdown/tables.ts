export type TableAlignment = "default" | "left" | "center" | "right";

export interface TableColumn {
  alignment: TableAlignment;
}

export interface TableCell {
  rawMarkdown: string;
  sourceFrom?: number;
  sourceTo?: number;
}

export type TableParseWarning = "raggedRows" | "mixedOuterPipes";

export interface MarkdownTableRecord {
  sourceFrom: number;
  sourceTo: number;
  lineFrom: number;
  lineTo: number;
  rawSource: string;
  sourceFingerprint: string;
  documentFingerprint: string;
  lineEnding: "\n" | "\r\n";
  outerPipeStyle: "both" | "none" | "mixed";
  columns: TableColumn[];
  header: TableCell[];
  rows: TableCell[][];
  warnings: TableParseWarning[];
}

export interface MarkdownTableInspection {
  lineFrom: number;
  lineTo: number;
  columns: number;
  bodyRows: number;
  warnings: TableParseWarning[];
}

interface LineInfo {
  text: string;
  start: number;
  end: number;
  lineNumber: number;
  lineEnding: "\n" | "\r\n" | "";
}

interface ParsedRow {
  cells: TableCell[];
  startsWithOuterPipe: boolean;
  endsWithOuterPipe: boolean;
  hasPipe: boolean;
}

interface ScanState {
  inFence: boolean;
  fenceChar: "`" | "~" | "";
  fenceLength: number;
  inComment: boolean;
  rawHtmlUntilBlank: boolean;
  rawHtmlClosingTag: string | null;
}

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
const UNSUPPORTED_CONTAINER_RE = /^ {0,3}(?:>|(?:[-+*]|\d+[.)])(?:[ \t]+|$))/;
const INDENTED_CODE_RE = /^(?: {4}|\t)/;
const RAW_HTML_TAG_RE = /^ {0,3}<([A-Za-z][A-Za-z0-9-]*)(?:[\s/>]|$)/;
const RAW_HTML_UNTIL_CLOSE = new Set(["pre", "script", "style", "textarea"]);

function splitLines(content: string): LineInfo[] {
  if (content.length === 0) return [];
  const lines: LineInfo[] = [];
  let start = 0;
  let lineNumber = 1;
  while (start < content.length) {
    const newline = content.indexOf("\n", start);
    if (newline === -1) {
      lines.push({ text: content.slice(start), start, end: content.length, lineNumber, lineEnding: "" });
      break;
    }
    const hasCr = newline > start && content[newline - 1] === "\r";
    const end = hasCr ? newline - 1 : newline;
    lines.push({
      text: content.slice(start, end),
      start,
      end,
      lineNumber,
      lineEnding: hasCr ? "\r\n" : "\n",
    });
    start = newline + 1;
    lineNumber += 1;
  }
  return lines;
}

function countPrecedingBackslashes(text: string, index: number): number {
  let count = 0;
  for (let i = index - 1; i >= 0 && text[i] === "\\"; i--) count += 1;
  return count;
}

function backtickRunLength(text: string, index: number): number {
  let end = index;
  while (end < text.length && text[end] === "`") end += 1;
  return end - index;
}

function findMatchingBacktickRun(text: string, from: number, length: number): number {
  for (let i = from; i < text.length; i++) {
    if (text[i] !== "`") continue;
    const run = backtickRunLength(text, i);
    if (run === length) return i;
    i += run - 1;
  }
  return -1;
}

function separatorPipeIndexes(text: string): number[] {
  const pipes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "`") {
      const run = backtickRunLength(text, i);
      const close = findMatchingBacktickRun(text, i + run, run);
      if (close !== -1) {
        i = close + run - 1;
        continue;
      }
      i += run - 1;
      continue;
    }
    if (text[i] === "|" && countPrecedingBackslashes(text, i) % 2 === 0) pipes.push(i);
  }
  return pipes;
}

function trimCell(text: string, absoluteStart: number): TableCell {
  let from = 0;
  let to = text.length;
  while (from < to && (text[from] === " " || text[from] === "\t")) from += 1;
  while (to > from && (text[to - 1] === " " || text[to - 1] === "\t")) to -= 1;
  return {
    rawMarkdown: text.slice(from, to),
    sourceFrom: absoluteStart + from,
    sourceTo: absoluteStart + to,
  };
}

function parseRow(line: LineInfo): ParsedRow {
  const pipes = separatorPipeIndexes(line.text);
  if (pipes.length === 0) {
    return {
      cells: [trimCell(line.text, line.start)],
      startsWithOuterPipe: false,
      endsWithOuterPipe: false,
      hasPipe: false,
    };
  }

  let firstNonSpace = 0;
  while (firstNonSpace < line.text.length && (line.text[firstNonSpace] === " " || line.text[firstNonSpace] === "\t")) {
    firstNonSpace += 1;
  }
  let lastNonSpace = line.text.length - 1;
  while (lastNonSpace >= 0 && (line.text[lastNonSpace] === " " || line.text[lastNonSpace] === "\t")) lastNonSpace -= 1;

  const startsWithOuterPipe = pipes[0] === firstNonSpace;
  const endsWithOuterPipe = pipes[pipes.length - 1] === lastNonSpace;
  const boundaries = [0, ...pipes.map((index) => index + 1), line.text.length + 1];
  const cells: TableCell[] = [];

  for (let i = 0; i < boundaries.length - 1; i++) {
    let segmentStart = boundaries[i];
    let segmentEnd = boundaries[i + 1] - 1;
    if (i === 0) segmentEnd = pipes[0];
    if (i > 0) segmentStart = pipes[i - 1] + 1;
    if (i === pipes.length) segmentEnd = line.text.length;
    if (startsWithOuterPipe && i === 0) continue;
    if (endsWithOuterPipe && i === pipes.length) continue;
    cells.push(trimCell(line.text.slice(segmentStart, segmentEnd), line.start + segmentStart));
  }

  return { cells, startsWithOuterPipe, endsWithOuterPipe, hasPipe: true };
}

function delimiterAlignment(raw: string): TableAlignment | null {
  const value = raw.trim();
  if (!/^:?-{3,}:?$/.test(value)) return null;
  const left = value.startsWith(":");
  const right = value.endsWith(":");
  if (left && right) return "center";
  if (left) return "left";
  if (right) return "right";
  return "default";
}

function parseDelimiter(row: ParsedRow): TableColumn[] | null {
  if (!row.hasPipe || row.cells.length === 0) return null;
  const columns: TableColumn[] = [];
  for (const cell of row.cells) {
    const alignment = delimiterAlignment(cell.rawMarkdown);
    if (alignment === null) return null;
    columns.push({ alignment });
  }
  return columns;
}

function detectLineEnding(lines: LineInfo[], from: number, to: number): "\n" | "\r\n" {
  for (let i = from; i <= to; i++) {
    if (lines[i]?.lineEnding) return lines[i].lineEnding as "\n" | "\r\n";
  }
  return "\n";
}

function stableFingerprint(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function lineIsExcluded(line: LineInfo, state: ScanState): boolean {
  if (state.inFence) {
    const close = FENCE_RE.exec(line.text);
    if (
      close &&
      close[1][0] === state.fenceChar &&
      close[1].length >= state.fenceLength &&
      line.text.trim() === close[1]
    ) {
      state.inFence = false;
    }
    return true;
  }

  const fence = FENCE_RE.exec(line.text);
  if (fence) {
    state.inFence = true;
    state.fenceChar = fence[1][0] as "`" | "~";
    state.fenceLength = fence[1].length;
    return true;
  }

  if (state.inComment) {
    if (line.text.includes("-->")) state.inComment = false;
    return true;
  }
  const commentStart = line.text.indexOf("<!--");
  if (commentStart !== -1) {
    if (line.text.indexOf("-->", commentStart + 4) === -1) state.inComment = true;
    return true;
  }

  if (state.rawHtmlClosingTag) {
    const close = new RegExp(`</${state.rawHtmlClosingTag}\\s*>`, "i");
    if (close.test(line.text)) state.rawHtmlClosingTag = null;
    return true;
  }
  if (state.rawHtmlUntilBlank) {
    if (line.text.trim() === "") state.rawHtmlUntilBlank = false;
    return true;
  }
  const html = RAW_HTML_TAG_RE.exec(line.text);
  if (html) {
    const tag = html[1].toLowerCase();
    if (RAW_HTML_UNTIL_CLOSE.has(tag)) {
      const close = new RegExp(`</${tag}\\s*>`, "i");
      if (!close.test(line.text)) state.rawHtmlClosingTag = tag;
    } else {
      state.rawHtmlUntilBlank = line.text.trim() !== "";
    }
    return true;
  }

  return INDENTED_CODE_RE.test(line.text) || UNSUPPORTED_CONTAINER_RE.test(line.text);
}

function excludedLineIndexes(lines: LineInfo[]): Set<number> {
  const excluded = new Set<number>();
  const state: ScanState = {
    inFence: false,
    fenceChar: "",
    fenceLength: 0,
    inComment: false,
    rawHtmlUntilBlank: false,
    rawHtmlClosingTag: null,
  };
  for (let i = 0; i < lines.length; i++) {
    if (lineIsExcluded(lines[i], state)) excluded.add(i);
  }
  return excluded;
}

function rowHasUsableTablePipe(row: ParsedRow): boolean {
  if (!row.hasPipe) return false;
  if (row.startsWithOuterPipe && row.endsWithOuterPipe) return true;
  return row.cells.length >= 2;
}

function outerPipeStyle(rows: ParsedRow[]): "both" | "none" | "mixed" {
  const both = rows.every((row) => row.startsWithOuterPipe && row.endsWithOuterPipe);
  if (both) return "both";
  const none = rows.every((row) => !row.startsWithOuterPipe && !row.endsWithOuterPipe);
  return none ? "none" : "mixed";
}

/**
 * Scans top-level Markdown for supported GFM pipe tables. The scanner is
 * deliberately conservative: code, raw HTML, blockquotes, and list-item
 * containers are excluded rather than guessed through.
 */
export function scanMarkdownTables(content: string): MarkdownTableRecord[] {
  const lines = splitLines(content);
  if (lines.length < 2) return [];
  const excluded = excludedLineIndexes(lines);
  const result: MarkdownTableRecord[] = [];
  const documentFingerprint = stableFingerprint(content);

  for (let i = 0; i < lines.length - 1; i++) {
    if (excluded.has(i) || excluded.has(i + 1)) continue;
    const headerRow = parseRow(lines[i]);
    const delimiterRow = parseRow(lines[i + 1]);
    if (!rowHasUsableTablePipe(headerRow) || !rowHasUsableTablePipe(delimiterRow)) continue;
    const delimiterColumns = parseDelimiter(delimiterRow);
    if (!delimiterColumns) continue;

    const parsedRows: ParsedRow[] = [headerRow, delimiterRow];
    const body: ParsedRow[] = [];
    let endLineIndex = i + 1;
    for (let j = i + 2; j < lines.length; j++) {
      if (excluded.has(j) || lines[j].text.trim() === "") break;
      const row = parseRow(lines[j]);
      if (!rowHasUsableTablePipe(row)) break;
      body.push(row);
      parsedRows.push(row);
      endLineIndex = j;
    }

    const width = Math.max(
      delimiterColumns.length,
      headerRow.cells.length,
      ...body.map((row) => row.cells.length),
    );
    const columns = Array.from({ length: width }, (_, index): TableColumn => ({
      alignment: delimiterColumns[index]?.alignment ?? "default",
    }));
    const warnings: TableParseWarning[] = [];
    if (headerRow.cells.length !== width || delimiterColumns.length !== width || body.some((row) => row.cells.length !== width)) {
      warnings.push("raggedRows");
    }
    const style = outerPipeStyle(parsedRows);
    if (style === "mixed") warnings.push("mixedOuterPipes");

    const sourceFrom = lines[i].start;
    const sourceTo = lines[endLineIndex].end;
    const rawSource = content.slice(sourceFrom, sourceTo);
    result.push({
      sourceFrom,
      sourceTo,
      lineFrom: lines[i].lineNumber,
      lineTo: lines[endLineIndex].lineNumber,
      rawSource,
      sourceFingerprint: stableFingerprint(rawSource),
      documentFingerprint,
      lineEnding: detectLineEnding(lines, i, endLineIndex),
      outerPipeStyle: style,
      columns,
      header: headerRow.cells,
      rows: body.map((row) => row.cells),
      warnings,
    });
    i = endLineIndex;
  }

  return result;
}

/** Returns the supported table whose exact source range contains offset. */
export function findMarkdownTableAt(content: string, offset: number): MarkdownTableRecord | null {
  if (!Number.isInteger(offset) || offset < 0 || offset > content.length) return null;
  return scanMarkdownTables(content).find((table) => offset >= table.sourceFrom && offset <= table.sourceTo) ?? null;
}

function escapeCellMarkdown(rawMarkdown: string): string {
  if (rawMarkdown.includes("\n") || rawMarkdown.includes("\r")) {
    throw new Error("Table cells must be single-line Markdown");
  }
  const text = rawMarkdown.trim().replace(/\t/g, " ");
  let output = "";
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "`") {
      const run = backtickRunLength(text, i);
      const close = findMatchingBacktickRun(text, i + run, run);
      if (close !== -1) {
        output += text.slice(i, close + run);
        i = close + run - 1;
        continue;
      }
      output += text.slice(i, i + run);
      i += run - 1;
      continue;
    }
    if (text[i] === "|" && countPrecedingBackslashes(text, i) % 2 === 0) {
      output += "\\|";
    } else {
      output += text[i];
    }
  }
  return output;
}

function alignmentDelimiter(alignment: TableAlignment): string {
  switch (alignment) {
    case "left":
      return ":---";
    case "center":
      return ":---:";
    case "right":
      return "---:";
    default:
      return "---";
  }
}

function canonicalRow(cells: string[], width: number): string {
  const padded = Array.from({ length: width }, (_, index) => escapeCellMarkdown(cells[index] ?? ""));
  return `| ${padded.join(" | ")} |`;
}

/** Serializes a parsed or draft-shaped table to deterministic canonical GFM. */
export function serializeMarkdownTable(table: {
  columns: TableColumn[];
  header: Array<TableCell | string>;
  rows: Array<Array<TableCell | string>>;
  lineEnding?: "\n" | "\r\n";
}): string {
  const width = Math.max(
    1,
    table.columns.length,
    table.header.length,
    ...table.rows.map((row) => row.length),
  );
  const value = (cell: TableCell | string | undefined): string =>
    typeof cell === "string" ? cell : cell?.rawMarkdown ?? "";
  const header = canonicalRow(table.header.map(value), width);
  const delimiter = canonicalRow(
    Array.from({ length: width }, (_, index) => alignmentDelimiter(table.columns[index]?.alignment ?? "default")),
    width,
  );
  const body = table.rows.map((row) => canonicalRow(row.map(value), width));
  return [header, delimiter, ...body].join(table.lineEnding ?? "\n");
}

/** Developer-only structural summary suitable for console or fixture inspection. */
export function inspectMarkdownTables(content: string): MarkdownTableInspection[] {
  return scanMarkdownTables(content).map((table) => ({
    lineFrom: table.lineFrom,
    lineTo: table.lineTo,
    columns: table.columns.length,
    bodyRows: table.rows.length,
    warnings: [...table.warnings],
  }));
}

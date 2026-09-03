export type ScalarStyle = "plain" | "single" | "double";

interface SourceRange {
  start: number;
  end: number;
}

interface EditableBase {
  key: string;
  editable: true;
  replaceRange: SourceRange;
  removeRange: SourceRange;
}

export interface EditableScalarProperty extends EditableBase {
  kind: "scalar";
  value: string;
  style: ScalarStyle;
}

export interface EditableListProperty extends EditableBase {
  kind: "list";
  value: string[];
}

export interface ReadonlyFrontmatterProperty {
  kind: "readonly";
  key: string;
  value: string;
  editable: false;
  removeRange: SourceRange;
}

export type FrontmatterProperty =
  | EditableScalarProperty
  | EditableListProperty
  | ReadonlyFrontmatterProperty;

export interface ParsedFrontmatterProperties {
  properties: FrontmatterProperty[];
}

interface FrontmatterBlock {
  eol: string;
  content: string;
  contentStart: number;
  closingStart: number;
  blockEnd: number;
}

interface SourceLine {
  text: string;
  start: number;
  end: number;
  endWithNewline: number;
}

const TOP_LEVEL_KEY = /^([A-Za-z0-9_.-]+):(.*)$/;
const INDENTED_NONBLANK = /^\s+\S/;

function findBlock(source: string): FrontmatterBlock | null {
  const match = /^---(\r?\n)([\s\S]*?)(\r?\n)---(?:\r?\n)?/.exec(source);
  if (!match) return null;
  const contentStart = 3 + match[1].length;
  const closingStart = contentStart + match[2].length + match[3].length;
  return {
    eol: match[1],
    content: match[2],
    contentStart,
    closingStart,
    blockEnd: match[0].length,
  };
}

function sourceLines(content: string, offset: number): SourceLine[] {
  if (content.length === 0) return [];
  const lines: SourceLine[] = [];
  let cursor = 0;
  while (cursor <= content.length) {
    const newline = content.indexOf("\n", cursor);
    const endWithNewline = newline === -1 ? content.length : newline + 1;
    const raw = content.slice(cursor, newline === -1 ? content.length : newline);
    const text = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const end = offset + cursor + text.length;
    lines.push({ text, start: offset + cursor, end, endWithNewline: offset + endWithNewline });
    if (newline === -1) break;
    cursor = newline + 1;
    if (cursor === content.length) break;
  }
  return lines;
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\(["\\])/g, "$1");
  }
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return trimmed;
}

function inlineCommentStart(value: string): number {
  let quote: "single" | "double" | null = null;
  let depth = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (quote === "double") {
      if (ch === "\\") i++;
      else if (ch === '"') quote = null;
      continue;
    }
    if (quote === "single") {
      if (ch === "'" && value[i + 1] === "'") i++;
      else if (ch === "'") quote = null;
      continue;
    }
    if (ch === '"') quote = "double";
    else if (ch === "'") quote = "single";
    else if (ch === "[") depth++;
    else if (ch === "]" && depth > 0) depth--;
    else if (ch === "#" && depth === 0 && (i === 0 || /\s/.test(value[i - 1]))) return i;
  }
  return -1;
}

function parseInlineList(value: string): string[] | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;
  const body = trimmed.slice(1, -1);
  const items: string[] = [];
  let quote: "single" | "double" | null = null;
  let start = 0;
  for (let i = 0; i <= body.length; i++) {
    const ch = body[i];
    if (i === body.length || (ch === "," && quote === null)) {
      const item = stripQuotes(body.slice(start, i));
      if (item) items.push(item);
      start = i + 1;
      continue;
    }
    if (quote === "double") {
      if (ch === "\\") i++;
      else if (ch === '"') quote = null;
    } else if (quote === "single") {
      if (ch === "'" && body[i + 1] === "'") i++;
      else if (ch === "'") quote = null;
    } else if (ch === '"') quote = "double";
    else if (ch === "'") quote = "single";
  }
  return quote === null ? items : null;
}

function scalarStyle(raw: string): ScalarStyle {
  const trimmed = raw.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return "double";
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) return "single";
  return "plain";
}

function quoteDouble(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function serializeScalar(value: string, style: ScalarStyle): string {
  if (style === "double") return quoteDouble(value);
  if (style === "single") return `'${value.replace(/'/g, "''")}'`;
  if (value !== "" && !/^[-?:,[\]{}#&*!|>'"%@`]|:\s|\s#|[\r\n]/.test(value)) return value;
  return quoteDouble(value);
}

function serializeList(values: string[]): string {
  return `[${values.map(quoteDouble).join(", ")}]`;
}

function replaceRange(source: string, range: SourceRange, replacement: string): string {
  return source.slice(0, range.start) + replacement + source.slice(range.end);
}

/** Whether `source` starts with a YAML frontmatter delimiter block at all,
 * independent of whether any of its fields are safely editable. Used by
 * collections/collectionSelectors.ts for the "Has frontmatter" system
 * query field (spec/f09-smart-collections-property-views.md section 6.2),
 * which needs to distinguish "no frontmatter block" from "a frontmatter
 * block with only unsupported/empty content" the same way this file's own
 * `findBlock` already does for editing. */
export function hasFrontmatterBlock(source: string): boolean {
  return findBlock(source) !== null;
}

/** The absolute character offset where `source`'s body starts, i.e. right
 * after its frontmatter block (delimiters and all) if it has one, or `0`
 * otherwise. Used by F04 Phase 4a's whole-note embed rendering
 * (`![[Note]]`, spec/f04-heading-block-links-embeds.md section 11.1: "the
 * note body after frontmatter"), reusing `findBlock`'s existing delimiter
 * detection rather than a second frontmatter-boundary scan. */
export function frontmatterBodyStart(source: string): number {
  return findBlock(source)?.blockEnd ?? 0;
}

export function parseFrontmatterProperties(source: string): ParsedFrontmatterProperties {
  const block = findBlock(source);
  if (!block) return { properties: [] };
  const lines = sourceLines(block.content, block.contentStart);
  const properties: FrontmatterProperty[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const match = TOP_LEVEL_KEY.exec(line.text);
    if (!match) {
      i++;
      continue;
    }

    const key = match[1];
    const colon = line.text.indexOf(":");
    const afterColon = line.text.slice(colon + 1);
    const commentAt = inlineCommentStart(afterColon);
    const beforeComment = commentAt >= 0 ? afterColon.slice(0, commentAt) : afterColon;
    const trimmedEnd = beforeComment.trimEnd();
    const leading = trimmedEnd.length - trimmedEnd.trimStart().length;
    const rawValue = trimmedEnd.trimStart();
    const valueStart = line.start + colon + 1 + leading;
    const valueEnd = valueStart + rawValue.length;

    if (rawValue === "") {
      let j = i + 1;
      const listValues: string[] = [];
      let onlyListItems = false;
      while (j < lines.length && INDENTED_NONBLANK.test(lines[j].text)) {
        const item = /^\s*-\s*(.*)$/.exec(lines[j].text);
        if (!item) break;
        onlyListItems = true;
        listValues.push(stripQuotes(item[1]));
        j++;
      }
      if (onlyListItems && j > i + 1 && !listValues.some((item) => item.includes(","))) {
        const last = lines[j - 1];
        properties.push({
          kind: "list",
          key,
          value: listValues,
          editable: true,
          replaceRange: { start: line.start, end: last.end },
          removeRange: { start: line.start, end: last.endWithNewline },
        });
        i = j;
        continue;
      }
      if (i + 1 < lines.length && INDENTED_NONBLANK.test(lines[i + 1].text)) {
        j = i + 1;
        while (j < lines.length && INDENTED_NONBLANK.test(lines[j].text)) j++;
        const last = lines[j - 1];
        properties.push({
          kind: "readonly",
          key,
          value: source.slice(line.start, last.end),
          editable: false,
          removeRange: { start: line.start, end: last.endWithNewline },
        });
        i = j;
        continue;
      }
      properties.push({
        kind: "scalar",
        key,
        value: "",
        style: "plain",
        editable: true,
        replaceRange: { start: valueStart, end: valueEnd },
        removeRange: { start: line.start, end: line.endWithNewline },
      });
      i++;
      continue;
    }

    if (rawValue === "|" || rawValue === ">" || rawValue.startsWith("{") || rawValue.startsWith("&") || rawValue.startsWith("*")) {
      let j = i + 1;
      while (j < lines.length && INDENTED_NONBLANK.test(lines[j].text)) j++;
      const last = lines[Math.max(i, j - 1)];
      properties.push({
        kind: "readonly",
        key,
        value: source.slice(line.start, last.end),
        editable: false,
        removeRange: { start: line.start, end: last.endWithNewline },
      });
      i = j;
      continue;
    }

    if (rawValue.startsWith("[")) {
      const list = parseInlineList(rawValue);
      if (list && !list.some((item) => item.includes(","))) {
        properties.push({
          kind: "list",
          key,
          value: list,
          editable: true,
          replaceRange: { start: valueStart, end: valueEnd },
          removeRange: { start: line.start, end: line.endWithNewline },
        });
      } else {
        properties.push({
          kind: "readonly",
          key,
          value: rawValue,
          editable: false,
          removeRange: { start: line.start, end: line.endWithNewline },
        });
      }
      i++;
      continue;
    }

    properties.push({
      kind: "scalar",
      key,
      value: stripQuotes(rawValue),
      style: scalarStyle(rawValue),
      editable: true,
      replaceRange: { start: valueStart, end: valueEnd },
      removeRange: { start: line.start, end: line.endWithNewline },
    });
    i++;
  }

  return { properties };
}

export function updateFrontmatterProperty(
  source: string,
  property: EditableScalarProperty | EditableListProperty,
  value: string | string[],
): string {
  if (property.kind === "scalar") {
    if (typeof value !== "string") return source;
    return replaceRange(source, property.replaceRange, serializeScalar(value, property.style));
  }
  if (!Array.isArray(value)) return source;
  if (property.replaceRange.start === property.removeRange.start) {
    return replaceRange(source, property.replaceRange, `${property.key}: ${serializeList(value)}`);
  }
  return replaceRange(source, property.replaceRange, serializeList(value));
}

export function removeFrontmatterProperty(source: string, property: FrontmatterProperty): string {
  const result = replaceRange(source, property.removeRange, "");
  const block = findBlock(result);
  if (block && block.content.trim() === "") return result.slice(block.blockEnd);
  return result;
}

export function addFrontmatterProperty(source: string, key: string): string {
  const block = findBlock(source);
  if (!block) return `---\n${key}: ""\n---\n${source}`;
  if (block.content === "") {
    return source.slice(0, block.contentStart) + `${key}: ""` + source.slice(block.contentStart);
  }
  return source.slice(0, block.closingStart) + `${key}: ""${block.eol}` + source.slice(block.closingStart);
}

/**
 * Shared Markdown heading scanner, the first piece of the structural
 * scanner infrastructure described in spec/README.md. F06 (note outline)
 * is its first consumer; F04's real link/normalization work is expected
 * to reconcile `normalizeHeadingKey` with its own deterministic
 * normalization contract (spec/f04-heading-block-links-embeds.md section
 * 6.2) once that lands, since only one heading normalizer may exist.
 *
 * This is a Phase 1 slice (spec/f06-note-outline-heading-breadcrumbs.md
 * section 20): it recognizes ATX and setext headings at the top level of
 * a document (not inside blockquotes or list items), skips fenced code
 * blocks and block-level HTML comments, and does not attempt full
 * CommonMark block parsing. Both known limitations are covered by tests
 * so a gap never regresses silently.
 */

export interface HeadingRecord {
  /** Deterministic, case-folded, whitespace-collapsed heading text used
   * to detect duplicates. See normalizeHeadingKey. */
  key: string;
  /** 1-based count of this exact key seen so far in the document, in
   * source order. The first occurrence of a key is 1. */
  occurrence: number;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  /** The heading's visible text with inline Markdown formatting removed,
   * but not case-folded or whitespace-collapsed beyond trimming. */
  rawText: string;
  /** rawText with internal whitespace runs collapsed to one space. What
   * the outline and breadcrumbs display. */
  displayText: string;
  /** Absolute character offsets in the source document spanning the
   * heading's own markup (its whole line for ATX; both the text and
   * underline lines for setext). */
  sourceFrom: number;
  sourceTo: number;
  /** Absolute character offsets spanning just the heading's visible text
   * in the source (excluding leading hashes/whitespace and, for ATX, an
   * optional closing hash sequence). Used to reveal the heading exactly
   * without selecting its markup. */
  contentFrom: number;
  contentTo: number;
  /** 1-based line number and column of the start of the heading's own
   * markup (sourceFrom). */
  line: number;
  column: number;
  /** Absolute character offsets spanning this heading's whole section:
   * from sourceFrom through the character before the next heading whose
   * level is less than or equal to this one, or the end of the document. */
  sectionFrom: number;
  sectionTo: number;
  /** Index into the returned array of this heading's nearest heading
   * ancestor (the nearest preceding heading with a strictly lower
   * level), or undefined for a heading with no such ancestor. */
  parentIndex?: number;
  /** Indexes into the returned array of this heading's direct heading
   * children, in source order. */
  childIndexes: number[];
}

interface LineInfo {
  text: string;
  start: number;
  end: number;
  lineNumber: number;
}

function splitLines(content: string): LineInfo[] {
  if (content.length === 0) {
    return [{ text: "", start: 0, end: 0, lineNumber: 1 }];
  }
  const lines: LineInfo[] = [];
  let pos = 0;
  let lineNumber = 1;
  while (pos < content.length) {
    const newlineIndex = content.indexOf("\n", pos);
    if (newlineIndex === -1) {
      lines.push({ text: content.slice(pos), start: pos, end: content.length, lineNumber });
      break;
    }
    let lineEnd = newlineIndex;
    if (lineEnd > pos && content[lineEnd - 1] === "\r") lineEnd -= 1;
    lines.push({ text: content.slice(pos, lineEnd), start: pos, end: lineEnd, lineNumber });
    pos = newlineIndex + 1;
    lineNumber += 1;
  }
  return lines;
}

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
const ATX_OPEN_RE = /^ {0,3}(#{1,6})/;
const SETEXT_RE = /^ {0,3}(=+|-+)[ \t]*$/;
const CLOSING_HASH_RE = /[ \t]+#+$/;

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
};

function decodeEntitiesAndEscapes(text: string): string {
  return text
    .replace(/\\([\\`*_{}[\]()#+.!~>|"'-])/g, "$1")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => {
      try {
        return String.fromCodePoint(parseInt(hex, 16));
      } catch {
        return _;
      }
    })
    .replace(/&#(\d+);/g, (_, dec: string) => {
      try {
        return String.fromCodePoint(parseInt(dec, 10));
      } catch {
        return _;
      }
    })
    .replace(/&([a-zA-Z]+);/g, (full: string, name: string) =>
      Object.prototype.hasOwnProperty.call(HTML_ENTITIES, name) ? HTML_ENTITIES[name] : full,
    );
}

/**
 * Strips inline Markdown formatting from heading text, leaving the
 * visible reading text behind. Not a full CommonMark inline parser: it
 * handles the constructs realistically found in heading text (emphasis,
 * inline code, links, images, wikilinks, strikethrough, escapes, and the
 * common HTML entities), applied in an order where already-unwrapped
 * link/code text can still have surrounding emphasis stripped.
 */
export function stripInlineMarkdownFormatting(text: string): string {
  let result = decodeEntitiesAndEscapes(text);
  result = result.replace(/(`+)([\s\S]*?)\1/g, (_, _ticks: string, inner: string) => inner.trim());
  result = result.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  result = result.replace(/\[\[([^[\]|]+)\|([^[\]]+)\]\]/g, "$2");
  result = result.replace(/\[\[([^[\]]+)\]\]/g, "$1");
  result = result.replace(/\[([^[\]]*)\]\([^)]*\)/g, "$1");
  result = result.replace(/\[([^[\]]*)\]\[[^[\]]*\]/g, "$1");
  result = result.replace(/<((?:https?|mailto):[^>\s]+)>/g, "$1");
  for (let i = 0; i < 3; i++) {
    result = result
      .replace(/\*\*\*([^*]+?)\*\*\*/g, "$1")
      .replace(/___([^_]+?)___/g, "$1")
      .replace(/\*\*([^*]+?)\*\*/g, "$1")
      .replace(/__([^_]+?)__/g, "$1")
      .replace(/~~([^~]+?)~~/g, "$1")
      .replace(/\*([^*]+?)\*/g, "$1")
      .replace(/_([^_]+?)_/g, "$1");
  }
  return result;
}

/**
 * Deterministic key used to detect duplicate headings: trims, collapses
 * internal whitespace, and case-folds the display text. Provisional
 * pending F04's own normalization (see this file's header comment).
 */
export function normalizeHeadingKey(displayText: string): string {
  return displayText.trim().replace(/\s+/g, " ").toLowerCase();
}

function collapseWhitespace(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

interface RawHeading {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  rawText: string;
  sourceFrom: number;
  sourceTo: number;
  contentFrom: number;
  contentTo: number;
  line: number;
  column: number;
}

function tryParseAtx(line: LineInfo): RawHeading | null {
  const open = ATX_OPEN_RE.exec(line.text);
  if (!open) return null;
  const hashes = open[1];
  const afterHashes = open[0].length;
  if (afterHashes === line.text.length) {
    return {
      level: hashes.length as RawHeading["level"],
      rawText: "",
      sourceFrom: line.start,
      sourceTo: line.end,
      contentFrom: line.start + afterHashes,
      contentTo: line.start + afterHashes,
      line: line.lineNumber,
      column: 1,
    };
  }
  const sep = line.text[afterHashes];
  if (sep !== " " && sep !== "\t") return null;
  let contentStart = afterHashes;
  while (contentStart < line.text.length && (line.text[contentStart] === " " || line.text[contentStart] === "\t")) {
    contentStart += 1;
  }
  let contentEnd = line.text.length;
  while (contentEnd > contentStart && (line.text[contentEnd - 1] === " " || line.text[contentEnd - 1] === "\t")) {
    contentEnd -= 1;
  }
  let raw = line.text.slice(contentStart, contentEnd);
  const closing = CLOSING_HASH_RE.exec(raw);
  if (closing) {
    contentEnd -= closing[0].length;
    raw = raw.slice(0, raw.length - closing[0].length);
  }
  return {
    level: hashes.length as RawHeading["level"],
    rawText: raw,
    sourceFrom: line.start,
    sourceTo: line.end,
    contentFrom: line.start + contentStart,
    contentTo: line.start + contentEnd,
    line: line.lineNumber,
    column: 1,
  };
}

function trySetextLevel(underline: LineInfo): 1 | 2 | null {
  const match = SETEXT_RE.exec(underline.text);
  if (!match) return null;
  return match[1][0] === "=" ? 1 : 2;
}

/** Scans a Markdown document for ATX and setext headings at the top
 * level (not inside blockquotes or list items), skipping fenced code
 * blocks and block-level HTML comments, and returns them in source
 * order with hierarchy and section ranges resolved. */
export function scanHeadings(content: string): HeadingRecord[] {
  const lines = splitLines(content);
  const raw: RawHeading[] = [];
  // Line indices already claimed by a heading (an ATX line, or a setext
  // heading's text/underline lines), so neither can be reinterpreted as
  // part of a different heading.
  const consumedLines = new Set<number>();

  let inFence = false;
  let fenceChar = "";
  let fenceLength = 0;
  let inComment = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (inFence) {
      const close = FENCE_RE.exec(line.text);
      if (close && close[1][0] === fenceChar && close[1].length >= fenceLength && line.text.trim() === close[1]) {
        inFence = false;
      }
      continue;
    }
    const fenceOpen = FENCE_RE.exec(line.text);
    if (fenceOpen) {
      inFence = true;
      fenceChar = fenceOpen[1][0];
      fenceLength = fenceOpen[1].length;
      continue;
    }

    if (inComment) {
      if (line.text.includes("-->")) inComment = false;
      continue;
    }
    const commentStart = line.text.indexOf("<!--");
    if (commentStart !== -1) {
      const closeOnSameLine = line.text.indexOf("-->", commentStart + 4);
      if (closeOnSameLine === -1) inComment = true;
      continue;
    }

    if (consumedLines.has(i)) continue;

    const atx = tryParseAtx(line);
    if (atx) {
      raw.push(atx);
      consumedLines.add(i);
      continue;
    }

    const setextLevel = trySetextLevel(line);
    if (setextLevel !== null) {
      const textLine = lines[i - 1];
      const textIsUsable = textLine !== undefined && textLine.text.trim() !== "" && !consumedLines.has(i - 1);
      if (textIsUsable) {
        let contentStart = 0;
        while (
          contentStart < textLine.text.length &&
          (textLine.text[contentStart] === " " || textLine.text[contentStart] === "\t")
        ) {
          contentStart += 1;
        }
        let contentEnd = textLine.text.length;
        while (
          contentEnd > contentStart &&
          (textLine.text[contentEnd - 1] === " " || textLine.text[contentEnd - 1] === "\t")
        ) {
          contentEnd -= 1;
        }
        consumedLines.add(i - 1);
        consumedLines.add(i);
        raw.push({
          level: setextLevel,
          rawText: textLine.text.slice(contentStart, contentEnd),
          sourceFrom: textLine.start,
          sourceTo: line.end,
          contentFrom: textLine.start + contentStart,
          contentTo: textLine.start + contentEnd,
          line: textLine.lineNumber,
          column: 1,
        });
      }
    }
  }

  const keyOccurrences = new Map<string, number>();
  const headings: HeadingRecord[] = raw.map((h) => {
    const stripped = stripInlineMarkdownFormatting(h.rawText);
    const displayText = collapseWhitespace(stripped);
    const key = normalizeHeadingKey(displayText);
    const occurrence = (keyOccurrences.get(key) ?? 0) + 1;
    keyOccurrences.set(key, occurrence);
    return {
      key,
      occurrence,
      level: h.level,
      rawText: h.rawText.trim(),
      displayText,
      sourceFrom: h.sourceFrom,
      sourceTo: h.sourceTo,
      contentFrom: h.contentFrom,
      contentTo: h.contentTo,
      line: h.line,
      column: h.column,
      sectionFrom: h.sourceFrom,
      sectionTo: content.length,
      childIndexes: [],
    };
  });

  const stack: number[] = [];
  for (let i = 0; i < headings.length; i++) {
    while (stack.length > 0 && headings[stack[stack.length - 1]].level >= headings[i].level) {
      stack.pop();
    }
    if (stack.length > 0) {
      const parent = stack[stack.length - 1];
      headings[i].parentIndex = parent;
      headings[parent].childIndexes.push(i);
    }
    stack.push(i);
  }

  for (let i = 0; i < headings.length; i++) {
    let sectionTo = content.length;
    for (let j = i + 1; j < headings.length; j++) {
      if (headings[j].level <= headings[i].level) {
        sectionTo = headings[j].sourceFrom;
        break;
      }
    }
    headings[i].sectionTo = sectionTo;
  }

  return headings;
}

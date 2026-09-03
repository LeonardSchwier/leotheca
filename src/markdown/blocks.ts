import { scanHeadings } from "./headings";

/**
 * F04 Phase 3a/3b/3d/3e's block-reference scanner
 * (spec/f04-heading-block-links-embeds.md section 7). Detects an explicit
 * block ID, a whitespace-delimited `^id` token (grammar
 * `[A-Za-z0-9][A-Za-z0-9-]{0,63}`, section 7.1) at the end of a block's
 * final line, and reports its exact source range plus the block's own
 * content range (excluding the marker).
 *
 * **Scope, disclosed rather than silently narrowed**: section 7.2 lists
 * paragraphs, headings, list items, blockquotes, and fenced code blocks
 * as eligible block kinds. Phase 3a detected paragraphs only; Phase 3b
 * added **single-line** list items and blockquotes (a line matching the
 * bullet/blockquote marker syntax, with the block ID on that same line,
 * e.g. "- The user owns the files. ^local-first" or "> A quoted
 * principle. ^principle", both spec 7.1's own examples). Phase 3d (this
 * revision) adds fenced code blocks, whose marker shape is genuinely
 * different from the other four (spec 7.2: "the ID appears on a separate
 * immediately following line, not inside the code fence") rather than on
 * the block's own last line: the line directly after a closing fence,
 * and only that one line, gets one chance to be a marker consisting of
 * nothing but the token itself (optional 0-3 leading spaces, then
 * `^id`, then only trailing whitespace); a blank line, another fence
 * opening immediately, or any other content in that one line forfeits
 * the attachment rather than searching further lines for one.
 *
 * A list item or blockquote spanning more than one physical line is now
 * (Phase 3e) attributed correctly rather than misread as a standalone
 * paragraph: a list item continues across any following non-blank line
 * indented at least as far as the item's own marker+padding width (its
 * `LIST_ITEM_PREFIX_RE` match length), matching CommonMark's own
 * indent-based continuation rule; a blockquote continues across any
 * following non-blank line, whether re-prefixed with `>` or not (real
 * CommonMark "lazy continuation"), the same generous-lazy-continuation
 * reading section 7.1 implies by not excluding it. Either continuation
 * ends at a blank line, a line that starts a fenced code block, an ATX
 * heading, or (for list items specifically) a line under-indented below
 * the item's own continuation width; the block ID marker is then looked
 * for on the last accumulated line only, the same "final line of the
 * block" rule paragraphs already use. Deliberately still not attempted,
 * a narrower but genuine remaining gap: a loose list item's own
 * blank-line-separated paragraphs (continuation ends at the first blank
 * line, not resumed after it), nested sub-lists or nested blockquotes
 * inside a continuing item (a continuation line that itself looks like a
 * new list item or blockquote ends the outer one rather than nesting into
 * it), and tab-indented continuation (only literal space characters are
 * counted toward a list item's own indent width). Real CommonMark parses
 * all of these; this module intentionally does not become a second,
 * competing block parser to get there. Headings remain the one
 * still-excluded eligible kind, deliberately, even though
 * `markdown/headings.ts` already scans them: teaching that scanner about
 * a trailing `^id` marker would mean stripping it from `rawText`/
 * `displayText`, a change to a foundational module several other shipped
 * features (outline, breadcrumbs, F03 diagnostics, F04's own heading
 * links) already depend on and test against, well beyond this module's
 * own scope. Tracked as a follow-up in ROADMAP.md, not silently dropped.
 *
 * A marker attached to a paragraph, list item, or blockquote is only
 * recognized on the same physical line as the block's own trailing text
 * (matching every example in spec section 7.1, e.g. "This decision
 * remains valid for the first release. ^release-decision"), not on a
 * line of its own directly below one, an intentionally narrower reading
 * of "whitespace-delimited" than the spec's wording alone would strictly
 * require for those three kinds, to keep detection unambiguous (fenced
 * code blocks are the one deliberate, spec-mandated exception, per the
 * paragraph above). For a list item or blockquote specifically, the
 * marker's own required leading whitespace must belong to the block's
 * real content, not merely be the single separator space the bullet/`>`
 * marker itself already requires: a bare "- ^orphan-id" (no text before
 * the marker) is rejected, not recorded with an inverted, empty content
 * range.
 *
 * Line classification (fence/comment detection, blank-line paragraph
 * separation, and excluding heading lines so they are never misread as
 * paragraph content) intentionally mirrors `headings.ts` and `tasks.ts`
 * rather than importing their internals: each of those modules owns a
 * different block kind's own detection rules, and this module only ever
 * needs enough of each to know a line is NOT a paragraph line. Duplicating
 * a handful of small regexes here keeps this module self-contained the
 * same way its two siblings are.
 *
 * F04 Phase 5d generalized the internal walker (now `scanBlocks`, see
 * below) to report every eligible block whether or not it already
 * carries a marker, not only ones that do: `scanBlockIds` is now a thin
 * filter over it (unchanged output/behavior), and the same walk backs
 * `findBlockAtOffset`, used by the new Copy block link editor action
 * (`editor/blockLinkActions.ts`) to locate the block at the cursor and,
 * when it has no marker yet, generate and insert one.
 */

export interface BlockRecord {
  /** The block ID exactly as written, case preserved (spec 7.1: "IDs are
   * case-sensitive for serialization"). */
  id: string;
  /** Lowercased id, used for case-insensitive duplicate detection and
   * lookup (spec 7.1: "case-insensitive for duplicate detection"). */
  key: string;
  /** 1-based count of this exact key seen so far in the document, in
   * source order. The first occurrence of a key is 1. */
  occurrence: number;
  /** "list-item" and "blockquote" may span multiple physical lines (Phase
   * 3e); see the module doc comment above for the remaining continuation
   * gaps (loose-list blank-line-separated paragraphs, nesting, tabs).
   * "fenced-code" is a whole fenced code block (open fence through close
   * fence), whose marker sits on its own separate line right after the
   * closing fence rather than being part of the block's own content. */
  kind: "paragraph" | "list-item" | "blockquote" | "fenced-code" | "heading";
  /** Absolute character offsets spanning the whole block, its own marker
   * line included. */
  sourceFrom: number;
  sourceTo: number;
  /** Absolute character offsets spanning the block's own visible content,
   * excluding the leading whitespace and `^id` marker. Used to reveal the
   * block without selecting its own (invisible, per spec 7.3) ID token. */
  contentFrom: number;
  contentTo: number;
  /** Absolute character offsets of the marker's own `^id` text (caret
   * included). Not consumed by any caller yet, but recorded for the same
   * reason `WikiLinkRecord` records precise sub-ranges it doesn't all
   * consume immediately: a future "copy/create block link" action (spec
   * 7.4, a disclosed follow-up) needs this exact span to remove or
   * replace the marker without re-deriving it. */
  idFrom: number;
  idTo: number;
  /** 1-based line number and column of the start of the block's content
   * (sourceFrom). */
  line: number;
  column: number;
}

/**
 * One block boundary found by `scanBlocks` below, whether or not it
 * carries an existing `^id` marker. `contentFrom`/`contentTo` always
 * exclude a marker when one is present (the same convention
 * `BlockRecord` already uses), so a caller inserting a *new* marker can
 * always append it at `contentTo` (or, for `"fenced-code"`, on a new
 * line right after `contentTo`) without re-deriving where the block's
 * real content ends. `marker` is present only when the block's own last
 * (or, for `"fenced-code"`, immediately following) line already carries
 * a syntactically valid, non-orphaned `^id` token.
 */
export interface ScannedBlock {
  kind: BlockRecord["kind"];
  sourceFrom: number;
  sourceTo: number;
  contentFrom: number;
  contentTo: number;
  line: number;
  column: number;
  marker?: { id: string; idFrom: number; idTo: number };
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
const ATX_RE = /^ {0,3}#{1,6}(?:[ \t]|$)/;
const SETEXT_RE = /^ {0,3}(=+|-+)[ \t]*$/;
const BLOCKQUOTE_RE = /^ {0,3}>/;
const BLOCKQUOTE_PREFIX_RE = /^ {0,3}>[ \t]?/;
const LIST_ITEM_RE = /^ {0,3}(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/;
const LIST_ITEM_PREFIX_RE = /^ {0,3}(?:[-*+]|\d{1,9}[.)])[ \t]*/;
const BLOCK_ID_RE = /[ \t]+\^([A-Za-z0-9][A-Za-z0-9-]{0,63})[ \t]*$/;
// A fenced code block's marker line contains nothing but the token
// itself (spec 7.2: "on a separate immediately following line"), so
// unlike BLOCK_ID_RE above it requires no preceding text on that line,
// only up to 3 leading spaces (matching CommonMark's own leaf-block
// indentation allowance) before the caret.
const STANDALONE_BLOCK_ID_RE = /^ {0,3}\^([A-Za-z0-9][A-Za-z0-9-]{0,63})[ \t]*$/;

/**
 * Scans a Markdown document for every eligible block (a paragraph, a
 * (possibly multi-line) list item or blockquote, or a fenced code block;
 * see the module doc comment above for exactly what's eligible),
 * skipping block-level HTML comments and headings, and returns them in
 * source order, each annotated with its existing `^id` marker when it
 * has one. This is the one shared walker both `scanBlockIds` (markers
 * only, F04 Phase 3a/3b/3d/3e) and `findBlockAtOffset` (any block, F04
 * Phase 5d's "block at the cursor" lookup for the Copy block link
 * action) build on, so the block-boundary detection rules above are
 * never re-derived a second time for either purpose.
 */
export function scanBlocks(content: string): ScannedBlock[] {
  const lines = splitLines(content);
  const blocks: ScannedBlock[] = [];

  // Records a paragraph, list item, or blockquote: `last` is the block's
  // own last accumulated line, the one line convention 7.1 allows a
  // marker on. Called for every such block, whether or not `last` turns
  // out to carry a valid one, so a markerless block is still reported
  // (with `contentTo` covering the whole line) for `findBlockAtOffset`.
  function recordInline(
    kind: "paragraph" | "list-item" | "blockquote",
    sourceFrom: number,
    contentFrom: number,
    last: LineInfo,
  ): void {
    const match = BLOCK_ID_RE.exec(last.text);
    if (match) {
      // The marker's own leading whitespace must belong to the block's
      // real content, not merely be the bullet/">" marker's own
      // required separator: reject a bare "- ^id"/"> ^id" with nothing
      // else on the line (the module doc comment's "orphan-id" example)
      // by falling through to the markerless case below instead of
      // dropping the block outright.
      const contentTo = last.start + match.index;
      if (contentTo >= contentFrom) {
        const id = match[1];
        const caretOffset = match.index + match[0].indexOf("^");
        const idFrom = last.start + caretOffset;
        blocks.push({
          kind,
          sourceFrom,
          sourceTo: last.end,
          contentFrom,
          contentTo,
          line: last.lineNumber,
          column: 1,
          marker: { id, idFrom, idTo: idFrom + 1 + id.length },
        });
        return;
      }
    }
    blocks.push({
      kind,
      sourceFrom,
      sourceTo: last.end,
      contentFrom,
      contentTo: last.end,
      line: last.lineNumber,
      column: 1,
    });
  }

  // Records a fenced code block (open fence through close fence).
  // `markerLine`, when given, is the one line right after the close
  // fence that gets exactly one chance to be a marker (spec 7.2); absent
  // when no such line exists (end of document) or a new fence opened
  // immediately, forfeiting the check (see the two call sites below).
  // Unlike `recordInline`, `contentTo` never depends on whether a marker
  // was actually found: the marker, when present, is always a wholly
  // separate line, never part of the fenced block's own content.
  function recordFencedCode(blockFrom: number, blockTo: number, closeLine: LineInfo, markerLine?: LineInfo): void {
    if (markerLine) {
      const idMatch = STANDALONE_BLOCK_ID_RE.exec(markerLine.text);
      if (idMatch) {
        const id = idMatch[1];
        const caretOffset = idMatch.index + idMatch[0].indexOf("^");
        const idFrom = markerLine.start + caretOffset;
        blocks.push({
          kind: "fenced-code",
          sourceFrom: blockFrom,
          sourceTo: markerLine.end,
          contentFrom: blockFrom,
          contentTo: blockTo,
          line: markerLine.lineNumber,
          column: 1,
          marker: { id, idFrom, idTo: idFrom + 1 + id.length },
        });
        return;
      }
    }
    blocks.push({
      kind: "fenced-code",
      sourceFrom: blockFrom,
      sourceTo: blockTo,
      contentFrom: blockFrom,
      contentTo: blockTo,
      line: closeLine.lineNumber,
      column: 1,
    });
  }

  interface OpenBlock {
    kind: "list-item" | "blockquote";
    /** Offset right after the first line's own bullet/`>` prefix; the
     * start of the block's real content, matching the single-line
     * convention `recordBlock`'s callers already use. */
    contentFrom: number;
    /** The first line's marker+padding width, in space count only (tabs
     * are not converted). Only meaningful for "list-item"; a blockquote's
     * continuation is not indent-gated (see the module doc comment's
     * "lazy continuation" note). */
    indentWidth: number;
    lines: LineInfo[];
  }
  let openBlock: OpenBlock | null = null;

  function isContinuationLine(line: LineInfo, block: OpenBlock): boolean {
    if (line.text.trim() === "") return false;
    if (FENCE_RE.test(line.text)) return false;
    if (line.text.indexOf("<!--") !== -1) return false;
    if (ATX_RE.test(line.text)) return false;
    if (LIST_ITEM_RE.test(line.text)) return false;
    if (block.kind === "blockquote") {
      // Lazy continuation (spec 7.1's "whitespace-delimited" reading):
      // any remaining non-blank, non-block-starting line continues the
      // quote whether or not it repeats the ">" prefix.
      return true;
    }
    const leadingSpaces = /^ */.exec(line.text)![0].length;
    if (leadingSpaces < block.indentWidth) return false;
    if (BLOCKQUOTE_RE.test(line.text)) return false;
    return true;
  }

  function flushOpenBlock(): void {
    if (!openBlock) return;
    const { kind, contentFrom, lines } = openBlock;
    openBlock = null;
    recordInline(kind, lines[0].start, contentFrom, lines[lines.length - 1]);
  }

  let inFence = false;
  let fenceChar = "";
  let fenceLength = 0;
  let fenceStartLine: LineInfo | null = null;
  // Set the instant a fence closes, to the fence's own [start, end) span
  // (start of the opening line through end of the closing line) plus the
  // closing line itself; consumed (its marker accepted or forfeited, the
  // block itself always recorded either way) by exactly the one line
  // right after it, per spec 7.2's "immediately following line," or by
  // `flushPendingFencedCode` below when no such line ever arrives.
  let pendingFencedCode: { blockFrom: number; blockTo: number; closeLine: LineInfo } | null = null;

  function flushPendingFencedCode(markerLine?: LineInfo): void {
    if (!pendingFencedCode) return;
    const { blockFrom, blockTo, closeLine } = pendingFencedCode;
    pendingFencedCode = null;
    recordFencedCode(blockFrom, blockTo, closeLine, markerLine);
  }

  let inComment = false;
  let paragraphLines: LineInfo[] = [];

  function flushParagraph(): void {
    if (paragraphLines.length === 0) return;
    const first = paragraphLines[0];
    const last = paragraphLines[paragraphLines.length - 1];
    recordInline("paragraph", first.start, first.start, last);
    paragraphLines = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (inFence) {
      flushParagraph();
      const close = FENCE_RE.exec(line.text);
      if (close && close[1][0] === fenceChar && close[1].length >= fenceLength && line.text.trim() === close[1]) {
        inFence = false;
        pendingFencedCode = { blockFrom: fenceStartLine!.start, blockTo: line.end, closeLine: line };
      }
      continue;
    }
    const fenceOpen = FENCE_RE.exec(line.text);
    if (fenceOpen) {
      flushParagraph();
      flushOpenBlock();
      // A fence opening immediately (no id line arrived in between)
      // forfeits the previous fence's own marker check, but the
      // previous fenced-code block itself is still recorded, markerless.
      flushPendingFencedCode();
      inFence = true;
      fenceChar = fenceOpen[1][0];
      fenceLength = fenceOpen[1].length;
      fenceStartLine = line;
      continue;
    }

    if (openBlock !== null) {
      if (isContinuationLine(line, openBlock)) {
        openBlock.lines.push(line);
        continue;
      }
      flushOpenBlock();
      // Not a continuation: fall through so this line is classified
      // normally below (it may itself start a new list item/blockquote,
      // a fence, a heading, or be blank/paragraph text).
    }

    if (pendingFencedCode !== null) {
      const idMatch = STANDALONE_BLOCK_ID_RE.test(line.text);
      flushPendingFencedCode(idMatch ? line : undefined);
      if (idMatch) continue;
      // Not a marker line: forfeited, per the module doc comment (the
      // fenced-code block is still recorded, markerless). Fall through
      // so this line is still classified normally below (it could
      // itself be a blank line, a heading, a new fence, etc.).
    }

    if (inComment) {
      flushParagraph();
      if (line.text.includes("-->")) inComment = false;
      continue;
    }
    const commentStart = line.text.indexOf("<!--");
    if (commentStart !== -1) {
      flushParagraph();
      const closeOnSameLine = line.text.indexOf("-->", commentStart + 4);
      if (closeOnSameLine === -1) inComment = true;
      continue;
    }

    if (line.text.trim() === "") {
      flushParagraph();
      continue;
    }

    if (ATX_RE.test(line.text)) {
      flushParagraph();
      continue;
    }

    if (SETEXT_RE.test(line.text) && paragraphLines.length > 0) {
      // Mirrors headings.ts's own setext detection: only the single line
      // directly above the underline becomes the heading's text, not the
      // whole accumulated run before it. Drop just that line, then flush
      // whatever (if anything) remains as an ordinary paragraph.
      paragraphLines.pop();
      flushParagraph();
      continue;
    }

    if (BLOCKQUOTE_RE.test(line.text)) {
      flushParagraph();
      const prefixMatch = BLOCKQUOTE_PREFIX_RE.exec(line.text)!;
      openBlock = { kind: "blockquote", contentFrom: line.start + prefixMatch[0].length, indentWidth: 0, lines: [line] };
      continue;
    }

    if (LIST_ITEM_RE.test(line.text)) {
      flushParagraph();
      const prefixMatch = LIST_ITEM_PREFIX_RE.exec(line.text)!;
      openBlock = {
        kind: "list-item",
        contentFrom: line.start + prefixMatch[0].length,
        indentWidth: prefixMatch[0].length,
        lines: [line],
      };
      continue;
    }

    paragraphLines.push(line);
  }
  // A fenced code block that closes as the very last thing in the
  // document has no following line to ever consume its pending marker
  // check; still record the block itself, markerless.
  flushPendingFencedCode();
  flushParagraph();
  flushOpenBlock();

  for (const heading of scanHeadings(content)) {
    blocks.push({
      kind: "heading",
      sourceFrom: heading.sourceFrom,
      sourceTo: heading.sourceTo,
      contentFrom: heading.contentFrom,
      contentTo: heading.contentTo,
      line: heading.line,
      column: heading.column,
      marker: heading.blockId
        ? { id: heading.blockId.id, idFrom: heading.blockId.idFrom, idTo: heading.blockId.idTo }
        : undefined,
    });
  }
  blocks.sort((a, b) => a.sourceFrom - b.sourceFrom);

  return blocks;
}

/** Scans a Markdown document for explicit block ID tokens attached to a
 * paragraph, a (possibly multi-line) list item or blockquote, or a fenced
 * code block (see the module doc comment above for exactly what's
 * eligible), skipping block-level HTML comments and headings, and returns
 * them in source order. */
export function scanBlockIds(content: string): BlockRecord[] {
  const records: BlockRecord[] = [];
  const keyOccurrences = new Map<string, number>();
  for (const block of scanBlocks(content)) {
    if (!block.marker) continue;
    const key = block.marker.id.toLowerCase();
    const occurrence = (keyOccurrences.get(key) ?? 0) + 1;
    keyOccurrences.set(key, occurrence);
    records.push({
      id: block.marker.id,
      key,
      occurrence,
      kind: block.kind,
      sourceFrom: block.sourceFrom,
      sourceTo: block.sourceTo,
      contentFrom: block.contentFrom,
      contentTo: block.contentTo,
      idFrom: block.marker.idFrom,
      idTo: block.marker.idTo,
      line: block.line,
      column: block.column,
    });
  }
  return records;
}

/**
 * Finds the innermost eligible block (per the module doc comment's scope)
 * whose source range contains `offset`, whether or not it already carries
 * a `^id` marker. Built for F04 Phase 5d's "Copy block link" action
 * (spec section 7.4 step 1, "determine the selected Markdown block from
 * the current cursor"): the caller decides separately whether the found
 * block already has a unique marker (reuse it) or needs one created (see
 * `ScannedBlock.contentFrom`/`contentTo` for exactly where to insert one).
 * Blocks are non-overlapping and returned in source order by `scanBlocks`,
 * so the first one containing `offset` is the only one that can.
 */
export function findBlockAtOffset(content: string, offset: number): ScannedBlock | undefined {
  return scanBlocks(content).find((block) => offset >= block.sourceFrom && offset <= block.sourceTo);
}

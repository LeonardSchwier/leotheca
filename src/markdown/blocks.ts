/**
 * F04 Phase 3a/3b's block-reference scanner
 * (spec/f04-heading-block-links-embeds.md section 7). Detects an explicit
 * block ID, a whitespace-delimited `^id` token (grammar
 * `[A-Za-z0-9][A-Za-z0-9-]{0,63}`, section 7.1) at the end of a block's
 * final line, and reports its exact source range plus the block's own
 * content range (excluding the marker).
 *
 * **Scope, disclosed rather than silently narrowed**: section 7.2 lists
 * paragraphs, headings, list items, blockquotes, and fenced code blocks
 * as eligible block kinds. Phase 3a detected paragraphs only; Phase 3b
 * (this revision) adds **single-line** list items and blockquotes (a
 * line matching the bullet/blockquote marker syntax, with the block ID
 * on that same line, e.g. "- The user owns the files. ^local-first" or
 * "> A quoted principle. ^principle", both spec 7.1's own examples).
 * Deliberately not attempted: a list item or blockquote spanning more
 * than one physical line (lazy continuation lines, a nested sub-list,
 * a loose list's blank-line-separated paragraphs within one item) — real
 * CommonMark multi-line list/blockquote continuation parsing is well
 * beyond what this module's simple line classification can support
 * without becoming a second, competing block parser. A genuinely
 * disclosed inaccuracy, not silently dropped: an indented continuation
 * line ending in a marker is misread as its own standalone top-level
 * paragraph (this scanner has no notion of "this line belongs to the
 * list item above it"), not correctly attributed to the item it actually
 * continues and not rejected outright either; `blocks.test.ts` has a
 * dedicated test asserting this exact known-wrong behavior so a future
 * fix has something concrete to turn green. Headings remain
 * deliberately excluded even though `markdown/headings.ts` already scans
 * them: teaching that scanner about a trailing `^id` marker would mean
 * stripping it from `rawText`/`displayText`, a change to a foundational
 * module several other shipped features (outline, breadcrumbs, F03
 * diagnostics, F04's own heading links) already depend on and test
 * against, well beyond this slice's scope. Fenced code blocks (spec
 * 7.2's "ID on a separate immediately following line") need their own,
 * different detection shape (the marker is not on the same line as any
 * of the block's own content) this slice does not attempt either. Both
 * are tracked as a follow-up in ROADMAP.md, not silently dropped.
 *
 * A marker is only recognized on the same physical line as the block's
 * own trailing text (matching every example in spec section 7.1, e.g.
 * "This decision remains valid for the first release. ^release-decision"),
 * not on a line of its own directly below one, an intentionally narrower
 * reading of "whitespace-delimited" than the spec's wording alone would
 * strictly require, to keep detection unambiguous. For a list item or
 * blockquote specifically, the marker's own required leading whitespace
 * must belong to the block's real content, not merely be the single
 * separator space the bullet/`>` marker itself already requires: a bare
 * "- ^orphan-id" (no text before the marker) is rejected, not recorded
 * with an inverted, empty content range.
 *
 * Line classification (fence/comment detection, blank-line paragraph
 * separation, and excluding heading lines so they are never misread as
 * paragraph content) intentionally mirrors `headings.ts` and `tasks.ts`
 * rather than importing their internals: each of those modules owns a
 * different block kind's own detection rules, and this module only ever
 * needs enough of each to know a line is NOT a paragraph line. Duplicating
 * a handful of small regexes here keeps this module self-contained the
 * same way its two siblings are.
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
  /** "list-item" and "blockquote" are single-line only in this phase; see
   * the module doc comment above for the multi-line gap this leaves. */
  kind: "paragraph" | "list-item" | "blockquote";
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

/** Scans a Markdown document for explicit block ID tokens attached to a
 * paragraph, single-line list item, or single-line blockquote (see the
 * module doc comment above for exactly what's eligible), skipping fenced
 * code blocks, block-level HTML comments, and headings, and returns them
 * in source order. */
export function scanBlockIds(content: string): BlockRecord[] {
  const lines = splitLines(content);
  const blocks: BlockRecord[] = [];
  const keyOccurrences = new Map<string, number>();

  function recordBlock(kind: BlockRecord["kind"], sourceFrom: number, contentFrom: number, line: LineInfo, match: RegExpExecArray): void {
    // The marker's own leading whitespace must belong to the block's
    // real content, not merely be the bullet/">" marker's own required
    // separator: reject a bare "- ^id"/"> ^id" with nothing else on the
    // line (see the module doc comment's "orphan-id" example).
    if (line.start + match.index < contentFrom) return;
    const id = match[1];
    const key = id.toLowerCase();
    const occurrence = (keyOccurrences.get(key) ?? 0) + 1;
    keyOccurrences.set(key, occurrence);
    const caretOffset = match.index + match[0].indexOf("^");
    const idFrom = line.start + caretOffset;
    blocks.push({
      id,
      key,
      occurrence,
      kind,
      sourceFrom,
      sourceTo: line.end,
      contentFrom,
      contentTo: line.start + match.index,
      idFrom,
      idTo: idFrom + 1 + id.length,
      line: line.lineNumber,
      column: 1,
    });
  }

  function recordSingleLineBlock(line: LineInfo, kind: "list-item" | "blockquote", prefixRe: RegExp): void {
    const match = BLOCK_ID_RE.exec(line.text);
    if (!match) return;
    const prefixMatch = prefixRe.exec(line.text)!;
    recordBlock(kind, line.start, line.start + prefixMatch[0].length, line, match);
  }

  let inFence = false;
  let fenceChar = "";
  let fenceLength = 0;
  let inComment = false;
  let paragraphLines: LineInfo[] = [];

  function flushParagraph(): void {
    if (paragraphLines.length === 0) return;
    const first = paragraphLines[0];
    const last = paragraphLines[paragraphLines.length - 1];
    const match = BLOCK_ID_RE.exec(last.text);
    if (match) recordBlock("paragraph", first.start, first.start, last, match);
    paragraphLines = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (inFence) {
      flushParagraph();
      const close = FENCE_RE.exec(line.text);
      if (close && close[1][0] === fenceChar && close[1].length >= fenceLength && line.text.trim() === close[1]) {
        inFence = false;
      }
      continue;
    }
    const fenceOpen = FENCE_RE.exec(line.text);
    if (fenceOpen) {
      flushParagraph();
      inFence = true;
      fenceChar = fenceOpen[1][0];
      fenceLength = fenceOpen[1].length;
      continue;
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
      recordSingleLineBlock(line, "blockquote", BLOCKQUOTE_PREFIX_RE);
      continue;
    }

    if (LIST_ITEM_RE.test(line.text)) {
      flushParagraph();
      recordSingleLineBlock(line, "list-item", LIST_ITEM_PREFIX_RE);
      continue;
    }

    paragraphLines.push(line);
  }
  flushParagraph();

  return blocks;
}

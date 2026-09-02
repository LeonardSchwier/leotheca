import { stripInlineMarkdownFormatting } from "./headings";

/**
 * Shared GFM task-list-item scanner, the second module of the structural
 * scanner infrastructure described in spec/README.md (headings.ts was the
 * first). F02 Phase 1 (spec/f02-workspace-task-hub.md section 16) is its
 * first consumer: a read-only workspace-wide Task Hub sidebar panel.
 *
 * This is a Phase 1 slice, narrowed the same way headings.ts's own first
 * phase was: it recognizes `-`/`*`/`+` unordered task list items (`[ ]`,
 * `[x]`, `[X]`) at any indentation, skips fenced code blocks and
 * block-level HTML comments the same way headings.ts already does, and
 * tracks nesting depth via a simple indentation stack rather than a full
 * CommonMark list-block parser. Ordered-list tasks (`1. [ ] ...`) are out
 * of scope for the first release per the spec (section 5.1), to avoid
 * surprising normalization and parser ambiguity. Due-date extraction
 * (spec section 5.2) and completion-toggle mutation (spec section 6.5)
 * are later phases, not implemented here: this module only scans and
 * reports, it never writes back to a note.
 */

export interface TaskRecord {
  /** Whether the task is completed: true for `[x]`/`[X]`, false for `[ ]`. */
  checked: boolean;
  /** The literal character found inside the brackets, kept distinct from
   * `checked` since the spec (section 6.5) treats a completed task's
   * original marker case as meaningful for display but not for its
   * boolean completion state. */
  marker: " " | "x" | "X";
  /** The task's own text, trimmed, with its original Markdown formatting
   * intact (e.g. `**due soon**`). */
  text: string;
  /** `text` with inline Markdown formatting stripped, for display, reusing
   * headings.ts's own stripper so both scanners render text the same way. */
  displayText: string;
  /** The task line's leading indentation, converted to columns (a tab
   * advances to the next multiple of 4, matching common Markdown tab
   * handling elsewhere in this app). */
  indentationColumns: number;
  /** This task's nesting depth among other task/list items, computed from
   * indentationColumns via a simple stack (0 for a top-level item). See
   * this file's buildNestingDepths for the exact algorithm and its known
   * limitations relative to full CommonMark list-block parsing. */
  nestingDepth: number;
  /** 1-based source line number of the task's own line. */
  line: number;
  /** 1-based column of the line's first non-whitespace character (the
   * list marker), matching headings.ts's column convention. */
  column: number;
  /** Absolute character offsets spanning the task's whole line (marker
   * through the end of its own text), excluding the line terminator. */
  sourceFrom: number;
  sourceTo: number;
  /** Absolute character offset of the single completion-marker character
   * itself (the character inside `[ ]`/`[x]`/`[X]`), for a future toggle
   * mutation (spec section 5.3's TaskLocator) to target precisely without
   * touching any other character on the line. Not read or written by this
   * Phase 1 slice. */
  markerFrom: number;
  markerTo: number;
  /** Absolute character offsets spanning the task's own visible text
   * (after the closing bracket and its following whitespace, trimmed of
   * trailing whitespace), used to reveal the task without selecting its
   * list marker or checkbox. */
  textFrom: number;
  textTo: number;
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
// Bullet, at least one space/tab, a single bracketed marker character,
// then either end of line or at least one space/tab before the task text.
// A missing space before the bracket (`-[ ]`), an empty bracket (`- []`),
// or an unsupported marker character (`- [~]`) all simply fail to match,
// which is exactly the spec's (section 5.1) "not indexed as a task" rule
// for malformed markers: there is no separate exclusion list to maintain.
const TASK_LINE_RE = /^( *)([-*+])([ \t]+)\[([ xX])\](?:([ \t]+)(.*)|())$/;

function indentationColumnsOf(leading: string): number {
  // No literal tabs are possible here since TASK_LINE_RE's leading group
  // only captures spaces; kept as a named helper (rather than inlining
  // leading.length) so a future caller measuring a raw source line
  // (which can contain tabs) has one place to change the tab-stop rule.
  return leading.length;
}

/**
 * Assigns each task a nesting depth from its indentationColumns, via a
 * stack of currently "open" indentation levels: an item less indented
 * than the stack's top closes every level at or above it, an item more
 * indented than the top opens a new level under it. This recovers the
 * expected depth for well-formed, consistently-indented nested lists
 * (the common case) without a full CommonMark list-block parser, which
 * would need to track list markers, loose/tight spacing, and blank-line
 * continuation rules this Phase 1 slice deliberately does not implement.
 *
 * Deliberately not reset on a blank line: a loose list item's own nested
 * sub-list is commonly separated from it by one blank line, and resetting
 * here would misreport the sub-list's depth as 0. The stack instead only
 * ever unwinds via a later, less-indented item, which also correctly
 * resets depth back to 0 once an unrelated top-level list starts.
 */
function buildNestingDepths(indentationColumns: number[]): number[] {
  const stack: number[] = [];
  return indentationColumns.map((columns) => {
    while (stack.length > 0 && stack[stack.length - 1] >= columns) stack.pop();
    const depth = stack.length;
    stack.push(columns);
    return depth;
  });
}

/**
 * Scans a Markdown document for supported GFM task list items, skipping
 * fenced code blocks and block-level HTML comments. See this file's
 * header comment for the exact syntax supported and known limitations.
 */
export function scanTasks(content: string): TaskRecord[] {
  const lines = splitLines(content);

  interface RawTask {
    checked: boolean;
    marker: " " | "x" | "X";
    text: string;
    indentationColumns: number;
    line: number;
    column: number;
    sourceFrom: number;
    sourceTo: number;
    markerFrom: number;
    markerTo: number;
    textFrom: number;
    textTo: number;
  }
  const raw: RawTask[] = [];
  // Indentation levels of task/list items currently "open" at the point
  // each line is scanned, so an indented line with no shallower list item
  // above it (an empty stack) is recognized as a top-level indented code
  // block rather than a nested task, per the spec's (section 5.1) "tasks
  // inside... indented code blocks... are ignored" exclusion. Populated
  // from every matched task line's own indentationColumns as scanning
  // proceeds, independent of buildNestingDepths (run once, afterward,
  // over only the tasks actually recorded).
  const openIndentLevels: number[] = [];

  let inFence = false;
  let fenceChar = "";
  let fenceLength = 0;
  let inComment = false;

  for (const line of lines) {
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

    const match = TASK_LINE_RE.exec(line.text);
    if (!match) continue;

    const [, leading, , afterBullet, markerChar, gapWhitespace, textBody] = match;
    const indentationColumns = indentationColumnsOf(leading);
    // A 4-or-more-column-indented line with no shallower open task/list
    // item above it has nothing to nest under, so it reads as a top-level
    // indented code block rather than a task, per the spec's (section
    // 5.1) "tasks inside... indented code blocks... are ignored"
    // exclusion. A deeply indented line that *does* have an open item
    // above it is always treated as nesting under it instead, even where
    // full CommonMark block parsing might read the same indentation as an
    // indented code block belonging to that item's own content; resolving
    // that ambiguity would need real list-marker-width-aware block
    // parsing this Phase 1 slice deliberately does not implement.
    const isTopLevelIndentedCodeBlock = indentationColumns >= 4 && openIndentLevels.length === 0;
    if (isTopLevelIndentedCodeBlock) continue;

    while (openIndentLevels.length > 0 && openIndentLevels[openIndentLevels.length - 1] >= indentationColumns) {
      openIndentLevels.pop();
    }
    openIndentLevels.push(indentationColumns);

    const bulletOffset = line.start + leading.length;
    const bracketOpenOffset = bulletOffset + 1 + afterBullet.length;
    const markerFrom = bracketOpenOffset + 1;
    const markerTo = markerFrom + 1; // the closing "]"'s own offset
    const afterBracketOffset = markerTo + 1; // right after the closing "]"
    // gapWhitespace is only present when the alternative that requires
    // trailing content matched (TASK_LINE_RE's mandatory `[ \t]+` before
    // the greedy `(.*)`); a bare "- [ ]" with nothing after the bracket
    // matches the other alternative instead, leaving both undefined.
    let textFrom = afterBracketOffset + (gapWhitespace?.length ?? 0);
    let text = textBody ?? "";
    let textTo = textFrom + text.length;
    // The regex's greedy `(.*)` can only swallow trailing whitespace on
    // its own line (it never matches "\n"), so trim it back out of both
    // the recorded text and its range.
    const trailingMatch = /[ \t]*$/.exec(text);
    if (trailingMatch && trailingMatch[0].length > 0) {
      text = text.slice(0, text.length - trailingMatch[0].length);
      textTo = textFrom + text.length;
    }
    if (text.length === 0) textFrom = textTo;

    raw.push({
      checked: markerChar === "x" || markerChar === "X",
      marker: markerChar as " " | "x" | "X",
      text,
      indentationColumns,
      line: line.lineNumber,
      column: leading.length + 1,
      sourceFrom: line.start,
      sourceTo: line.end,
      markerFrom,
      markerTo,
      textFrom,
      textTo,
    });
  }

  const depths = buildNestingDepths(raw.map((t) => t.indentationColumns));

  return raw.map((t, index) => ({
    checked: t.checked,
    marker: t.marker,
    text: t.text,
    displayText: stripInlineMarkdownFormatting(t.text).trim(),
    indentationColumns: t.indentationColumns,
    nestingDepth: depths[index],
    line: t.line,
    column: t.column,
    sourceFrom: t.sourceFrom,
    sourceTo: t.sourceTo,
    markerFrom: t.markerFrom,
    markerTo: t.markerTo,
    textFrom: t.textFrom,
    textTo: t.textTo,
  }));
}

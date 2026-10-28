/**
 * Heading-scoped insert logic for the `insert-heading` automation command.
 *
 * Given a markdown document and a target heading, produces a new document
 * with `content` inserted either immediately after the heading line
 * ("prepend") or at the end of the heading's section ("append").
 *
 * Pure, synchronous, and side-effect free so it can be tested in
 * isolation and reused by the Tauri commit layer.
 */

export interface InsertHeadingResult {
  /** The modified document. */
  content: string;
  /** True when `content` was inserted right after the heading line. */
  inserted: "prepend" | "append";
}

export interface InsertHeadingOptions {
  /** The markdown document to modify. */
  document: string;
  /**
   * The heading text to target, e.g. `"Meeting Notes"`.
   * Matched by heading text (after the hashes), ignoring the heading level
   * by default. Set `exactLevel` to require a specific level.
   */
  heading: string;
  /** The text to insert. */
  content: string;
  /**
   * `"prepend"` inserts directly after the heading line (before any
   * existing body). `"append"` inserts at the end of the heading's
   * section (after the last body line, before the next heading).
   * Defaults to `"append"`.
   */
  position?: "prepend" | "append";
  /**
   * When true, the target heading must have exactly this many `#`
   * characters. When false/omitted, any heading level matching the
   * heading text is accepted.
   */
  exactLevel?: number;
}

/**
 * Find the 0-based line index of the first heading line in `lines` whose
 * heading text matches `headingText` (after the hashes, trimmed).
 * Returns -1 when not found.
 */
function findHeadingLine(
  lines: string[],
  headingText: string,
  exactLevel?: number,
): number {
  const target = headingText.trim().toLowerCase();
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.*)/);
    if (!match) continue;
    if (exactLevel !== undefined && match[1].length !== exactLevel) continue;
    if (match[2].trim().toLowerCase() === target) return i;
  }
  return -1;
}

/**
 * Find the index of the line that *ends* the section owned by the heading
 * at `headingLineIdx` (i.e. the line index of the next heading, or
 * `lines.length` if this is the last section).
 */
function sectionEndLine(lines: string[], headingLineIdx: number): number {
  for (let i = headingLineIdx + 1; i < lines.length; i++) {
    if (/^#{1,6}\s+/.test(lines[i])) return i;
  }
  return lines.length;
}

/**
 * Detect the dominant line ending used in `document`.
 */
function detectLineEnding(document: string): string {
  if (document.includes("\r\n")) return "\r\n";
  return "\n";
}

/**
 * Insert `content` under the heading identified by `heading` in
 * `document`, either immediately after the heading ("prepend") or at the
 * end of the heading's section ("append").
 *
 * @throws {Error} When no matching heading is found.
 */
export function insertUnderHeading(options: InsertHeadingOptions): InsertHeadingResult {
  const {
    document,
    heading,
    content,
    position = "append",
    exactLevel,
  } = options;

  const headingText = heading.trim();
  if (!headingText) {
    throw new Error("insertUnderHeading: heading text must be non-empty");
  }
  if (!content) {
    throw new Error("insertUnderHeading: content must be non-empty");
  }

  const lineEnding = detectLineEnding(document);
  const lines = document.split(/\r?\n/);

  const headingIdx = findHeadingLine(lines, headingText, exactLevel);
  if (headingIdx === -1) {
    throw new Error(
      `insertUnderHeading: no heading matching "${headingText}" found`,
    );
  }

  const trimmedContent = content.replace(/\r?\n$/, ""); // strip one trailing newline
  const contentLines = trimmedContent.split("\n");

  if (position === "prepend") {
    // Insert right after the heading line, before any existing body.
    // Preserve a blank line between the heading and the new content if the
    // original document had one (i.e. lines[headingIdx + 1] was empty or
    // a body line); we always separate heading from body with one blank line.
    const newLines = [
      ...lines.slice(0, headingIdx + 1),
      "", // blank separator after heading
      ...contentLines,
      "", // blank separator before old body (if any)
      ...lines.slice(headingIdx + 1),
    ];
    // If the document had content directly after the heading (no blank line),
    // we've now added a blank line which is correct markdown.
    return { content: newLines.join(lineEnding), inserted: "prepend" };
  }

  // position === "append"
  const endIdx = sectionEndLine(lines, headingIdx);
  // Walk back over trailing blank lines within the section so the new
  // content lands right after the last body line, not after a run of blanks.
  let lastBodyIdx = endIdx - 1;
  while (lastBodyIdx > headingIdx && lines[lastBodyIdx].trim() === "") {
    lastBodyIdx--;
  }
  // If the section is empty (heading is immediately followed by a heading or
  // EOF), lastBodyIdx === headingIdx; insert right after the heading.
  const insertAt = lastBodyIdx + 1;
  const newLines = [
    ...lines.slice(0, insertAt),
    // Ensure a blank line separates old body from new content
    lines[insertAt - 1]?.trim() === "" ? "" : "",
    ...contentLines,
    ...lines.slice(insertAt),
  ];
  return { content: newLines.join(lineEnding), inserted: "append" };
}

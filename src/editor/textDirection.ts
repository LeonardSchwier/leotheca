import type { EditorState, Range } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

/**
 * Right-to-left (RTL) text-direction support for a note's own content,
 * queued 2026-09-07 by the daily competitor changelog scan (Market
 * Solution #2 v1.14.0's RTL language support). This is Phase 1 only (see
 * ROADMAP.md): correct per-line/per-block direction inside the two places
 * a note's own content actually renders, the CodeMirror source editor
 * (see textDirectionExtension below) and the Markdown preview (see
 * addAutoTextDirection below). Workspace-chrome mirroring (sidebar
 * position, toolbar/tab order, navigation gestures) is an explicitly
 * separate, unclaimed follow-up phase, not attempted here.
 *
 * Direction is decided per line/block, not once for the whole note: a
 * mixed-language note (an English code block inside an otherwise-Hebrew
 * note, for example) needs each line to read and edit in its own correct
 * direction, the same behavior HTML's own `dir="auto"` gives each element
 * independently.
 */

export type TextDirection = "ltr" | "rtl";

/**
 * Unicode scripts whose own text runs right-to-left. Deliberately scoped
 * to scripts, not "any character with the Unicode Bidi_Class of R or AL":
 * a scripts-based test is simpler to read/maintain and covers every
 * right-to-left script in real use today; a rarer explicit RTL-format
 * control character (RLM, RLE, RLO, etc.) is not treated as a strong
 * character here; a note actually relying on one of those to force
 * direction is a disclosed edge case, not silently mishandled (it falls
 * back to whatever the next real strong character decides, same as a
 * plain-text editor with no bidi-control awareness at all).
 */
const RTL_CHAR =
  /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Mandaic}\p{Script=Adlam}\p{Script=Hanifi_Rohingya}]/u;

/** Any Unicode letter is a strong LTR character once RTL_CHAR above has
 * already ruled out an RTL script for it (checked first in
 * detectTextDirection's loop): this covers Latin, Cyrillic, Greek, CJK,
 * Devanagari, and every other left-to-right or direction-neutral-by-
 * convention script in one test, rather than enumerating each. */
const STRONG_LTR_CHAR = /\p{L}/u;

/**
 * The Unicode Bidirectional Algorithm's own "first strong character"
 * rule (the same one HTML's `dir="auto"` uses): scan for the first
 * character that is itself a letter, and let its script decide the whole
 * line/block's base direction. Markdown's own syntax (`#`, `*`, `-`,
 * `>`, `|`, digits) and whitespace are bidi-neutral and are skipped
 * automatically, since none of them match either pattern below, so a
 * Hebrew heading ("# שלום עולם") is detected "rtl" without any
 * Markdown-specific special-casing. A line with no strong character at
 * all (blank, pure punctuation/digits/code-fence markers) falls back to
 * "ltr", the same default `dir="auto"` itself uses.
 */
export function detectTextDirection(text: string): TextDirection {
  for (const char of text) {
    if (RTL_CHAR.test(char)) return "rtl";
    if (STRONG_LTR_CHAR.test(char)) return "ltr";
  }
  return "ltr";
}

const RTL_LINE_DECORATION = Decoration.line({
  attributes: { style: "direction: rtl; text-align: right;" },
});

interface SimpleRange {
  from: number;
  to: number;
}

/**
 * Builds one line decoration per visible right-to-left line, applying
 * `direction: rtl` (and the matching right alignment, since `.cm-line`
 * has no explicit `text-align` of its own for this to already inherit
 * correctly) directly on that line's own DOM element. A left-to-right
 * line gets no decoration at all: `direction: ltr` is CodeMirror's own
 * unstyled default, so decorating every line would only enlarge the
 * decoration set for no visible effect. Limited to visibleRanges, the
 * same viewport-only cost discipline livePreview.ts's buildLiveDecorations
 * already follows, so one very large note isn't scanned line-by-line on
 * every keystroke.
 */
export function buildTextDirectionDecorations(
  state: EditorState,
  visibleRanges: readonly SimpleRange[] = [{ from: 0, to: state.doc.length }],
): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const seenLines = new Set<number>();

  for (const { from, to } of visibleRanges) {
    let pos = from;
    for (;;) {
      const line = state.doc.lineAt(pos);
      if (!seenLines.has(line.from)) {
        seenLines.add(line.from);
        if (detectTextDirection(line.text) === "rtl") {
          ranges.push(RTL_LINE_DECORATION.range(line.from));
        }
      }
      if (line.to >= to) break;
      pos = line.to + 1;
    }
  }

  return Decoration.set(ranges, true);
}

/**
 * CodeMirror extension wiring buildTextDirectionDecorations above into
 * the live view, recomputed whenever the document or viewport changes
 * (not on a mere selection change: a line's own text direction never
 * depends on where the cursor is, unlike livePreview.ts's markup-hiding
 * decorations). `EditorView.perLineTextDirection` is required alongside
 * the decorations themselves: without it, CodeMirror assumes the whole
 * editor shares one base direction for its own internal bidi model
 * (visual cursor movement, Home/End, click-to-position), so a per-line
 * CSS `direction` would only be cosmetic and Home/End would still land on
 * the visually wrong side of an RTL line. With it enabled, CodeMirror
 * reads each rendered line's own CSS direction (exactly what the
 * decoration above sets) for that line's own bidi model too.
 */
export const textDirectionExtension = [
  EditorView.perLineTextDirection.of(true),
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildTextDirectionDecorations(view.state, view.visibleRanges);
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildTextDirectionDecorations(update.view.state, update.view.visibleRanges);
        }
      }
    },
    { decorations: (instance) => instance.decorations },
  ),
];

/**
 * A block-level tag this project's own Markdown rendering (marked.js)
 * actually produces for note content: paragraphs, list items, headings,
 * blockquotes, and table cells. Inline tags (`strong`, `em`, `code`,
 * `a`, ...) are deliberately excluded: HTML's own `dir="auto"` only
 * makes sense on a block-level element establishing its own paragraph
 * context, and tagging every inline span would be both wrong (an inline
 * run doesn't get its own bidi paragraph) and needlessly expensive.
 */
// The negative lookahead requires a preceding whitespace before "dir=",
// not just a word boundary: a plain `\bdir=` would also match inside an
// unrelated attribute name ending in "-dir" (e.g. a hypothetical
// `data-dir="x"`), since a hyphen-to-letter transition is itself a word
// boundary, incorrectly treating that tag as already having its own
// `dir` attribute.
const BLOCK_TAG_PATTERN = /<(p|li|h[1-6]|blockquote|td|th|dt|dd)\b(?![^>]*\sdir=)([^>]*)>/gi;

/**
 * Adds a native `dir="auto"` attribute to every block-level tag marked.js
 * produces that doesn't already declare one, so the browser itself runs
 * the same first-strong-character rule detectTextDirection above
 * reimplements for the editor, per rendered block, with zero custom bidi
 * code needed on the Preview side: the browser already implements
 * `dir="auto"` correctly, including for the mixed RTL/LTR paragraph case
 * this project's own note content can contain. DOMPurify.sanitize (this
 * project's default config) already allows the `dir` attribute through
 * unchanged; this must run before that sanitize call, on marked's raw
 * output, not after, purely so the attribute exists for DOMPurify to
 * preserve.
 *
 * The negative lookahead skips a tag that already declares its own `dir`
 * (raw HTML a note's own Markdown source can embed directly, e.g.
 * `<p dir="ltr">`), so this never produces an invalid duplicate
 * attribute or silently overrides an author's explicit choice. Safe
 * against a literal "<p>"-looking substring inside rendered text content
 * too: marked/DOMPurify already HTML-escape it to `&lt;p&gt;`, which this
 * pattern (matching a real `<` tag-open byte) never touches.
 */
export function addAutoTextDirection(html: string): string {
  return html.replace(BLOCK_TAG_PATTERN, (_match, tag: string, rest: string) => `<${tag} dir="auto"${rest}>`);
}

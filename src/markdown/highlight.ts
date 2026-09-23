/**
 * Shared, single-source-of-truth logic for the `==highlight==` inline
 * syntax's Obsidian v1.14.0 "shoulders of giants" emoji-color convention
 * (see ROADMAP.md rm-c2a2c2d840b60a2e): a highlight can optionally start
 * with one recognized color emoji immediately after its opening `==`,
 * which is stripped from the rendered/decorated text and instead recorded
 * as a color name consumed as a CSS class (`lt-highlight-<color>` in
 * Preview, `cm-live-highlight-<color>` in the editor; see
 * src/app/App.css and src/styles/theme.css for the actual color tokens).
 *
 * Both the Preview renderer (editor/MarkdownPreview.tsx, via a `marked`
 * inline extension) and the live-preview editor decoration
 * (editor/livePreview.ts, via a `@lezer/markdown` inline extension) call
 * `detectHighlightColor` on exactly the raw text between a highlight's
 * `==` delimiters, so the two surfaces can never drift into recognizing a
 * different emoji set or disagreeing on an edge case.
 */

/**
 * The five color emoji Obsidian's own highlight-color convention uses
 * (ROADMAP.md's own wording: "a color emoji like 🔴🟠🟢🔵🟣"). Each is a
 * single, fully-qualified emoji codepoint (no variation selector needed),
 * so comparing by `codePointAt(0)` is exact and doesn't need a Unicode
 * property regex.
 */
export const HIGHLIGHT_COLOR_EMOJI: Readonly<Record<string, string>> = {
  "\u{1F534}": "red", // 🔴
  "\u{1F7E0}": "orange", // 🟠
  "\u{1F7E2}": "green", // 🟢
  "\u{1F535}": "blue", // 🔵
  "\u{1F7E3}": "purple", // 🟣
};

/** Every recognized color name, in the same order as HIGHLIGHT_COLOR_EMOJI
 * above, for callers (tests, docs) that want the finite set without
 * reconstructing it from the emoji map's values. */
export const HIGHLIGHT_COLORS: readonly string[] = Object.freeze(
  Array.from(new Set(Object.values(HIGHLIGHT_COLOR_EMOJI))),
);

export interface DetectedHighlight {
  /** The recognized color name, or undefined when `content` did not start
   * with a recognized color emoji (or the emoji was the only non-blank
   * content, see below): a plain, uncolored highlight. */
  color?: string;
  /** `content` with the recognized leading color emoji removed, or
   * `content` unchanged when no color was detected. Never trimmed: a
   * space the author typed right after the emoji (`==🔴 text==`) is left
   * in place rather than silently eaten, the same "don't rewrite what the
   * user typed beyond the syntax markers themselves" rule the rest of
   * this codebase's inline syntax (wikilinks, footnotes) already follows. */
  text: string;
}

/**
 * Detects a highlight-color emoji prefix in `content`, the raw text
 * between a highlight's `==...==` delimiters (before any further inline
 * parsing). Only strips the emoji when doing so leaves real (non-
 * whitespace) content behind: `==🔴==` or `==🔴   ==` has nothing to
 * color, so the emoji is left as the highlight's literal, uncolored text
 * instead of producing an empty or whitespace-only `<mark>`. Only the
 * first codepoint is ever inspected, so a second emoji later in the text
 * (including a second color emoji) is always ordinary content, never a
 * second color.
 */
export function detectHighlightColor(content: string): DetectedHighlight {
  const firstCodePoint = content.codePointAt(0);
  if (firstCodePoint === undefined) return { text: content };

  const emojiChar = String.fromCodePoint(firstCodePoint);
  const color = HIGHLIGHT_COLOR_EMOJI[emojiChar];
  if (!color) return { text: content };

  const rest = content.slice(emojiChar.length);
  if (rest.trim() === "") return { text: content };

  return { color, text: rest };
}

/** Builds the CSS class list (space-separated) for a highlight with the
 * given detected color, shared by both the Preview `<mark>` renderer and
 * the editor's live-decoration pass so the two surfaces' class naming can
 * never drift apart. */
export function highlightClassName(baseClass: string, color: string | undefined): string {
  return color ? `${baseClass} ${baseClass}-${color}` : baseClass;
}

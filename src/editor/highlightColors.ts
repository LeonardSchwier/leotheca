/**
 * Pure insertion logic for ROADMAP.md's "Highlight colors in the editor
 * and preview" (rm-7e6b338cfafec8d3): the two user-facing affordances
 * that write the emoji-color prefix into a note's own text — the
 * toolbar color picker (app/HighlightColorPicker.tsx) and the editor's
 * `==` typing suggestion (MarkdownEditor.tsx's highlightColorCompletions).
 *
 * Both call `insertHighlightColor` here rather than each building its
 * own `==<emoji> <text>==` string, so the two affordances can never
 * drift into writing a different marker for the same color. The emoji
 * itself and the color-name set come from the shared single source of
 * truth, `../markdown/highlight.ts` (rm-c2a2c2d840b60a2e), the same
 * "one parser/scanner per consumer" rule the wikilink/heading/block
 * completions above this file's import block already follow.
 */
import { HIGHLIGHT_COLOR_EMOJI, HIGHLIGHT_COLORS } from "../markdown/highlight";

/** The color's emoji, in the same red → orange → green → blue → purple
 * order the rest of the module (and both CSS surfaces) use. Reversed
 * here because HIGHLIGHT_COLOR_EMOJI is keyed emoji → color name. */
export function highlightColorEmoji(color: string): string | undefined {
  const entry = Object.entries(HIGHLIGHT_COLOR_EMOJI).find(([, name]) => name === color);
  return entry?.[0];
}

export interface HighlightInsertion {
  /** The exact replacement text to write into the document. */
  text: string;
  /**
   * Caret offset relative to the start of the replacement text above,
   * placed between the inserted emoji and the highlight body — the
   * author keeps typing the highlighted words, never re-typing the
   * marker or the emoji.
   */
  caretOffset: number;
}

/**
 * Builds the replacement text and caret offset for (re)coloring a
 * highlight with `color` (`undefined` = plain, uncolored), applied to
 * `body`, the highlight's content without its own `==` delimiters.
 *
 * A body that already starts with a recognized color emoji is re-colored
 * in place rather than stacking a second marker on top:
 * `==🔴 text==` recolored blue becomes `==🔵 text==`, never
 * `==🔵 🔴 text==`. Only the emoji and the single space the previous
 * insertion would have written around it are replaced — the rest of the
 * body is kept byte-for-byte, the same "don't rewrite what the user
 * typed beyond the syntax markers themselves" rule `../markdown/highlight.ts`'s
 * own `detectHighlightColor` follows (its doc comment names this exact
 * rule for the emoji it strips). So `==  text==` recolored red stays
 * `==🔴   text==`'s spacing intact after the emoji, and an emoji the
 * detector would treat as literal content (its "emoji-only body" edge
 * case, e.g. a body that is only `🔴`) is left as content, never
 * re-marked twice.
 */
export function insertHighlightColor(body: string, color?: string): HighlightInsertion {
  const emoji = color ? highlightColorEmoji(color) : undefined;

  // Re-coloring: drop at most one leading emoji (plus the space a prior
  // insertion wrote after it) so `==🔴 text==` → `==🔵 text==` instead of
  // `==🔵 🔴 text==`. Only a *recognized* color emoji is stripped; any
  // other leading content — including an emoji detectHighlightColor
  // would render as literal text (e.g. ❤️, 🖤) — is preserved verbatim,
  // exactly the same "don't rewrite what the user typed beyond the
  // syntax markers themselves" rule ../markdown/highlight.ts's own
  // detectHighlightColor follows for the emoji it strips. So `==  text==`
  // recolored red keeps the author's own leading spaces after the emoji.
  const stripped = body.replace(/^(\p{Extended_Pictographic}) ?/u, (match, lead) =>
    HIGHLIGHT_COLOR_EMOJI[lead] ? "" : match,
  );
  const text = emoji ? `==${emoji} ${stripped}==` : `==${stripped}==`;
  const caretOffset = emoji ? emoji.length + 3 : 2;
  return { text, caretOffset };
}

/**
 * The five colors the picker and the `==` suggestion both offer, as
 * `{ color, label }` pairs (red first, matching the emoji set's own
 * order) for callers that render a list. `HIGHLIGHT_COLORS` itself
 * stays the plain-string source of truth; this view exists purely so the
 * two UI surfaces name their entries identically.
 */
export const HIGHLIGHT_COLOR_CHOICES: readonly { color: string; label: string }[] = Object.freeze(
  HIGHLIGHT_COLORS.map((color) => ({ color, label: color[0].toUpperCase() + color.slice(1) })),
);

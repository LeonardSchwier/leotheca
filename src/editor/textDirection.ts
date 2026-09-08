import type { EditorState } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

/** Structurally matches CodeMirror's own `EditorView.visibleRanges`
 * entries (and livePreview.ts's private `SimpleRange`); kept local since
 * that type isn't exported. */
interface SimpleRange {
  from: number;
  to: number;
}

/**
 * Right-to-left script ranges (Hebrew, Arabic plus its supplement and
 * presentation-form blocks, Syriac, Thaana, N'Ko, Samaritan/Mandaic).
 * Used by `detectTextDirection`'s first-strong-character scan below,
 * the same Unicode TR9 P2/P3 heuristic browsers use for the HTML
 * `dir="auto"` attribute: RTL support in this app is per-line/per-block
 * automatic direction detection (the convention CodeMirror, VS Code, and
 * most modern editors with mixed-language support already converged on),
 * not a manual global LTR/RTL toggle.
 */
const RTL_CHAR = /[\u0591-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

/** Any other letter is a strong left-to-right character for this
 * heuristic; markdown syntax, digits, punctuation and whitespace are
 * direction-neutral and skipped. */
const STRONG_LTR_CHAR = /\p{L}/u;

/**
 * The first strong-directional character in `text` decides its overall
 * reading direction, exactly like the HTML `dir="auto"` heuristic.
 * Neutral characters (digits, punctuation, whitespace, markdown syntax
 * like `#`/`*`/`-`/`[`/`]`) are skipped; text with no strong character at
 * all defaults to "ltr".
 */
export function detectTextDirection(text: string): "ltr" | "rtl" {
  for (const char of text) {
    if (RTL_CHAR.test(char)) return "rtl";
    if (STRONG_LTR_CHAR.test(char)) return "ltr";
  }
  return "ltr";
}

/**
 * One line-attribute decoration per visible line, setting a real `dir`
 * attribute (never `dir="auto"`) from `detectTextDirection` of that
 * line's own text. An explicit value, not the HTML auto heuristic,
 * because CodeMirror's `EditorView.perLineTextDirection` facet (enabled
 * alongside this extension, see `lineDirectionExtension` below) reads
 * each line's resolved `direction` CSS property to decide bidi text
 * layout and cursor movement; an explicit `dir` attribute is what
 * reliably sets that resolved value across browsers/WebViews, where
 * `dir="auto"`'s own resolution semantics are less consistently
 * specified.
 */
export function buildLineDirectionDecorations(
  state: EditorState,
  visibleRanges: readonly SimpleRange[] = [{ from: 0, to: state.doc.length }],
): DecorationSet {
  const ranges = [];
  let lastLine = -1;
  for (const { from, to } of visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = state.doc.lineAt(pos);
      if (line.number !== lastLine) {
        lastLine = line.number;
        const dir = detectTextDirection(line.text);
        ranges.push(Decoration.line({ attributes: { dir } }).range(line.from));
      }
      if (line.to >= to) break;
      pos = line.to + 1;
    }
  }
  return Decoration.set(ranges);
}

/**
 * Gives each rendered line its own automatically detected text
 * direction, so a right-to-left line (Hebrew, Arabic, ...) in an
 * otherwise left-to-right note renders and edits correctly (cursor
 * movement, selection, and alignment all follow that line's own
 * direction), without requiring a manual per-note or per-workspace RTL
 * toggle. Pair with `EditorView.perLineTextDirection.of(true)` (see
 * MarkdownEditor.tsx's `buildExtensions`), which is what makes
 * CodeMirror's own bidi/cursor logic read direction per line instead of
 * assuming one direction for the whole document.
 */
export const lineDirectionExtension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildLineDirectionDecorations(view.state, view.visibleRanges);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildLineDirectionDecorations(update.view.state, update.view.visibleRanges);
      }
    }
  },
  { decorations: (instance) => instance.decorations },
);

/** Block-level elements markdown rendering actually produces whose own
 * reading direction should follow their own content, not the preview's
 * base direction. Deliberately excludes `pre`/`code`: source code and
 * fenced blocks always render left-to-right regardless of surrounding
 * note language, the same convention CodeMirror's own syntax-highlighted
 * code follows and every mainstream code editor uses. */
const DIRECTIONAL_BLOCK_SELECTOR = "p, li, h1, h2, h3, h4, h5, h6, blockquote, dd, dt, td, th, caption";

/**
 * Applies `detectTextDirection` to every rendered block-level element in
 * `container` individually (not just the preview root), so e.g. an
 * Arabic paragraph inside an otherwise English note is right-aligned and
 * reads right-to-left while its English neighbors stay left-to-right.
 * Called from a `useEffect` in MarkdownPreview after (re)rendering the
 * sanitized HTML into the DOM; see its own `[html]`-keyed effect.
 */
export function applyBlockDirectionAttributes(container: HTMLElement): void {
  const blocks = container.querySelectorAll<HTMLElement>(DIRECTIONAL_BLOCK_SELECTOR);
  for (const block of blocks) {
    block.dir = detectTextDirection(block.textContent ?? "");
  }
}

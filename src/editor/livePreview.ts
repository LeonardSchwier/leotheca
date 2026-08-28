import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { resolveWikilink } from "../linking/store";

/**
 * Inline live-preview decorations for the editor's normal (source) mode:
 * while a line isn't part of the current selection, its markup characters
 * (#, **, *, `, [[ ]]) are hidden and the content is styled directly
 * instead (bold, italic, code font, larger heading text, link-colored
 * wikilink target). As soon as the cursor or selection touches that line,
 * the raw markup reappears so it stays editable, the same interaction
 * Market Solution #2's own live preview uses. This is deliberately not a separate
 * view mode (see ROADMAP.md): it augments Source mode itself, Split and
 * Preview are unaffected.
 *
 * Covers headings, bold, italic, inline code, wikilinks, and bullet list
 * markers. Ordered list markers are left as-is (the number is meaningful
 * content, not pure decoration, unlike a heading's "#").
 *
 * Decoration computation is limited to the editor's visible ranges. The
 * previous implementation rebuilt decorations for the whole document on
 * every cursor move, which made one unusually large note unnecessarily
 * expensive to edit or scroll through.
 */

/** Matches the same `[[target]]` shape the wikilink autocomplete and link
 * index use (see wikilinkCompletions in MarkdownEditor.tsx and
 * extractWikilinks in linking/store.ts), restricted to a single line so a
 * stray unmatched `[[` doesn't swallow the rest of the document. */
const WIKILINK_PATTERN = /\[\[([^[\]\n]+)\]\]/g;

/** Node types whose content should never be reinterpreted as a wikilink,
 * so `` `[[not a link]]` `` inside a code span or block stays plain text. */
const CODE_NODE_TYPES = new Set(["InlineCode", "FencedCode", "CodeBlock"]);

/** Renders in place of a hidden bullet list marker ("-", "*", or "+"), so
 * the line still visually reads as a list item instead of losing its
 * marker entirely. All three bullet characters render identically, the
 * same interaction Market Solution #2's own live preview uses. */
class BulletWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-live-list-bullet";
    span.textContent = "• ";
    return span;
  }

  eq(other: WidgetType): boolean {
    return other instanceof BulletWidget;
  }
}

const HEADING_NODE_CLASS: Record<string, string> = {
  ATXHeading1: "cm-live-heading-1",
  ATXHeading2: "cm-live-heading-2",
  ATXHeading3: "cm-live-heading-3",
  ATXHeading4: "cm-live-heading-4",
  ATXHeading5: "cm-live-heading-5",
  ATXHeading6: "cm-live-heading-6",
};

interface SimpleRange {
  from: number;
  to: number;
}

/** True when any selection range shares at least one document line with
 * [from, to) — the signal used to decide whether a node's raw markup
 * should stay visible (still being edited) or be hidden in favor of its
 * rendered form. */
export function overlapsSelectedLines(
  doc: EditorState["doc"],
  selectionRanges: readonly SimpleRange[],
  from: number,
  to: number,
): boolean {
  const startLine = doc.lineAt(from).number;
  const endLine = doc.lineAt(Math.max(from, to - 1)).number;
  for (const range of selectionRanges) {
    const selStartLine = doc.lineAt(range.from).number;
    const selEndLine = doc.lineAt(range.to).number;
    if (selEndLine >= startLine && selStartLine <= endLine) return true;
  }
  return false;
}

function hide(ranges: SimpleRange[], from: number, to: number): void {
  if (to > from) ranges.push({ from, to });
}

function visibleLineRanges(
  doc: EditorState["doc"],
  visibleRanges: readonly SimpleRange[],
): SimpleRange[] {
  if (visibleRanges.length === 0) return [];

  const ranges = visibleRanges.map(({ from, to }) => {
    const start = doc.lineAt(from).from;
    const end = doc.lineAt(Math.max(from, to - 1)).to;
    return { from: start, to: end };
  });
  ranges.sort((a, b) => a.from - b.from);

  const merged: SimpleRange[] = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (previous && range.from <= previous.to + 1) {
      previous.to = Math.max(previous.to, range.to);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

export function buildLiveDecorations(
  state: EditorState,
  visibleRanges: readonly SimpleRange[] = [{ from: 0, to: state.doc.length }],
): DecorationSet {
  const tree = syntaxTree(state);
  const selectionRanges = state.selection.ranges;
  const scanRanges = visibleLineRanges(state.doc, visibleRanges);
  const marks: { from: number; to: number; class: string }[] = [];
  const hidden: SimpleRange[] = [];
  const codeRanges: SimpleRange[] = [];
  const widgetReplacements: { from: number; to: number; widget: WidgetType }[] = [];

  for (const range of scanRanges) {
    tree.iterate({
      from: range.from,
      to: range.to,
      enter: (node) => {
        const type = node.type.name;
        const headingClass = HEADING_NODE_CLASS[type];

        if (CODE_NODE_TYPES.has(type)) {
          codeRanges.push({ from: node.from, to: node.to });
        }

        if (headingClass) {
          const active = overlapsSelectedLines(state.doc, selectionRanges, node.from, node.to);
          marks.push({ from: node.from, to: node.to, class: headingClass });
          if (!active) {
            const mark = node.node.getChild("HeaderMark");
            if (mark) {
              // Also swallow the single space after the "#"s, so hiding
              // them doesn't leave a stray leading space on the heading.
              let end = mark.to;
              if (state.doc.sliceString(end, end + 1) === " ") end += 1;
              hide(hidden, mark.from, end);
            }
          }
          return;
        }

        if (type === "StrongEmphasis" || type === "Emphasis") {
          const active = overlapsSelectedLines(state.doc, selectionRanges, node.from, node.to);
          marks.push({
            from: node.from,
            to: node.to,
            class: type === "StrongEmphasis" ? "cm-live-strong" : "cm-live-em",
          });
          if (!active) {
            for (const mark of node.node.getChildren("EmphasisMark")) hide(hidden, mark.from, mark.to);
          }
          return;
        }

        if (type === "InlineCode") {
          const active = overlapsSelectedLines(state.doc, selectionRanges, node.from, node.to);
          marks.push({ from: node.from, to: node.to, class: "cm-live-code" });
          if (!active) {
            for (const mark of node.node.getChildren("CodeMark")) hide(hidden, mark.from, mark.to);
          }
          return;
        }

        if (type === "ListMark") {
          // ListMark also appears inside OrderedList ("1.", "2.", ...); its
          // number is meaningful content, not pure markup, so it's left
          // alone. Only a BulletList's "-"/"*"/"+" marker gets replaced.
          const listType = node.node.parent?.parent?.type.name;
          if (listType !== "BulletList") return;

          const active = overlapsSelectedLines(state.doc, selectionRanges, node.from, node.to);
          if (!active) {
            let end = node.to;
            if (state.doc.sliceString(end, end + 1) === " ") end += 1;
            widgetReplacements.push({ from: node.from, to: end, widget: new BulletWidget() });
          }
        }
      },
    });
  }

  const docText = state.doc.toString();
  const matchedWikilinks = new Set<number>();
  for (const range of scanRanges) {
    WIKILINK_PATTERN.lastIndex = 0;
    const text = docText.slice(range.from, range.to);
    let match: RegExpExecArray | null;
    while ((match = WIKILINK_PATTERN.exec(text))) {
      const from = range.from + match.index;
      const to = from + match[0].length;
      if (matchedWikilinks.has(from)) continue;
      matchedWikilinks.add(from);
      if (codeRanges.some((codeRange) => from < codeRange.to && to > codeRange.from)) continue;

      const target = match[1];
      const resolved = resolveWikilink(target) !== null;
      marks.push({
        from,
        to,
        class: resolved ? "cm-live-wikilink-resolved" : "cm-live-wikilink-broken",
      });

      if (!overlapsSelectedLines(state.doc, selectionRanges, from, to)) {
        hide(hidden, from, from + 2); // the opening "[["
        hide(hidden, to - 2, to); // the closing "]]"
      }
    }
  }

  const ranges = [
    ...marks.map(({ from, to, class: cls }) => Decoration.mark({ class: cls }).range(from, to)),
    ...hidden.map(({ from, to }) => Decoration.replace({}).range(from, to)),
    ...widgetReplacements.map(({ from, to, widget }) => Decoration.replace({ widget }).range(from, to)),
  ];
  return Decoration.set(ranges, true);
}

export const livePreviewExtension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildLiveDecorations(view.state, view.visibleRanges);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildLiveDecorations(update.view.state, update.view.visibleRanges);
      }
    }
  },
  { decorations: (instance) => instance.decorations },
);

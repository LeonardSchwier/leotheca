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
import { parseWikiLinks, type WikiLinkRecord } from "../linking/wikiSyntax";
import {
  crossNoteHeadingsFor,
  resolveBlockFragment,
  resolveHeadingFragment,
  resolveWikiLinkTarget,
} from "../linking/wikiResolver";
import { scanHeadings, type HeadingRecord } from "../markdown/headings";
import { scanBlockIds, type BlockRecord } from "../markdown/blocks";

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
 *
 * F04 Phase 2 (spec/f04-heading-block-links-embeds.md section 21 Phase 2)
 * adds a second, dedicated pass for heading-link syntax
 * (`[[Note#Heading]]`/`[[#Heading]]`), reusing F04 Phase 1's structured
 * parser (`linking/wikiSyntax.ts`'s parseWikiLinks) and resolver
 * (`linking/wikiResolver.ts`) instead of teaching the plain-wikilink regex
 * below about fragments, the same "one parser, shared by every consumer"
 * rule MarkdownPreview.tsx's renderWikilinksStructured already follows
 * (spec section 2). A same-note fragment resolves fully against this
 * document's own headings (resolved/missing/ambiguous, see
 * classifyHeadingLink below); a cross-note fragment resolves fully too,
 * as of F04 Phase 5a, against `LinkIndex.headingsByPath` (no file read
 * needed from inside this synchronous decoration pass, since that map is
 * already in memory, see `linking/wikiResolver.ts`'s `crossNoteHeadingsFor`
 * and `linking/store.ts`'s own doc comment on the field), rendering
 * "broken" only when the note itself does not exist.
 *
 * F04 Phase 3c adds the identical treatment for `^block-id` fragments
 * (`classifyBlockLink` below, reusing F04 Phase 3a/3b's `resolveBlockFragment`
 * and `markdown/blocks.ts`'s `scanBlockIds` exactly the way the heading
 * pass reuses `resolveHeadingFragment`/`scanHeadings`): a same-note
 * fragment resolves fully against this document's own scanned blocks, a
 * cross-note fragment resolves at the note level only, the same disclosed
 * scope narrowing as headings above (and as `MarkdownPreview.tsx`'s own
 * block-link rendering). A record whose fragment is neither a heading nor
 * a block (a plain `[[Note]]`/`[[Note|Label]]` link) is left to the
 * WIKILINK_PATTERN pass below exactly as before either phase.
 *
 * F04 Phase 3f adds the same decoration for an embed
 * (`![[Note]]`/`![[Note#Heading]]`/`![[Note#^block-id]]`,
 * `record.kind === "embed"`), excluded from the heading/block passes above
 * and handled by its own dedicated pass further down (`embedLinkClass`):
 * unlike a link, an embed's source range includes its leading `!`, so it
 * needs its own from/to and marker-hide offsets rather than reusing the
 * link passes' fixed "the opening `[[` is always the first two characters"
 * assumption.
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

type HeadingLinkStatus = "resolved" | "missing" | "ambiguous" | "broken";

/** Reuses the plain-wikilink classes for the two states this phase shares
 * with it (a fully resolved link; a link whose note doesn't exist at all,
 * indistinguishable in Source mode from a plain broken wikilink), and adds
 * two heading-specific classes for the two states a plain wikilink can
 * never be in: an existing note whose named heading is missing or
 * ambiguous (see App.css and linking/linking.css's own dotted-underline
 * convention for the equivalent Preview-mode states). */
const HEADING_LINK_CLASS: Record<HeadingLinkStatus, string> = {
  resolved: "cm-live-wikilink-resolved",
  missing: "cm-live-wikilink-heading-missing",
  ambiguous: "cm-live-wikilink-heading-ambiguous",
  broken: "cm-live-wikilink-broken",
};

/**
 * Classifies one already-parsed heading-link record for decoration.
 * `currentHeadingsRef` is a lazily-populated one-call cache (populated at
 * most once per buildLiveDecorations invocation, only if a same-note
 * fragment is actually encountered) rather than an unconditional
 * `scanHeadings` call on every decoration rebuild, since a rebuild runs on
 * every keystroke and selection change, and most documents contain no
 * same-note heading link at all.
 *
 * F04 Phase 5a: a cross-note fragment (`record.noteTarget !== ""`) can
 * now reach "missing"/"ambiguous" too, verified against
 * `LinkIndex.headingsByPath` via `crossNoteHeadingsFor` — no file read
 * needed, that map is already in memory (see its own doc comment in
 * `linking/store.ts`). "broken" is reserved for the note itself not
 * resolving; a resolving note with a missing/ambiguous heading gets the
 * more specific status, matching MarkdownPreview.tsx's own equivalent
 * handling for the same case.
 */
function classifyHeadingLink(
  record: WikiLinkRecord,
  currentHeadingsRef: { value: HeadingRecord[] | null },
  docText: string,
): HeadingLinkStatus {
  if (record.noteTarget === "") {
    if (currentHeadingsRef.value === null) currentHeadingsRef.value = scanHeadings(docText);
    const result = resolveHeadingFragment(currentHeadingsRef.value, record.fragment!.value);
    if (result.status === "resolved") return "resolved";
    if (result.status === "ambiguous-fragment") return "ambiguous";
    return "missing";
  }

  const target = resolveWikiLinkTarget(record, {
    currentNotePath: undefined,
    targetHeadings: crossNoteHeadingsFor(record),
  });
  if (target.status === "resolved") return "resolved";
  if (target.status === "missing-fragment") return "missing";
  if (target.status === "ambiguous-fragment") return "ambiguous";
  return "broken";
}

type BlockLinkStatus = "resolved" | "missing" | "ambiguous" | "broken";

/** F04 Phase 3c's analog of HEADING_LINK_CLASS above, for `^block-id`
 * fragments (see App.css's own block-missing/block-ambiguous rule, styled
 * identically to the heading pair). */
const BLOCK_LINK_CLASS: Record<BlockLinkStatus, string> = {
  resolved: "cm-live-wikilink-resolved",
  missing: "cm-live-wikilink-block-missing",
  ambiguous: "cm-live-wikilink-block-ambiguous",
  broken: "cm-live-wikilink-broken",
};

/** F04 Phase 3c's analog of classifyHeadingLink above, for a `^block-id`
 * fragment: `currentBlocksRef` is the same lazily-populated one-call cache
 * pattern, and a cross-note fragment is likewise never verified against
 * the target note's actual blocks in this synchronous decoration pass
 * (only ever "resolved" or "broken" at the note level). */
function classifyBlockLink(
  record: WikiLinkRecord,
  currentBlocksRef: { value: BlockRecord[] | null },
  docText: string,
): BlockLinkStatus {
  if (record.noteTarget === "") {
    if (currentBlocksRef.value === null) currentBlocksRef.value = scanBlockIds(docText);
    const result = resolveBlockFragment(currentBlocksRef.value, record.fragment!.value);
    if (result.status === "resolved") return "resolved";
    if (result.status === "ambiguous-fragment") return "ambiguous";
    return "missing";
  }

  const target = resolveWikiLinkTarget(record, { currentNotePath: undefined, targetBlocks: undefined });
  return target.status === "resolved" ? "resolved" : "broken";
}

/** F04 Phase 3f's analog of classifyHeadingLink/classifyBlockLink above,
 * for an embed record (`record.kind === "embed"`), returning the CSS class
 * to apply directly rather than a separate status enum. An embed's
 * fragment can be a heading, a block, or absent entirely (a plain
 * `![[Note]]` whole-note embed, which has no fragment-specific state at
 * all: only whether its target note itself resolves). Delegates to the
 * existing classifyHeadingLink/classifyBlockLink for the two fragment
 * cases rather than a second, duplicate resolution implementation: both
 * functions key only on `record.noteTarget`/`record.fragment`, never on
 * `record.kind`, so they already work correctly for an embed record as-is.
 * A missing or ambiguous fragment reuses the exact same
 * HEADING_LINK_CLASS/BLOCK_LINK_CLASS lookup a plain link's own decoration
 * pass already uses (a missing heading or block is exactly as meaningful
 * for an embed, its target section doesn't exist, as it is for a link);
 * only "resolved" and "broken" get embed-specific classes
 * (cm-live-embed-resolved/broken, styled in App.css as the link pair's own
 * italic variant), so an embed still reads as visually distinct from a
 * plain link at a glance even when both ultimately point at valid
 * targets. */
function embedLinkClass(
  record: WikiLinkRecord,
  currentHeadingsRef: { value: HeadingRecord[] | null },
  currentBlocksRef: { value: BlockRecord[] | null },
  docText: string,
): string {
  if (!record.fragment) {
    const target = resolveWikiLinkTarget(record, { currentNotePath: undefined });
    return target.status === "resolved" ? "cm-live-embed-resolved" : "cm-live-embed-broken";
  }
  if (record.fragment.kind === "heading") {
    const status = classifyHeadingLink(record, currentHeadingsRef, docText);
    if (status === "resolved") return "cm-live-embed-resolved";
    if (status === "broken") return "cm-live-embed-broken";
    return HEADING_LINK_CLASS[status];
  }
  const status = classifyBlockLink(record, currentBlocksRef, docText);
  if (status === "resolved") return "cm-live-embed-resolved";
  if (status === "broken") return "cm-live-embed-broken";
  return BLOCK_LINK_CLASS[status];
}

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

  // F04 Phase 2/3c: heading-link and block-link records
  // (`[[Note#Heading]]`/`[[#Heading]]`, `[[Note#^block-id]]`/`[[#^block-id]]`)
  // are decorated through the shared structured parser/resolver below,
  // never through the plain-wikilink regex; fragmentLinkRanges records
  // their exact [from, to) source spans (shared by both passes) so the
  // WIKILINK_PATTERN pass right after can skip them rather than
  // double-decorating the same occurrence with an incorrect "broken" look
  // (a fragment's `#` makes the literal bracket contents an unresolvable
  // note name to that regex). Both loops below exclude an embed record
  // (`record.kind === "embed"`, a leading `!` before `[[`): F04 Phase 3f's
  // dedicated embed pass further down handles those, since an embed's
  // source range includes that extra leading `!` character and needs a
  // different hide/mark offset than a plain link's identical-looking
  // `[[...]]` shape.
  const fragmentLinkRanges = new Set<string>();
  const currentHeadingsRef: { value: HeadingRecord[] | null } = { value: null };
  for (const range of scanRanges) {
    const text = docText.slice(range.from, range.to);
    for (const record of parseWikiLinks(text)) {
      if (record.parseStatus !== "valid" || record.fragment?.kind !== "heading" || record.kind === "embed") continue;
      const from = range.from + record.sourceFrom;
      const to = range.from + record.sourceTo;
      if (fragmentLinkRanges.has(`${from}:${to}`)) continue;
      fragmentLinkRanges.add(`${from}:${to}`);
      if (codeRanges.some((codeRange) => from < codeRange.to && to > codeRange.from)) continue;

      const status = classifyHeadingLink(record, currentHeadingsRef, docText);
      marks.push({ from, to, class: HEADING_LINK_CLASS[status] });

      if (!overlapsSelectedLines(state.doc, selectionRanges, from, to)) {
        hide(hidden, from, from + 2); // the opening "[["
        hide(hidden, to - 2, to); // the closing "]]"
      }
    }
  }

  const currentBlocksRef: { value: BlockRecord[] | null } = { value: null };
  for (const range of scanRanges) {
    const text = docText.slice(range.from, range.to);
    for (const record of parseWikiLinks(text)) {
      if (record.parseStatus !== "valid" || record.fragment?.kind !== "block" || record.kind === "embed") continue;
      const from = range.from + record.sourceFrom;
      const to = range.from + record.sourceTo;
      if (fragmentLinkRanges.has(`${from}:${to}`)) continue;
      fragmentLinkRanges.add(`${from}:${to}`);
      if (codeRanges.some((codeRange) => from < codeRange.to && to > codeRange.from)) continue;

      const status = classifyBlockLink(record, currentBlocksRef, docText);
      marks.push({ from, to, class: BLOCK_LINK_CLASS[status] });

      if (!overlapsSelectedLines(state.doc, selectionRanges, from, to)) {
        hide(hidden, from, from + 2); // the opening "[["
        hide(hidden, to - 2, to); // the closing "]]"
      }
    }
  }

  // F04 Phase 3f: an embed record (`![[Note]]`/`![[Note#Heading]]`/
  // `![[Note#^block-id]]`, `record.kind === "embed"`) is decorated here,
  // never through the plain-wikilink regex below or the heading/block
  // passes above (both now explicitly exclude embeds). `record.sourceFrom`
  // includes the leading `!` for an embed (see wikiSyntax.ts's own doc
  // comment on that field), so `from` below points at the `!`, one
  // character before the opening `[[` — the WIKILINK_PATTERN pass below is
  // blind to that `!` and would otherwise independently match and
  // re-decorate the exact same `[[...]]` substring with an unrelated
  // plain-link status, so this loop also registers that inner range (the
  // one WIKILINK_PATTERN's own `from`/`to` would compute) into
  // fragmentLinkRanges to suppress it, the same dedup mechanism the
  // heading/block passes above already use for their own (non-`!`-shifted)
  // ranges. Prior to this phase, an embed carrying a heading or block
  // fragment was actually decorated by the heading/block passes above
  // (they filtered only on `record.fragment?.kind`, not `record.kind`),
  // which then hid `from, from + 2`, the `!` and the first `[`, not the
  // real `[[` two characters later, leaving a stray unhidden `[` behind; a
  // regression test for that exact case now guards this fix.
  for (const range of scanRanges) {
    const text = docText.slice(range.from, range.to);
    for (const record of parseWikiLinks(text)) {
      if (record.parseStatus !== "valid" || record.kind !== "embed") continue;
      const from = range.from + record.sourceFrom;
      const to = range.from + record.sourceTo;
      if (fragmentLinkRanges.has(`${from}:${to}`)) continue;
      fragmentLinkRanges.add(`${from}:${to}`);
      fragmentLinkRanges.add(`${from + 1}:${to}`);
      if (codeRanges.some((codeRange) => from < codeRange.to && to > codeRange.from)) continue;

      // Reuses the exact same lazily-populated heading/block caches the
      // passes above already share, rather than a fresh scan: most
      // documents contain at most one of a same-note heading link, block
      // link, or embed, so this cache is very likely already empty and
      // cheap either way, but sharing it means a document with more than
      // one never scans twice.
      const cls = embedLinkClass(record, currentHeadingsRef, currentBlocksRef, docText);
      marks.push({ from, to, class: cls });

      if (!overlapsSelectedLines(state.doc, selectionRanges, from, to)) {
        hide(hidden, from + 1, from + 3); // the opening "[[", after the leading "!"
        hide(hidden, to - 2, to); // the closing "]]"
      }
    }
  }

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
      if (fragmentLinkRanges.has(`${from}:${to}`)) continue;
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

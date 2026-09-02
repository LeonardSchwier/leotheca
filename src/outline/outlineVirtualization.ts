import type { HeadingRecord } from "../markdown/headings";

/**
 * Large-outline virtualization (spec/f06-note-outline-heading-breadcrumbs.md
 * section 16: "Notes with more than 500 headings use virtualized or
 * windowed row rendering"). This is Phase 4a of the spec's own Phase 4
 * ("Scale and accessibility", section 20): only the scale half. Complete
 * keyboard tree semantics, screen-reader validation, and compact/touch
 * hardening (section 15.1, 15.2, 15.4) remain open, tracked as their own
 * follow-up item, the same way Phase 2 split into 2a/2b/2c.
 */

/** Below this heading count, OutlinePanel keeps rendering its existing
 * nested `<ul>`/`<li>` tree unchanged (see OutlineRow): every already
 * shipped, tested small-outline behavior is untouched by this module. */
export const LARGE_OUTLINE_THRESHOLD = 500;

/** Fixed per-row pixel height used only by the virtualized list, matching
 * this codebase's existing 28px compact-control convention (see
 * `graph.css`'s `.graph-*` controls and `App.css`'s toolbar buttons). A
 * *fixed* height, applied to every virtualized row via inline style
 * rather than left to CSS, is what makes the windowing math in
 * `computeVirtualWindow` exact: a variable-height row would need real
 * layout measurement, which this codebase's test environment (jsdom)
 * cannot provide. */
export const VIRTUAL_ROW_HEIGHT_PX = 28;

/** How many extra rows to render on each side of the visible window, so
 * a small scroll delta or a fast arrow-key repeat doesn't show a blank
 * gap before the next render commits. */
export const VIRTUAL_OVERSCAN_ROWS = 8;

export function headingKeyId(heading: HeadingRecord): string {
  return `${heading.key} ${heading.occurrence}`;
}

/** One row in the outline's rendered order. */
export interface OutlineRowInfo {
  index: number;
  depth: number;
}

/**
 * The exact depth-first, source-order sequence of heading indexes
 * OutlinePanel's existing nested renderer (OutlineRow) shows for a given
 * collapse and filter state: every root heading, then recursively every
 * child not hidden by a collapsed ancestor, skipping any heading the
 * active filter excludes (unless it's a match's ancestor, kept reachable
 * per section 6.5). Collapse never hides a row while filtering, matching
 * OutlineRow's own rule. Used by the virtualized list to materialize the
 * full row order up front, since windowing needs random access into it
 * rather than OutlineRow's lazy recursive skip.
 */
export function flattenVisibleRows(
  headings: HeadingRecord[],
  collapsedKeys: Set<string>,
  filterActive: boolean,
  visibleIndexes: Set<number> | null,
): OutlineRowInfo[] {
  const rows: OutlineRowInfo[] = [];

  function visit(index: number, depth: number) {
    if (filterActive && !visibleIndexes?.has(index)) return;
    const heading = headings[index];
    rows.push({ index, depth });
    const collapsed = !filterActive && collapsedKeys.has(headingKeyId(heading));
    if (collapsed) return;
    for (const childIndex of heading.childIndexes) visit(childIndex, depth + 1);
  }

  headings.forEach((heading, index) => {
    if (heading.parentIndex === undefined) visit(index, 0);
  });

  return rows;
}

/** The slice of `rows` to actually render, plus the pixel height of the
 * blank spacers before and after it that keep the scrollbar's size and
 * position correct for the full, un-rendered row count. */
export interface VirtualWindow {
  startIndex: number;
  endIndex: number;
  topSpacerHeight: number;
  bottomSpacerHeight: number;
}

/**
 * Pure windowing math: which row indexes fall within (or just outside,
 * per `overscan`) the visible pixel range, given every row has the same
 * fixed height. Deliberately takes plain numbers, not DOM elements or
 * refs, so it is fully unit-testable without real layout (jsdom cannot
 * provide it) and so a caller can pass scrollTop/viewportHeight from
 * whatever measurement strategy its own environment actually supports.
 */
export function computeVirtualWindow(
  rowCount: number,
  rowHeight: number,
  scrollTop: number,
  viewportHeight: number,
  overscan: number,
): VirtualWindow {
  if (rowCount === 0 || rowHeight <= 0) {
    return { startIndex: 0, endIndex: 0, topSpacerHeight: 0, bottomSpacerHeight: 0 };
  }
  const clampedScrollTop = Math.max(0, scrollTop);
  const firstVisible = Math.floor(clampedScrollTop / rowHeight);
  const visibleRowCount = Math.max(1, Math.ceil(viewportHeight / rowHeight));
  const startIndex = Math.max(0, firstVisible - overscan);
  const endIndex = Math.min(rowCount, firstVisible + visibleRowCount + overscan);
  return {
    startIndex,
    endIndex,
    topSpacerHeight: startIndex * rowHeight,
    bottomSpacerHeight: (rowCount - endIndex) * rowHeight,
  };
}

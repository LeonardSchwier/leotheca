import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { HeadingRecord } from "../markdown/headings";
import { OutlineRowContent } from "./OutlineRowContent";
import {
  computeVirtualWindow,
  flattenVisibleRows,
  headingKeyId,
  VIRTUAL_OVERSCAN_ROWS,
  VIRTUAL_ROW_HEIGHT_PX,
} from "./outlineVirtualization";

interface VirtualizedOutlineListProps {
  headings: HeadingRecord[];
  duplicateFlags: boolean[];
  collapsedKeys: Set<string>;
  onToggleCollapse: (keyId: string) => void;
  filterActive: boolean;
  visibleIndexes: Set<number> | null;
  onSelect: (heading: HeadingRecord) => void;
}

/** Used only before the first real ResizeObserver measurement lands (or
 * in an environment, like this codebase's jsdom test suite, that never
 * fires one): large enough that a small note-with-many-headings fixture
 * still renders a real, non-trivial window in a test without needing to
 * mock layout, without ever being mistaken for a real measurement. */
const INITIAL_VIEWPORT_HEIGHT_PX = 240;

/**
 * Renders a large outline's rows (see OutlinePanel's LARGE_OUTLINE_THRESHOLD)
 * as a flat, windowed list instead of OutlinePanel's own recursive nested
 * `<ul>` tree: only the rows within the current scroll position, plus a
 * small overscan margin, are ever mounted in the DOM. Row markup itself
 * (OutlineRowContent) is shared with the nested renderer so the two
 * strategies can never visually drift apart; only the container and
 * windowing differ.
 *
 * Deliberately its own scroll container, not the outline panel's shared
 * outer scroll region the small-outline path scrolls as one unit with
 * its header and filter input: virtualizing the *panel's* scroll would
 * need to measure the header/filter's rendered height as a moving
 * offset, which this codebase's jsdom test environment cannot provide.
 * Keeping the header and filter outside this component's own bounded,
 * independently scrolling list sidesteps that measurement entirely, and
 * is arguably the more usable behavior anyway for a list long enough to
 * need windowing: the filter box that is the whole point of scanning a
 * huge outline stays visible while the rows themselves scroll.
 */
export function VirtualizedOutlineList({
  headings,
  duplicateFlags,
  collapsedKeys,
  onToggleCollapse,
  filterActive,
  visibleIndexes,
  onSelect,
}: VirtualizedOutlineListProps) {
  const containerRef = useRef<HTMLUListElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(INITIAL_VIEWPORT_HEIGHT_PX);

  const rows = useMemo(
    () => flattenVisibleRows(headings, collapsedKeys, filterActive, visibleIndexes),
    [headings, collapsedKeys, filterActive, visibleIndexes],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setViewportHeight(container.clientHeight));
    observer.observe(container);
    if (container.clientHeight > 0) setViewportHeight(container.clientHeight);
    return () => observer.disconnect();
  }, []);

  // A collapse or a narrower filter match set can shrink the row count
  // out from under an already-scrolled-down position; clamp scrollTop
  // itself (not just the computed window) so a later expand or filter
  // clear doesn't resume from a stale, now-out-of-range position.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const maxScrollTop = Math.max(0, rows.length * VIRTUAL_ROW_HEIGHT_PX - viewportHeight);
    if (container.scrollTop > maxScrollTop) {
      container.scrollTop = maxScrollTop;
      setScrollTop(maxScrollTop);
    }
  }, [rows.length, viewportHeight]);

  const virtualWindow = computeVirtualWindow(
    rows.length,
    VIRTUAL_ROW_HEIGHT_PX,
    scrollTop,
    viewportHeight,
    VIRTUAL_OVERSCAN_ROWS,
  );

  return (
    <ul
      class="outline-list outline-list--virtual"
      aria-label="Heading outline"
      ref={containerRef}
      onScroll={(event) => setScrollTop((event.target as HTMLUListElement).scrollTop)}
    >
      {virtualWindow.topSpacerHeight > 0 && (
        <li aria-hidden="true" style={{ height: `${virtualWindow.topSpacerHeight}px` }} />
      )}
      {rows.slice(virtualWindow.startIndex, virtualWindow.endIndex).map(({ index, depth }) => {
        const heading = headings[index];
        const hasChildren = heading.childIndexes.length > 0;
        const keyId = headingKeyId(heading);
        const collapsed = !filterActive && collapsedKeys.has(keyId);
        return (
          <li key={index} class="outline-node" style={{ height: `${VIRTUAL_ROW_HEIGHT_PX}px` }}>
            <OutlineRowContent
              heading={heading}
              depth={depth}
              hasChildren={hasChildren}
              collapsed={collapsed}
              duplicate={duplicateFlags[index]}
              onToggleCollapse={() => onToggleCollapse(keyId)}
              onSelect={() => onSelect(heading)}
            />
          </li>
        );
      })}
      {virtualWindow.bottomSpacerHeight > 0 && (
        <li aria-hidden="true" style={{ height: `${virtualWindow.bottomSpacerHeight}px` }} />
      )}
    </ul>
  );
}

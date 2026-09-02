import type { HeadingRecord } from "../markdown/headings";

interface OutlineRowContentProps {
  heading: HeadingRecord;
  depth: number;
  hasChildren: boolean;
  collapsed: boolean;
  duplicate: boolean;
  onToggleCollapse: () => void;
  onSelect: () => void;
}

/** The row's own visible content (chevron plus label button): the part
 * shared between OutlinePanel's nested small-outline renderer (OutlineRow)
 * and VirtualizedOutlineList's large-outline flat renderer, so the two
 * rendering strategies can never visually drift apart. Kept in its own
 * module, rather than defined in either renderer, so neither one needs to
 * import the other. */
export function OutlineRowContent({
  heading,
  depth,
  hasChildren,
  collapsed,
  duplicate,
  onToggleCollapse,
  onSelect,
}: OutlineRowContentProps) {
  return (
    <div class="outline-row" style={{ paddingLeft: `${depth * 16}px` }}>
      <button
        class="outline-chevron"
        aria-label={
          hasChildren
            ? `${collapsed ? "Expand" : "Collapse"} ${heading.displayText || "heading"}`
            : undefined
        }
        disabled={!hasChildren}
        onClick={onToggleCollapse}
      >
        {hasChildren ? (collapsed ? "▸" : "▾") : ""}
      </button>
      <button
        class="outline-label"
        title={heading.displayText || "(Untitled heading)"}
        onClick={onSelect}
      >
        <span class="outline-text">{heading.displayText || "(Untitled heading)"}</span>
        {duplicate && (
          <span class="outline-duplicate-marker" aria-label="Duplicate heading text" title="Duplicate heading text">
            ⚠
          </span>
        )}
      </button>
    </div>
  );
}

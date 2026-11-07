import type { HeadingRecord } from "../markdown/headings";
import { HeadingLinkActions } from "./HeadingLinkActions";

interface OutlineRowContentProps {
  heading: HeadingRecord;
  depth: number;
  hasChildren: boolean;
  collapsed: boolean;
  duplicate: boolean;
  /** The active note's own title, needed for Copy link's note-qualified
   * `[[Note#Heading]]` form (see HeadingLinkActions.tsx). */
  noteTitle: string;
  /** Whether Insert link has anywhere sensible to insert into right now
   * (spec section 9.4); see HeadingLinkActions.tsx. */
  canInsertLink: boolean;
  onToggleCollapse: () => void;
  onSelect: () => void;
  /** Called right after Insert link succeeds; see HeadingLinkActions.tsx. */
  onInserted?: () => void;
}

/** The row's own visible content (chevron, label button, and F06 Phase 3's
 * copy/insert-link actions): the part shared between OutlinePanel's nested
 * small-outline renderer (OutlineRow) and VirtualizedOutlineList's
 * large-outline flat renderer, so the two rendering strategies can never
 * visually drift apart. Kept in its own module, rather than defined in
 * either renderer, so neither one needs to import the other. */
export function OutlineRowContent({
  heading,
  depth,
  hasChildren,
  collapsed,
  duplicate,
  noteTitle,
  canInsertLink,
  onToggleCollapse,
  onSelect,
  onInserted,
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
      <HeadingLinkActions
        heading={heading}
        noteTitle={noteTitle}
        duplicate={duplicate}
        canInsertLink={canInsertLink}
        onInserted={onInserted}
      />
    </div>
  );
}

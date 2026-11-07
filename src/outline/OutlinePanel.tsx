import { useEffect, useState } from "preact/hooks";
import type { HeadingRecord } from "../markdown/headings";
import { requestOutlineReveal } from "./outlineNavigation";
import { announceOutline, headingNavigationAnnouncement } from "./outlineAnnouncements";
import { useNoteHeadings } from "./useNoteHeadings";
import { OutlineRowContent } from "./OutlineRowContent";
import { headingKeyId, LARGE_OUTLINE_THRESHOLD } from "./outlineVirtualization";
import { VirtualizedOutlineList } from "./VirtualizedOutlineList";
import "./outline.css";

interface OutlinePanelProps {
  content: string;
  /** The active note's own title, needed for Copy link's note-qualified
   * `[[Note#Heading]]` form (spec section 9.2, see
   * outline/HeadingLinkActions.tsx). */
  noteTitle: string;
  /** Whether Insert link has anywhere sensible to insert into right now
   * (spec section 9.4: no writable editor mounted, e.g. a preview-only
   * view mode). Defaults to true so a caller that doesn't care about this
   * distinction still sees the action enabled. Copy link is unaffected:
   * it only needs the clipboard, never an editor. */
  canInsertLink?: boolean;
  /** Called right after a row is selected and a reveal has been
   * requested, so a host that needs to make the editor visible (e.g.
   * switching out of a preview-only view mode) can do so; the outline
   * itself has no opinion on view mode. Also called right after Insert
   * link succeeds, for the same reason. */
  onNavigated?: () => void;
}

// section 6.2: the filter field only appears once a note has enough
// headings that scanning the list by eye stops being the faster option.
const FILTER_THRESHOLD = 20;

// section 15.2: "Filter counts update through a polite live region after
// debounce", so a screen reader hears one summary once typing pauses
// rather than a new count on every keystroke. Long enough to cover a
// normal typing cadence, short enough the announcement still reads as a
// direct response to what was just typed.
const FILTER_ANNOUNCE_DEBOUNCE_MS = 300;

/** A heading's key is a duplicate exactly when some other heading in the
 * document shares the same normalized key, including its own first
 * occurrence, per spec section 6.3 ("duplicate-heading warning when
 * relevant"). Exported for testing, and reused by HeadingBreadcrumbs.tsx
 * to decide the same thing about its own active heading (Phase 3's
 * headingLinkDisabledReason needs it too, spec section 9's "duplicate
 * headings shall not produce a falsely precise copied heading link",
 * F06-FR-15): one normalizer, not two. */
export function computeDuplicateFlags(headings: HeadingRecord[]): boolean[] {
  const counts = new Map<string, number>();
  for (const heading of headings) counts.set(heading.key, (counts.get(heading.key) ?? 0) + 1);
  return headings.map((heading) => (counts.get(heading.key) ?? 0) > 1);
}

/** Headings visible while filtering: every heading whose display text
 * matches, plus its full ancestor chain, per spec section 6.5
 * ("Matching rows remain visible with their ancestor chain"). Exported
 * for testing. */
export function computeVisibleIndexes(headings: HeadingRecord[], filterLower: string): Set<number> {
  const visible = new Set<number>();
  headings.forEach((heading, index) => {
    if (!heading.displayText.toLowerCase().includes(filterLower)) return;
    let current: number | undefined = index;
    while (current !== undefined && !visible.has(current)) {
      visible.add(current);
      current = headings[current].parentIndex;
    }
  });
  return visible;
}

/** How many headings actually match the filter text, as opposed to
 * `computeVisibleIndexes`'s size, which also counts non-matching
 * ancestors kept visible for context (section 6.5). Section 15.2's
 * "filter counts" live-region announcement describes matches, not the
 * larger visible set, so this is a separate, smaller count. Exported for
 * testing. */
export function computeMatchCount(headings: HeadingRecord[], filterLower: string): number {
  return headings.filter((heading) => heading.displayText.toLowerCase().includes(filterLower)).length;
}

interface OutlineRowProps {
  headings: HeadingRecord[];
  duplicateFlags: boolean[];
  index: number;
  depth: number;
  collapsedKeys: Set<string>;
  onToggleCollapse: (keyId: string) => void;
  filterActive: boolean;
  visibleIndexes: Set<number> | null;
  onSelect: (heading: HeadingRecord) => void;
  noteTitle: string;
  canInsertLink: boolean;
  onInserted?: () => void;
}

function OutlineRow({
  headings,
  duplicateFlags,
  index,
  depth,
  collapsedKeys,
  onToggleCollapse,
  filterActive,
  visibleIndexes,
  onSelect,
  noteTitle,
  canInsertLink,
  onInserted,
}: OutlineRowProps) {
  if (filterActive && !visibleIndexes?.has(index)) return null;

  const heading = headings[index];
  const hasChildren = heading.childIndexes.length > 0;
  const keyId = headingKeyId(heading);
  // Collapse never hides a row while filtering: the whole point of the
  // ancestor chain above is to make a match reachable.
  const collapsed = !filterActive && collapsedKeys.has(keyId);

  return (
    <li class="outline-node">
      <OutlineRowContent
        heading={heading}
        depth={depth}
        hasChildren={hasChildren}
        collapsed={collapsed}
        duplicate={duplicateFlags[index]}
        noteTitle={noteTitle}
        canInsertLink={canInsertLink}
        onToggleCollapse={() => onToggleCollapse(keyId)}
        onSelect={() => onSelect(heading)}
        onInserted={onInserted}
      />
      {hasChildren && !collapsed && (
        <ul class="outline-children">
          {heading.childIndexes.map((childIndex) => (
            <OutlineRow
              key={childIndex}
              headings={headings}
              duplicateFlags={duplicateFlags}
              index={childIndex}
              depth={depth + 1}
              collapsedKeys={collapsedKeys}
              onToggleCollapse={onToggleCollapse}
              filterActive={filterActive}
              visibleIndexes={visibleIndexes}
              onSelect={onSelect}
              noteTitle={noteTitle}
              canInsertLink={canInsertLink}
              onInserted={onInserted}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Phase 1 (spec/f06-note-outline-heading-breadcrumbs.md section 20)
 * read-only structural outline for the active note: a hierarchical,
 * filterable, collapsible list of headings that navigates the editor's
 * selection to a heading's text without remounting it. Phase 3 added
 * per-row copy-heading-link and insert-heading-link actions (section 9,
 * see outline/HeadingLinkActions.tsx); the remainder of Phase 4 (complete
 * keyboard tree semantics, screen-reader validation, compact hardening)
 * is still a later phase, not implemented here. Above LARGE_OUTLINE_THRESHOLD
 * headings, rendering switches to VirtualizedOutlineList (Phase 4a);
 * below it, this file's own nested OutlineRow renderer is unchanged.
 *
 * Rendered with `key={path}` by its caller (see App.tsx, following the
 * same convention as FrontmatterPropertiesPanel) so opening a different
 * note remounts this component fresh: the scanned headings, filter text,
 * and collapse state are component-local and reset automatically rather
 * than needing an explicit workspace-switch listener.
 */
export function OutlinePanel({ content, noteTitle, canInsertLink = true, onNavigated }: OutlinePanelProps) {
  const headings = useNoteHeadings(content);
  const [filterText, setFilterText] = useState("");
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set());

  const filterLower = filterText.trim().toLowerCase();
  const filterActive = filterLower.length > 0;
  const visibleIndexes = filterActive ? computeVisibleIndexes(headings, filterLower) : null;
  const duplicateFlags = computeDuplicateFlags(headings);
  const rootIndexes: number[] = [];
  let hasAnyChildren = false;
  headings.forEach((heading, index) => {
    if (heading.parentIndex === undefined) rootIndexes.push(index);
    if (heading.childIndexes.length > 0) hasAnyChildren = true;
  });

  useEffect(() => {
    if (!filterActive) return;
    const timer = setTimeout(() => {
      const count = computeMatchCount(headings, filterLower);
      announceOutline(
        count === 0
          ? "No headings match."
          : count === 1
            ? "1 heading matches."
            : `${count} headings match.`,
      );
    }, FILTER_ANNOUNCE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [filterActive, filterLower, headings]);

  function toggleCollapse(keyId: string) {
    setCollapsedKeys((current) => {
      const next = new Set(current);
      if (next.has(keyId)) next.delete(keyId);
      else next.add(keyId);
      return next;
    });
  }

  function handleSelect(heading: HeadingRecord) {
    requestOutlineReveal(heading.contentFrom, heading.contentTo);
    announceOutline(
      headingNavigationAnnouncement(heading.displayText || "heading", content, heading.contentFrom),
    );
    onNavigated?.();
  }

  return (
    <section class="outline-panel" aria-label="Outline">
      <div class="outline-header">
        <h2 class="outline-heading">Outline</h2>
        <span class="outline-count">{headings.length}</span>
        {hasAnyChildren && (
          <div class="outline-header-actions">
            <button class="outline-text-button" onClick={() => setCollapsedKeys(new Set())}>
              Expand all
            </button>
            <button
              class="outline-text-button"
              onClick={() =>
                setCollapsedKeys(
                  new Set(headings.filter((h) => h.childIndexes.length > 0).map(headingKeyId)),
                )
              }
            >
              Collapse all
            </button>
          </div>
        )}
      </div>
      {headings.length > FILTER_THRESHOLD && (
        <input
          class="outline-filter"
          type="text"
          placeholder="Filter headings"
          value={filterText}
          onInput={(event) => setFilterText((event.target as HTMLInputElement).value)}
          aria-label="Filter headings"
        />
      )}
      {headings.length === 0 ? (
        <p class="empty-hint">This note has no headings.</p>
      ) : filterActive && (visibleIndexes?.size ?? 0) === 0 ? (
        <div class="outline-empty-filter">
          <p class="empty-hint">No headings match.</p>
          <button class="outline-text-button" onClick={() => setFilterText("")}>
            Clear filter
          </button>
        </div>
      ) : headings.length > LARGE_OUTLINE_THRESHOLD ? (
        <VirtualizedOutlineList
          headings={headings}
          duplicateFlags={duplicateFlags}
          collapsedKeys={collapsedKeys}
          onToggleCollapse={toggleCollapse}
          filterActive={filterActive}
          visibleIndexes={visibleIndexes}
          onSelect={handleSelect}
          noteTitle={noteTitle}
          canInsertLink={canInsertLink}
          onInserted={onNavigated}
        />
      ) : (
        <ul class="outline-list" aria-label="Heading outline">
          {rootIndexes.map((index) => (
            <OutlineRow
              key={index}
              headings={headings}
              duplicateFlags={duplicateFlags}
              index={index}
              depth={0}
              collapsedKeys={collapsedKeys}
              onToggleCollapse={toggleCollapse}
              filterActive={filterActive}
              visibleIndexes={visibleIndexes}
              onSelect={handleSelect}
              noteTitle={noteTitle}
              canInsertLink={canInsertLink}
              onInserted={onNavigated}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

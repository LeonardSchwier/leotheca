import { useState } from "preact/hooks";
import type { HeadingRecord } from "../markdown/headings";
import { requestOutlineReveal } from "./outlineNavigation";
import { useNoteHeadings } from "./useNoteHeadings";
import "./outline.css";

interface OutlinePanelProps {
  content: string;
  /** Called right after a row is selected and a reveal has been
   * requested, so a host that needs to make the editor visible (e.g.
   * switching out of a preview-only view mode) can do so; the outline
   * itself has no opinion on view mode. */
  onNavigated?: () => void;
}

// section 6.2: the filter field only appears once a note has enough
// headings that scanning the list by eye stops being the faster option.
const FILTER_THRESHOLD = 20;

function headingKeyId(heading: HeadingRecord): string {
  return `${heading.key} ${heading.occurrence}`;
}

/** A heading's key is a duplicate exactly when some other heading in the
 * document shares the same normalized key, including its own first
 * occurrence, per spec section 6.3 ("duplicate-heading warning when
 * relevant"). Exported for testing. */
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
      <div class="outline-row" style={{ paddingLeft: `${depth * 16}px` }}>
        <button
          class="outline-chevron"
          aria-label={
            hasChildren
              ? `${collapsed ? "Expand" : "Collapse"} ${heading.displayText || "heading"}`
              : undefined
          }
          disabled={!hasChildren}
          onClick={() => onToggleCollapse(keyId)}
        >
          {hasChildren ? (collapsed ? "▸" : "▾") : ""}
        </button>
        <button
          class="outline-label"
          title={heading.displayText || "(Untitled heading)"}
          onClick={() => onSelect(heading)}
        >
          <span class="outline-text">{heading.displayText || "(Untitled heading)"}</span>
          {duplicateFlags[index] && (
            <span class="outline-duplicate-marker" aria-label="Duplicate heading text" title="Duplicate heading text">
              ⚠
            </span>
          )}
        </button>
      </div>
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
 * selection to a heading's text without remounting it. Breadcrumbs,
 * F04-dependent copy/insert-link actions, current-section tracking, and
 * large-outline virtualization are later phases, not implemented here.
 *
 * Rendered with `key={path}` by its caller (see App.tsx, following the
 * same convention as FrontmatterPropertiesPanel) so opening a different
 * note remounts this component fresh: the scanned headings, filter text,
 * and collapse state are component-local and reset automatically rather
 * than needing an explicit workspace-switch listener.
 */
export function OutlinePanel({ content, onNavigated }: OutlinePanelProps) {
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
            />
          ))}
        </ul>
      )}
    </section>
  );
}

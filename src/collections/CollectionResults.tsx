import { useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { fileNameFromPath } from "../linking/store";
import type { FrontmatterProperty } from "../editor/frontmatterEdits";
import type { NoteRecord } from "./collectionQuery";
import type { CollectionViewV1, SmartCollectionV1 } from "./collectionTypes";
import "./collections.css";

export interface CollectionResultsProps {
  collection: SmartCollectionV1;
  results: NoteRecord[];
  onOpenFile: (path: string, name: string) => void | Promise<void>;
  onViewChange: (view: CollectionViewV1) => void | Promise<void>;
  onEditProperty: (
    note: NoteRecord,
    property: Exclude<FrontmatterProperty, { kind: "readonly" }>,
    value: string | string[],
  ) => Promise<"ok" | "stale" | "error">;
}

function formatModified(ms: number | undefined): string {
  if (ms === undefined) return "";
  try {
    return new Date(ms).toLocaleDateString();
  } catch {
    return "";
  }
}

function propertyText(property: FrontmatterProperty | undefined): string {
  if (!property) return "";
  if (property.kind === "list") return property.value.join(", ");
  return property.value;
}

function visiblePropertyKeys(results: NoteRecord[], configured: string[] | undefined): string[] {
  if (configured && configured.length > 0) return configured.slice(0, 6);
  const keys = new Map<string, string>();
  for (const note of results) {
    for (const property of note.properties.values()) {
      if (!keys.has(property.key.toLocaleLowerCase())) keys.set(property.key.toLocaleLowerCase(), property.key);
      if (keys.size >= 6) return Array.from(keys.values());
    }
  }
  return Array.from(keys.values());
}

/** Builds a `CollectionViewV1` for the given mode/groupBy/groupOrder.
 * When `existing` is supplied (the view the user is editing), mode-specific
 * fields (`columns` for table, `fields` for card) are carried over so that
 * reordering a group column does not silently destroy the user's column or
 * field selections. */
export function viewForMode(
  mode: Exclude<CollectionViewV1["mode"], "kanban">,
  groupBy: string | undefined,
  groupOrder?: string[],
  existing?: CollectionViewV1,
): CollectionViewV1 {
  const withGroup = groupBy && groupBy.trim() !== "" ? { groupBy } : {};
  const withOrder = groupOrder && groupOrder.length > 0 ? { groupOrder } : {};
  if (mode === "table") {
    const columns =
      existing && existing.mode === "table" && existing.columns
        ? { columns: existing.columns }
        : {};
    return { mode: "table", ...columns, ...withGroup, ...withOrder };
  }
  if (mode === "card") {
    const fields =
      existing && existing.mode === "card" && existing.fields
        ? { fields: existing.fields }
        : {};
    return { mode: "card", ...fields, ...withGroup, ...withOrder };
  }
  return { mode: "list", ...withGroup, ...withOrder };
}

interface GroupColumn {
  key: string;
  label: string;
  notes: NoteRecord[];
}

const UNASSIGNED_KANBAN_COLUMN = "__leotheca_unassigned__";
/** Sentinel groupBy value for folder-based board grouping (competitor scan,
 * Obsidian 1.14.2 Bases Kanban precedent). The schema already stores
 * groupBy as a free-form string, so no decode or type change is needed. */
export const FOLDER_GROUP_BY = "file.folder";

function folderColumnKey(note: NoteRecord): string {
  return note.folder.trim() !== "" ? note.folder.trim() : UNASSIGNED_KANBAN_COLUMN;
}

/** Builds a stable read-only board. Group by a frontmatter property (lists
 * and unsupported YAML join Unassigned) or by the note's containing folder
 * (`FOLDER_GROUP_BY`). Notes in the workspace root (empty folder) join
 * Unassigned for folder grouping. */
export function groupResults(
  results: NoteRecord[],
  groupBy: string,
  groupOrder?: string[],
): GroupColumn[] {
  const columns = new Map<string, GroupColumn>();
  const byFolder = groupBy === FOLDER_GROUP_BY;
  const normalizedKey = byFolder ? "" : groupBy.toLocaleLowerCase();
  for (const note of results) {
    const value = byFolder
      ? folderColumnKey(note)
      : (() => {
          const property = note.properties.get(normalizedKey);
          return property?.kind === "scalar" && property.value.trim() !== ""
            ? property.value.trim()
            : UNASSIGNED_KANBAN_COLUMN;
        })();
    // Property values are grouped case-insensitively, matching how filter
    // queries and sorting already treat them (collectionQuery.ts's `fold`/
    // `sortValue`): otherwise notes whose frontmatter capitalizes the same
    // value differently ("Work" vs "work") would silently fragment into
    // separate columns instead of the one a `status is Work` filter would
    // match them all under. Folder paths stay case-sensitive -- two
    // differently-cased folders are genuinely different directories on a
    // case-sensitive filesystem, not the same value written inconsistently.
    const key = value === UNASSIGNED_KANBAN_COLUMN || byFolder ? value : value.toLocaleLowerCase();
    const existing = columns.get(key);
    if (existing) existing.notes.push(note);
    else columns.set(key, {
      key,
      label: value === UNASSIGNED_KANBAN_COLUMN ? "Unassigned" : value,
      notes: [note],
    });
  }

  const ordered = byFolder ? undefined : groupOrder;
  const orderedLowerSet = new Set((ordered ?? []).map((l) => l.toLocaleLowerCase()));

  const sortedAll = Array.from(columns.values()).sort((a, b) => {
    if (a.key === UNASSIGNED_KANBAN_COLUMN) return 1;
    if (b.key === UNASSIGNED_KANBAN_COLUMN) return -1;
    if (ordered) {
      const idxA = orderedLowerSet.has(a.label.toLocaleLowerCase())
        ? (ordered ?? []).findIndex((l) => l.toLocaleLowerCase() === a.label.toLocaleLowerCase())
        : Infinity;
      const idxB = orderedLowerSet.has(b.label.toLocaleLowerCase())
        ? (ordered ?? []).findIndex((l) => l.toLocaleLowerCase() === b.label.toLocaleLowerCase())
        : Infinity;
      if (idxA !== idxB) return idxA - idxB;
    }
    return a.label.localeCompare(b.label, undefined, { sensitivity: "base" }) || a.label.localeCompare(b.label);
  });

  // For drag-and-drop, the Unassigned column must always exist as a drop
  // target, even when no notes are currently unassigned.
  if (!byFolder && !sortedAll.some((c) => c.key === UNASSIGNED_KANBAN_COLUMN)) {
    sortedAll.push({ key: UNASSIGNED_KANBAN_COLUMN, label: "Unassigned", notes: [] });
  }
  return sortedAll;
}

interface PropertyCellProps {
  note: NoteRecord;
  property: FrontmatterProperty | undefined;
  onEditProperty: CollectionResultsProps["onEditProperty"];
}

function PropertyCell({ note, property, onEditProperty }: PropertyCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "stale" | "error">("idle");

  if (!property) return <span class="collections-cell-empty">-</span>;
  if (property.kind === "readonly") {
    return <span title="This YAML value is read-only">{propertyText(property) || "-"}</span>;
  }

  async function save() {
    if (!property || property.kind === "readonly" || status === "saving") return;
    setStatus("saving");
    const value = property.kind === "list" ? draft.split(",").map((v) => v.trim()).filter(Boolean) : draft;
    const result = await onEditProperty(note, property, value);
    if (result === "ok") {
      setStatus("idle");
      setEditing(false);
    } else {
      setStatus(result);
    }
  }

  if (editing) {
    return (
      <span class="collections-property-editor">
        <input
          class="collections-property-input"
          aria-label={`Edit ${property.key} for ${note.noteName}`}
          value={draft}
          disabled={status === "saving"}
          onInput={(event) => setDraft((event.target as HTMLInputElement).value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void save();
            if (event.key === "Escape") {
              setEditing(false);
              setStatus("idle");
            }
          }}
        />
        <button type="button" disabled={status === "saving"} onClick={() => void save()}>
          {status === "saving" ? "Saving" : "Save"}
        </button>
        {status === "stale" && <span role="alert">Changed elsewhere. Refresh and retry.</span>}
        {status === "error" && <span role="alert">Could not save.</span>}
      </span>
    );
  }

  return (
    <button
      type="button"
      class="collections-property-value"
      title={`Edit ${property.key}`}
      onClick={(event) => {
        event.stopPropagation();
        setDraft(propertyText(property));
        setStatus("idle");
        setEditing(true);
      }}
    >
      {propertyText(property) || "-"}
    </button>
  );
}

interface OpenHandlerProps {
  onOpenNote: (note: NoteRecord) => void;
  openErrorPath: string | null;
}

function OpenErrorMessage({ note, openErrorPath }: { note: NoteRecord; openErrorPath: string | null }) {
  if (openErrorPath !== note.path) return null;
  return (
    <p class="collections-result-error" role="alert">
      Couldn't open "{note.noteName}" — it may have been moved, renamed, or deleted.
    </p>
  );
}

interface GroupSectionProps {
  column: GroupColumn;
  children: ComponentChildren;
}

/** A collapsible section heading one group of results; the collapse state is
 * per-render (not persisted) — the grouping itself persists in the
 * collection's view, which is what the tests and the constitution require. */
function GroupSection({ column, children }: GroupSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <section
      class={`collections-group ${collapsed ? "is-collapsed" : ""}`}
      aria-label={`${column.label}, ${column.notes.length} notes`}
    >
      <div class="collections-group-heading">
        <h3 class="collections-group-title">
          {column.label} ({column.notes.length})
        </h3>
        <button
          type="button"
          class="collections-group-toggle"
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? "Expand" : "Collapse"} ${column.label}`.replace(/\s+/g, " ")}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? "+" : "−"}
        </button>
      </div>
      {!collapsed && children}
      {collapsed && <span class="collections-group-hidden-note" role="note">{column.notes.length} hidden</span>}
    </section>
  );
}

function ListView({
  collection,
  results,
  onOpenNote,
  openErrorPath,
}: Pick<CollectionResultsProps, "collection" | "results"> & OpenHandlerProps) {
  const groupBy = collection.view.mode === "list" ? collection.view.groupBy : undefined;
  const groupOrder = collection.view.mode === "list" ? collection.view.groupOrder : undefined;
  const row = (note: NoteRecord) => (
    <li key={note.path} class="collections-result-item">
      <button
        class="file-tree-item collections-result-open"
        onClick={() => onOpenNote(note)}
      >
        <span class="collections-result-name">{note.noteName}</span>
        {note.folder && <span class="collections-result-folder">{note.folder}</span>}
        <span class="collections-result-meta">
          {note.tags.length > 0 && (
            <span class="collections-result-tags">{note.tags.map((t) => `#${t}`).join(" ")}</span>
          )}
          {note.modified !== undefined && (
            <span class="collections-result-modified">{formatModified(note.modified)}</span>
          )}
        </span>
      </button>
      <OpenErrorMessage note={note} openErrorPath={openErrorPath} />
    </li>
  );

  if (!groupBy) {
    return (
      <ul class="collections-results-list" aria-label="Collection results">
        {results.map(row)}
      </ul>
    );
  }

  return (
    <div class="collections-grouped" role="region" aria-label={`Collection results grouped by ${groupBy}`}>
      {groupResults(results, groupBy, groupOrder).map((column) => (
        <GroupSection key={column.key} column={column}>
          <ul class="collections-results-list" aria-label={`${column.label} notes`}>
            {column.notes.map(row)}
          </ul>
        </GroupSection>
      ))}
    </div>
  );
}

function TableView({
  collection,
  results,
  onOpenNote,
  openErrorPath,
  onEditProperty,
}: Pick<CollectionResultsProps, "collection" | "results" | "onEditProperty"> & OpenHandlerProps) {
  const configured = collection.view.mode === "table" ? collection.view.columns : undefined;
  const groupBy = collection.view.mode === "table" ? collection.view.groupBy : undefined;
  const groupOrder = collection.view.mode === "table" ? collection.view.groupOrder : undefined;
  const propertyKeys = visiblePropertyKeys(results, configured);
  const table = (notes: NoteRecord[]) => (
    <div class="collections-table-wrap">
      <table class="collections-table">
        <thead>
          <tr>
            <th>Note</th>
            <th>Path</th>
            <th>Tags</th>
            <th>Modified</th>
            {propertyKeys.map((key) => <th key={key} title={key}>{key}</th>)}
          </tr>
        </thead>
        <tbody>
          {notes.map((note) => (
            <tr key={note.path}>
              <td>
                <button type="button" class="collections-note-link" onClick={() => onOpenNote(note)}>
                  {note.noteName}
                </button>
                <OpenErrorMessage note={note} openErrorPath={openErrorPath} />
              </td>
              <td>{note.path}</td>
              <td>{note.tags.map((tag) => `#${tag}`).join(" ")}</td>
              <td>{formatModified(note.modified)}</td>
              {propertyKeys.map((key) => (
                <td key={key}>
                  <PropertyCell
                    note={note}
                    property={note.properties.get(key.toLocaleLowerCase())}
                    onEditProperty={onEditProperty}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (!groupBy) return table(results);

  return (
    <div class="collections-grouped" role="region" aria-label={`Collection table grouped by ${groupBy}`}>
      {groupResults(results, groupBy, groupOrder).map((column) => (
        <GroupSection key={column.key} column={column}>
          {table(column.notes)}
        </GroupSection>
      ))}
    </div>
  );
}

function CardView({
  collection,
  results,
  onOpenNote,
  openErrorPath,
}: Pick<CollectionResultsProps, "collection" | "results"> & OpenHandlerProps) {
  const configured = collection.view.mode === "card" ? collection.view.fields : undefined;
  const groupBy = collection.view.mode === "card" ? collection.view.groupBy : undefined;
  const groupOrder = collection.view.mode === "card" ? collection.view.groupOrder : undefined;
  const propertyKeys = visiblePropertyKeys(results, configured);
  const card = (note: NoteRecord) => (
    <article key={note.path} class="collections-card">
      <button type="button" class="collections-card-open" onClick={() => onOpenNote(note)}>
        <strong>{note.noteName}</strong>
        {note.folder && <span>{note.folder}</span>}
      </button>
      <OpenErrorMessage note={note} openErrorPath={openErrorPath} />
      <dl class="collections-card-fields">
        {propertyKeys.map((key) => {
          const property = note.properties.get(key.toLocaleLowerCase());
          if (!property) return null;
          return (
            <div key={key}>
              <dt>{property.key}</dt>
              <dd>{propertyText(property) || "-"}</dd>
            </div>
          );
        })}
      </dl>
      <div class="collections-result-meta">
        {note.tags.length > 0 && <span>{note.tags.map((tag) => `#${tag}`).join(" ")}</span>}
        {note.modified !== undefined && <span>{formatModified(note.modified)}</span>}
      </div>
    </article>
  );
  const grid = (notes: NoteRecord[]) => (
    <div class="collections-card-grid" role="region" aria-label="Collection cards">
      {notes.map(card)}
    </div>
  );

  if (!groupBy) return grid(results);

  return (
    <div class="collections-grouped" role="region" aria-label={`Collection cards grouped by ${groupBy}`}>
      {groupResults(results, groupBy, groupOrder).map((column) => (
        <GroupSection key={column.key} column={column}>
          {grid(column.notes)}
        </GroupSection>
      ))}
    </div>
  );
}

const DRAG_MIME_TYPE = "text/leotheca-kanban-note";

function KanbanView({
  collection,
  results,
  onOpenNote,
  openErrorPath,
  onEditProperty,
}: Pick<CollectionResultsProps, "collection" | "results" | "onEditProperty"> & OpenHandlerProps) {
  if (collection.view.mode !== "kanban") return null;
  const groupBy = collection.view.groupBy;
  const groupOrder = collection.view.groupOrder;
  const propertyGrouped = groupBy !== FOLDER_GROUP_BY;
  const groupByKey = groupBy.toLocaleLowerCase();
  const columns = groupResults(results, groupBy, groupOrder);

  function handleDragStart(event: { dataTransfer: { setData: (type: string, value: string) => void; effectAllowed: string } }, note: NoteRecord) {
    event.dataTransfer.setData(DRAG_MIME_TYPE, note.path);
    event.dataTransfer.effectAllowed = "move";
  }

  function handleDrop(event: { dataTransfer: { getData: (type: string) => string }; preventDefault: () => void }, column: GroupColumn) {
    event.preventDefault();
    if (!propertyGrouped) return;
    const notePath = event.dataTransfer.getData(DRAG_MIME_TYPE);
    if (!notePath) return;

    // No-op if the note is already in this column
    const currentColumn = columns.find((c) => c.notes.some((n) => n.path === notePath));
    if (currentColumn?.key === column.key) return;

    const note = results.find((n) => n.path === notePath);
    if (!note) return;

    const property = note.properties.get(groupByKey);
    if (!property) return;
    if (property.kind === "readonly" || property.kind === "list") return;

    // Unassigned means clear the value; otherwise set the column's value
    const targetValue = column.key === UNASSIGNED_KANBAN_COLUMN ? "" : column.label;
    void onEditProperty(note, property, targetValue).catch(() => {
      // Edit failure is surfaced via the existing error path; do not crash
    });
  }

  return (
    <div class="collections-kanban" role="region" aria-label={`Collection board grouped by ${groupBy}`}>
      {columns.map((column) => (
        <section
          key={column.key}
          class={`collections-kanban-column ${propertyGrouped ? "is-drop-target" : ""}`}
          aria-label={`${column.label}, ${column.notes.length} notes`}
          onDragOver={propertyGrouped ? (e: DragEvent) => { e.preventDefault(); } : undefined}
          onDrop={propertyGrouped ? (e: DragEvent) => handleDrop(e as unknown as { dataTransfer: { getData: (t: string) => string }; preventDefault: () => void }, column) : undefined}
        >
          <h3 class="collections-kanban-heading">
            <span>{column.label}</span>
            <span class="collections-kanban-count">{column.notes.length}</span>
          </h3>
          <div class="collections-kanban-cards">
            {column.notes.map((note) => (
              <div key={note.path}>
                <button
                  type="button"
                  class="collections-kanban-card"
                  aria-label={note.noteName}
                  draggable={propertyGrouped || undefined}
                  onDragStart={propertyGrouped ? (e: DragEvent) => handleDragStart(e as unknown as { dataTransfer: { setData: (t: string, v: string) => void; effectAllowed: string } }, note) : undefined}
                  onClick={() => onOpenNote(note)}
                >
                  <strong>{note.noteName}</strong>
                  {note.folder && <span>{note.folder}</span>}
                </button>
                <OpenErrorMessage note={note} openErrorPath={openErrorPath} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** F09 Phase 2 result surface. Switching modes persists into the collection
 * definition; table property cells edit only fields the shared lossless
 * frontmatter parser already marks editable. */
interface GroupOrderMenuProps {
  groupBy: string;
  results: NoteRecord[];
  currentOrder?: string[];
  mode: Exclude<CollectionViewV1["mode"], "kanban">;
  existingView?: CollectionViewV1;
  onViewChange: (view: CollectionViewV1) => void | Promise<void>;
}

/** F11 — Manual group management menu. Shows the current group columns
 * (derived from the results) with up/down/hide buttons. Hiding a column
 * removes it from `groupOrder`; moving one reorders it. The menu is a
 * dropdown activated by a "Manage groups" button. */
function GroupOrderMenu({ groupBy, results, currentOrder, mode, existingView, onViewChange }: GroupOrderMenuProps) {
  const [open, setOpen] = useState(false);

  // Compute the display order of columns (what groupResults would produce).
  const displayColumns = groupResults(results, groupBy, currentOrder)
    .filter((c) => c.key !== UNASSIGNED_KANBAN_COLUMN);

  function move(label: string, direction: -1 | 1) {
    const order = currentOrder ? [...currentOrder] : displayColumns.map((c) => c.label);
    const idx = order.findIndex((l) => l.toLocaleLowerCase() === label.toLocaleLowerCase());
    if (idx === -1) return;
    const target = idx + direction;
    if (target < 0 || target >= order.length) return;
    [order[idx], order[target]] = [order[target], order[idx]];
    void onViewChange(viewForMode(mode, groupBy, order, existingView));
  }

  function hide(label: string) {
    const order = (currentOrder ?? displayColumns.map((c) => c.label)).filter(
      (l) => l.toLocaleLowerCase() !== label.toLocaleLowerCase(),
    );
    void onViewChange(viewForMode(mode, groupBy, order.length > 0 ? order : undefined, existingView));
  }

  return (
    <div class="collections-group-order-menu" role="menu" aria-label="Manage groups">
      <button
        type="button"
        class="collections-group-order-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        {open ? "Close" : "Manage groups"}
      </button>
      {open && (
        <ul class="collections-group-order-list" role="menuitem" aria-label="Group order">
          {displayColumns.map((col, i) => (
            <li key={col.key} class="collections-group-order-item" role="menuitem">
              <span class="collections-group-order-label">{col.label}</span>
              <button
                type="button"
                aria-label={`Move ${col.label} up`}
                disabled={i === 0}
                onClick={() => move(col.label, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Move ${col.label} down`}
                disabled={i === displayColumns.length - 1}
                onClick={() => move(col.label, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                aria-label={`Hide ${col.label}`}
                onClick={() => hide(col.label)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CollectionResults({
  collection,
  results,
  onOpenFile,
  onViewChange,
  onEditProperty,
}: CollectionResultsProps) {
  const availableKanbanKeys = visiblePropertyKeys(results, undefined);
  const hasFolderBoard = results.some((n) => n.folder.trim() !== "");
  const boardAvailable = availableKanbanKeys.length > 0 || hasFolderBoard;
  const selectedKanbanKey = collection.view.mode === "kanban" ? collection.view.groupBy : "";
  const currentGroupBy =
    "groupBy" in collection.view ? (collection.view.groupBy ?? "") : "";
  const currentGroupOrder =
    "groupOrder" in collection.view ? collection.view.groupOrder : undefined;
  const [openErrorPath, setOpenErrorPath] = useState<string | null>(null);

  async function handleOpenNote(note: NoteRecord) {
    setOpenErrorPath(null);
    try {
      await onOpenFile(note.path, fileNameFromPath(note.path));
    } catch {
      setOpenErrorPath(note.path);
    }
  }

  return (
    <div class="collections-results">
      <div class="collections-view-switcher" role="radiogroup" aria-label="Collection view">
        {(["list", "table", "card"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={collection.view.mode === mode}
            class={collection.view.mode === mode ? "active" : ""}
            onClick={() => void onViewChange(viewForMode(mode, currentGroupBy || undefined, currentGroupOrder))}
          >
            {mode === "list" ? "List" : mode === "table" ? "Table" : "Cards"}
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={collection.view.mode === "kanban"}
          class={collection.view.mode === "kanban" ? "active" : ""}
          disabled={!boardAvailable}
          title={!boardAvailable ? "A board needs an indexed frontmatter property or notes in folders" : undefined}
          onClick={() => {
            const groupBy =
              selectedKanbanKey || currentGroupBy || (availableKanbanKeys[0] ?? (hasFolderBoard ? FOLDER_GROUP_BY : ""));
            if (groupBy) void onViewChange({ mode: "kanban", groupBy, ...(currentGroupOrder ? { groupOrder: currentGroupOrder } : {}) });
          }}
        >
          Board
        </button>
      </div>

      <label class="collections-kanban-grouping">
        Group by
        <select
          aria-label="Grouping property"
          value={currentGroupBy}
          onChange={(event) => {
            const groupBy = (event.target as HTMLSelectElement).value;
            const mode = collection.view.mode === "kanban" ? "kanban" : collection.view.mode;
            if (groupBy) {
              void onViewChange(
                mode === "kanban"
                  ? { mode: "kanban", groupBy, ...(currentGroupOrder ? { groupOrder: currentGroupOrder } : {}) }
                  : viewForMode(mode, groupBy, currentGroupOrder),
              );
            } else {
              void onViewChange(
                mode === "kanban"
                  ? { mode: "kanban", groupBy: availableKanbanKeys[0] ?? FOLDER_GROUP_BY }
                  : viewForMode(mode, undefined),
              );
            }
          }}
        >
          {currentGroupBy === FOLDER_GROUP_BY && (
            <option value={FOLDER_GROUP_BY}>Folder</option>
          )}
          {currentGroupBy !== FOLDER_GROUP_BY &&
            currentGroupBy !== "" &&
            !availableKanbanKeys.includes(currentGroupBy) && (
              <option value={currentGroupBy}>{currentGroupBy}</option>
            )}
          <option value="">Ungrouped</option>
          {availableKanbanKeys.map((key) => <option key={key} value={key}>{key}</option>)}
        </select>
      </label>

      {currentGroupBy && currentGroupBy !== FOLDER_GROUP_BY && (
        <GroupOrderMenu
          groupBy={currentGroupBy}
          results={results}
          currentOrder={currentGroupOrder}
          mode={collection.view.mode === "kanban" ? "list" : collection.view.mode}
          existingView={collection.view}
          onViewChange={onViewChange}
        />
      )}

      {results.length === 0 ? (
        <p class="empty-hint">No notes match this collection.</p>
      ) : collection.view.mode === "table" ? (
        <TableView
          collection={collection}
          results={results}
          onOpenNote={(note) => void handleOpenNote(note)}
          openErrorPath={openErrorPath}
          onEditProperty={onEditProperty}
        />
      ) : collection.view.mode === "card" ? (
        <CardView
          collection={collection}
          results={results}
          onOpenNote={(note) => void handleOpenNote(note)}
          openErrorPath={openErrorPath}
        />
      ) : collection.view.mode === "kanban" ? (
        <KanbanView
          collection={collection}
          results={results}
          onOpenNote={(note) => void handleOpenNote(note)}
          openErrorPath={openErrorPath}
          onEditProperty={onEditProperty}
        />
      ) : (
        <ListView
          collection={collection}
          results={results}
          onOpenNote={(note) => void handleOpenNote(note)}
          openErrorPath={openErrorPath}
        />
      )}
    </div>
  );
}

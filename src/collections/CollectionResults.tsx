import { useState } from "preact/hooks";
import { fileNameFromPath } from "../linking/store";
import type { FrontmatterProperty } from "../editor/frontmatterEdits";
import type { NoteRecord } from "./collectionQuery";
import type { CollectionViewV1, SmartCollectionV1 } from "./collectionTypes";
import "./collections.css";

export interface CollectionResultsProps {
  collection: SmartCollectionV1;
  results: NoteRecord[];
  onOpenFile: (path: string, name: string) => void;
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

function viewForMode(mode: Exclude<CollectionViewV1["mode"], "kanban">): CollectionViewV1 {
  if (mode === "table") return { mode: "table" };
  if (mode === "card") return { mode: "card" };
  return { mode: "list" };
}

interface KanbanColumn {
  key: string;
  label: string;
  notes: NoteRecord[];
}

const UNASSIGNED_KANBAN_COLUMN = "__leotheca_unassigned__";

/** Builds a stable read-only board from already-indexed scalar properties.
 * Lists and unsupported YAML deliberately join Unassigned: assigning one card
 * to several columns would make the board's membership ambiguous, while
 * mutating the note to resolve that ambiguity is outside this first phase. */
export function groupKanbanColumns(results: NoteRecord[], groupBy: string): KanbanColumn[] {
  const columns = new Map<string, KanbanColumn>();
  const normalizedKey = groupBy.toLocaleLowerCase();
  for (const note of results) {
    const property = note.properties.get(normalizedKey);
    const value = property?.kind === "scalar" && property.value.trim() !== ""
      ? property.value.trim()
      : UNASSIGNED_KANBAN_COLUMN;
    const existing = columns.get(value);
    if (existing) existing.notes.push(note);
    else columns.set(value, {
      key: value,
      label: value === UNASSIGNED_KANBAN_COLUMN ? "Unassigned" : value,
      notes: [note],
    });
  }
  return Array.from(columns.values()).sort((a, b) => {
    if (a.key === UNASSIGNED_KANBAN_COLUMN) return 1;
    if (b.key === UNASSIGNED_KANBAN_COLUMN) return -1;
    return a.label.localeCompare(b.label, undefined, { sensitivity: "base" }) || a.label.localeCompare(b.label);
  });
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

function ListView({ results, onOpenFile }: Pick<CollectionResultsProps, "results" | "onOpenFile">) {
  return (
    <ul class="collections-results-list" aria-label="Collection results">
      {results.map((note) => (
        <li key={note.path} class="collections-result-item">
          <button
            class="file-tree-item collections-result-open"
            onClick={() => onOpenFile(note.path, fileNameFromPath(note.path))}
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
        </li>
      ))}
    </ul>
  );
}

function TableView({
  collection,
  results,
  onOpenFile,
  onEditProperty,
}: Pick<CollectionResultsProps, "collection" | "results" | "onOpenFile" | "onEditProperty">) {
  const configured = collection.view.mode === "table" ? collection.view.columns : undefined;
  const propertyKeys = visiblePropertyKeys(results, configured);
  return (
    <div class="collections-table-wrap">
      <table class="collections-table">
        <thead>
          <tr>
            <th>Note</th>
            <th>Path</th>
            <th>Tags</th>
            <th>Modified</th>
            {propertyKeys.map((key) => <th key={key}>{key}</th>)}
          </tr>
        </thead>
        <tbody>
          {results.map((note) => (
            <tr key={note.path}>
              <td>
                <button type="button" class="collections-note-link" onClick={() => onOpenFile(note.path, fileNameFromPath(note.path))}>
                  {note.noteName}
                </button>
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
}

function CardView({ collection, results, onOpenFile }: Pick<CollectionResultsProps, "collection" | "results" | "onOpenFile">) {
  const configured = collection.view.mode === "card" ? collection.view.fields : undefined;
  const propertyKeys = visiblePropertyKeys(results, configured);
  return (
    <div class="collections-card-grid" role="region" aria-label="Collection cards">
      {results.map((note) => (
        <article key={note.path} class="collections-card">
          <button type="button" class="collections-card-open" onClick={() => onOpenFile(note.path, fileNameFromPath(note.path))}>
            <strong>{note.noteName}</strong>
            {note.folder && <span>{note.folder}</span>}
          </button>
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
      ))}
    </div>
  );
}

function KanbanView({ collection, results, onOpenFile }: Pick<CollectionResultsProps, "collection" | "results" | "onOpenFile">) {
  if (collection.view.mode !== "kanban") return null;
  const columns = groupKanbanColumns(results, collection.view.groupBy);
  return (
    <div class="collections-kanban" role="region" aria-label={`Collection board grouped by ${collection.view.groupBy}`}>
      {columns.map((column) => (
        <section key={column.key} class="collections-kanban-column" aria-label={`${column.label}, ${column.notes.length} notes`}>
          <h3 class="collections-kanban-heading">
            <span>{column.label}</span>
            <span class="collections-kanban-count">{column.notes.length}</span>
          </h3>
          <div class="collections-kanban-cards">
            {column.notes.map((note) => (
              <button
                key={note.path}
                type="button"
                class="collections-kanban-card"
                aria-label={note.noteName}
                onClick={() => onOpenFile(note.path, fileNameFromPath(note.path))}
              >
                <strong>{note.noteName}</strong>
                {note.folder && <span>{note.folder}</span>}
              </button>
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
export function CollectionResults({
  collection,
  results,
  onOpenFile,
  onViewChange,
  onEditProperty,
}: CollectionResultsProps) {
  const availableKanbanKeys = visiblePropertyKeys(results, undefined);
  const selectedKanbanKey = collection.view.mode === "kanban" ? collection.view.groupBy : "";

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
            onClick={() => void onViewChange(viewForMode(mode))}
          >
            {mode === "list" ? "List" : mode === "table" ? "Table" : "Cards"}
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={collection.view.mode === "kanban"}
          class={collection.view.mode === "kanban" ? "active" : ""}
          disabled={availableKanbanKeys.length === 0}
          title={availableKanbanKeys.length === 0 ? "A board needs an indexed frontmatter property" : undefined}
          onClick={() => {
            const groupBy = selectedKanbanKey || availableKanbanKeys[0];
            if (groupBy) void onViewChange({ mode: "kanban", groupBy });
          }}
        >
          Board
        </button>
      </div>

      {collection.view.mode === "kanban" && (
        <label class="collections-kanban-grouping">
          Group by
          <select
            aria-label="Board grouping property"
            value={collection.view.groupBy}
            onChange={(event) => {
              const groupBy = (event.target as HTMLSelectElement).value;
              if (groupBy) void onViewChange({ mode: "kanban", groupBy });
            }}
          >
            {availableKanbanKeys.includes(collection.view.groupBy) || (
              <option value={collection.view.groupBy}>{collection.view.groupBy}</option>
            )}
            {availableKanbanKeys.map((key) => <option key={key} value={key}>{key}</option>)}
          </select>
        </label>
      )}

      {results.length === 0 ? (
        <p class="empty-hint">No notes match this collection.</p>
      ) : collection.view.mode === "table" ? (
        <TableView collection={collection} results={results} onOpenFile={onOpenFile} onEditProperty={onEditProperty} />
      ) : collection.view.mode === "card" ? (
        <CardView collection={collection} results={results} onOpenFile={onOpenFile} />
      ) : collection.view.mode === "kanban" ? (
        <KanbanView collection={collection} results={results} onOpenFile={onOpenFile} />
      ) : (
        <ListView results={results} onOpenFile={onOpenFile} />
      )}
    </div>
  );
}

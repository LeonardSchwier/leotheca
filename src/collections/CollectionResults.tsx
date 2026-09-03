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
  if (property.kind === "scalar") return property.value;
  return property.rawValue.trim();
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
    setStatus(result);
    if (result === "ok") setEditing(false);
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
    <div class="collections-card-grid" aria-label="Collection cards">
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
            onClick={() => void onViewChange({ mode })}
          >
            {mode === "list" ? "List" : mode === "table" ? "Table" : "Cards"}
          </button>
        ))}
      </div>

      {results.length === 0 ? (
        <p class="empty-hint">No notes match this collection.</p>
      ) : collection.view.mode === "table" ? (
        <TableView collection={collection} results={results} onOpenFile={onOpenFile} onEditProperty={onEditProperty} />
      ) : collection.view.mode === "card" ? (
        <CardView collection={collection} results={results} onOpenFile={onOpenFile} />
      ) : (
        <ListView results={results} onOpenFile={onOpenFile} />
      )}
    </div>
  );
}
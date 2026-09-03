import { useMemo, useState } from "preact/hooks";
import { linkIndex } from "../linking/store";
import { openTabs, updateTabContent } from "../workspace/store";
import { readTextFile } from "../workspace/tauriBridge";
import { workspaceSession } from "../settings/store";
import { getActiveSaveCoordinator } from "../workspace/saveCoordinator";
import {
  parseFrontmatterProperties,
  updateFrontmatterProperty,
  type FrontmatterProperty,
} from "../editor/frontmatterEdits";
import {
  collectionsFile,
  collectionsFileCorrupt,
  createCollection,
  deleteCollection,
  orderedCollections,
  updateCollection,
} from "./collectionStore";
import { buildNoteRecords, evaluateCollection, type NoteRecord } from "./collectionQuery";
import { emptyQueryGroup, type QueryGroupV1, type SmartCollectionV1 } from "./collectionTypes";
import { CollectionBuilder } from "./CollectionBuilder";
import { CollectionResults } from "./CollectionResults";
import "./collections.css";

export interface CollectionsPanelProps {
  onOpenFile: (path: string, name: string) => void;
}

type BuilderState = { mode: "create" } | { mode: "edit"; collection: SmartCollectionV1 } | null;
type EditableProperty = Exclude<FrontmatterProperty, { kind: "readonly" }>;

const propertyEditQueues = new Map<string, Promise<void>>();

function enqueuePropertyEdit<T>(path: string, run: () => Promise<T>): Promise<T> {
  const previous = propertyEditQueues.get(path) ?? Promise.resolve();
  const settled = previous.then(run, run);
  propertyEditQueues.set(
    path,
    settled.then(
      () => undefined,
      () => undefined,
    ),
  );
  return settled;
}

function sameEditableProperty(a: FrontmatterProperty | undefined, b: EditableProperty): a is EditableProperty {
  if (!a || a.kind !== b.kind || a.key !== b.key || a.kind === "readonly") return false;
  if (a.replaceRange.start !== b.replaceRange.start || a.replaceRange.end !== b.replaceRange.end) return false;
  if (a.kind === "list" && b.kind === "list") {
    return a.value.length === b.value.length && a.value.every((value, index) => value === b.value[index]);
  }
  return a.kind === "scalar" && b.kind === "scalar" && a.value === b.value && a.style === b.style;
}

function replaceIndexedProperties(path: string, content: string): void {
  const next = new Map(linkIndex.value.frontmatterPropertiesByPath ?? []);
  const properties = parseFrontmatterProperties(content).properties;
  if (properties.length === 0) next.delete(path);
  else next.set(path, properties);
  linkIndex.value = { ...linkIndex.value, frontmatterPropertiesByPath: next };
}

async function editIndexedProperty(
  note: NoteRecord,
  expected: EditableProperty,
  value: string | string[],
): Promise<"ok" | "stale" | "error"> {
  return enqueuePropertyEdit(note.path, async () => {
    const save = getActiveSaveCoordinator();
    if (!save) return "error";
    const sessionAtStart = workspaceSession.value;
    const openTab = openTabs.value.find((tab) => tab.path === note.path);
    let content: string;
    try {
      content = openTab?.content ?? (await readTextFile(note.path));
    } catch {
      return "error";
    }
    if (workspaceSession.value !== sessionAtStart) return "stale";

    const current = parseFrontmatterProperties(content).properties.find(
      (property) => property.key.toLocaleLowerCase() === expected.key.toLocaleLowerCase(),
    );
    if (!sameEditableProperty(current, expected)) return "stale";
    if (current.kind === "list" && !Array.isArray(value)) return "error";
    if (current.kind === "scalar" && typeof value !== "string") return "error";

    const nextContent = updateFrontmatterProperty(content, current, value);
    if (openTab) updateTabContent(note.path, nextContent);
    save.change(sessionAtStart, note.path, nextContent);
    await save.flush(sessionAtStart, note.path);
    if (save.getError(sessionAtStart, note.path)) return "error";
    if (workspaceSession.value !== sessionAtStart) return "stale";
    replaceIndexedProperties(note.path, nextContent);
    return "ok";
  });
}

/**
 * F09 Smart Collections panel. Query results remain a projection of the shared
 * metadata index. Phase 2 adds persisted list/table/card modes and safe table
 * property edits without introducing another note writer: mutations validate
 * the indexed field against the freshest open-tab or disk source and then use
 * the app-owned SaveCoordinator.
 */
export function CollectionsPanel({ onOpenFile }: CollectionsPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [builder, setBuilder] = useState<BuilderState>(null);

  const notes = buildNoteRecords(linkIndex.value);
  const propertyKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const note of notes) {
      for (const property of note.properties.values()) keys.add(property.key);
    }
    return Array.from(keys).sort();
  }, [notes]);

  const collections = orderedCollections(collectionsFile.value);
  const selected = collections.find((c) => c.id === selectedId) ?? null;
  const results = selected ? evaluateCollection(selected, notes) : [];

  if (builder) {
    const initial =
      builder.mode === "edit"
        ? builder.collection
        : { name: "", description: "", query: emptyQueryGroup() };
    const initialQuery = (initial.query as QueryGroupV1) ?? emptyQueryGroup();
    return (
      <section class="collections-panel" aria-label="Collections">
        <CollectionBuilder
          key={builder.mode === "edit" ? builder.collection.id : "new"}
          initialName={initial.name}
          initialDescription={initial.description ?? ""}
          initialQuery={initialQuery}
          notes={notes}
          propertyKeys={propertyKeys}
          onCancel={() => setBuilder(null)}
          onSave={async ({ name, description, query }) => {
            if (builder.mode === "edit") {
              await updateCollection(builder.collection.id, { name, description, query });
              setSelectedId(builder.collection.id);
            } else {
              const created = await createCollection(name, query, description);
              setSelectedId(created.id);
            }
            setBuilder(null);
          }}
        />
      </section>
    );
  }

  return (
    <section class="collections-panel" aria-label="Collections">
      <div class="collections-header">
        <h2 class="collections-heading">Collections</h2>
        <button class="collections-add-button" onClick={() => setBuilder({ mode: "create" })}>
          + New collection
        </button>
      </div>

      {collectionsFileCorrupt.value && (
        <p class="collections-corrupt-warning" role="alert">
          Some saved collections could not be read and were skipped. Saving any change here
          rewrites the file without them.
        </p>
      )}

      {collections.length === 0 ? (
        <p class="empty-hint">Create a collection to build a reusable note view.</p>
      ) : (
        <ul class="collections-list" aria-label="Saved collections">
          {collections.map((collection) => {
            const count = evaluateCollection(collection, notes).length;
            const isSelected = collection.id === selectedId;
            return (
              <li key={collection.id} class="collections-item">
                <button
                  class={`collections-item-open ${isSelected ? "active" : ""}`}
                  onClick={() => setSelectedId(isSelected ? null : collection.id)}
                  aria-expanded={isSelected}
                >
                  <span class="collections-item-name">{collection.name}</span>
                  <span class="collections-item-count">{count}</span>
                </button>
                <div class="collections-item-actions">
                  <button
                    class="icon-button"
                    aria-label={`Edit ${collection.name}`}
                    title="Edit"
                    onClick={() => setBuilder({ mode: "edit", collection })}
                  >
                    ✎
                  </button>
                  <button
                    class="icon-button"
                    aria-label={`Delete ${collection.name}`}
                    title="Delete"
                    onClick={() => {
                      if (selectedId === collection.id) setSelectedId(null);
                      void deleteCollection(collection.id);
                    }}
                  >
                    ×
                  </button>
                </div>
                {isSelected && (
                  <div class="collections-item-results">
                    <CollectionResults
                      collection={collection}
                      results={results}
                      onOpenFile={onOpenFile}
                      onViewChange={(view) => updateCollection(collection.id, { view })}
                      onEditProperty={editIndexedProperty}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
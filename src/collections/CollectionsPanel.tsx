import { useMemo, useState } from "preact/hooks";
import { linkIndex } from "../linking/store";
import {
  collectionsFile,
  collectionsFileCorrupt,
  createCollection,
  deleteCollection,
  orderedCollections,
  updateCollection,
} from "./collectionStore";
import { buildNoteRecords, evaluateCollection } from "./collectionQuery";
import { emptyQueryGroup, type QueryGroupV1, type SmartCollectionV1 } from "./collectionTypes";
import { CollectionBuilder } from "./CollectionBuilder";
import { CollectionResults } from "./CollectionResults";
import "./collections.css";

export interface CollectionsPanelProps {
  onOpenFile: (path: string, name: string) => void;
}

type BuilderState = { mode: "create" } | { mode: "edit"; collection: SmartCollectionV1 } | null;

/**
 * F09 Phase 1 (spec/f09-smart-collections-property-views.md, narrowed to
 * a first slice, see ROADMAP.md's F09 Phase 1 entry): a sidebar panel to
 * create, edit, and delete Smart Collection definitions, and to view one
 * collection's results as a read-only list. Follows TagsPanel/
 * TaskHubPanel's structural conventions (a plain list, click-to-open
 * rows, an empty-state hint). Results stay live because they're derived
 * fresh from `linkIndex.value` on every render, the same shared workspace
 * metadata index TagsPanel and TaskHubPanel already read; there is no
 * second file-watcher, matching the "keeping results live" requirement in
 * this phase's own claim.
 *
 * Table and card view modes, in-collection sort configuration, and the
 * full builder live-preview experience (typeahead, broad-query warnings)
 * are explicitly out of scope for this phase, see CollectionBuilder.tsx's
 * own doc comment for exactly which parts of spec section 8 are deferred
 * and why.
 */
export function CollectionsPanel({ onOpenFile }: CollectionsPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [builder, setBuilder] = useState<BuilderState>(null);

  // Recomputed plainly on every render, the same way TagsPanel/TaskHubPanel
  // read `linkIndex.value` directly rather than through `useMemo`: a
  // signal read inside a `useMemo` dependency array is exactly what it
  // needs to be to stay live (Preact's signals integration re-renders this
  // component whenever `linkIndex.value` changes, and the array is
  // re-evaluated on every render anyway), but `eslint-plugin-react-hooks`
  // has no notion of signals and flags it as an "unnecessary dependency"
  // false positive; avoiding `useMemo` here sidesteps that without an
  // eslint-disable comment.
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
    // A collection's query is always a group at the root (both
    // emptyQueryGroup() and every persisted collection's own `query`,
    // since the builder only ever writes a group there); this cast
    // reflects that invariant rather than widening QueryGroupEditor to
    // accept a bare clause at the root, which the spec never allows.
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
                    <CollectionResults results={results} onOpenFile={onOpenFile} />
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

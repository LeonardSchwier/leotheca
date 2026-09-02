/**
 * F09 Phase 1: load/save and CRUD for `.leotheca/collections.json`,
 * following bookmarks/store.ts's established shape for a saved,
 * persisted, workspace-scoped list (a `signal`, a sequence-numbered load
 * guarded against a superseded workspace switch, a plain save-the-whole-
 * file write through writeWorkspaceTextFile). Definitions only: query
 * *evaluation* against the live workspace index lives in
 * collectionQuery.ts, kept separate so this file's responsibility stays
 * "what's saved," not "what currently matches."
 */
import { signal } from "@preact/signals";
import { workspacePath } from "../settings/store";
import { readTextFile, writeWorkspaceTextFile } from "../workspace/tauriBridge";
import { workspaceTransitions } from "../workspace/workspaceTransition";
import { decodeCollectionsFile } from "./collectionDecode";
import {
  emptyCollectionsFile,
  type CollectionSortV1,
  type CollectionViewV1,
  type CollectionsFileV1,
  type QueryNodeV1,
  type SmartCollectionV1,
} from "./collectionTypes";

const COLLECTIONS_RELATIVE_PATH = ".leotheca/collections.json";

function collectionsFilePath(rootPath: string): string {
  return `${rootPath}/${COLLECTIONS_RELATIVE_PATH}`;
}

export const collectionsFile = signal<CollectionsFileV1>(emptyCollectionsFile());
/** True once the persisted file's decode result flagged `corrupt: true`
 * (spec section 5.2, FR-03): the caller (CollectionsPanel) uses this to
 * warn rather than silently save a "cleaned up" file over data that might
 * still be worth the user's own look, matching this codebase's existing
 * `corrupt` conventions (settings/workspaceSettings.ts,
 * bookmarks/store.ts). Cleared back to false the next time a save
 * actually succeeds, since a save always writes a fully-valid, freshly
 * serialized file. */
export const collectionsFileCorrupt = signal(false);

/** Collections in the user's own saved order (CollectionsFileV1.order),
 * not array/insertion order. A collection id present in `collections` but
 * missing from `order` cannot happen after a decode (decodeCollectionsFile
 * always appends it), so this never silently drops one. */
export function orderedCollections(file: CollectionsFileV1): SmartCollectionV1[] {
  const byId = new Map(file.collections.map((collection) => [collection.id, collection]));
  return file.order.map((id) => byId.get(id)).filter((c): c is SmartCollectionV1 => !!c);
}

let loadSequence = 0;

export function resetCollections(): void {
  loadSequence += 1;
  collectionsFile.value = emptyCollectionsFile();
  collectionsFileCorrupt.value = false;
}
workspaceTransitions.registerReset(resetCollections);

export async function loadCollections(rootPath: string): Promise<void> {
  const sequence = ++loadSequence;
  collectionsFile.value = emptyCollectionsFile();
  collectionsFileCorrupt.value = false;
  let raw: string;
  try {
    raw = await readTextFile(collectionsFilePath(rootPath));
  } catch {
    // No file yet (first time collections are used in this workspace), or
    // it's unreadable for a reason unrelated to its contents: an ordinary,
    // expected case, not corruption.
    return;
  }
  if (sequence !== loadSequence) return;
  const { file, corrupt } = decodeCollectionsFile(raw);
  if (sequence !== loadSequence) return;
  collectionsFile.value = file;
  collectionsFileCorrupt.value = corrupt;
}

async function saveCollections(): Promise<void> {
  if (!workspacePath.value) return;
  await writeWorkspaceTextFile(
    workspacePath.value,
    COLLECTIONS_RELATIVE_PATH,
    JSON.stringify(collectionsFile.value, null, 2),
  );
  // A save always writes exactly what decodeCollectionsFile would decode
  // back losslessly (it's this module's own in-memory state, already
  // valid), so any earlier corruption warning no longer describes what's
  // on disk.
  collectionsFileCorrupt.value = false;
}

function newId(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function createCollection(
  name: string,
  query: QueryNodeV1,
  description = "",
): Promise<SmartCollectionV1> {
  const timestamp = nowIso();
  const collection: SmartCollectionV1 = {
    id: newId(),
    name: name.trim(),
    description,
    query,
    view: { mode: "list" },
    sort: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  collectionsFile.value = {
    ...collectionsFile.value,
    collections: [...collectionsFile.value.collections, collection],
    order: [...collectionsFile.value.order, collection.id],
  };
  await saveCollections();
  return collection;
}

export interface CollectionEdits {
  name?: string;
  description?: string;
  query?: QueryNodeV1;
  view?: CollectionViewV1;
  sort?: CollectionSortV1[];
}

export async function updateCollection(id: string, edits: CollectionEdits): Promise<void> {
  const timestamp = nowIso();
  collectionsFile.value = {
    ...collectionsFile.value,
    collections: collectionsFile.value.collections.map((collection) =>
      collection.id === id
        ? {
            ...collection,
            ...(edits.name !== undefined ? { name: edits.name.trim() } : {}),
            ...(edits.description !== undefined ? { description: edits.description } : {}),
            ...(edits.query !== undefined ? { query: edits.query } : {}),
            ...(edits.view !== undefined ? { view: edits.view } : {}),
            ...(edits.sort !== undefined ? { sort: edits.sort } : {}),
            updatedAt: timestamp,
          }
        : collection,
    ),
  };
  await saveCollections();
}

export async function deleteCollection(id: string): Promise<void> {
  collectionsFile.value = {
    ...collectionsFile.value,
    collections: collectionsFile.value.collections.filter((collection) => collection.id !== id),
    order: collectionsFile.value.order.filter((entryId) => entryId !== id),
  };
  await saveCollections();
}

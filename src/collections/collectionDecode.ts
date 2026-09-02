import { anyCorrupt, decodeArrayDroppingInvalidEntries, decodeString, decodeStringArray } from "../settings/decode";
import {
  MAX_QUERY_CLAUSES,
  MAX_QUERY_DEPTH,
  QUERY_OPERATORS,
  SYSTEM_FIELD_NAMES,
  emptyCollectionsFile,
  type CollectionSortV1,
  type CollectionViewV1,
  type CollectionsFileV1,
  type QueryClauseV1,
  type QueryFieldV1,
  type QueryNodeV1,
  type QueryOperatorV1,
  type QueryValueV1,
  type SmartCollectionV1,
  type SortFieldV1,
  type SystemFieldName,
} from "./collectionTypes";

/**
 * F09 Phase 1 (spec section 5.2, "Runtime decoding"): turns
 * `.leotheca/collections.json`'s raw text into `CollectionsFileV1` without
 * ever trusting `JSON.parse(...) as CollectionsFileV1` outright, following
 * this codebase's established decoder style (settings/decode.ts,
 * settings/workspaceSettings.ts, bookmarks/store.ts). One invalid
 * collection, or one invalid clause inside an otherwise-fine collection,
 * is dropped without discarding its valid siblings (spec section 5.2 and
 * FR-02); the file's own `corrupt` flag tells the caller when that
 * happened, so it can avoid silently persisting a "repaired" file over
 * data that might still be worth the user's own look (FR-03). The
 * `Open raw file`/`Restore from backup`/`Create new collection file`
 * recovery actions spec section 5.2 also describes are explicitly Phase 2
 * scope ("persistence recovery" in the spec's own section 22 rollout
 * plan), not implemented here.
 */

const QUERY_OPERATOR_SET: ReadonlySet<string> = new Set(QUERY_OPERATORS);
const SYSTEM_FIELD_SET: ReadonlySet<string> = new Set(SYSTEM_FIELD_NAMES);
const SORT_SYSTEM_FIELDS = new Set(["name", "path", "folder", "modified"]);

function isValidQueryValue(raw: unknown): raw is QueryValueV1 {
  if (typeof raw !== "object" || raw === null) return false;
  const value = raw as Record<string, unknown>;
  switch (value.type) {
    case "string":
    case "path":
      return typeof value.value === "string";
    case "number":
      return typeof value.value === "number" && Number.isFinite(value.value);
    case "boolean":
      return typeof value.value === "boolean";
    case "date":
      return typeof value.value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.value);
    case "datetime":
      return typeof value.value === "string" && !Number.isNaN(Date.parse(value.value));
    case "string-list":
      return (
        Array.isArray(value.value) && value.value.every((item) => typeof item === "string")
      );
    default:
      return false;
  }
}

function decodeQueryField(raw: unknown): QueryFieldV1 | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  if (record.kind === "system") {
    return typeof record.field === "string" && SYSTEM_FIELD_SET.has(record.field)
      ? { kind: "system", field: record.field as SystemFieldName }
      : null;
  }
  if (record.kind === "property") {
    return typeof record.key === "string" && record.key.trim() !== ""
      ? { kind: "property", key: record.key }
      : null;
  }
  return null;
}

function decodeQueryOperator(raw: unknown): QueryOperatorV1 | null {
  return typeof raw === "string" && QUERY_OPERATOR_SET.has(raw) ? (raw as QueryOperatorV1) : null;
}

function decodeQueryClause(raw: Record<string, unknown>): QueryClauseV1 | null {
  const field = decodeQueryField(raw.field);
  const operator = decodeQueryOperator(raw.operator);
  if (!field || !operator) return null;
  if (raw.value !== undefined && !isValidQueryValue(raw.value)) return null;
  return {
    type: "clause",
    field,
    operator,
    ...(raw.value !== undefined ? { value: raw.value as QueryValueV1 } : {}),
  };
}

interface QueryDecodeResult {
  node: QueryNodeV1 | null;
  corrupt: boolean;
}

/** `counter` is shared across the whole recursive decode of one
 * collection's query so MAX_QUERY_CLAUSES is enforced against the tree's
 * total clause count, not per-group. `depth` counts groups below the root
 * (the root call passes 0), enforcing MAX_QUERY_DEPTH the same way the
 * spec states it (section 6.1). A clause or group past either limit, or
 * shaped wrong in any other way, is dropped (not kept as a false "match
 * everything" placeholder) and reported via `corrupt`. */
function decodeQueryNode(
  raw: unknown,
  depth: number,
  counter: { count: number },
): QueryDecodeResult {
  if (typeof raw !== "object" || raw === null) return { node: null, corrupt: true };
  const record = raw as Record<string, unknown>;

  if (record.type === "clause") {
    if (counter.count >= MAX_QUERY_CLAUSES) return { node: null, corrupt: true };
    const clause = decodeQueryClause(record);
    if (!clause) return { node: null, corrupt: true };
    counter.count++;
    return { node: clause, corrupt: false };
  }

  if (record.type === "group") {
    if (depth > MAX_QUERY_DEPTH) return { node: null, corrupt: true };
    const operator = record.operator === "and" || record.operator === "or" ? record.operator : null;
    if (!operator || !Array.isArray(record.children)) return { node: null, corrupt: true };
    const children: QueryNodeV1[] = [];
    let corrupt = false;
    for (const rawChild of record.children) {
      const result = decodeQueryNode(rawChild, depth + 1, counter);
      if (result.corrupt) corrupt = true;
      if (result.node) children.push(result.node);
    }
    return { node: { type: "group", operator, children }, corrupt };
  }

  return { node: null, corrupt: true };
}

function decodeCollectionView(raw: unknown): { value: CollectionViewV1; corrupt: boolean } {
  if (raw === undefined) return { value: { mode: "list" }, corrupt: false };
  if (typeof raw === "object" && raw !== null) {
    const record = raw as Record<string, unknown>;
    if (record.mode === "list") return { value: { mode: "list" }, corrupt: false };
    if (record.mode === "table") {
      const columns =
        Array.isArray(record.columns) && record.columns.every((c) => typeof c === "string")
          ? (record.columns as string[])
          : undefined;
      return { value: { mode: "table", ...(columns ? { columns } : {}) }, corrupt: false };
    }
    if (record.mode === "card") {
      const fields =
        Array.isArray(record.fields) && record.fields.every((f) => typeof f === "string")
          ? (record.fields as string[])
          : undefined;
      return { value: { mode: "card", ...(fields ? { fields } : {}) }, corrupt: false };
    }
  }
  return { value: { mode: "list" }, corrupt: true };
}

function isValidSortField(raw: unknown): raw is SortFieldV1 {
  if (typeof raw !== "object" || raw === null) return false;
  const record = raw as Record<string, unknown>;
  if (record.kind === "system") {
    return typeof record.field === "string" && SORT_SYSTEM_FIELDS.has(record.field);
  }
  if (record.kind === "property") {
    return typeof record.key === "string" && record.key.trim() !== "";
  }
  return false;
}

function isValidCollectionSort(raw: unknown): raw is CollectionSortV1 {
  if (typeof raw !== "object" || raw === null) return false;
  const record = raw as Record<string, unknown>;
  return (
    isValidSortField(record.field) &&
    (record.direction === "asc" || record.direction === "desc") &&
    (record.missing === "first" || record.missing === "last")
  );
}

function decodeCollection(raw: unknown): { collection: SmartCollectionV1 | null; corrupt: boolean } {
  if (typeof raw !== "object" || raw === null) return { collection: null, corrupt: true };
  const record = raw as Record<string, unknown>;

  // No sensible default exists for a missing/blank id: it's this
  // collection's only stable identity (spec section 5.1), so unlike every
  // other field below there is nothing to fall back to. Same reasoning
  // bookmarks/store.ts's decodeBookmarks already applies to a bookmark
  // missing its own id.
  if (typeof record.id !== "string" || record.id.trim() === "") {
    return { collection: null, corrupt: true };
  }

  const queryResult = decodeQueryNode(record.query, 0, { count: 0 });
  if (!queryResult.node) return { collection: null, corrupt: true };

  const name = decodeString(record.name, "Untitled collection");
  const description = decodeString(record.description, "");
  const view = decodeCollectionView(record.view);
  const sort = decodeArrayDroppingInvalidEntries<CollectionSortV1>(
    record.sort,
    [],
    isValidCollectionSort,
  );
  const createdAt = decodeString(record.createdAt, "");
  const updatedAt = decodeString(record.updatedAt, "");

  const collection: SmartCollectionV1 = {
    id: record.id,
    name: name.value,
    description: description.value,
    query: queryResult.node,
    view: view.value,
    sort: sort.value,
    createdAt: createdAt.value,
    updatedAt: updatedAt.value,
  };

  const corrupt =
    queryResult.corrupt ||
    anyCorrupt(name, description, sort) ||
    view.corrupt;

  return { collection, corrupt };
}

export function decodeCollectionsFile(raw: string): { file: CollectionsFileV1; corrupt: boolean } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { file: emptyCollectionsFile(), corrupt: true };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { file: emptyCollectionsFile(), corrupt: true };
  }
  const record = parsed as Record<string, unknown>;

  // Only version 1 exists today; an unrecognized version is flagged as
  // corrupt (so it's never silently persisted back over) but decoding
  // still proceeds best-effort, same convention as
  // workspaceSettings.ts's decodeWorkspaceSettings.
  const versionCorrupt = record.version !== undefined && record.version !== 1;

  const collectionsShapeCorrupt =
    record.collections !== undefined && !Array.isArray(record.collections);
  const rawCollections = Array.isArray(record.collections) ? record.collections : [];

  const seenIds = new Set<string>();
  const collections: SmartCollectionV1[] = [];
  let anyCollectionCorrupt = collectionsShapeCorrupt;
  for (const rawCollection of rawCollections) {
    const { collection, corrupt } = decodeCollection(rawCollection);
    if (corrupt) anyCollectionCorrupt = true;
    if (!collection) continue;
    // A duplicate id "should only occur from corrupt input" (spec section
    // 8.4): keep the first occurrence, drop the rest, rather than letting
    // a later entry silently shadow an earlier one's identity.
    if (seenIds.has(collection.id)) {
      anyCollectionCorrupt = true;
      continue;
    }
    seenIds.add(collection.id);
    collections.push(collection);
  }

  const decodedOrder = decodeStringArray(record.order, []);
  const knownIds = new Set(collections.map((c) => c.id));
  const orderedIds = decodedOrder.value.filter((id) => knownIds.has(id));
  // A collection missing from `order` (e.g. one an older app build added
  // before `order` existed, or a corrupt `order` that got reset above) is
  // appended rather than silently hidden from the list.
  for (const collection of collections) {
    if (!orderedIds.includes(collection.id)) orderedIds.push(collection.id);
  }

  const file: CollectionsFileV1 = {
    ...record,
    version: 1,
    collections,
    order: orderedIds,
  } as unknown as CollectionsFileV1;

  const corrupt = versionCorrupt || anyCollectionCorrupt || decodedOrder.corrupt;
  return { file, corrupt };
}

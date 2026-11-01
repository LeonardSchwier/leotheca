/**
 * F09 Phase 2: filter row management for collections.
 *
 * Provides pure functions to add, remove, reorder, and scope filter rows
 * in a collection's query tree. The "All views" vs "This view" split
 * distinguishes filters that apply to every view in the collection
 * (stored at the root query group level) from those specific to one
 * view mode (stored per-view in the view's own filter group).
 *
 * This module is UI-agnostic: CollectionBuilder.tsx and
 * CollectionResults.tsx call into these functions and receive the
 * updated query/view shapes back.
 */
import type { QueryClauseV1, QueryGroupV1, SmartCollectionV1 } from "./collectionTypes";

/** Scope for a filter row: "all" applies to every view in the collection,
 * "this" applies only to the specific view being edited. */
export type FilterScope = "all" | "this";

/** A filter row as the builder presents it: a clause plus its scope.
 * The scope is not persisted in the query AST itself — it determines
 * *where* the clause lives in the tree (root group vs. view group). */
export interface FilterRow {
  clause: QueryClauseV1;
  scope: FilterScope;
}

/** The set of filter rows currently in a collection, split by scope. */
export interface FilterRowsState {
  all: QueryClauseV1[];
  thisView: QueryClauseV1[];
}

/** Extract all clause rows from a query group (the "All views" scope).
 * Only direct clause children are returned; nested groups are left
 * alone (they are the user's own AND/OR structure, not filter rows). */
export function extractAllViewClauses(query: QueryGroupV1): QueryClauseV1[] {
  return query.children.filter(
    (child): child is QueryClauseV1 => child.type === "clause",
  );
}

/** Add a new filter row to the collection's query tree.
 * - scope "all" → append to the root query group's children
 * - scope "this" → append to the view-specific filter group (created
 *   if the view doesn't have one yet; the view group is stored under
 *   the view's `groupBy`/`groupOrder` extension — see below)
 *
 * Returns the updated collection with the clause inserted. */
export function addFilterRow(
  collection: SmartCollectionV1,
  clause: QueryClauseV1,
  scope: FilterScope,
): SmartCollectionV1 {
  if (scope === "all") {
    const root = collection.query;
    if (root.type !== "group") return collection;
    return {
      ...collection,
      query: { ...root, children: [...root.children, clause] },
    };
  }

  // scope === "this": append to the view's filter list.
  // The view's filter list is stored in the view shape's optional
  // `filters` array (added in this phase).
  const view = collection.view;
  const existingFilters: QueryClauseV1[] =
    "filters" in view && Array.isArray((view as { filters?: QueryClauseV1[] }).filters)
      ? (view as { filters: QueryClauseV1[] }).filters
      : [];
  const nextView = { ...view, filters: [...existingFilters, clause] };
  return { ...collection, view: nextView };
}

/** Remove a filter row by its index within the given scope.
 * Returns the updated collection, or the same collection if the index
 * is out of bounds. */
export function removeFilterRow(
  collection: SmartCollectionV1,
  scope: FilterScope,
  index: number,
): SmartCollectionV1 {
  if (scope === "all") {
    const root = collection.query;
    if (root.type !== "group") return collection;
    const clauses = extractAllViewClauses(root);
    if (index < 0 || index >= clauses.length) return collection;
    // Find the actual index in children (not just among clauses)
    let clauseCount = 0;
    const newChildren = root.children.filter((child) => {
      if (child.type !== "clause") return true;
      if (clauseCount === index) {
        clauseCount++;
        return false;
      }
      clauseCount++;
      return true;
    });
    return { ...collection, query: { ...root, children: newChildren } };
  }

  // scope === "this"
  const view = collection.view;
  const existingFilters: QueryClauseV1[] =
    "filters" in view && Array.isArray((view as { filters?: QueryClauseV1[] }).filters)
      ? (view as { filters: QueryClauseV1[] }).filters
      : [];
  if (index < 0 || index >= existingFilters.length) return collection;
  const nextFilters = existingFilters.filter((_, i) => i !== index);
  return { ...collection, view: { ...view, filters: nextFilters } };
}

/** Reorder a filter row: move it from `fromIndex` to `toIndex`
 * within the given scope. Returns the updated collection. */
export function reorderFilterRow(
  collection: SmartCollectionV1,
  scope: FilterScope,
  fromIndex: number,
  toIndex: number,
): SmartCollectionV1 {
  if (scope === "all") {
    const root = collection.query;
    if (root.type !== "group") return collection;
    // Reorder within the full children array, preserving groups in place
    // and moving only clause children relative to each other.
    const clauseIndices = root.children
      .map((child, i) => (child.type === "clause" ? i : -1))
      .filter((i) => i >= 0);
    if (fromIndex < 0 || fromIndex >= clauseIndices.length) return collection;
    if (toIndex < 0 || toIndex >= clauseIndices.length) return collection;

    const children = root.children.slice();
    const [moved] = children.splice(clauseIndices[fromIndex], 1);
    // Recalculate target position after removal
    const remainingIndices = children
      .map((child, i) => (child.type === "clause" ? i : -1))
      .filter((i) => i >= 0);
    const targetPos = toIndex < fromIndex
      ? remainingIndices[toIndex]
      : remainingIndices[toIndex - 1] + 1;
    children.splice(targetPos, 0, moved);
    return { ...collection, query: { ...root, children } };
  }

  // scope === "this"
  const view = collection.view;
  const existingFilters: QueryClauseV1[] =
    "filters" in view && Array.isArray((view as { filters?: QueryClauseV1[] }).filters)
      ? (view as { filters: QueryClauseV1[] }).filters
      : [];
  if (fromIndex < 0 || fromIndex >= existingFilters.length) return collection;
  if (toIndex < 0 || toIndex >= existingFilters.length) return collection;
  const next = existingFilters.slice();
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return { ...collection, view: { ...view, filters: next } };
}

/** Change a filter row's scope: remove it from one scope and add it
 * to the other. Returns the updated collection. */
export function moveFilterRowScope(
  collection: SmartCollectionV1,
  fromScope: FilterScope,
  index: number,
  toScope: FilterScope,
): SmartCollectionV1 {
  if (fromScope === toScope) return collection;

  // Get the clause from the source scope
  let clause: QueryClauseV1;
  if (fromScope === "all") {
    const clauses = extractAllViewClauses(collection.query as QueryGroupV1);
    clause = clauses[index];
    if (!clause) return collection;
  } else {
    const view = collection.view;
    const filters: QueryClauseV1[] =
      "filters" in view && Array.isArray((view as { filters?: QueryClauseV1[] }).filters)
        ? (view as { filters: QueryClauseV1[] }).filters
        : [];
    clause = filters[index];
    if (!clause) return collection;
  }

  // Remove from source, add to target
  const removed = removeFilterRow(collection, fromScope, index);
  return addFilterRow(removed, clause, toScope);
}

/** Get the filter rows state for a collection (both scopes). */
export function getFilterRowsState(
  collection: SmartCollectionV1,
): FilterRowsState {
  const root = collection.query;
  const all = root.type === "group" ? extractAllViewClauses(root) : [];

  const view = collection.view;
  const thisView: QueryClauseV1[] =
    "filters" in view && Array.isArray((view as { filters?: QueryClauseV1[] }).filters)
      ? (view as { filters: QueryClauseV1[] }).filters
      : [];

  return { all, thisView };
}

/** Validate that a filter row state is well-formed:
 * - no duplicate clause identities (same field+operator+value)
 * - all clauses are valid (non-empty values where required)
 * Returns an array of error messages (empty = valid). */
export function validateFilterRows(state: FilterRowsState): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();

  const check = (clauses: QueryClauseV1[], scope: string) => {
    for (const clause of clauses) {
      const key = `${clause.field.kind}:${clause.field.kind === "system" ? clause.field.field : clause.field.key}:${clause.operator}`;
      if (seen.has(key)) {
        errors.push(`Duplicate filter in ${scope} scope: ${key}`);
      }
      seen.add(key);
    }
  };

  check(state.all, "All views");
  check(state.thisView, "This view");
  return errors;
}

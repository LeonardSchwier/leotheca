/**
 * F09 Phase 1 (spec/f09-smart-collections-property-views.md): the Smart
 * Collections query AST, storage schema, and view/sort shapes. Pure types
 * and the small constant tables the decoder and evaluator both need, no
 * logic here. See collectionDecode.ts for turning persisted JSON into
 * these types safely, and collectionQuery.ts for evaluating them.
 *
 * Deliberately implements the full nested-group query model the spec
 * describes (section 6), not a narrowed subset: the query engine and
 * schema support arbitrary depth and every listed field/operator
 * combination. What Phase 1 narrows instead is the *builder UI* (see
 * CollectionBuilder.tsx's own doc comment) and the result view (list
 * only, per this phase's roadmap claim); the underlying data model is not
 * narrowed, so Phase 2 (query builder polish, sort configuration) and
 * Phase 3 (table/card views) can build on this schema unchanged.
 */

/** Maximum group nesting below the root group (spec section 6.1). */
export const MAX_QUERY_DEPTH = 3;
/** Maximum total clauses across the whole query tree (spec section 6.1). */
export const MAX_QUERY_CLAUSES = 100;

export type SystemFieldName =
  | "name"
  | "path"
  | "folder"
  | "tag"
  | "modified"
  | "hasFrontmatter";

export const SYSTEM_FIELD_NAMES: readonly SystemFieldName[] = [
  "name",
  "path",
  "folder",
  "tag",
  "modified",
  "hasFrontmatter",
];

export type QueryFieldV1 =
  | { kind: "system"; field: SystemFieldName }
  | { kind: "property"; key: string };

/** Every operator across every field type (spec section 6.3), flattened
 * into one runtime-checkable array (so collectionDecode.ts can validate a
 * persisted operator string without a second, hand-maintained list) with
 * `QueryOperatorV1` derived from it. A given field only exposes the subset
 * that makes sense for it; see FIELD_OPERATOR_GROUPS below for that
 * mapping, used by both the evaluator (to reject a mismatched combination
 * rather than guessing) and the builder UI (to only offer valid choices). */
export const QUERY_OPERATORS = [
  "is",
  "is-not",
  "contains",
  "does-not-contain",
  "starts-with",
  "ends-with",
  "exists",
  "does-not-exist",
  "equals",
  "does-not-equal",
  "greater-than",
  "greater-than-or-equal",
  "less-than",
  "less-than-or-equal",
  "is-true",
  "is-false",
  "before",
  "on-or-before",
  "after",
  "on-or-after",
  "contains-item",
  "contains-all-items",
  "contains-any-item",
  "contains-no-item",
  "is-empty",
  "is-not-empty",
  "is-under-folder",
  "is-not-under-folder",
  "contains-segment",
] as const;

export type QueryOperatorV1 = (typeof QUERY_OPERATORS)[number];

export type QueryValueV1 =
  | { type: "string"; value: string }
  | { type: "number"; value: number }
  | { type: "boolean"; value: boolean }
  | { type: "date"; value: string }
  | { type: "datetime"; value: string }
  | { type: "string-list"; value: string[] }
  | { type: "path"; value: string };

export interface QueryClauseV1 {
  type: "clause";
  field: QueryFieldV1;
  operator: QueryOperatorV1;
  value?: QueryValueV1;
}

export interface QueryGroupV1 {
  type: "group";
  operator: "and" | "or";
  children: QueryNodeV1[];
}

export type QueryNodeV1 = QueryGroupV1 | QueryClauseV1;

/** Operator groups, keyed by the same "family" name collectionQuery.ts's
 * evaluator dispatches on. Used by CollectionBuilder.tsx to only offer
 * operators that make sense for whatever field a clause currently targets
 * (spec section 8.3: "The builder exposes only operators compatible with
 * its current inferred or explicitly selected type"). A property clause
 * offers every family's operators, since a property's actual type is only
 * known from its indexed values, not declared up front (spec section
 * 7.3's per-clause typed comparison). */
export const OPERATOR_GROUPS: Record<string, readonly QueryOperatorV1[]> = {
  string: [
    "is",
    "is-not",
    "contains",
    "does-not-contain",
    "starts-with",
    "ends-with",
    "exists",
    "does-not-exist",
  ],
  number: [
    "equals",
    "does-not-equal",
    "greater-than",
    "greater-than-or-equal",
    "less-than",
    "less-than-or-equal",
    "exists",
    "does-not-exist",
  ],
  boolean: ["is-true", "is-false", "exists", "does-not-exist"],
  date: ["is", "before", "on-or-before", "after", "on-or-after", "exists", "does-not-exist"],
  list: [
    "contains-item",
    "contains-all-items",
    "contains-any-item",
    "contains-no-item",
    "is-empty",
    "is-not-empty",
    "exists",
    "does-not-exist",
  ],
  path: [
    "is",
    "is-under-folder",
    "is-not-under-folder",
    "contains-segment",
    "exists",
    "does-not-exist",
  ],
} as const;

/** Which operator families a given system field offers in the builder;
 * a "property" field (spec section 6.2's typeahead-selected custom key)
 * offers every family, since its actual type is only known from indexed
 * note values. */
export const SYSTEM_FIELD_OPERATOR_FAMILIES: Record<SystemFieldName, keyof typeof OPERATOR_GROUPS> = {
  name: "string",
  path: "path",
  folder: "path",
  tag: "list",
  modified: "date",
  hasFrontmatter: "boolean",
};

export type CollectionViewV1 =
  | { mode: "list" }
  | { mode: "table"; columns?: string[] }
  | { mode: "card"; fields?: string[] };

export type SortFieldV1 =
  | { kind: "system"; field: "name" | "path" | "folder" | "modified" }
  | { kind: "property"; key: string };

export interface CollectionSortV1 {
  field: SortFieldV1;
  direction: "asc" | "desc";
  missing: "first" | "last";
}

export interface SmartCollectionV1 {
  id: string;
  name: string;
  description?: string;
  query: QueryNodeV1;
  view: CollectionViewV1;
  sort: CollectionSortV1[];
  createdAt: string;
  updatedAt: string;
  unknown?: Record<string, unknown>;
}

export interface CollectionsFileV1 {
  version: 1;
  collections: SmartCollectionV1[];
  order: string[];
  unknown?: Record<string, unknown>;
}

export function emptyCollectionsFile(): CollectionsFileV1 {
  return { version: 1, collections: [], order: [] };
}

/** A brand-new, unsaved query: an empty AND group matches every note
 * (spec section 6.1), the least surprising starting point for a new
 * collection's builder draft. */
export function emptyQueryGroup(): QueryGroupV1 {
  return { type: "group", operator: "and", children: [] };
}

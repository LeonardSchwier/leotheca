# F09 Software Design Document: Smart Collections and Property Views

**Status:** Approved for implementation design  
**Feature:** F09 Smart Collections and Property Views  
**Target:** Desktop and Android  
**Last updated:** 2026-09-01

## 1. Summary

F09 lets users save structured local queries over note paths, tags, modification metadata, and supported frontmatter properties. Each Smart Collection updates automatically as notes are created, edited, renamed, or deleted. Results can be viewed as a list, table, or cards and opened through the shared note-navigation contract.

Collections do not create a proprietary note database. Their definitions are workspace-scoped UI metadata in `.leotheca/collections.json`; the actual values remain in Markdown frontmatter and file metadata. Query evaluation uses the shared workspace metadata index, not repeated full-workspace body scans.

Property views are read-only by default. The table view may edit individually supported scalar or list properties through the existing source-range-preserving frontmatter editor. Every edit is conflict-checked and applied to the canonical note content. Arbitrary scripts, formulas, joins, rollups, and body-text queries are outside the first release.

## 2. Motivation

Folders and tags are useful but cannot express combinations such as:

- active work notes in one area;
- books with rating above 4;
- projects whose status is not done and whose review date is before today;
- all notes that contain a particular property;
- reference notes missing a required property.

Users can search repeatedly, but repeated manual filters are not a durable workspace view. Smart Collections make these views explicit without moving note content into a hidden database. They also give frontmatter properties a practical, visual use while preserving Markdown portability.

## 3. Goals

1. Save named workspace-local metadata queries.
2. Support a safe visual query builder with nested AND and OR groups.
3. Query system fields, tags, paths, and supported frontmatter properties.
4. Infer useful scalar and list value types without requiring a schema file.
5. Present dynamic results in list, table, and card views.
6. Sort results deterministically by system fields or selected properties.
7. Open any result note and reveal it in the requested F07 group.
8. Allow safe single-cell property edits for supported frontmatter values.
9. Update results incrementally after note saves and F03 path refactors.
10. Preserve collection definitions, unknown fields, and local-first boundaries.

## 4. Non-goals

The first release does not include:

- full note-body text queries;
- regular expressions;
- arbitrary scripting or SQL;
- formulas or computed properties;
- joins across notes;
- relation properties, rollups, or backlinks as query fields;
- cross-workspace collections;
- automatic note movement based on query results;
- bulk edit or bulk delete;
- inline editing of note body content;
- editing unsupported nested YAML structures;
- a mandatory property schema;
- custom user code in cards;
- charts or dashboards;
- recurring automation triggered by collection membership;
- cloud sharing of collection definitions.

A collection is a dynamic view, not a folder and not a playlist with manual membership order.

## 5. Storage model

### 5.1 Collection file

Definitions are stored at:

```text
<workspace>/.leotheca/collections.json
```

The file is excluded from ordinary note indexing and file-tree presentation.

```typescript
interface CollectionsFileV1 {
  version: 1;
  collections: SmartCollectionV1[];
  order: string[];
  unknown?: Record<string, unknown>;
}

interface SmartCollectionV1 {
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
```

IDs are locally generated UUIDs. They remain stable across rename and reordering.

### 5.2 Runtime decoding

The decoder must:

- validate top-level version and types;
- preserve unknown fields where practical;
- skip an invalid collection without discarding valid siblings;
- expose recoverable errors with the collection ID or array position;
- never replace a corrupt file with an empty file automatically;
- offer `Open raw file`, `Restore from backup`, and `Create new collection file` when recovery is required;
- write through a temporary file and safe replacement where supported.

A small last-known-good backup may be stored under `.leotheca/` before each successful settings write. It is UI metadata only and does not contain note bodies.

### 5.3 Workspace settings

The following presentation state may live in `.leotheca/settings.json`:

- last active collection ID;
- current transient result selection;
- optional panel width owned by UX-01;
- whether the collection list is collapsed.

Query definitions and view configuration remain in `collections.json`.

## 6. Query model

### 6.1 Query abstract syntax tree

```typescript
type QueryNodeV1 = QueryGroupV1 | QueryClauseV1;

interface QueryGroupV1 {
  type: "group";
  operator: "and" | "or";
  children: QueryNodeV1[];
}

interface QueryClauseV1 {
  type: "clause";
  field: QueryFieldV1;
  operator: QueryOperatorV1;
  value?: QueryValueV1;
}
```

Limits:

- maximum nesting depth: 3 groups below root;
- maximum clauses: 100;
- empty AND group matches all notes;
- empty OR group matches no notes;
- invalid clauses are shown as builder errors and do not silently match.

A `not` node is not included in the first release. Equivalent common cases are covered by `is not`, `does not contain`, `does not exist`, and comparison operators.

### 6.2 Fields

System fields:

| Field | Type | Notes |
|---|---|---|
| Note name | String | Filename without `.md` |
| Path | String or path | Normalized workspace-relative path |
| Folder | Path | Parent folder |
| Tag | String list | Frontmatter and supported inline tags from shared index |
| Modified | Date-time | Filesystem modification time when available |
| Has frontmatter | Boolean | Whether supported frontmatter exists |

Property field:

```typescript
interface PropertyQueryField {
  kind: "property";
  key: string;
}
```

Property keys use exact stored spelling for display and a normalized lookup key for matching. Key normalization is case-insensitive unless existing frontmatter behavior has a stricter documented policy. The UI warns when a workspace contains keys that differ only by case.

### 6.3 Operators

String:

- is;
- is not;
- contains;
- does not contain;
- starts with;
- ends with;
- exists;
- does not exist.

Number:

- equals;
- does not equal;
- greater than;
- greater than or equal;
- less than;
- less than or equal;
- exists;
- does not exist.

Boolean:

- is true;
- is false;
- exists;
- does not exist.

Date or date-time:

- is;
- before;
- on or before;
- after;
- on or after;
- exists;
- does not exist.

List:

- contains item;
- contains all items;
- contains any item;
- contains no item;
- is empty;
- is not empty;
- exists;
- does not exist.

Path:

- is;
- is under folder;
- is not under folder;
- contains segment;
- exists;
- does not exist.

The builder exposes only operators compatible with its current inferred or explicitly selected type.

### 6.4 Query values

```typescript
type QueryValueV1 =
  | { type: "string"; value: string }
  | { type: "number"; value: number }
  | { type: "boolean"; value: boolean }
  | { type: "date"; value: string }
  | { type: "datetime"; value: string }
  | { type: "string-list"; value: string[] }
  | { type: "path"; value: string };
```

Date values use ISO `YYYY-MM-DD` and local calendar semantics. Date-time values use valid ISO timestamps and compare as instants. Invalid serialized values make the clause invalid and visible in the builder.

### 6.5 String comparison

Default string matching:

- Unicode-compatible case-insensitive comparison;
- trim query value outer whitespace;
- retain punctuation and diacritics;
- no fuzzy matching;
- no regex;
- list item comparison follows the same rules.

A future case-sensitive option is out of scope.

## 7. Property type inference

### 7.1 Supported source values

F09 consumes the existing lossless frontmatter parser and extends indexed value interpretation for supported top-level values:

- quoted or unquoted string;
- finite number;
- boolean `true` or `false`;
- ISO date `YYYY-MM-DD`;
- ISO date-time;
- simple list of supported scalar values.

Nested mappings, multiline folded values, anchors, tags, and other unsupported YAML constructs remain preserved raw but are not queryable or editable in the first release.

### 7.2 Inference order

For an unquoted scalar:

1. exact boolean;
2. finite decimal number;
3. valid ISO date;
4. valid ISO date-time;
5. string.

Quoted values remain strings. This lets a user preserve an identifier such as `"0012"` as text.

### 7.3 Workspace type summary

The index tracks observed types per normalized property key:

```typescript
interface PropertyTypeSummary {
  key: string;
  observedTypes: Set<IndexedValueType>;
  occurrenceCount: number;
  editableOccurrenceCount: number;
  sampleValues: QueryValueV1[];
}
```

When one key has incompatible types across notes:

- the builder shows `Mixed types`;
- the user selects which type a comparison applies to;
- incompatible note values do not match that typed clause;
- the result can show a mixed-type warning;
- F09 does not rewrite values to normalize the workspace.

### 7.4 Missing versus empty

- Missing property: key is absent.
- Empty string: key exists with an empty string.
- Empty list: key exists with no list items.
- Null-like unsupported YAML value: key exists but has unsupported type.

`exists` matches supported and unsupported present keys. Typed comparisons match only compatible indexed values.

## 8. Query builder experience

### 8.1 Entry points

Collections are available from:

- an Activity Rail `Collections` destination;
- Command Palette `Open Collections`;
- Command Palette `New Smart Collection`;
- a saved search action `Save as collection` when the source search can be represented by the supported query model.

### 8.2 Collection list

The collection list shows:

- collection name;
- optional description;
- current result count;
- invalid-definition or mixed-type warning;
- context actions Rename, Duplicate, Edit, Delete, and Move.

Reordering changes only the `order` array. Duplicate creates a new UUID and appends `copy` to the visible name.

### 8.3 Builder layout

The builder contains:

1. name and optional description;
2. root AND or OR group;
3. nested clause and group rows;
4. live result count and sample;
5. view and sort configuration;
6. Save and Cancel.

Each clause follows:

```text
[Field] [Operator] [Value]
```

Property selection supports typeahead over observed keys and a typed custom key. Path pickers operate on workspace-relative folders and never expose Android grant tokens.

### 8.4 Builder validation

The Save action is disabled for:

- blank collection name;
- duplicate ID, which should only occur from corrupt input;
- unsupported or blank property key;
- incompatible operator;
- missing required value;
- invalid date or number;
- query depth or clause-count limit;
- path outside containment;
- an unrecoverable collections-file conflict.

Duplicate visible names are allowed but discouraged with a warning because stable IDs distinguish collections.

### 8.5 Live preview

The builder evaluates the in-memory draft after a short debounce and shows:

- result count;
- up to a bounded sample of matching notes;
- type warnings;
- estimated broad-query warning when every note matches.

Draft changes are not persisted until Save.

## 9. Result views

### 9.1 Shared result model

```typescript
interface CollectionResult {
  path: string;
  noteName: string;
  folder: string;
  tags: string[];
  modified?: string;
  properties: Map<string, IndexedProperty>;
  matchGeneration: number;
}
```

Results are derived from metadata records. Note body content is not loaded to render a collection.

### 9.2 List view

Each row shows:

- note name and path context;
- selected secondary property values;
- tags when configured;
- modified date when configured;
- open action.

List view is the default and works best on compact layouts.

### 9.3 Table view

Required behavior:

- one row per note;
- fixed Note column;
- optional Path, Folder, Tags, Modified, and selected property columns;
- sortable columns when their values have a compatible type;
- horizontal scrolling inside the table region on compact screens;
- sticky header where supported;
- row activation separate from editable cell activation;
- safe single-cell editing for supported property columns.

Table view is not F11. It edits frontmatter values, not Markdown pipe tables.

### 9.4 Card view

Cards show:

- note name;
- optional description property selected by the user;
- up to a bounded number of selected property fields, initially six;
- tags and modified state when configured;
- path context for duplicate names.

Cards use a responsive grid and contain no arbitrary user HTML or scripts.

### 9.5 Sorting

A collection may define up to three sort keys. Each key has ascending or descending direction and missing-value placement.

Required fields:

- note name;
- path;
- folder;
- modified;
- selected compatible property.

Sorting is stable. Final tie-breaker is normalized path ascending. Mixed or incompatible property values are grouped with missing values according to the configured placement.

### 9.6 Empty and error states

- No collections: `Create a collection to build a reusable note view.`
- Valid collection, no results: `No notes match this collection.` with Edit query.
- Invalid collection: show exact invalid clauses and Edit query.
- Indexing: show existing last-proven results only when clearly marked, otherwise progress.
- Collections file conflict: preserve unsaved draft and offer Reload, Copy draft, or Save as new after resolution.

## 10. Opening notes

Selecting a result calls the shared note-location API without a required location. With F07:

- ordinary activation uses the active group;
- context action `Open in other group` targets the other group;
- if the note is already open, its owner group is focused;
- the collection surface remains available in the Activity Rail or sheet.

After F03 path migration, result paths update from the index and selection follows the stable note mapping when available.

## 11. Inline property editing

### 11.1 Scope

Inline table editing is available only for supported top-level scalar or simple-list frontmatter properties. System fields such as path, folder, modified time, and note name are read-only.

Editing is disabled for:

- unsupported raw YAML value;
- mixed representation that the lossless editor cannot preserve safely;
- note with an unresolved external-change conflict;
- collection result generated from a stale workspace session;
- F03 transaction lock;
- property whose key differs only by case from another key in the same note.

### 11.2 Editor controls

- strings use a text field;
- numbers use a validated text input rather than locale-dependent browser number coercion;
- booleans use a switch or select;
- dates use an ISO text field plus platform date picker when accessible;
- lists use a chip or line-based editor that serializes through the existing supported list format.

The user commits with Enter or explicit Save and cancels with Escape or Cancel. Mobile uses a focused edit sheet when an inline control would be too narrow.

### 11.3 Mutation path

For an open note:

1. resolve the canonical document;
2. parse current frontmatter source ranges;
3. validate the expected property state;
4. apply one minimal CodeMirror transaction through the existing property editor;
5. save through the coordinator;
6. update the note metadata and reevaluate collections.

For a closed note:

1. re-read content;
2. parse current frontmatter;
3. validate expected state and note fingerprint;
4. produce a minimal property edit;
5. write through the bridge;
6. reparse and update metadata.

A missing supported property may be added. If no frontmatter exists, the existing frontmatter editor may create a minimal delimiter block at the top while preserving a byte-order mark and line-ending convention.

### 11.4 Membership changes

An edit may cause the note to leave the active collection. The row remains pending until save succeeds. After success:

- if it still matches, update the cell;
- if it no longer matches, remove the row and move focus to the next row, previous row, or result-empty action;
- announce `Note no longer matches this collection` through a polite live region.

No optimistic removal occurs before durable save.

### 11.5 Undo

For open notes, one cell commit is one CodeMirror transaction and can be undone in the note editor. Collection UI does not maintain a second persistent undo log. For closed notes, a brief `Open note` action is offered after save; automatic cross-file undo is out of scope.

## 12. Index architecture

### 12.1 Indexed properties

```typescript
interface IndexedProperty {
  key: string;
  normalizedKey: string;
  exists: true;
  type: "string" | "number" | "boolean" | "date" | "datetime" | "list" | "unsupported";
  value?: string | number | boolean | string[];
  rawValue: string;
  editable: boolean;
  sourceFrom?: number;
  sourceTo?: number;
}
```

Unsupported values retain enough metadata to answer `exists`, but not full note bodies or arbitrary nested objects.

### 12.2 Postings

The metadata index may create postings for:

- normalized tags;
- folder prefixes;
- property existence;
- exact normalized string or list-item values;
- numeric and date values where sorted evaluation materially improves performance.

Implementation can begin with per-note evaluation and add postings based on measured workspaces. It must avoid a second recursive scan either way.

### 12.3 Incremental updates

After a successful note save:

- replace that note's metadata record;
- update type summaries and any postings;
- reevaluate only collections whose query fields could be affected, or reevaluate all saved collections if the bounded collection count makes that simpler;
- publish results under a newer index generation.

After delete or F03 path move, remove or migrate the record and reevaluate path predicates.

## 13. F03 integration

Path clauses in collection definitions are typed metadata references. F03 must include them in rename or folder-move preview.

Examples:

- `Path is Projects/Alpha.md` updates when that note moves.
- `Folder is under Projects/Alpha` updates when that folder moves.
- A string property whose value happens to look like a path is not rewritten.

The F09 adapter returns exact collection IDs and clause paths to F03, produces before and after JSON preview, and preserves unknown fields.

If F03 is not yet available, a path move triggers a collection warning with `Edit query` rather than silent broadening or arbitrary repair.

## 14. Architecture

Recommended modules:

```text
src/collections/
  collectionTypes.ts
  collectionDecode.ts
  collectionStore.ts
  collectionQuery.ts
  collectionTypesInference.ts
  collectionSelectors.ts
  collectionPersistence.ts
  collectionPathMigration.ts
  CollectionsPanel.tsx
  CollectionBuilder.tsx
  CollectionResults.tsx
  CollectionListView.tsx
  CollectionTableView.tsx
  CollectionCardView.tsx
  PropertyCellEditor.tsx
```

The query engine is pure and operates on metadata records. UI components do not read note files directly. Property mutation delegates to the existing lossless frontmatter editor and shared source mutation layer.

## 15. Concurrency and lifecycle

- Collection loads, saves, previews, and evaluations carry workspace session and request generation.
- A newer builder edit supersedes an older preview evaluation.
- Collections-file writes serialize through one store and use expected-fingerprint checks.
- A workspace switch preserves an unsaved builder draft only in memory long enough to ask the user to Save, Discard, or Cancel the switch according to transition policy.
- Note-property writes participate in the path-specific save authority.
- F03 holds the workspace mutation lock while migrating path clauses.
- A stale result row cannot authorize property editing without revalidation.
- External changes to `collections.json` or a target note produce explicit conflict UI.

## 16. Security and privacy

- Queries and results remain local.
- No arbitrary code, regex engine, SQL, or template execution is exposed.
- Property and path values render as text.
- Collection files contain definitions and field names, not copied note bodies.
- Path clauses are workspace-relative and containment-validated.
- Inline edits cannot target system paths or unsupported YAML structures.
- No remote assets, telemetry, or account state is introduced.
- Android grant tokens never appear in collection definitions.
- Card view does not render property values as unsanitized HTML.

## 17. Accessibility

### 17.1 Builder

- Groups and clauses have clear labels and logical reading order.
- AND and OR state is expressed in text, not connector lines alone.
- Add, remove, and move controls identify the affected group or clause.
- Validation errors are associated with exact fields and summarized at the top.
- Reordering is possible without drag.

### 17.2 Results

- List and cards use semantic links or buttons for note opening.
- Table uses a complete accessible table or grid pattern appropriate to editing.
- Sort direction is announced.
- Editable cells identify note, property, current value, and editability.
- Membership removal has predictable focus behavior.
- Warnings for mixed types, invalid queries, or stale results include text.

### 17.3 Compact

- Builder groups stack vertically.
- Table horizontal scrolling stays inside its labeled region.
- Cell edits may use an accessible full-width sheet.
- Touch targets meet the compact minimum and increased text size does not truncate required labels without an accessible expansion.

## 18. Performance requirements

- Collection evaluation uses the shared metadata index and performs no recursive body scan.
- Opening a saved collection with up to 10,000 indexed notes should show initial results within 200 ms after the index is ready on a typical desktop.
- Query-builder preview uses a debounce, initially 100 ms, and is cancellable.
- List, table, and card results virtualize above 300 rows.
- Sorting 10,000 result records by three keys should complete within 150 ms on a typical desktop.
- Inline editing reparses only the affected note and reevaluates relevant results.
- Collection definitions remain small and do not cache complete result bodies.
- Android result rendering stays bounded and does not mount offscreen card content unnecessarily.

## 19. Functional requirements

**F09-FR-01** The application shall store versioned Smart Collection definitions in `.leotheca/collections.json`.  
**F09-FR-02** Collection decoding shall preserve valid siblings and unknown fields when one record is invalid.  
**F09-FR-03** Corrupt collection data shall not be silently replaced with an empty file.  
**F09-FR-04** The query model shall support nested AND and OR groups within defined depth and clause limits.  
**F09-FR-05** The builder shall expose only typed allowlisted fields and operators.  
**F09-FR-06** Queries shall support note name, path, folder, tags, modified time, frontmatter presence, and supported properties.  
**F09-FR-07** Property values shall use the inference and mixed-type rules defined in this SDD.  
**F09-FR-08** Missing, empty, and unsupported-present properties shall remain distinct.  
**F09-FR-09** String matching shall be case-insensitive and non-regex.  
**F09-FR-10** Date-only comparisons shall use local calendar semantics.  
**F09-FR-11** Builder preview shall be generation-authoritative and shall not persist until Save.  
**F09-FR-12** Saved results shall update dynamically from the shared metadata index.  
**F09-FR-13** Collection evaluation shall not read full note bodies after metadata is indexed.  
**F09-FR-14** Result views shall include list, table, and cards.  
**F09-FR-15** Collections shall support up to three deterministic sort keys with path tie-breaker.  
**F09-FR-16** Selecting a result shall open the note through the shared navigation API.  
**F09-FR-17** F07 other-group opening shall route through the central open-note router.  
**F09-FR-18** Table view shall edit only supported top-level scalar and simple-list properties.  
**F09-FR-19** System fields and unsupported YAML shall remain read-only.  
**F09-FR-20** Open-note property edits shall use canonical in-memory content and one CodeMirror transaction.  
**F09-FR-21** Closed-note property edits shall re-read and conflict-check before write.  
**F09-FR-22** A successful property edit shall update metadata and reevaluate membership.  
**F09-FR-23** A failed edit shall not optimistically change or remove a result.  
**F09-FR-24** F03 shall migrate typed path clauses during reviewed note or folder moves.  
**F09-FR-25** Collections-file and property writes shall be workspace-session and generation authoritative.  
**F09-FR-26** Queries shall not execute scripts, formulas, SQL, arbitrary regex, or network requests.  
**F09-FR-27** Collection definitions shall not contain Android grant tokens or copied note bodies.  
**F09-FR-28** Builder, list, table, cards, and property edits shall be keyboard and screen-reader operable.  
**F09-FR-29** Compact layouts shall expose equivalent query and result functionality.  
**F09-FR-30** The feature shall operate without accounts, telemetry, or network access.

## 20. Acceptance criteria

1. A collection with path, tag, and property clauses returns exactly the matching indexed notes.
2. Nested AND and OR groups evaluate according to their visible structure and limits.
3. Invalid clauses block Save and identify the exact issue.
4. Strings, quoted numeric-looking strings, numbers, booleans, dates, date-times, lists, missing values, and unsupported values follow the defined inference rules.
5. A mixed-type property shows a warning and typed comparisons match only compatible values.
6. `exists` matches a present unsupported property while numeric or string comparison does not.
7. Date-only comparisons remain correct across timezone offsets because they use local calendar semantics.
8. List, table, and card views show the same result set in the same configured sort order.
9. Three-key sorting is stable and uses normalized path as final tie-breaker.
10. Selecting a result opens the existing tab or the requested F07 group without duplicating the path.
11. Editing a supported property in an open dirty note changes only the intended frontmatter range and retains one undo step.
12. Editing a closed note changed externally produces a conflict and no write.
13. Editing a property that removes membership keeps the row until save succeeds, then moves focus predictably.
14. Unsupported nested YAML remains byte-preserved and read-only.
15. Creating frontmatter for a missing supported property preserves BOM, line endings, and note body.
16. A note save updates relevant collections without a full workspace walk.
17. A note delete removes its results and a note creation adds matching results.
18. F03 preview includes exact path-clause changes for renamed notes and folders.
19. String property values that merely look like paths are not changed by F03.
20. One invalid collection record does not delete or hide valid sibling definitions.
21. A corrupt collection file shows recovery actions and is not overwritten automatically.
22. External modification of `collections.json` while a draft is open preserves the draft through conflict UI.
23. A 10,000-note fixture remains responsive and result views are virtualized.
24. Query and property content causes no network request and no arbitrary code execution.
25. Builder, views, sort controls, and inline edits pass keyboard, screen-reader, zoom, and compact tests.

## 21. Test plan

### 21.1 Unit tests

- Query AST decoding, limits, and evaluation.
- Every field and operator combination.
- Empty AND and OR groups.
- String normalization and list comparison.
- Number, boolean, date, and date-time inference.
- Missing, empty, and unsupported-present semantics.
- Mixed-type summaries.
- Stable multi-key sorting and missing placement.
- Collection file decoding, unknown fields, invalid siblings, and backup recovery.
- F03 typed path-clause migration.

### 21.2 Component tests

- Collection list create, rename, duplicate, reorder, and delete.
- Builder nested groups, validation, live count, and unsaved close.
- List, table, and card switching.
- Sort controls and mixed-type warnings.
- Empty, invalid, indexing, and conflict states.
- Compact builder and table edit sheet.

### 21.3 Property editing tests

- Add and edit string, number, boolean, date, and list.
- Open clean and dirty note.
- Closed note and external conflict.
- Note without frontmatter.
- Unsupported raw YAML preservation.
- Membership retained and removed after save.
- One-step undo for open notes.

### 21.4 Integration tests

- Metadata index incremental updates.
- Workspace switch during evaluation and property save.
- F07 primary and secondary opening.
- F03 note and folder move with path clauses.
- Collections-file external change and write conflict.
- Missing or corrupt index cache recovery.

### 21.5 Performance and accessibility tests

- 100 collections, 10,000 notes, 100 clauses, and 10,000 results.
- Virtualized list, table, and card rendering.
- Keyboard-only query construction and table editing.
- Screen-reader group relationships, table headers, sort direction, and validation.
- 200 percent zoom, forced colors, increased Android text size, and 320 by 568 compact layout.

## 22. Rollout plan

### Phase 1: Storage, query engine, and list view

- Land schema, runtime decoder, pure evaluator, and index property records.
- Ship read-only list collections behind a feature flag.

### Phase 2: Query builder and sorting

- Add nested builder, live preview, type summaries, sort configuration, and persistence recovery.

### Phase 3: Table and card views

- Add virtualized table and responsive cards with accessibility validation.

### Phase 4: Safe property editing

- Reuse and extend lossless frontmatter mutation for supported cells.
- Add conflict, membership-change, and focus behavior.

### Phase 5: F03 and F07 integration

- Add path-clause migration and other-group opening.
- Complete compact Android presentation.

### Phase 6: General availability

- Enable by default after performance, migration, and accessibility gates pass.
- Update user and architecture documentation.

## 23. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Type inference surprises users | Incorrect results | Quoted strings remain strings, mixed-type warnings, explicit typed clause selection |
| Query engine becomes unsafe or complex | Security and maintenance risk | Typed AST, allowlisted operators, no scripts, regex, or SQL |
| Inline editing damages frontmatter | Data loss | Reuse lossless parser, exact ranges, conflicts, unsupported values read-only |
| Collection file corruption loses views | Lost UI metadata | Runtime decoding, valid-sibling preservation, last-known-good backup, no silent reset |
| Result view loads note bodies | Memory and privacy cost | Metadata-only results and lazy note opening |
| Path move silently broadens query | Incorrect membership | F03 typed adapter and previewed clause migration |
| Large collections lag | Poor UX | Shared index, optional postings, debounce, stable selectors, virtualization |
| Property edit removes focused row | Accessibility issue | Durable-save gate and defined focus movement |

## 24. Documentation changes

Update:

- user guide for creating queries, type behavior, views, and property editing;
- supported frontmatter value documentation;
- architecture documentation for collection storage, query AST, and metadata index;
- `.leotheca/collections.json` schema and recovery guide;
- F03 path-migration integration notes;
- accessibility and keyboard documentation;
- roadmap status for F09.

## 25. Definition of done

F09 is done when:

- saved typed queries evaluate solely from the shared metadata index;
- collection definitions are versioned, recoverable, and preserve valid and unknown data;
- list, table, and card views show consistent, sorted, virtualized results;
- supported property edits are minimal, conflict-safe, and update membership only after durable save;
- unsupported YAML is preserved and cannot be accidentally edited;
- F03 path refactors and F07 opening behavior integrate through typed contracts;
- no scripts, formulas, full-body scans, accounts, telemetry, or network access are introduced;
- all functional requirements and acceptance criteria pass on desktop and Android;
- accessibility, performance, storage, and migration gates pass;
- documentation and tests land with implementation;
- no unresolved critical or high-severity data-integrity or query-correctness defect remains.

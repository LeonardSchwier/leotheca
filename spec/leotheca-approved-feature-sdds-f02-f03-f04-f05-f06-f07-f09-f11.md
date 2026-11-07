# Leotheca Approved Feature SDDs

**Status:** Approved for implementation design  
**Features:** F02, F03, F04, F05, F06, F07, F09, F11  
**Generated:** 2026-09-01

This combined document contains the package index followed by all eight approved Software Design Documents. The individual files remain the preferred units for repository implementation and review.

---

# Approved Feature SDD Pack

**Status:** Approved for implementation design
**Feature labels:** F02, F03, F04, F05, F06, F07, F09, F11
**Target:** Desktop and Android
**Last updated:** 2026-09-01

## 1. Purpose

This package turns the approved feature set into implementation-grade Software Design Documents for Leotheca. Each feature has its own specification so it can be claimed, implemented, verified, and shipped independently. This index defines the shared contracts and sequencing rules that prevent the eight features from creating duplicate parsers, incompatible indexes, or competing state models.

The specifications are grounded in the repository state reviewed on 2026-09-01. Before implementation, the owning session must fetch current `main`, read all active roadmap claims, and revalidate the referenced modules against any changes that landed after this package was written.

## 2. Included specifications

| Feature | Specification | Primary outcome |
|---|---|---|
| F02 | `f02-workspace-task-hub.md` | Workspace-wide task collection, filtering, navigation, and safe completion toggles |
| F03 | `f03-link-integrity-refactor-center.md` | Rename-safe links, diagnostics, previewed bulk edits, and recovery |
| F04 | `f04-heading-block-links-embeds.md` | Heading links, stable block references, and read-only transclusion |
| F05 | `f05-universal-quick-capture-inbox.md` | In-app capture, local automation, Android sharing, and inbox append flows |
| F06 | `f06-note-outline-heading-breadcrumbs.md` | Active-note outline, heading ancestry, source navigation, and copy-link actions |
| F07 | `f07-split-panes-pinned-tabs.md` | Two editor groups, pane-aware tabs, pinning, resizing, and adaptive compact behavior |
| F09 | `f09-smart-collections-property-views.md` | Saved metadata queries with list, table, and card views |
| F11 | `f11-visual-markdown-table-editor.md` | Safe visual editing of ordinary GFM pipe tables |

## 3. Product boundaries shared by every feature

Every implementation in this package must preserve the following contracts:

- Notes remain ordinary local Markdown files in user-controlled folders.
- No feature may require an account, server, network request, remote font, telemetry, analytics, or proprietary sync.
- Application metadata may live under `<workspace>/.leotheca/` only when it is workspace-scoped UI or cache state. It must never become the source of truth for note content.
- All workspace file operations must use the shared platform bridge and its containment-aware mutation functions.
- Android workspaces are identified by the authoritative workspace session and grant, not by the synthetic `/workspace` display path alone.
- Asynchronous work must be generation-authoritative. Results from an older workspace, older note selection, older query, or older mutation preview must not publish over newer user intent.
- Existing DOMPurify sanitization and Content Security Policy protections must not be weakened.
- Persisted JSON must be runtime-decoded, tolerate missing fields, preserve unknown fields when practical, and avoid destructive recovery.
- Desktop and Android must expose equivalent core behavior even when the presentation differs.
- Documentation and tests must land with the implementation that changes a module boundary, storage model, bridge operation, or user-visible behavior.

## 4. Current architectural baseline

The current application has one shared Preact and TypeScript frontend, CodeMirror 6 for source editing, Tauri on desktop, and Capacitor plus a custom Storage Access Framework bridge on Android.

The existing `src/linking/store.ts` performs one recursive Markdown walk and builds note-name, alias, tag, wikilink, and backlink metadata with an mtime-based cache. `src/workspace/tauriBridge.ts` is the single platform dispatcher and tracks in-flight workspace operations. `src/workspace/workspaceTransition.ts` owns generation-authoritative workspace switching. `src/workspace/saveCoordinator.ts` owns debounced note writes. These are foundations to extend, not parallel systems to bypass.

The current tab model is a flat `OpenTab[]`, the current view mode is global, and the current active editor is rendered once in `App.tsx`. F07 is therefore a real state-model and shell change, not only a CSS split.

The current wikilink parser treats the whole text inside `[[...]]` as one target. F04 and F03 require a structured grammar that understands labels, headings, block IDs, and embeds without breaking legacy links.

The current frontmatter tooling safely edits supported top-level scalar and list fields by source range while preserving unsupported content. F09 must reuse that lossless editing contract.

## 5. Shared foundation contracts

### 5.1 Markdown structure module

Introduce a small dependency-free module under `src/markdown/` that owns workspace-relevant structure extraction. It must not be a second rendered-Markdown implementation. Rendering remains owned by the preview pipeline.

Recommended files:

```text
src/markdown/
  scanMarkdown.ts
  headings.ts
  links.ts
  blocks.ts
  tasks.ts
  tables.ts
  sourceRanges.ts
```

The scanner must:

- report UTF-16 source offsets compatible with CodeMirror positions;
- report one-based line and column values for display;
- preserve original source text for every record;
- skip fenced code blocks, indented code blocks where required, inline code, and HTML comments when recognizing structural syntax;
- tolerate malformed Markdown by returning the records it can prove, never by rewriting the source;
- use deterministic normalization shared by indexing, autocomplete, preview navigation, diagnostics, and refactoring;
- have fixture tests for LF and CRLF line endings, Unicode text, escaped delimiters, nested lists, and malformed input.

### 5.2 Workspace metadata index

Evolve the existing link index into a modular workspace metadata index rather than adding separate full-workspace scans for tasks, headings, blocks, properties, and link diagnostics.

A target shape is:

```typescript
interface WorkspaceNoteMetadata {
  path: string;
  mtime?: number;
  noteName: string;
  aliases: string[];
  tags: string[];
  headings: HeadingRecord[];
  blockIds: BlockRecord[];
  outboundLinks: LinkRecord[];
  tasks: TaskRecord[];
  properties: IndexedProperty[];
  referencedAttachments: AttachmentReference[];
}

interface WorkspaceMetadataIndex {
  notesByPath: Map<string, WorkspaceNoteMetadata>;
  pathsByNoteName: Map<string, string[]>;
  pathsByAlias: Map<string, string[]>;
  backlinksByPath: Map<string, BacklinkRecord[]>;
  pathsByTag: Map<string, string[]>;
  propertyPostings: Map<string, PropertyPosting>;
}
```

Implementation may keep compatibility selectors named `linkIndex` while call sites migrate. There must still be only one native recursive Markdown discovery per rebuild. The cache version must be bumped whenever the cached record shape changes. A cache miss or corrupt cache must cause a real read, not failure of the feature.

The index must support incremental replacement of one note record after an in-app save. Bulk mutations replace all affected records only after the mutation commits. A full rebuild remains the recovery fallback.

### 5.3 Note-location navigation

Introduce one application-level navigation contract used by F02, F03, F04, F06, F09, and F11:

```typescript
type NoteLocation =
  | { kind: "line"; line: number; column?: number }
  | { kind: "range"; from: number; to: number }
  | { kind: "heading"; headingKey: string; occurrence?: number }
  | { kind: "block"; blockId: string };

interface OpenNoteRequest {
  path: string;
  location?: NoteLocation;
  preferredGroupId?: string;
  focus?: "source" | "preview" | "preserve";
}
```

Opening a note and revealing a location must be authority-checked after every asynchronous read. Source mode moves the CodeMirror selection and scrolls the range into view. Preview mode scrolls to the rendered anchor. Split mode follows the requested focus. If the location no longer exists, the note still opens and a non-blocking notice explains that the target moved.

### 5.4 Safe source mutation

Introduce shared helpers for minimal source edits:

```typescript
interface TextEdit {
  from: number;
  to: number;
  insert: string;
}

interface SourceSnapshot {
  path: string;
  content: string;
  fingerprint: string;
  workspaceSession: number;
}
```

Rules:

- Edits are sorted, validated as non-overlapping, and applied from the end of the document toward the start.
- A closed file is re-read immediately before mutation and must still match the expected snapshot or locator.
- An open file is mutated through the canonical open-document state so a later autosave cannot overwrite the change with stale content.
- Every mutation is tied to the current workspace session.
- A stale or conflicting mutation fails closed and offers refresh or reopen. It never guesses a new source position.
- A mutation of one note uses one CodeMirror transaction where possible, so Undo behaves predictably.

F03 adds the stronger multi-file transaction and recovery layer defined in its own SDD.

### 5.5 Adaptive surface ownership

The visual refresh SDD owns tokens, primitives, global navigation, inspector presentation, sheets, and responsive breakpoints. These feature SDDs own behavior and information architecture for their surfaces.

F07 owns the editor-group state model. Other features request a target editor group through `OpenNoteRequest`; they must not manipulate pane arrays directly.

F20 owns workspace profile selection. F05 may request a destination profile, but it must use F20's switch and activation coordinator rather than inventing another profile registry.

## 6. Dependency graph

```text
Shared Markdown scanner + source ranges + note navigation
             |                    |                 |
             v                    v                 v
            F06 ----------------> F04 ------------> F03
                                   |                 |
                                   +-------> workspace metadata index vNext
                                                     |             |
                                                     v             v
                                                    F02           F09

UX-01 visual system -------------------------------> F07
F20 workspace profiles ----------------------------> F05
Shared source mutation ----------------------------> F02, F03, F04, F09, F11
```

F06 can land before F04 if its copy-link action is hidden until structured heading links are available. The preferred combined sequence is F06 foundation first, then F04, then F03.

## 7. Recommended delivery tracks

### Track A: Knowledge structure and refactoring

1. Shared Markdown scanner, source ranges, note navigation, and index compatibility layer.
2. F06 Note Outline and Heading Breadcrumbs.
3. F04 Heading Links, Block References, and Embeds.
4. F03 Link Integrity and Refactor Center.
5. F02 Workspace Task Hub.
6. F09 Smart Collections and Property Views.

This order proves heading extraction and navigation on one active note before those records become workspace-wide index data or mutation targets.

### Track B: Shell and document layout

1. UX-01 primitives and adaptive shell foundation.
2. F07 Split Panes and Pinned Tabs.
3. Integration passes for F02, F03, F06, and F09 surfaces inside the final Activity Rail, Inspector, dialog, and compact-sheet architecture.

F07 must not be implemented in parallel with a conflicting `App.tsx`, `TabBar.tsx`, or workspace-settings claim unless the touch sets are explicitly coordinated.

### Track C: Capture

1. F20 workspace profile activation API.
2. Shared append/capture bridge operations.
3. F05 in-app capture and local automation.
4. F05 Android share intents and attachment ingestion.

### Track D: Editor utility

1. Shared table parser and source-locator tests.
2. F11 Visual Markdown Table Editor.
3. Integration with the refreshed document header and command palette.

## 8. Storage ownership map

| Data | Owner | Storage |
|---|---|---|
| Note text, task state, block IDs, tables | User Markdown | Existing `.md` files |
| Workspace metadata cache | Workspace index | `<workspace>/.leotheca/workspace-index-cache.json` or a migrated equivalent |
| Collections | F09 | `<workspace>/.leotheca/collections.json` |
| Pane layout, pinned paths, last active group | F07 | `<workspace>/.leotheca/settings.json` |
| Task Hub transient filter state | F02 | Workspace settings, only when persistence is useful |
| Quick Capture configuration | F05 | Workspace settings plus F20 profile preference where profile-scoped |
| Pending external captures | F05 | App-private, bounded, runtime-decoded queue until committed or discarded |
| Refactor recovery journals | F03 | Temporary `<workspace>/.leotheca/transactions/` data, removed after commit or rollback |
| Outline expansion state | F06 | In memory by note; optional bounded workspace setting if later approved |
| Visual table draft | F11 | In memory only until Apply |

## 9. Cross-feature rules

### 9.1 Link syntax authority

F04 owns the structured wikilink grammar and normalization. F03 diagnoses and rewrites links through that parser. F06 copies links through the same serializer. F02 task text may contain links but does not parse them independently.

### 9.2 Source truth and open tabs

Open document content is authoritative over the last saved disk copy while a tab is dirty. Bulk operations must flush or explicitly include dirty open content in their plan. No background index write may mark a dirty tab clean.

### 9.3 External file changes

Leotheca may coexist with sync tools and other editors. Every destructive or multi-file operation must validate its source snapshot immediately before writing. Conflict UI must preserve both the user's local draft and the externally changed file.

### 9.4 Hidden and generated paths

Workspace scans exclude `.leotheca`, `.trash`, and other hidden directories according to the existing native walk rules. Template folders are excluded from task results by default. No feature treats cache, transaction, or settings files as notes.

### 9.5 Accessibility

All feature surfaces must meet the UX refresh accessibility contract:

- complete keyboard operation;
- visible focus;
- semantic names and states;
- 44px minimum compact touch targets;
- screen-reader announcements for applied changes, conflicts, loading, and failures;
- no state communicated only by color;
- no forced motion when reduced motion is active.

### 9.6 Performance

No feature may add an independent recursive directory walk on startup. Index-backed panels render the current cached snapshot first and communicate refresh state. Large result sets use incremental rendering or virtualization. Typing in CodeMirror must not synchronously rescan the workspace.

## 10. Common verification gate

Each feature must pass the repository's current authoritative same-commit verification suite. In addition, the package requires:

- focused parser and serializer unit tests;
- deferred-promise tests proving stale requests cannot publish;
- Android JVM or bridge contract tests for every new native operation or intent path;
- component tests for keyboard and compact interactions;
- source-preservation fixtures for LF, CRLF, Unicode, malformed Markdown, and unsupported frontmatter;
- large-workspace and large-document performance fixtures;
- a manual desktop and physical Android smoke pass for the complete user flow;
- an update to `documentation/ARCHITECTURE.md` when a shared module, storage file, platform bridge, or state ownership boundary changes;
- an accurate roadmap and changelog update when the feature is complete.

## 11. Package-level definition of done

The approved package is complete only when:

1. All eight features satisfy their individual acceptance criteria.
2. There is one structured link parser and one note-location navigation API.
3. Tasks, properties, headings, blocks, and link diagnostics do not cause competing workspace scans.
4. F03 can safely update links created by F04 and references surfaced by F06.
5. F02 and F09 update after note edits without a mandatory full rebuild.
6. F05 cannot append into a stale workspace session or cause an open target tab to overwrite a capture.
7. F07 preserves save safety, workspace transitions, and compact usability.
8. F11 changes only the selected table range and never rewrites unrelated note text.
9. Every new persisted file has runtime decoding, forward-compatibility behavior, and corruption tests.
10. Desktop and Android documentation accurately describe the released behavior and limitations.


---

# F02 Software Design Document: Workspace Task Hub

**Status:** Approved for implementation design  
**Feature:** F02 Workspace-wide Task Hub  
**Target:** Desktop and Android  
**Last updated:** 2026-09-01

## 1. Summary

The Workspace Task Hub gives users one local view of actionable Markdown tasks across the active Leotheca workspace. It discovers standard GitHub Flavored Markdown task list items, exposes useful filters and grouping, opens each task at its exact source location, and lets the user complete or reopen a task without creating a second task database.

The Markdown file remains the sole source of truth. A task is not copied into proprietary storage and does not receive a hidden persistent identifier. The Task Hub is a projection of the workspace metadata index. Toggling a task performs a minimal, conflict-checked source edit against the canonical note content.

This SDD depends on the shared contracts in `README.md`, especially the Markdown structure scanner, workspace metadata index, note-location navigation, safe source mutation, workspace-session authority, and adaptive surface ownership.

## 2. Motivation

Tasks are currently useful only while the user remembers which note contains them. As a workspace grows, open checkboxes become distributed across project notes, meeting notes, journals, and reference material. Search can locate text, but it does not provide a focused task workflow, due-state filtering, or direct completion from a consolidated surface.

A good Task Hub must preserve Leotheca's local-first model. It must not introduce an opaque task database that can diverge from the Markdown, silently rewrite task prose, or require a background server. It must also coexist safely with open dirty tabs, external file edits, Android Storage Access Framework workspaces, and ongoing workspace transitions.

## 3. Goals

1. Discover supported Markdown task list items from all eligible notes in the active workspace.
2. Present open and completed tasks with filters for status, due state, note path, tags, and text.
3. Open a task at its precise source location in Source, Preview, or Split mode.
4. Toggle completion directly from the Task Hub using a minimal source edit.
5. Reflect in-app edits incrementally without rescanning the whole workspace after every keystroke.
6. Keep Markdown as the only authoritative task representation.
7. Provide equivalent core behavior on desktop and Android through adaptive presentation.
8. Remain responsive on large workspaces and fail safely when index records become stale.

## 4. Non-goals

The first release does not include:

- recurring tasks;
- reminders, alarms, notifications, or background scheduling;
- assignees, teams, comments, or collaboration;
- Kanban boards;
- task dependencies;
- a proprietary task file format;
- hidden task IDs inserted into notes;
- natural-language date parsing;
- automatic task creation from prose;
- cross-workspace aggregation;
- cloud sync or account-based task services;
- bulk rewriting of arbitrary task syntax;
- drag-and-drop task reordering across notes.

Nested task list items are displayed with their indentation context, but parent-child completion semantics are not inferred. Completing a parent does not automatically complete its descendants.

## 5. Product decisions

### 5.1 Supported task syntax

A supported task is a list item whose marker is followed by a bracket state:

```markdown
- [ ] Open task
- [x] Completed task
* [X] Completed with uppercase marker
+ [ ] Another open task
```

Rules:

- `-`, `*`, and `+` unordered list markers are supported.
- `[ ]` is open.
- `[x]` and `[X]` are completed.
- Leading indentation is preserved and reported as nesting depth.
- Tasks inside fenced code blocks, indented code blocks, inline code, or HTML comments are ignored.
- Malformed markers such as `-[ ]`, `- []`, or `- [~]` are not indexed as tasks.
- Ordered-list tasks are out of scope for the first release to avoid surprising normalization and parser ambiguity.
- The Task Hub never changes the list marker, indentation, task prose, or letter case of an existing completion marker unless that character is the requested toggle target.

### 5.2 Optional due-date convention

The first release recognizes an explicit ASCII metadata suffix inside task text:

```markdown
- [ ] Submit release notes due: 2026-09-15
- [ ] Renew certificate due:: 2026-10-01
```

Recognition rules:

- Accepted keys are `due:` and `due::`, case-insensitive.
- The value must be an ISO calendar date in `YYYY-MM-DD` form.
- The recognized occurrence must be outside inline code and links.
- If multiple valid due values exist, the rightmost valid value is used and a diagnostic flag is attached to the record.
- Invalid dates remain ordinary text and do not receive a due date.
- Dates are date-only values. They are not converted through UTC.
- The UI writes the canonical form `due: YYYY-MM-DD` when it adds or changes a due date.

The Task Hub may expose an edit-due action after the completion-toggle MVP is stable. If included in the same implementation, it must use the same source-range mutation safeguards and preserve unrelated task text.

### 5.3 Task identity

No stable ID is inserted into the note. An indexed task is located by:

```typescript
interface TaskLocator {
  path: string;
  markerFrom: number;
  markerTo: number;
  sourceFrom: number;
  sourceTo: number;
  line: number;
  normalizedFingerprint: string;
  noteFingerprint: string;
  workspaceSession: number;
}
```

`markerFrom` and `markerTo` identify only the completion character within `[ ]`, `[x]`, or `[X]`. `normalizedFingerprint` includes the normalized task line, nearby structural context, and original marker state. It helps detect movement but is not permission to guess a replacement location.

When the exact range no longer validates, the toggle fails closed. The user receives `Task changed. Refresh the Task Hub and try again.` No approximate text replacement is allowed.

### 5.4 Eligibility

By default, the index includes Markdown notes that are already eligible for the normal workspace note index. It excludes:

- `.leotheca/`;
- hidden application directories already excluded by workspace discovery;
- the configured Templates folder;
- non-Markdown files;
- paths outside the active workspace containment boundary.

A later setting may allow template tasks to be included, but the first release does not expose one.

### 5.5 One source of truth

Task state is stored only in the task marker inside the Markdown note. Filters, expanded groups, selected sort, and other UI preferences may be persisted as workspace UI state, but they must never be required to reconstruct the task list.

## 6. User experience

### 6.1 Entry points

The Task Hub is available through:

- an Activity Rail destination in the refreshed shell;
- the Command Palette action `Open Task Hub`;
- the shortcut defined in the Shortcuts registry;
- an optional current-note action `Show tasks from this note` that opens the hub with a path filter.

Until the visual refresh lands, the same behavior may be hosted in the existing sidebar or a dedicated dialog. The behavior contract must not depend on the temporary placement.

### 6.2 Layout

The primary surface contains:

1. a title and indexed-task count;
2. a search field;
3. compact filter controls;
4. a grouping and sort control;
5. the virtualized task result list;
6. index state, empty state, or error state as needed.

Each row displays:

- a checkbox reflecting the actual indexed marker state;
- task text with recognized due metadata visually de-emphasized;
- due status when present;
- note name and compact path context;
- note tags when space permits;
- nested indentation indicator when relevant;
- a stale or ambiguous metadata warning when relevant.

The row itself opens the note at the task. The checkbox toggles completion without opening the note. The controls must have separate accessible names and hit targets.

### 6.3 Filters

Required filters:

- **Status:** Open, Completed, All. Default is Open.
- **Due:** Overdue, Today, Next 7 days, Later, No due date, All.
- **Path:** one or more folder prefixes.
- **Tags:** one or more note tags, using AND within the selected set by default.
- **Text:** case-insensitive match against task text, note name, and path.

Due buckets use the user's local calendar date. For example, on 2026-09-01, a task due `2026-08-31` is overdue and a task due `2026-09-01` is due today.

Required grouping modes:

- Due state;
- Note;
- Folder;
- None.

Required sort modes:

- Due date, then note path and source order;
- Note path and source order;
- Recently modified note;
- Task text.

Completed tasks with no due date sort after open tasks when status is All and the user has not chosen another explicit sort.

### 6.4 Opening a task

Selecting a task calls the shared `OpenNoteRequest` with a source range or line location. The preferred target group is:

1. the group already showing the note;
2. otherwise the currently active group;
3. otherwise the primary group.

In Source mode, the task line is selected or its marker is placed in view. In Preview mode, the rendered task item is scrolled into view. In Split mode, the focused pane determines the primary reveal, while both panes may synchronize if the existing split synchronization contract allows it.

If the task no longer exists, the note still opens and a non-blocking notice explains that the source location moved.

### 6.5 Toggling completion

On checkbox activation:

1. Disable only that row's checkbox and show a compact pending state.
2. Confirm the Task Hub result belongs to the current workspace session.
3. Resolve whether the note is open in the document store.
4. For an open note, validate the marker against the canonical in-memory content and apply one editor transaction.
5. For a closed note, re-read the file, validate the exact marker and expected snapshot, mutate one character, and write through the platform bridge.
6. Wait for the write or canonical save to succeed.
7. Incrementally replace the note's metadata record in the workspace index.
8. Re-evaluate filters and keep keyboard focus predictable.

The visual state must not optimistically claim completion before the canonical document accepts the edit. A short pending state is preferable to a false completed state.

When toggling from complete to open, the original marker case is not meaningful. The canonical reopened marker is a space. When completing an open task, the UI writes lowercase `x`.

### 6.6 Empty and error states

Required states:

- `No open tasks` with an option to show completed tasks.
- `No tasks match these filters` with `Clear filters`.
- `Indexing tasks...` with progress when available.
- `Task changed` for a stale row.
- `Could not save task` with Retry and Open note.
- `Workspace unavailable` using the existing workspace recovery actions.

Errors remain attached to the affected row until the user retries, opens the note, or refreshes the result set.

### 6.7 Compact behavior

On compact layouts:

- the hub occupies a full-height route or sheet;
- filters open in a labeled filter sheet;
- rows maintain at least 44 by 44 CSS pixel interactive targets;
- grouping headers may remain sticky;
- note path and tags wrap or collapse without horizontal page scrolling;
- Android Back first closes menus and filter sheets, then returns from the Task Hub.

## 7. Data model

### 7.1 Indexed task record

```typescript
interface TaskRecord {
  idForRender: string;
  path: string;
  state: "open" | "completed";
  marker: " " | "x" | "X";
  text: string;
  displayText: string;
  indentationColumns: number;
  nestingDepth: number;
  line: number;
  column: number;
  sourceFrom: number;
  sourceTo: number;
  markerFrom: number;
  markerTo: number;
  dueDate?: string;
  dueOccurrences: number;
  normalizedFingerprint: string;
}
```

`idForRender` is an ephemeral value derived from path, range, and note fingerprint. It is not persisted and must not be treated as a stable task ID.

### 7.2 Task query state

```typescript
interface TaskHubQuery {
  status: "open" | "completed" | "all";
  dueBuckets: TaskDueBucket[];
  pathPrefixes: string[];
  tags: string[];
  text: string;
  groupBy: "due" | "note" | "folder" | "none";
  sortBy: "due" | "note" | "modified" | "text";
}
```

A versioned subset may be persisted under workspace settings:

```typescript
interface TaskHubSettingsV1 {
  version: 1;
  status?: TaskHubQuery["status"];
  groupBy?: TaskHubQuery["groupBy"];
  sortBy?: TaskHubQuery["sortBy"];
}
```

Text, path, and tag filters are session-only by default so returning to the hub does not unexpectedly hide tasks.

## 8. Architecture

### 8.1 Module ownership

Recommended modules:

```text
src/tasks/
  taskTypes.ts
  taskQuery.ts
  taskDue.ts
  taskMutation.ts
  taskSelectors.ts
  TaskHub.tsx
  TaskFilters.tsx
  TaskRow.tsx
  taskAccessibility.ts
```

Shared parser support belongs in `src/markdown/tasks.ts`. Workspace-wide task records belong in the shared metadata index, not in a second task store.

### 8.2 State flow

```text
Workspace files
    -> shared Markdown scanner
    -> WorkspaceNoteMetadata.tasks
    -> metadata index selectors
    -> TaskHub query/group/sort
    -> virtualized rows

Task toggle
    -> validate workspace session
    -> validate canonical source locator
    -> safe source mutation
    -> save/write success
    -> incremental metadata replacement
    -> selector result update
```

### 8.3 Index integration

The index builder extracts tasks in the same note read used for links, headings, blocks, properties, and attachments. It must not perform another full recursive workspace walk.

On an in-app note edit, the active editor may provide a debounced provisional metadata record for responsive UI. Provisional records must be visibly or internally marked and must never authorize a closed-file mutation. The authoritative record follows a successful save or a fresh content snapshot.

### 8.4 Mutation coordination

`taskMutation.ts` delegates to the shared source mutation layer. It must coordinate with:

- the open-document store;
- `saveCoordinator`;
- workspace transition draining;
- the platform bridge's in-flight operation tracker;
- the metadata index update queue.

A task toggle and a note autosave must serialize through the same path-specific write authority. There must never be two independent writers racing to save different versions of one note.

## 9. Concurrency and consistency

### 9.1 Workspace transitions

Every Task Hub query and mutation is tagged with the current workspace session. A workspace switch:

- cancels or invalidates outstanding query work;
- prevents old task results from publishing;
- drains or aborts writes according to the transition coordinator;
- clears selected task and transient errors;
- restores only settings owned by the newly active workspace.

### 9.2 External edits

For a closed note, the mutation re-reads immediately before write. If the task marker or note fingerprint differs, the operation stops.

For an open dirty note, the in-memory document is authoritative. External-change handling follows the existing conflict policy. The Task Hub must not bypass that policy by writing the last indexed disk content.

### 9.3 Rapid toggles

A second toggle on the same task is disabled while the first mutation is pending. Toggles on different notes may run concurrently within the bridge limit. Multiple toggles in the same note must be serialized by path and revalidated against the current canonical document before each edit.

### 9.4 Index freshness

Rows carry the note fingerprint or metadata generation used to render them. A mutation against an older generation must validate against current content. The UI can continue to display stale rows during a refresh, but must not treat them as write-authoritative.

## 10. Security and privacy

- No task content leaves the device.
- No network requests are added.
- Only contained Markdown paths returned by workspace discovery are readable or writable.
- Task text is rendered as text, not unsanitized HTML.
- Any rendered Markdown excerpt uses the existing sanitized preview pipeline.
- Error messages and logs must not expose Android content URIs or grant tokens.
- Query state must not be written outside app or workspace configuration storage.
- The feature must not follow links found inside task text.

## 11. Accessibility

- The hub has a named landmark and heading.
- Each task checkbox has an accessible name that includes task text and note context.
- Checkbox state uses the native or correct ARIA checked state.
- Row navigation is a separate control from completion.
- Filters are keyboard reachable and expose selected values.
- Group headings are announced and do not trap focus.
- Pending, saved, and error states are announced through a polite live region without excessive repetition.
- Focus remains on the toggled row when it stays in the current filtered set.
- If completing a task removes it from the Open filter, focus moves to the next row, previous row, or empty-state action in that order.
- Due status is communicated with text, not color alone.
- The compact layout respects increased Android font size and system accessibility settings.

## 12. Performance requirements

- The feature adds no second recursive note walk.
- Querying 10,000 indexed tasks should complete within 100 ms on a typical desktop after the index is available.
- Filter text input should update visible results within 100 ms after a short debounce.
- Result rendering must be virtualized above an implementation-defined threshold, initially 300 rows.
- Completing one task must reparse only the affected note, not rebuild the complete workspace index.
- Date-bucket calculation should be memoized per local calendar day and query generation.
- The UI must remain cancellable and responsive while initial indexing is active.
- Android memory use must remain bounded by indexed metadata, not full note bodies.

## 13. Functional requirements

**F02-FR-01** The system shall recognize the supported GFM unordered task syntax outside excluded Markdown regions.  
**F02-FR-02** The system shall index task state, text, path, location, indentation, due date, and source locator in the shared workspace metadata index.  
**F02-FR-03** The system shall exclude `.leotheca/`, templates, non-Markdown files, and paths outside workspace containment.  
**F02-FR-04** The Task Hub shall default to open tasks.  
**F02-FR-05** The Task Hub shall filter by status, due bucket, path, tags, and text.  
**F02-FR-06** The Task Hub shall group by due state, note, folder, or no grouping.  
**F02-FR-07** The Task Hub shall sort by due date, note source order, note modification, or text.  
**F02-FR-08** Selecting a task shall open its note and reveal its source location through the shared navigation contract.  
**F02-FR-09** Toggling a task shall modify only the completion marker in the canonical note source.  
**F02-FR-10** A task toggle shall fail closed when the source locator or workspace session is stale.  
**F02-FR-11** An open note shall be mutated through the open-document state and save coordinator.  
**F02-FR-12** A closed note shall be re-read and validated immediately before writing.  
**F02-FR-13** A successful mutation shall incrementally replace the affected note's metadata record.  
**F02-FR-14** A failed mutation shall preserve the note and show Retry and Open note actions.  
**F02-FR-15** The feature shall not insert hidden task IDs or create a proprietary task database.  
**F02-FR-16** The Task Hub shall expose an adaptive compact presentation with no horizontal page scrolling.  
**F02-FR-17** Workspace transitions shall invalidate stale task results and drain or cancel writes through the existing coordinator.  
**F02-FR-18** The feature shall operate without accounts, telemetry, or network access.  
**F02-FR-19** Persisted Task Hub settings shall be versioned and runtime-decoded.  
**F02-FR-20** All task controls shall be fully operable by keyboard and screen reader.

## 14. Acceptance criteria

1. Given a workspace with supported task markers, the hub lists each eligible task once and in the correct state.
2. Tasks inside fenced code, inline code, HTML comments, templates, and `.leotheca/` are absent.
3. `[x]` and `[X]` both appear completed; toggling either open writes `[ ]` and changes no other character.
4. Toggling an open task writes lowercase `x` and preserves marker type, indentation, prose, line ending, and neighboring content.
5. A task with `due: 2026-09-01` appears in Today when the user's local date is 2026-09-01.
6. Invalid or impossible due values remain visible as text and are not classified as due dates.
7. Every required filter and grouping mode produces deterministic results.
8. Activating a row opens the correct note and reveals the correct task, including after tabs or panes are already open.
9. Completing a task from the Open filter removes it only after the canonical source mutation succeeds.
10. A simulated external edit between indexing and toggle causes a conflict message and no write.
11. A dirty open note is never overwritten by an indexed disk snapshot.
12. Two rapid toggles in one note serialize and produce the intended final content without lost updates.
13. Switching workspaces during a query prevents old rows from appearing in the new workspace.
14. Switching workspaces during a pending write follows transition drain policy and never writes into the wrong workspace.
15. Corrupt or missing index cache causes recovery through a fresh scan rather than feature failure.
16. A 10,000-task fixture remains navigable and does not render all rows simultaneously.
17. Desktop keyboard navigation and Android touch interaction reach every control.
18. Completing the only visible task moves focus to the empty-state action instead of losing focus.
19. No task note content, path grant, or query is sent over the network.
20. The original Markdown can be opened by another editor with no Leotheca-specific task metadata required.

## 15. Test plan

### 15.1 Unit tests

- Task recognition for all supported markers.
- Exclusion of fenced code, indented code, inline code, and comments.
- Nested indentation and source-range calculation for LF and CRLF.
- Unicode and surrogate-pair offsets compatible with CodeMirror.
- Due-date extraction, duplicate dates, invalid dates, and local bucket calculation.
- Query filters, grouping, stable sorting, and empty filters.
- Locator validation and one-character edit generation.
- Versioned settings decode with missing, invalid, and unknown fields.

### 15.2 Component tests

- Initial Open filter and counts.
- Filter-sheet behavior and clear action.
- Row navigation versus checkbox behavior.
- Pending, success, stale, and write-error row states.
- Focus retention when a row stays or leaves the result set.
- Keyboard operation of filters, groups, rows, and context actions.
- Compact layout at 320 by 568 CSS pixels.

### 15.3 Integration tests

- Shared index extracts links, headings, properties, and tasks in one note read.
- In-app editor change updates the task projection without a full workspace walk.
- Toggle in a clean open note.
- Toggle in a dirty open note.
- Toggle in a closed note.
- Autosave and Task Hub toggle racing on the same path.
- External file modification between index and write.
- Workspace switch during indexing and during write.
- Open task into primary and secondary F07 groups.
- F03 rename updates task note paths without duplicating task records.

### 15.4 Platform tests

Desktop:

- contained read/write behavior;
- file watcher or external-change interaction;
- shortcut registration and Command Palette entry.

Android:

- SAF workspace reads and writes;
- activity recreation with hub open;
- increased text size and touch targets;
- Android Back behavior;
- workspace grant loss and recovery.

### 15.5 Manual verification matrix

Test at minimum:

- light and dark themes;
- Source, Preview, and Split modes;
- no due dates, mixed due dates, and all completed tasks;
- deeply nested folders;
- duplicate note names;
- 0, 1, 300, and 10,000 task fixtures;
- keyboard-only desktop use;
- TalkBack or another Android screen reader;
- reduced motion and 200 percent desktop zoom.

## 16. Rollout plan

### Phase 1: Parser and index

- Land shared task scanner fixtures.
- Extend note metadata and cache version.
- Add selectors and debug-only task count verification.

### Phase 2: Read-only Task Hub

- Ship list, filters, grouping, sorting, and note navigation behind a feature flag.
- Compare indexed results against fixture expectations and manual workspace samples.

### Phase 3: Safe completion toggle

- Add open-document and closed-file mutation paths.
- Add conflict UI, pending state, and incremental index replacement.

### Phase 4: Adaptive and accessibility hardening

- Integrate final visual-system primitives.
- Complete compact route or sheet, focus policy, and large-result virtualization.

### Phase 5: General availability

- Remove the feature flag after acceptance criteria pass on desktop and Android.
- Publish documentation and keyboard shortcut updates.

## 17. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Regex-only task parsing misidentifies code examples | Incorrect tasks or destructive edits | Use the shared structure scanner with excluded-region fixtures and exact source ranges |
| Indexed location becomes stale | Wrong task is toggled | Re-read or validate canonical open content; fail closed |
| Autosave overwrites Task Hub mutation | Lost update | One path-specific writer through open-document state and save coordinator |
| Large workspaces create slow filters | Unresponsive UI | One shared index, memoized selectors, debounce, virtualization |
| Due syntax surprises users | Misclassified tasks | Explicit ISO-only suffix convention, no natural-language guessing |
| Completing a filtered row loses focus | Accessibility failure | Defined next, previous, empty-state focus policy |
| Android grant expires | Capture or toggle failure | Existing workspace recovery actions and no hidden retry loop |

## 18. Documentation changes

Update:

- user documentation with supported task syntax and due-date convention;
- keyboard shortcut reference;
- architecture documentation for task records in the workspace metadata index;
- privacy documentation to state that tasks remain local Markdown;
- roadmap status for F02;
- test-fixture documentation for parser edge cases.

## 19. Definition of done

F02 is done when:

- all functional requirements are implemented;
- all acceptance criteria pass on desktop and Android;
- task extraction shares the existing workspace metadata read path;
- direct completion cannot overwrite stale or dirty note content;
- no proprietary task database or hidden task IDs are introduced;
- large-result performance and accessibility gates pass;
- settings and caches are runtime-decoded and migration-safe;
- docs, architecture notes, and tests land with the implementation;
- no unresolved critical or high-severity defects remain.


---

# F03 Software Design Document: Link Integrity and Refactor Center

**Status:** Approved for implementation design  
**Feature:** F03 Link Integrity and Refactor Center  
**Target:** Desktop and Android  
**Last updated:** 2026-09-01

## 1. Summary

The Link Integrity and Refactor Center makes structural changes to a Leotheca workspace understandable and recoverable. It has two connected capabilities:

1. **Workspace diagnostics:** detect broken, ambiguous, and structurally invalid local references.
2. **Previewed refactoring:** update supported references when a note or folder is renamed or moved, with per-file diffs, conflict checks, a recovery journal, and rollback.

This feature does not change Leotheca's storage model. Notes remain ordinary Markdown, canvases remain local files, and application metadata remains local. The feature creates no remote service and does not check external URLs.

F03 depends on F04's structured wikilink grammar, the shared workspace metadata index, safe source ranges, the central note-location navigation contract, and workspace-generation authority. It also requires save and workspace transition race conditions to be closed before general availability.

## 2. Motivation

Local Markdown workspaces are durable because files can be renamed, moved, synchronized, and edited by other tools. Those same freedoms create integrity risks. A note rename can break basename wikilinks, relative Markdown links, image references, open tabs, bookmarks, and canvas nodes. Duplicate names can make a link silently ambiguous. Heading edits can invalidate a deep link while the note itself still exists.

A naive global search-and-replace is unsafe. It may rewrite code samples, unrelated prose, or stale file snapshots. It cannot distinguish labels from targets, cannot account for the referrer's new path after a folder move, and cannot recover cleanly from a mid-operation storage failure. F03 therefore treats refactoring as a planned workspace transaction, not as string replacement.

## 3. Goals

1. Detect broken and ambiguous local references with precise source locations.
2. Detect duplicate note identities, missing heading or block fragments, missing attachments, and supported broken canvas references.
3. Preview every file and metadata change before a rename or move is applied.
4. Rewrite only parsed, supported reference syntax.
5. Preserve labels, fragments, formatting, unrelated source text, and line endings.
6. Validate all source snapshots immediately before mutation.
7. Coordinate dirty open documents, autosave, workspace transitions, and platform bridge operations.
8. Recover or roll back after partial failure or application interruption.
9. Provide equivalent safe behavior on desktop and Android despite different filesystem capabilities.
10. Keep ordinary Markdown and local files as the source of truth.

## 4. Non-goals

The first release does not include:

- remote HTTP or HTTPS link checking;
- automatic repair without user review;
- semantic guessing of intended notes;
- batch content replacement unrelated to links;
- Git integration or automatic commits;
- arbitrary regular-expression refactors;
- case-only folder renames on platforms where the bridge cannot guarantee them safely;
- cross-workspace moves or links;
- rewriting links inside code blocks or HTML comments;
- rewriting unknown plugin syntax;
- automatic heading renames based on prose edits;
- binary file repair;
- duplicate-note merging;
- automatic deletion of orphan notes;
- a promise of multi-file atomicity at the operating-system level.

F03 provides application-level journaling and recovery because desktop filesystems and Android SAF do not expose one portable atomic transaction across many files.

## 5. Terminology

- **Reference:** a parsed local wikilink, Markdown link, image destination, block or heading fragment, or supported canvas file reference.
- **Target:** the note, attachment, heading, block, or canvas-linked file a reference resolves to.
- **Referrer:** the file containing the reference.
- **Identity collision:** more than one note matches a basename, alias, or other non-path identity.
- **Mutation plan:** the immutable preview model containing expected snapshots and proposed edits.
- **Recovery journal:** temporary local transaction data sufficient to finish, roll back, or explain an interrupted operation.
- **Workspace mutation lock:** an application-level exclusive lock that prevents conflicting structural writes while a plan is being applied.

## 6. Supported reference classes

### 6.1 Structured wikilinks

F03 uses F04's parser and resolver for:

```markdown
[[Note]]
[[Note|Visible label]]
[[Note#Heading]]
[[Note#^block-id]]
![[Note#Heading]]
[[#Local heading]]
```

The target, optional fragment, optional label, embed marker, and exact source ranges are stored separately. F03 never reparses these links with a broader regular expression.

### 6.2 Markdown links and images

Supported destinations include local relative paths:

```markdown
[Design](../design/system.md)
![Sketch](../assets/sketch.png)
```

Rules:

- URI fragments are parsed separately from paths.
- Percent-encoded path characters are decoded for resolution and encoded again when serialized.
- Query strings are left unchanged and do not participate in local file resolution.
- Absolute URLs and schemes other than the explicitly supported local form are not checked or rewritten.
- Reference definitions are supported when the shared Markdown scanner can prove their source ranges.
- Links inside excluded Markdown regions are ignored.

### 6.3 Canvas file references

F03 may diagnose and rewrite file references in the current Leotheca canvas format only through a format-specific adapter. The adapter must:

- runtime-decode the canvas document;
- identify supported fields such as file-node paths;
- preserve unknown fields and ordering where the current serializer permits;
- produce a user-visible structured diff summary;
- refuse to rewrite malformed or unknown records.

A canvas must not be treated as arbitrary text or globally searched for path substrings.

### 6.4 Application metadata

The plan may update local metadata that refers to paths, including:

- open and recently active tabs;
- pinned tabs and editor-group placement from F07;
- bookmarks or favorites;
- per-workspace settings with known path fields;
- collection path filters from F09;
- current-note and active-location state.

Each metadata owner supplies a typed path-migration adapter. Unknown JSON fields are preserved. F03 does not recursively replace path-like strings in arbitrary configuration.

## 7. Resolution and normalization

### 7.1 Note resolution precedence

The structured note resolver uses deterministic precedence:

1. exact normalized workspace-relative note path, with or without `.md`;
2. exact path relative to the referrer's directory when the syntax is path-like;
3. unique note basename;
4. unique alias;
5. unresolved or ambiguous.

Case handling follows platform and workspace policy, but diagnostics record a case mismatch when the stored reference casing differs from the actual path or heading spelling.

A basename or alias match with multiple candidate paths is ambiguous and must never be resolved by recency, folder proximity, or arbitrary ordering.

### 7.2 Heading and block fragments

F04 owns fragment normalization. F03 reports:

- missing heading;
- duplicate normalized heading when no occurrence can be selected safely;
- missing block ID;
- duplicate block ID inside a note;
- invalid block ID syntax.

A rename or move preserves the fragment text exactly unless the user separately invokes a supported fragment repair action.

### 7.3 Serialization policy

A refactor preserves the user's existing link style when it remains unambiguous:

- basename wikilinks remain basename wikilinks;
- path-qualified wikilinks remain path-qualified;
- `.md` extension presence is preserved;
- labels and fragments are byte-preserved unless their target range changes;
- Markdown links remain Markdown links;
- relative destinations are recalculated from the referrer's post-operation directory.

When a basename link would become ambiguous after the operation, the preview upgrades it to the shortest unambiguous workspace-relative path. It does not silently choose one candidate.

When a path cannot be represented safely in the existing syntax, the affected edit is marked blocked and the complete plan cannot be applied until the user changes the path or excludes the operation.

## 8. Diagnostics Center

### 8.1 Diagnostic types

The first release includes:

| Code | Diagnostic | Default severity |
|---|---|---|
| `broken-note` | Note target cannot be resolved | Error |
| `ambiguous-note` | Note target resolves to multiple candidates | Error |
| `missing-heading` | Note exists but heading fragment does not | Warning |
| `ambiguous-heading` | Fragment matches duplicate normalized headings | Warning |
| `missing-block` | Note exists but block ID does not | Warning |
| `duplicate-block-id` | Same block ID occurs more than once in a note | Error |
| `duplicate-note-name` | Multiple notes share a basename | Info or Warning |
| `duplicate-alias` | Alias resolves to multiple notes | Warning |
| `case-mismatch` | Reference casing differs from actual target | Info |
| `missing-attachment` | Local image or attachment target is absent | Warning |
| `broken-canvas-file` | Supported canvas file reference is absent | Warning |
| `orphan-note` | Eligible note has no inbound note references | Info |

Self-links do not count as inbound links for orphan detection. Notes in configured template, archive, or generated folders may be excluded through future settings. In the first release, the Templates folder and `.leotheca/` are excluded.

### 8.2 Diagnostic record

```typescript
interface WorkspaceDiagnostic {
  id: string;
  generation: number;
  type: DiagnosticType;
  severity: "error" | "warning" | "info";
  sourcePath?: string;
  sourceRange?: { from: number; to: number; line: number; column: number };
  targetText?: string;
  candidatePaths?: string[];
  message: string;
  suggestedActions: DiagnosticAction[];
}
```

IDs are generation-scoped and not persistent. Diagnostics are recalculated from current metadata and file existence data.

### 8.3 User interface

The center provides:

- summary counts by severity and type;
- filters for type, severity, folder, and text;
- grouping by diagnostic type or source note;
- virtualized results;
- source and target context;
- `Open source`, `Open target`, `Choose target`, `Preview fix`, or `Dismiss for session` actions when applicable.

`Dismiss for session` is not a permanent ignore rule. Persistent ignore patterns are out of scope for the first release.

Selecting a source diagnostic opens the exact source range through the shared note-location API. Candidate targets for ambiguity are shown explicitly and sorted by path.

### 8.4 Repair actions

Safe single-reference repair is allowed only when the user chooses the target. It uses the same source mutation validation as a refactor plan. The UI previews the exact replacement before writing.

Orphan and duplicate-name diagnostics do not offer automatic destructive repair.

## 9. Rename and move experience

### 9.1 Entry points

Previewed refactoring is invoked from:

- file-tree Rename and Move actions;
- note action menu;
- Command Palette;
- a diagnostic repair flow;
- a future drag-and-drop move action, if that action routes through the same coordinator.

The existing direct rename path must be replaced or wrapped so user-visible note and folder renames cannot bypass F03.

### 9.2 Refactor dialog

The flow has four states:

1. **Define:** choose the new name or destination.
2. **Analyze:** resolve affected paths and build the plan.
3. **Review:** inspect summary, warnings, and per-file diffs.
4. **Apply:** execute with progress, then show success or recovery state.

The Review screen shows:

- old and new path;
- count of notes, canvases, and metadata records affected;
- number of references changed;
- ambiguous or blocked references;
- case-sensitivity warnings;
- per-file before and after diff;
- files that are dirty and require save;
- rollback limitations, if any.

The primary action is disabled while blocked changes remain.

### 9.3 Note rename or move

A note operation may change:

- the note path itself;
- all parsed references that resolve to the old path;
- relative references inside the moved note because its base directory changes;
- references in other moved files when a folder operation contains the note;
- open tabs, bookmarks, collections, and other typed metadata.

The displayed note title is not automatically rewritten. A first heading or frontmatter title is content, not a filename mirror, unless a separate explicit feature is approved.

### 9.4 Folder rename or move

A folder operation builds an old-to-new path map for every contained eligible file. It then resolves every supported reference against the post-operation path graph.

This is necessary because a relative link may remain valid, become invalid, or need a different relative destination depending on whether the referrer, target, or both move.

The planner must reject:

- moving a folder into itself or a descendant;
- destination collisions;
- paths outside workspace containment;
- reserved `.leotheca/` destinations;
- unsupported case-only operations where safe execution is not guaranteed;
- a plan whose path count exceeds configured safety limits without explicit confirmation.

### 9.5 Preview semantics

The preview is immutable. Any file modification, workspace generation change, destination change, or index generation change after analysis invalidates the plan. The Apply action must either re-analyze automatically and explain the change, or require the user to refresh the preview.

No plan may be applied from a stale preview.

## 10. Mutation plan

```typescript
interface RefactorPlan {
  id: string;
  kind: "rename-note" | "move-note" | "rename-folder" | "move-folder" | "repair-reference";
  workspaceSession: number;
  indexGeneration: number;
  createdAt: string;
  pathMoves: PathMove[];
  fileChanges: PlannedFileChange[];
  metadataChanges: PlannedMetadataChange[];
  diagnostics: PlanDiagnostic[];
  blocked: boolean;
}

interface PlannedFileChange {
  originalPath: string;
  finalPath: string;
  format: "markdown" | "canvas" | "json";
  expectedFingerprint: string;
  edits?: TextEdit[];
  replacementContent?: string;
  changeSummary: string[];
}
```

All paths are normalized workspace-relative paths. The plan never stores or displays Android grant tokens.

## 11. Transaction protocol

### 11.1 Pre-apply preparation

Before execution:

1. Confirm the plan belongs to the current workspace session and latest index generation.
2. Acquire the exclusive workspace mutation lock.
3. Block new structural mutations and path-specific writes for affected paths.
4. Flush all dirty affected open notes through the canonical save coordinator.
5. Abort if any affected note cannot be saved.
6. Re-read every affected text or canvas file and compare its fingerprint with the plan.
7. Confirm every source exists, every destination is available, and containment still holds.
8. Rebuild the plan if a changed input can be refreshed safely; otherwise return to Review with conflicts.

A user may cancel before the first mutation begins.

### 11.2 Recovery journal

Create a transaction directory:

```text
<workspace>/.leotheca/transactions/<transaction-id>/
  manifest.json
  originals/
  staged/
```

The manifest is versioned and runtime-decoded. It includes:

- transaction kind and state;
- workspace-relative path map;
- expected and final fingerprints;
- completed step markers;
- backup file mapping;
- application version and format version;
- timestamps;
- enough typed metadata to attempt finish or rollback.

Original content for every file to be rewritten is copied into `originals/`. Metadata snapshots required for rollback are included. Binary files are not copied unless the operation itself moves them and the platform adapter requires a backup strategy.

The transaction directory must itself be excluded from normal indexing and file-tree display.

### 11.3 Apply sequence

The mutation executor uses this logical order:

1. Write and fsync, where supported, the prepared journal.
2. Mark state `prepared`.
3. Execute path moves through a platform-specific contained operation, recording each completed move.
4. Rewrite affected files at their post-move paths using atomic replace where supported and the safest available SAF write otherwise.
5. Persist typed application metadata changes.
6. Update open-document path identities and canonical contents without remounting unaffected editors.
7. Incrementally replace affected workspace metadata records or trigger one recovery rebuild.
8. Mark state `committed`.
9. Release the mutation lock.
10. Delete the journal asynchronously only after the committed state is durable.

The UI must not expose intermediate paths as a completed state. It shows transaction progress until commit or recovery.

### 11.4 Failure and rollback

If an error occurs after preparation:

1. Stop further forward mutations.
2. Mark the journal `rollback-required`.
3. Restore rewritten files from backups at their current mapped locations.
4. Reverse completed path moves in reverse order.
5. Restore typed metadata snapshots.
6. Refresh open documents and rebuild affected index records.
7. If all rollback steps succeed, mark `rolled-back` and report that no refactor was applied.
8. If any rollback step fails, preserve the journal and enter Recovery mode.

Rollback is best effort because external tools may modify files during the operation. Such conflicts must never be overwritten silently.

### 11.5 Startup recovery

On workspace open, before normal indexing publishes:

- inspect `.leotheca/transactions/` for nonterminal journals;
- validate each manifest without executing arbitrary paths;
- show a blocking recovery dialog for a transaction that can affect current content;
- offer `Finish refactor`, `Roll back`, `Inspect files`, and `Leave unchanged` when technically safe;
- explain any manual steps when neither finish nor rollback can be proven safe.

`Leave unchanged` keeps the journal and opens the workspace in a restricted state where affected structural mutations are disabled. It does not pretend the transaction is resolved.

## 12. Platform bridge changes

### 12.1 Shared bridge API

Recommended operations:

```typescript
interface WorkspaceMutationBridge {
  createTransactionJournal(input: JournalCreateInput): Promise<void>;
  updateTransactionManifest(input: JournalUpdateInput): Promise<void>;
  moveContainedEntry(input: MoveEntryInput): Promise<void>;
  replaceContainedTextFile(input: ReplaceTextInput): Promise<void>;
  restoreContainedFile(input: RestoreFileInput): Promise<void>;
  listRecoveryTransactions(): Promise<RecoverySummary[]>;
  removeRecoveryTransaction(id: string): Promise<void>;
}
```

The exact API may be consolidated into a typed `applyWorkspaceMutationStep`, but all operations must remain allowlisted, containment-checked, and visible to the in-flight bridge operation tracker.

### 12.2 Desktop

Desktop should use same-directory temporary files and atomic rename for individual text replacements when available. It must handle Windows path and case behavior explicitly. A case-only rename may require a validated intermediate name.

### 12.3 Android

Android uses the persisted SAF tree grant. The native plugin must validate document IDs and tree ancestry for every operation. Since providers differ in rename and replacement behavior, capability failures must be reported before execution when they can be detected.

No transaction may depend on `/workspace` as a unique filesystem identity. The active workspace session and grant are authoritative.

## 13. Open-document integration

Affected open notes require coordinated updates:

- Dirty content is saved before plan validation.
- After a path move, the open document keeps its editor state, undo history where technically possible, selection, and scroll position.
- The document key changes from old path to new path exactly once.
- Save queues, pending reads, and tab references migrate to the new key under the mutation lock.
- A stale file-open completion for the old path cannot publish after the refactor.
- If preserving undo across a path identity change is not reliable, the implementation may clear undo only for the moved document after showing a pre-apply notice. This exception requires explicit test coverage and documentation.

Unchanged editors must not remount.

## 14. Security and privacy

- No workspace content or diagnostics leave the device.
- External URLs are not fetched.
- All journal and mutation paths are workspace-relative and validated against containment.
- Journal manifests cannot request arbitrary commands or absolute paths.
- Symlink and traversal behavior follows the bridge's existing containment policy and must be covered by adversarial tests.
- Temporary backups are deleted after a verified commit or rollback.
- A failed deletion is reported and can be retried from Recovery.
- Android content URIs and grant tokens are never displayed or logged.
- Diffs render source text as text, not raw HTML.
- Canvas and JSON adapters preserve unknown fields and reject malformed structures rather than coercing them.

## 15. Accessibility

- Diagnostics and plan changes are available as structured lists, not only colored diffs.
- Each diagnostic states type, severity, source, target, and available action in its accessible name or description.
- The refactor flow has labeled steps and announces analysis and apply progress.
- Keyboard users can expand every changed file, review each diff hunk, and choose every action.
- Diff additions and removals have textual labels in addition to color.
- Focus moves to the first blocking issue when Apply is unavailable.
- Recovery dialogs identify consequences of each action without relying on iconography.
- Compact sheets and dialogs maintain 44 by 44 CSS pixel touch targets and correct Android Back behavior.

## 16. Performance requirements

- Diagnostics reuse the shared workspace metadata index and file-existence inventory.
- Opening the center after an index is ready should produce summary counts within 200 ms for a typical workspace.
- Result lists and per-file plan lists are virtualized above 300 rows.
- Plan analysis is cancellable and generation-authoritative.
- A plan reads only candidate referrers, affected canvases, and typed metadata needed for exact snapshots.
- Preview diff generation is lazy for files not yet expanded when a plan affects more than 100 files.
- The UI shows progress for analysis longer than 250 ms.
- No whole-workspace body text is retained solely for diagnostics after metadata extraction.

## 17. Functional requirements

**F03-FR-01** The system shall parse and resolve supported local references through shared format-specific parsers.  
**F03-FR-02** The system shall report broken, ambiguous, missing-fragment, duplicate-identity, missing-attachment, broken-canvas, case-mismatch, and orphan diagnostics defined in this SDD.  
**F03-FR-03** Every source diagnostic shall include a precise openable source location when one exists.  
**F03-FR-04** The system shall never check external network links.  
**F03-FR-05** Note and folder Rename and Move actions shall route through one refactor coordinator.  
**F03-FR-06** The coordinator shall build an immutable mutation plan before writing.  
**F03-FR-07** The Review step shall show all affected files, metadata changes, warnings, blocked changes, and per-file diffs.  
**F03-FR-08** The plan shall preserve labels, fragments, link style, unrelated source, and line endings whenever possible.  
**F03-FR-09** Relative destinations shall be recalculated from post-operation referrer paths.  
**F03-FR-10** Ambiguous basename references shall not be resolved arbitrarily.  
**F03-FR-11** A basename link that becomes ambiguous shall be upgraded to a shortest unambiguous path in preview.  
**F03-FR-12** The planner shall reject containment violations, destination collisions, self-descendant moves, and reserved destinations.  
**F03-FR-13** Apply shall acquire an exclusive workspace mutation lock.  
**F03-FR-14** Apply shall flush affected dirty open documents and abort on save failure.  
**F03-FR-15** Apply shall re-read and fingerprint every affected source immediately before mutation.  
**F03-FR-16** A stale plan shall never be applied.  
**F03-FR-17** The executor shall create a durable recovery journal before the first structural mutation.  
**F03-FR-18** Individual file rewrites shall use the safest platform-supported contained replacement.  
**F03-FR-19** Every completed mutation step shall be recorded in the journal.  
**F03-FR-20** A failure shall trigger best-effort rollback and preserve the journal when rollback is incomplete.  
**F03-FR-21** Workspace startup shall detect and present nonterminal recovery journals before normal editing.  
**F03-FR-22** Open tabs, bookmarks, F07 group state, and F09 path filters shall migrate through typed adapters.  
**F03-FR-23** Unknown metadata fields shall not be globally searched and replaced.  
**F03-FR-24** Open-document path migration shall prevent stale reads or saves from publishing under the old path.  
**F03-FR-25** Successful commit shall refresh affected index records and diagnostics.  
**F03-FR-26** Recovery data shall be removed after a verified terminal state.  
**F03-FR-27** The center shall be fully keyboard and screen-reader operable.  
**F03-FR-28** Desktop and Android shall implement equivalent preview, apply, rollback, and recovery semantics.  
**F03-FR-29** No operation shall require an account, telemetry, or network access.  
**F03-FR-30** Existing direct rename paths that bypass the coordinator shall be removed or made internal-only.

## 18. Acceptance criteria

1. Renaming a uniquely linked note previews and updates each parsed wikilink target while preserving labels and fragments.
2. Moving a note recalculates relative Markdown links both to the note and inside the moved note.
3. Moving a folder correctly handles references where referrer only, target only, both, or neither move.
4. Links inside fenced code, inline code, and comments are unchanged.
5. A duplicate basename produces an ambiguity diagnostic with all candidate paths and no guessed target.
6. A link to a missing heading or block produces the correct fragment diagnostic while the note itself remains resolved.
7. A missing local image produces a missing-attachment diagnostic; an HTTP image is not fetched or reported as local missing content.
8. Supported canvas file nodes are diagnosed and rewritten through the canvas adapter without deleting unknown fields.
9. Every rename or move shows a complete Review step before Apply.
10. A file changed after preview invalidates the plan and remains untouched.
11. A dirty affected open note is saved before apply; a save failure aborts the operation.
12. Destination collision, path traversal, reserved `.leotheca/` destination, and moving a folder into itself are blocked.
13. A simulated failure after one path move triggers rollback and restores original names and content.
14. A simulated failure during rollback preserves a nonterminal journal and shows Recovery on next workspace open.
15. Recovery can finish or roll back a fixture transaction without writing outside its allowlisted paths.
16. An application interruption after each journaled step results in a coherent recovery choice on restart.
17. Open tabs, pinned states, active note, bookmarks, and collection path filters point to the new paths after commit.
18. Unaffected editors retain content, selection, scroll, and undo state.
19. A stale file-open result for the old path cannot replace the moved document after commit.
20. Case-only rename behavior is either safely completed through an intermediate path or rejected before mutation on the affected platform.
21. Android SAF provider failures produce a recoverable error, not silent partial success.
22. Large plans lazily render diffs and remain cancellable during analysis.
23. Diff meaning is available without color, and all actions are keyboard reachable.
24. No remote request is made while diagnostics or refactoring runs.
25. After commit, a fresh index scan contains no references to the old path except deliberate prose or excluded syntax.

## 19. Test plan

### 19.1 Unit tests

- Structured resolver precedence and ambiguity.
- Path normalization, extension preservation, URL encoding, and fragments.
- Relative-path recalculation for every referrer and target movement combination.
- Link-style preservation and shortest-unambiguous-path selection.
- Heading and block diagnostics.
- Orphan calculation with self-links and exclusions.
- TextEdit ordering and source-range validation.
- Plan invalidation rules.
- Journal manifest runtime decoding and path allowlisting.
- Typed metadata path adapters with unknown-field preservation.

### 19.2 Parser fixtures

Include:

- labels containing `#` and `|` escapes where supported;
- embeds;
- local-only fragments;
- Unicode note names and headings;
- spaces, parentheses, percent encoding, and `#` in filenames;
- CRLF and LF;
- code fences of different lengths;
- inline code and HTML comments;
- duplicate names, aliases, headings, and block IDs;
- Markdown reference definitions;
- malformed links that must remain untouched.

### 19.3 Integration tests

- Note rename with clean open referrers.
- Note rename with dirty target and dirty referrer.
- Folder move with open tabs in both F07 groups.
- Rename while the index is rebuilding.
- Rename while a stale file-open read is pending.
- Save coordinator and mutation lock serialization.
- External modification between preview and preflight.
- Failure injection after every transaction step.
- Recovery finish and rollback after simulated process termination.
- Metadata migration for tabs, bookmarks, settings, and collections.
- Incremental index refresh versus full recovery rebuild.

### 19.4 Security tests

- `../` traversal and absolute-path injection in plans and journals.
- Symlink escape attempts on desktop.
- Crafted Android document IDs outside the granted tree.
- Malformed journal with unknown operation or path.
- Malformed canvas and JSON metadata.
- HTML in diff content.
- Oversized plan and recovery directory pressure.

### 19.5 Platform tests

Desktop:

- Windows case handling and locked files;
- macOS and Linux atomic replacement behavior;
- watcher notifications generated by staged writes and renames;
- interrupted process recovery.

Android:

- providers that support and reject rename;
- providers with non-atomic write behavior;
- activity recreation during Review and Apply;
- grant revocation;
- interruption and recovery from persisted journal state.

### 19.6 Manual verification

Use workspaces with:

- duplicate filenames in different folders;
- mixed wikilink and Markdown-link styles;
- images and attachments;
- canvases;
- deep folder moves;
- 1, 100, and 5,000 affected references;
- external sync simulation;
- keyboard-only and screen-reader review;
- compact 320 by 568 layout.

## 20. Rollout plan

### Phase 1: Structured diagnostics

- Land F04 parser and resolver contracts.
- Add diagnostic records and read-only center behind a feature flag.
- Validate against fixture workspaces.

### Phase 2: Note rename preview

- Replace direct note rename UI with Analyze and Review.
- Support Markdown and typed application metadata changes.
- Keep apply disabled in production until journal and rollback tests pass.

### Phase 3: Transaction executor and recovery

- Add mutation lock, preflight, journal, rollback, startup recovery, and failure injection.
- Enable note rename on desktop, then Android after provider coverage passes.

### Phase 4: Folder moves and canvases

- Add path-graph planning for folder operations.
- Add canvas adapter and collection path-filter adapter.

### Phase 5: General availability

- Remove bypass rename paths.
- Enable diagnostics and previewed refactoring by default.
- Update user and architecture documentation.

## 21. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Partial multi-file failure | Broken workspace | Durable journal, backups, recorded steps, rollback, startup recovery |
| Stale preview | User changes lost | Preflight re-read and immutable generation-scoped plan |
| Parser rewrites false positives | Corrupted prose or code | Rewrite only proven format records with exact ranges |
| Dirty tab overwritten | Data loss | Flush canonical document and use one mutation lock |
| Folder move changes relative semantics | Broken links | Resolve against complete post-operation path graph |
| Platform rename behavior differs | Partial results | Capability-aware adapters, preflight, failure injection on desktop and SAF |
| Recovery journal itself is malformed | Unsafe writes | Versioned decoder, allowlisted operations, containment revalidation |
| Huge preview exhausts memory | Unresponsive app | Lazy diffs, bounded concurrency, virtualization, cancellation |
| Metadata adapter misses a path owner | Stale UI state | Central adapter registry and package-level path-ownership audit |

## 22. Documentation changes

Update:

- user guide for diagnostics, rename preview, and recovery;
- architecture documentation for the structured resolver, mutation lock, and transaction journal;
- platform bridge documentation for contained move and replacement semantics;
- file format documentation for journal and collection path migration;
- keyboard and accessibility documentation;
- troubleshooting guide for incomplete recovery;
- roadmap status for F03.

## 23. Definition of done

F03 is done when:

- all supported reference types use shared parsers and precise source ranges;
- diagnostics produce correct, openable results without network access;
- all user-visible note and folder rename or move paths route through Preview and Apply;
- stale files, dirty tabs, workspace transitions, and pending reads cannot cause lost updates;
- a durable recovery journal exists before the first structural mutation;
- failure injection after every mutation step proves finish or rollback behavior;
- desktop and Android pass containment and recovery tests;
- no parser rewrites code, comments, malformed syntax, or arbitrary JSON strings;
- performance and accessibility gates pass;
- documentation, architecture updates, migration notes, and tests land with the code;
- no unresolved critical or high-severity data-integrity defect remains.


---

# F04 Software Design Document: Heading Links, Block References, and Embeds

**Status:** Approved for implementation design  
**Feature:** F04 Heading Links, Block References, and Embeds  
**Target:** Desktop and Android  
**Last updated:** 2026-09-01

## 1. Summary

F04 extends Leotheca's existing wikilinks from note-level navigation to precise knowledge references. Users can link to headings, create stable block references, embed a full note or selected section in Preview, autocomplete valid targets, and navigate consistently in Source, Preview, and Split modes.

The syntax remains readable plain Markdown. Explicit block IDs live in the note only when the user asks Leotheca to create one. Embeds are read-only projections of their source notes and never copy content into the referring file. All rendered content remains local and passes through the existing sanitization boundary.

F04 owns the structured wikilink grammar and resolver used by F03 diagnostics and refactoring, F06 copy-link actions, preview navigation, editor completion, and backlink records. Parallel link parsers are prohibited.

## 2. Motivation

Note-level wikilinks are effective for broad relationships but become imprecise in long notes. Users often need to reference one decision, paragraph, list item, or section. Copying that content creates drift. Generic anchor behavior also becomes fragile when headings are duplicated or reformatted.

F04 introduces two complementary target types:

- human-readable heading references for stable, unique section names;
- explicit block IDs for content that needs a durable identity independent of its visible wording.

Read-only embeds make those targets useful in dashboards, project summaries, and synthesis notes while preserving a single source of truth.

## 3. Goals

1. Parse note, heading, block, label, and embed parts of wikilinks into a structured record.
2. Support same-note and cross-note heading and block navigation.
3. Offer context-aware completion for notes, headings, and blocks.
4. Let users copy a link to a unique heading or create a stable block ID on explicit request.
5. Render full-note, heading-section, and block embeds as read-only content.
6. Resolve embedded relative links and images against the embedded source note.
7. Detect missing and ambiguous subtargets for F03.
8. Preserve compatibility with existing note-level links wherever resolution can prove intent.
9. Keep rendering sanitized, bounded, cancellable, and offline.
10. Keep source Markdown portable and understandable outside Leotheca.

## 4. Non-goals

The first release does not include:

- editing transcluded content in place;
- automatic insertion of block IDs during indexing;
- database-style live queries inside embeds;
- cross-workspace links or embeds;
- remote URL embeds;
- executable scripts or components in notes;
- automatic heading rename propagation outside F03's reviewed refactor flow;
- occurrence syntax for selecting one of several duplicate headings;
- arbitrary CSS supplied by notes;
- embedding binary files as editable objects;
- recursive embeds without limits;
- compatibility with every third-party wikilink dialect;
- a rich-text editor.

## 5. Syntax

### 5.1 Supported forms

```markdown
[[Note]]
[[Note|Visible label]]
[[Note#Heading]]
[[Note#Heading|Visible label]]
[[Note#^block-id]]
[[Note#^block-id|Visible label]]
[[#Heading]]
[[#^block-id]]
![[Note]]
![[Note#Heading]]
![[Note#^block-id]]
```

A same-note embed such as `![[#Heading]]` is supported subject to the same cycle safeguards as every embed.

### 5.2 Grammar rules

The parser recognizes an optional `!`, followed by `[[`, structured content, and the first valid unescaped `]]` terminator.

Inside the link:

- the first unescaped `|` separates target expression from visible label;
- the first unescaped `#` inside the target expression separates note target from fragment;
- a fragment beginning with `^` is a block ID;
- an empty note target means the current note;
- backslash may escape `\`, `#`, `|`, `[`, and `]` inside the structured expression;
- surrounding whitespace around the note target and fragment is trimmed for resolution but preserved in the source record;
- an empty fragment, empty block ID, or missing closing delimiter produces a malformed record, not a guessed valid link.

Recommended type:

```typescript
interface WikiLinkRecord {
  kind: "link" | "embed";
  raw: string;
  noteTarget: string;
  fragment?:
    | { kind: "heading"; value: string }
    | { kind: "block"; value: string };
  label?: string;
  sourceFrom: number;
  sourceTo: number;
  targetFrom: number;
  targetTo: number;
  fragmentFrom?: number;
  fragmentTo?: number;
  labelFrom?: number;
  labelTo?: number;
  parseStatus: "valid" | "malformed" | "legacy-fallback";
}
```

### 5.3 Legacy compatibility

The existing implementation historically treated more of the text inside `[[...]]` as one note target. Before changing parser semantics, the implementation must scan fixture workspaces for filenames containing raw `#` or `|`.

Compatibility rule:

- First attempt structured resolution.
- If the structured note portion does not resolve, but the complete unescaped legacy text resolves uniquely to an existing note, treat the record as a legacy whole-note link.
- Mark it `legacy-fallback` so F03 can offer a reviewed conversion to escaped syntax.
- Never reinterpret a uniquely resolvable legacy filename as a fragment link without review.

This fallback is for existing links, not the serializer. New links created by Leotheca use escaped structured syntax.

### 5.4 Display label

When no explicit label exists:

- a note link displays the note name;
- a heading link displays the heading text;
- a block link displays the block's first meaningful text, truncated for presentation, while retaining the full accessible description;
- unresolved links display the literal target expression.

Labels affect display only. They do not affect resolution or backlinks.

## 6. Heading targets

### 6.1 Supported headings

The shared scanner extracts:

- ATX headings from levels 1 through 6;
- setext headings from levels 1 and 2;
- exact source ranges for marker, visible content, and complete heading block;
- plain display text with inline Markdown formatting removed;
- section ranges extending from the heading through the content before the next heading of equal or higher level.

Headings inside excluded code or comment regions are ignored.

### 6.2 Normalization

Heading matching uses a deterministic `headingKey`:

1. remove parsed inline Markdown formatting from visible heading content;
2. decode local Markdown escapes and character entities recognized by the renderer;
3. trim leading and trailing whitespace;
4. collapse internal Unicode whitespace runs to one space;
5. apply Unicode-compatible case folding independent of UI locale.

Punctuation is retained. Diacritics are retained. Leotheca does not transliterate heading text for resolution.

The link serializer writes the current visible heading text, escaped as needed, not the normalized key.

### 6.3 Duplicate headings

Multiple headings in one note may share a normalized key. Such a fragment is ambiguous. Behavior:

- completion shows each occurrence with line number and ancestry;
- a manually typed ambiguous link is rendered as unresolved-ambiguous rather than silently selecting the first;
- F03 reports `ambiguous-heading`;
- `Copy link to heading` offers to create a stable block ID on the selected heading and copies a block link instead;
- no hidden occurrence suffix is added to the Markdown syntax in the first release.

### 6.4 Preview anchors

Rendered headings receive deterministic application-owned attributes:

```html
<h2 id="lt-heading-design-system-2" data-lt-heading-key="design system" data-lt-heading-occurrence="2">
```

The concrete slug algorithm may differ, but it must:

- be deterministic for one rendered document;
- produce unique valid DOM IDs;
- escape user input safely;
- not be used as the Markdown resolution authority;
- retain the normalized key and occurrence as data attributes for navigation.

## 7. Block references

### 7.1 Block ID syntax

An explicit block ID is a whitespace-delimited token at the end of a supported Markdown block:

```markdown
This decision remains valid for the first release. ^release-decision

- The user owns the Markdown files. ^local-first

> A quoted principle. ^principle

## Architecture boundary ^architecture-boundary
```

The identifier grammar is:

```text
[A-Za-z0-9][A-Za-z0-9-]{0,63}
```

IDs are case-sensitive for serialization and case-insensitive for duplicate detection. New IDs are generated in lowercase.

### 7.2 Eligible blocks

The first release supports IDs attached to:

- paragraphs;
- headings;
- individual list items;
- blockquotes;
- fenced code blocks when the ID appears on a separate immediately following line, not inside the code fence.

Tables, thematic breaks, and raw HTML blocks are not eligible in the first release unless the parser can prove a stable complete block range without ambiguity.

For a multi-line paragraph, blockquote, or list item, the ID belongs at the end of its final logical line. The scanner reports the complete block range and the ID token range.

### 7.3 Rendering

A valid block ID token is not shown as ordinary rendered text. The rendered block receives:

- a deterministic DOM ID;
- `data-lt-block-id`;
- an optional unobtrusive copy-link affordance on hover, focus, or long press.

Malformed or duplicate ID tokens remain visible as source-derived text or warning indicators according to parser certainty. The renderer must not hide text it cannot prove is an ID.

### 7.4 Creating an ID

`Copy block link` and `Create block link` are explicit user actions.

Flow:

1. Determine the selected Markdown block from the current cursor or preview element.
2. If it already has a unique valid ID, copy that link.
3. Otherwise propose a generated ID such as `b-7k3m2p9d` or a normalized human-readable candidate.
4. Confirm uniqueness against the active note.
5. Insert the token through one minimal CodeMirror transaction or the shared closed-file mutation helper.
6. Wait for canonical content acceptance.
7. Copy or insert the structured link.

Generated IDs use a local cryptographically strong random source when available. They contain no user or device identifier.

The application never adds IDs merely because a note is indexed or previewed.

## 8. Resolution model

```typescript
interface ResolvedWikiTarget {
  status: "resolved" | "missing-note" | "ambiguous-note" | "missing-fragment" | "ambiguous-fragment" | "malformed";
  notePath?: string;
  heading?: HeadingRecord;
  block?: BlockRecord;
  candidatePaths?: string[];
}
```

Resolution order for the note portion follows the shared F03 resolver. Fragment resolution happens only after exactly one note is resolved.

Same-note targets use the canonical current note path. A same-note link in an unsaved new note can resolve locally, but workspace-wide backlinks are provisional until the note has a contained path and successful save.

Every resolution result is tied to an index generation and workspace session. A click or completion selection revalidates the current target before opening.

## 9. Editor completion

### 9.1 Note completion

Typing `[[` or `![[` opens the existing note completion with:

- note name;
- path context;
- aliases;
- recency signal where already available;
- ambiguity indicator for duplicate names.

Selecting a note inserts the escaped note target but does not close completion if the user continues with `#`.

### 9.2 Heading completion

After `[[Note#`, completion shows headings from the resolved note:

- heading text;
- level;
- breadcrumb ancestry;
- line number;
- duplicate warning.

For the current unsaved note, headings come from the canonical in-memory scanner result. For a closed note, they come from the workspace metadata index and may be refreshed on demand if stale.

Selecting a unique heading inserts its escaped visible text.

### 9.3 Block completion

After `[[Note#^`, completion shows explicit block IDs with a short sanitized plain-text preview and line number. It does not show full sensitive note bodies beyond the local UI and does not keep those previews in persistent caches unless already part of the bounded metadata record.

The current note may also offer `Create block ID at cursor` when no suitable block exists.

### 9.4 Completion safety

Completion results are generation-authoritative. Results from an older target note or workspace cannot replace a newer completion query. Large notes may load block previews lazily.

## 10. Navigation

### 10.1 Link activation

Activating a resolved link calls the shared `OpenNoteRequest`:

- heading target uses `{ kind: "heading", headingKey }` plus the proven source range when available;
- block target uses `{ kind: "block", blockId }`;
- note target opens without a sublocation.

Modifier behavior should follow the existing open-note conventions. Once F07 exists, an explicit `Open in other group` action targets the secondary group without changing the core resolver.

### 10.2 Source mode

Source navigation moves the selection to the target content, scrolls it into view, and briefly highlights the range without altering the note.

For a heading block ID, the visible heading text is selected rather than only the hidden token.

### 10.3 Preview mode

Preview navigation scrolls to the rendered element and applies a short focus-safe highlight. It does not move DOM focus unless keyboard activation requires it. The target can receive temporary `tabindex=-1` for announced navigation, then restore its prior state.

### 10.4 Failed navigation

If a previously resolved target changes before activation:

- open the note if its path still resolves;
- show `The linked section moved or no longer exists`;
- offer `Search headings` or `Open diagnostics` when relevant;
- never scroll to an arbitrary similarly named target.

## 11. Embeds

### 11.1 Embed types

- `![[Note]]` renders the note body after frontmatter.
- `![[Note#Heading]]` renders that heading and its section through the next heading of equal or higher level.
- `![[Note#^block-id]]` renders the exact referenced block.

Frontmatter is not rendered as an embed body in the first release. A visible property table can be a separate future option.

### 11.2 Read-only presentation

Every embed has an application frame with:

- source note name;
- optional section label;
- `Open source note` action;
- resolved content or a clear placeholder;
- accessible `Embedded content from ...` label.

The frame must be visually quiet and must not make the embedded content look editable. Text selection and local link activation remain available.

### 11.3 Relative context

While rendering an embed:

- relative Markdown links resolve from the embedded note's directory;
- relative images and attachments resolve from the embedded note's directory;
- same-note wikilinks inside the embed refer to the embedded note, not the host note;
- heading and block anchors are namespaced to prevent DOM ID collisions in the host preview;
- activating a link carries the correct source context to the resolver.

### 11.4 Recursive embeds

Embeds may contain embeds under strict limits:

- maximum recursion depth: 3;
- maximum resolved embed instances per host preview: 25;
- maximum total source bytes loaded for one host preview: 1 MiB by default;
- duplicate target in the active recursion chain: cycle placeholder;
- per-note load timeout or cancellation on newer preview generation.

Required placeholders include:

- `Embedded note not found`;
- `Embedded heading not found`;
- `Embedded block not found`;
- `Embed cycle stopped`;
- `Embed limit reached`;
- `Could not read embedded note`.

These limits are implementation constants in the first release and may become advanced settings later.

### 11.5 Rendering and sanitization

Recommended pipeline:

```text
host canonical Markdown
  -> parse host and locate embeds
  -> resolve and load allowed local source slices
  -> recursively assemble an application-owned render tree
  -> render Markdown with source-context annotations
  -> sanitize complete assembled HTML with DOMPurify
  -> attach event handlers through application code
```

Sanitization happens after assembly so embedded HTML cannot bypass the host boundary. No embedded source may add scripts, event handlers, remote frames, or unrestricted style elements.

A nested embed read is cancellable and tied to preview generation. Stale reads cannot publish after the host note, workspace, or view mode changes.

### 11.6 Edit behavior

Embeds are not editable in Preview. In Source mode, users edit the literal `![[...]]` expression. `Open source note` is the supported route to editing embedded content.

## 12. Backlinks and metadata index

Link records gain structured target data:

```typescript
interface LinkRecord {
  sourcePath: string;
  kind: "wikilink" | "embed" | "markdown-link" | "image";
  rawTarget: string;
  noteTarget?: string;
  fragmentKind?: "heading" | "block";
  fragmentValue?: string;
  label?: string;
  sourceFrom: number;
  sourceTo: number;
  resolution?: LinkResolutionSummary;
}
```

Backlinks may be grouped as:

- links to note;
- links to this heading;
- links to this block;
- embeds of note or subtarget.

A note-level backlink view includes all resolved subtarget links because every subtarget also references the note. Context snippets are loaded lazily and sanitized.

The cache version must change. Corrupt or old cache data triggers a fresh scan.

## 13. Architecture

Recommended modules:

```text
src/linking/
  wikiSyntax.ts
  wikiResolver.ts
  wikiSerializer.ts
  linkNavigation.ts
  linkCompletion.ts

src/markdown/
  headings.ts
  blocks.ts
  links.ts

src/preview/
  embedResolver.ts
  embedRenderer.ts
  previewAnchors.ts
  embedLimits.ts
```

Responsibilities:

- `wikiSyntax.ts` parses and exposes exact source ranges.
- `wikiResolver.ts` maps syntax to current metadata targets.
- `wikiSerializer.ts` is the only creator of new wikilink text.
- `linkNavigation.ts` adapts resolved targets to `OpenNoteRequest`.
- `embedResolver.ts` owns recursion context, byte budgets, reads, and cancellation.
- the shared scanner owns heading and block extraction.
- the preview owns sanitized rendering, not resolution policy.

## 14. Concurrency and lifecycle

- All resolver, completion, navigation, and embed operations carry workspace session and request generation.
- Open-note headings and blocks come from current canonical editor content rather than an older disk index.
- Preview rebuilds cancel older nested embed reads.
- A save incrementally replaces heading, block, and outbound-link records for the affected note.
- A workspace transition drains bridge reads and prevents old embedded content from publishing.
- F03 acquires the workspace mutation lock before rewriting structured targets.
- Creating a block ID serializes with autosave through the canonical open document.
- A link click during an in-progress structural refactor is disabled or resolved only after the transaction reaches a terminal state.

## 15. Security and privacy

- All source and embeds remain local.
- No remote embeds, URL previews, or network fetches are introduced.
- Embedded image and attachment paths pass existing containment checks.
- The complete assembled preview is sanitized after recursive embed expansion.
- User content never becomes an HTML attribute without escaping.
- DOM IDs are application-generated and cannot inject markup.
- Block IDs are length- and character-limited.
- Embed byte, depth, and count limits protect memory and denial-of-service behavior.
- Android grant tokens and content URIs are not written into Markdown or logs.
- Clipboard actions copy only the requested link text and never note content implicitly.

## 16. Accessibility

- Resolved links expose meaningful accessible names, including note and fragment when no explicit label exists.
- Unresolved and ambiguous links have textual status and a discoverable action, not color alone.
- Embed frames are labeled regions with an `Open source note` control.
- Heading and block navigation works with keyboard activation.
- Temporary target highlights respect reduced motion and do not use animation as the only signal.
- Copy-link controls appear on focus as well as pointer hover.
- Completion lists expose note path, heading level, duplicate state, and block preview through proper option semantics.
- Error placeholders are readable by screen readers and do not trap focus.
- Touch targets meet the compact-layout minimum.

## 17. Performance requirements

- Heading, block, and structured link extraction share the one note scan used by the workspace metadata index.
- Completion for an indexed note should show initial headings within 100 ms after a resolved `#` query.
- A host preview with no embeds must not incur embedded-note reads.
- Embedded sources are loaded only on demand and cached by path plus content fingerprint within the active workspace session.
- Cache memory is bounded and released on workspace switch.
- Preview generation remains cancellable.
- The 1 MiB, 25-instance, and depth-3 limits are enforced before additional reads are scheduled.
- Large completion lists and backlink lists are virtualized above established thresholds.

## 18. Functional requirements

**F04-FR-01** The system shall parse note target, fragment, label, and embed marker into a structured record with exact source ranges.  
**F04-FR-02** The parser shall ignore wikilink-like text in excluded code and comment regions.  
**F04-FR-03** The resolver shall support same-note and cross-note heading and block targets.  
**F04-FR-04** Heading matching shall use the deterministic normalization defined in this SDD.  
**F04-FR-05** Duplicate headings shall be treated as ambiguous rather than resolved by order.  
**F04-FR-06** Explicit block IDs shall follow the defined grammar and eligible-block rules.  
**F04-FR-07** The application shall never insert a block ID without explicit user action.  
**F04-FR-08** New links shall be serialized only through the shared escaping serializer.  
**F04-FR-09** Legacy whole-note targets containing raw separators shall retain a unique-resolution fallback.  
**F04-FR-10** Completion shall support notes, headings, and explicit block IDs.  
**F04-FR-11** Completion results shall be workspace- and request-generation authoritative.  
**F04-FR-12** Activating a resolved target shall use the central note-location navigation API.  
**F04-FR-13** Source and Preview modes shall reveal the correct target without editing it.  
**F04-FR-14** Full-note embeds shall omit frontmatter from rendered content.  
**F04-FR-15** Heading embeds shall include the heading and its complete section range.  
**F04-FR-16** Block embeds shall include only the referenced parsed block.  
**F04-FR-17** Relative links and images inside embeds shall resolve from the embedded note's directory.  
**F04-FR-18** Same-note links inside embeds shall use the embedded note as source context.  
**F04-FR-19** Recursive embeds shall enforce cycle, depth, count, and byte limits.  
**F04-FR-20** The complete assembled preview shall pass through DOMPurify before display.  
**F04-FR-21** Embeds shall be read-only and expose Open source note.  
**F04-FR-22** Backlink records shall distinguish note, heading, block, and embed references.  
**F04-FR-23** Missing and ambiguous targets shall remain visible and feed F03 diagnostics.  
**F04-FR-24** Saves shall incrementally refresh the affected note's heading, block, and link records.  
**F04-FR-25** Stale embedded reads or resolver results shall never publish after newer user intent.  
**F04-FR-26** The feature shall work without accounts, telemetry, or network access.  
**F04-FR-27** All link, completion, embed, and copy controls shall be keyboard and screen-reader operable.  
**F04-FR-28** Source Markdown shall remain usable in external text editors without Leotheca metadata.

## 19. Acceptance criteria

1. Every supported syntax example parses into the expected structured fields and source ranges.
2. Escaped `#`, `|`, bracket, and backslash characters serialize and resolve correctly.
3. A unique existing legacy filename containing raw `#` or `|` remains resolvable through the compatibility fallback.
4. ATX and setext headings can be linked and opened in Source and Preview.
5. Heading matching is insensitive to case and collapsed whitespace but retains punctuation and diacritics.
6. Duplicate normalized headings produce ambiguity, not navigation to the first occurrence.
7. Creating a block link adds exactly one valid unique ID in one undoable source transaction.
8. Merely opening or indexing a note never adds a block ID.
9. Paragraph, list item, blockquote, heading, and post-fence block IDs resolve to the intended block.
10. Invalid and duplicate block IDs produce diagnostics and are not silently selected.
11. Heading and block completion shows correct line and context for the resolved target note.
12. Switching target notes during completion prevents older results from replacing the current list.
13. A heading link opens the exact source heading and correct preview anchor.
14. A full-note embed excludes frontmatter and includes the source-note action.
15. A heading embed stops before the next heading of equal or higher level.
16. A block embed renders only the referenced block.
17. Relative images and links inside an embed resolve as if rendered from the embedded note.
18. Same-note links inside an embed navigate within the embedded source note.
19. A direct or indirect embed cycle produces a cycle placeholder and no unbounded reads.
20. Depth, count, and source-byte limits stop further expansion with an accessible placeholder.
21. Script, event-handler, and unsafe HTML payloads in a nested embed are removed by the final sanitizer.
22. A workspace switch during embed loading prevents old content from appearing in the new workspace.
23. Backlinks distinguish ordinary links and embeds and retain fragment information.
24. F03 receives missing-note, ambiguous-note, missing-heading, ambiguous-heading, missing-block, and duplicate-block data.
25. No network request is issued for any link or embed behavior.

## 20. Test plan

### 20.1 Unit tests

- Structured syntax parsing and exact offsets.
- Escape and serializer round trips.
- Legacy target fallback.
- Heading extraction for ATX and setext forms.
- Inline-format stripping and normalized keys.
- Duplicate heading behavior.
- Block extraction and eligible-block boundaries.
- ID validation, duplicate detection, and random generation.
- Section-range calculation.
- Resolver status matrix.
- Embed recursion context and limit accounting.

### 20.2 Rendering tests

- Heading DOM anchors and namespacing.
- Hidden valid block IDs and visible malformed tokens.
- Full-note, heading, and block embeds.
- Relative links and images from nested sources.
- Sanitization after nested assembly.
- Error and cycle placeholders.
- Light, dark, reduced-motion, and forced-colors presentation.

### 20.3 Editor tests

- Note, heading, and block completion.
- Completion cancellation and stale results.
- Copy heading link.
- Create and copy block link in an open clean and dirty note.
- One-step undo after ID insertion.
- Same-note targets in unsaved content.

### 20.4 Integration tests

- Save updates index and backlinks.
- Link navigation into primary and secondary F07 groups.
- F06 outline copy-link uses the same serializer.
- F03 rename preserves labels and fragments.
- External source change while an embed is loading.
- Workspace switch during nested reads.
- Preview mode change during rendering.

### 20.5 Platform tests

Desktop and Android:

- contained nested-note and attachment reads;
- Unicode paths and headings;
- activity or window lifecycle interruption;
- keyboard or TalkBack operation;
- clipboard link actions;
- large note and embed-limit behavior.

## 21. Rollout plan

### Phase 1: Parser, headings, and navigation

- Land structured syntax and serializer fixtures.
- Extend metadata records and cache version.
- Add heading links and same-note navigation behind a feature flag.

### Phase 2: Block references

- Add explicit block extraction, ID insertion, copy actions, and diagnostics.
- Complete editor and preview navigation.

### Phase 3: Completion and backlinks

- Add heading and block completion.
- Upgrade backlink records and UI grouping.

### Phase 4: Read-only embeds

- Add full-note and section rendering, source context, limits, cancellation, and final sanitization.
- Enable Android after lifecycle and memory tests pass.

### Phase 5: General availability

- Enable by default.
- Update F03 and F06 integrations, user docs, and migration notes.

## 22. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| New separators reinterpret old filenames | Broken existing links | Unique legacy fallback, repository scan, reviewed F03 conversion |
| Duplicate headings navigate unpredictably | Wrong context | Treat as ambiguous and offer stable block ID |
| Block IDs pollute notes | Reduced portability | Insert only on explicit action, simple visible syntax |
| Nested embeds cause recursion or memory pressure | App instability | Cycle detection and strict depth, count, and byte budgets |
| Embedded content bypasses sanitizer | Security issue | Sanitize complete assembled output after expansion |
| Relative links use host context | Wrong targets | Carry source-note context through every nested render node |
| Stale async result appears | Cross-note or cross-workspace leak | Session and request generations with cancellation |
| Multiple parsers disagree | Incorrect diagnostics or refactors | One syntax parser, resolver, and serializer used by all features |

## 23. Documentation changes

Update:

- user guide with syntax examples and escaping rules;
- accessibility guide for link and embed controls;
- architecture documentation for parser, resolver, serializer, and embed pipeline;
- cache and metadata schema documentation;
- troubleshooting for ambiguous headings and block IDs;
- roadmap status for F04;
- F03 and F06 cross-reference documentation.

## 24. Definition of done

F04 is done when:

- one structured parser, resolver, and serializer serve editor, preview, backlinks, F03, and F06;
- heading and block links navigate precisely in Source, Preview, and Split modes;
- block IDs are stable, explicit, portable, and never inserted automatically;
- embeds remain read-only, bounded, source-context-correct, and sanitized after assembly;
- stale reads and workspace transitions cannot publish incorrect content;
- legacy link compatibility is tested and documented;
- all functional requirements and acceptance criteria pass on desktop and Android;
- accessibility and performance gates pass;
- documentation, architecture updates, cache migration, and tests land with implementation;
- no unresolved critical or high-severity security or data-integrity defects remain.


---

# F05 Software Design Document: Universal Quick Capture and Inbox

**Status:** Approved for implementation design  
**Feature:** F05 Universal Quick Capture and Inbox  
**Target:** Desktop and Android  
**Last updated:** 2026-09-01

## 1. Summary

F05 lets users capture text, links, and supported images into a local Leotheca workspace with minimal friction. It provides an in-app Capture Sheet, a local `leotheca://capture` automation route, Android share-target integration, configurable inbox destinations, and a bounded crash-safe pending queue for captures that arrive before a workspace can accept them.

A capture is never sent to a server and never requires an account. Leotheca does not fetch shared URLs or generate remote previews. The final result is ordinary Markdown plus ordinary local attachment files. When a destination note is already open, the capture is applied to the canonical in-memory document so a later autosave cannot overwrite it.

F05 integrates with F20 Workspace Profiles. Only one workspace is active at a time. A capture targeting another profile is queued until the user activates that profile through the authoritative workspace transition coordinator.

## 2. Motivation

Knowledge tools are most useful when adding a thought is easier than postponing it. Captures often arrive outside the note the user is editing: a copied idea, a browser URL, selected text from another Android app, or a photo. Without a reliable inbox, these fragments end up in unrelated apps or are lost.

Universal capture is also a high-risk write path. External intents are untrusted, Android URI permissions are short-lived, a workspace may be unavailable, and direct disk appends can race with a dirty open note. F05 therefore separates receipt, review, and commit. It keeps pending external data in bounded app-private storage until the final Markdown write succeeds or the user explicitly discards it.

## 3. Goals

1. Open a fast Capture Sheet from anywhere inside Leotheca.
2. Accept local capture deep links on desktop and Android.
3. Receive Android shared text, URLs, and images through standard share intents.
4. Append a readable Markdown block to a configured inbox note.
5. Optionally create a new note in a configured capture folder.
6. Support a date-pattern destination without requiring the complete F01 calendar feature.
7. Preserve external capture data across cold start, workspace recovery, and activity recreation.
8. Route every write through the active workspace bridge, canonical document state, and save coordinator.
9. Provide deterministic, retry-safe attachment ingestion.
10. Keep all processing local, bounded, secure, and understandable.

## 4. Non-goals

The first release does not include:

- URL fetching, Open Graph metadata, readability extraction, or screenshots;
- a cloud inbox or cross-device service;
- background reminders or scheduled captures;
- OCR;
- audio recording or speech-to-text;
- silent writes from arbitrary external deep links;
- an always-running desktop background agent;
- a required tray icon;
- clipboard monitoring;
- automatic capture from browser history;
- cross-workspace writing without activating the destination profile;
- support for arbitrary shared binary file types;
- annotation of shared images;
- automatic tagging through machine learning;
- hidden capture metadata inside notes.

A configurable desktop global shortcut may open the Capture Sheet while Leotheca is running. Keeping the app resident only to service the shortcut is out of scope.

## 5. Capture sources

### 5.1 In-app Capture Sheet

Entry points:

- Command Palette action `Quick Capture`;
- configurable in-app keyboard shortcut;
- optional global shortcut while the desktop process is running;
- mobile top-bar or overflow action;
- empty-state and inbox-note actions where useful.

The sheet opens without changing the current note. The text field receives focus unless a platform accessibility setting makes automatic focus inappropriate.

### 5.2 Local deep link

Supported route:

```text
leotheca://capture
```

Recognized query parameters:

| Parameter | Meaning |
|---|---|
| `text` | UTF-8 capture body |
| `title` | Suggested title for a new note or capture heading |
| `url` | Optional source URL, recorded but never fetched |
| `mode` | `append` or `new` |
| `profile` | Optional F20 profile UUID |
| `open` | `true` to open the result after commit |

Security and size rules:

- The decoded combined text, title, and URL payload is limited to 32 KiB.
- Unknown parameters are ignored only if the route is otherwise valid.
- Invalid enum or profile values are shown as review warnings, not executed.
- Absolute file paths, workspace paths, and Android content URIs are not accepted as note destinations through the URL.
- An external deep link always opens the Capture Sheet for review in the first release.
- The route cannot request deletion, arbitrary attachment reads, silent script execution, or an unrestricted target path.

### 5.3 Android share target

The Android activity registers for:

- `ACTION_SEND` with `text/plain`;
- `ACTION_SEND` with `text/uri-list` when a textual URL is available;
- `ACTION_SEND` with `image/*`;
- `ACTION_SEND_MULTIPLE` with `image/*`.

When both `EXTRA_TEXT` and image streams are present, both are represented in one pending capture.

The native receiving layer must ingest transient content URIs into app-private staging before the grant can expire. It must not assume a shared URI is a filesystem path.

### 5.4 Current selection helpers

Inside Leotheca, a future context action may prefill the Capture Sheet from selected text. It must still use the same request model and commit path. No separate direct append implementation is allowed.

## 6. Destinations

### 6.1 Destination modes

The Capture Sheet supports:

1. **Append to inbox note**
2. **Create new note in capture folder**
3. **Append to date-pattern note**

Default mode is Append to inbox note.

### 6.2 Inbox note

Default relative path:

```text
Inbox.md
```

The user may configure another contained Markdown path. Validation rules:

- path is workspace-relative;
- extension is `.md` or is normalized to `.md`;
- path cannot be under `.leotheca/`;
- traversal and absolute paths are rejected;
- parent folders may be created through contained bridge operations;
- the target is created if absent.

### 6.3 Capture folder

Default relative folder:

```text
Inbox/
```

For New note mode, a title is converted to a safe filename while preserving the visible title in the note when configured. Empty titles use a local timestamp. Collisions append `-2`, `-3`, and so on after a contained existence check.

Example:

```text
Inbox/Release-idea-2026-09-01-1432.md
```

Filename generation must be deterministic enough for preview and revalidated at commit.

### 6.4 Date-pattern target

A user may configure a limited local pattern such as:

```text
Daily/{{date:YYYY-MM-DD}}.md
```

Supported tokens in the first release:

- `{{date:YYYY-MM-DD}}`
- `{{date:YYYY-MM}}`
- `{{date:YYYY}}`

Tokens use the user's local calendar at commit time. Arbitrary format strings, shell expansion, and directory traversal are not supported. F01 may later adopt the same date-token utility.

### 6.5 Workspace profile

The destination profile selector uses F20's profile catalog.

Rules:

- default is the active profile;
- the user may designate one default capture profile;
- the profile UUID, not a display path, is persisted in capture preferences;
- a capture for a non-active profile is not written in the background;
- committing such a capture first invokes F20's save-safe activation flow;
- if activation fails or access must be relinked, the capture remains pending;
- forgetting a profile does not discard its pending captures without explicit user confirmation.

## 7. Capture Sheet experience

### 7.1 Fields

Required controls:

- multiline capture body;
- optional title;
- source URL when supplied;
- attachment thumbnails and remove actions;
- destination profile;
- destination mode and target preview;
- `Open after capture` option;
- primary `Capture` action;
- `Save for later` for external requests;
- `Discard` with confirmation for staged external data.

The target preview displays only a safe human-readable profile name and workspace-relative path. Android grant tokens are never shown.

### 7.2 Fast path

For an in-app text capture with a valid active destination:

- opening the sheet focuses the body;
- the configured submit shortcut commits;
- success closes the sheet and shows a truthful local confirmation;
- `Open after capture` navigates only after the write succeeds.

The application must not announce success when content is only queued or when an attachment copy remains incomplete.

### 7.3 External review

External requests show their source as `Shared from Android` or `Opened from local automation`, without trusting an arbitrary application label as security identity.

The user can edit all imported text before commit. The original pending item remains recoverable until the edited version commits successfully.

### 7.4 Pending Inbox

When one or more captures cannot commit, a local Pending Captures surface shows:

- received date and source type;
- safe text preview;
- attachment count and total size;
- intended profile and destination;
- status such as `Needs workspace access`, `Ready`, or `Previous attempt failed`;
- Review, Retry, Change destination, and Discard actions.

Pending captures are distinct from the Markdown inbox note. They are temporary app-private work awaiting an explicit commit.

### 7.5 Compact behavior

On Android and compact layouts:

- Capture is a full-height sheet or route;
- body input grows with content and respects the software keyboard;
- attachment strip scrolls horizontally inside its own region, not the page;
- target settings may collapse under a `Destination` row;
- primary actions remain reachable above safe-area insets;
- Android Back first closes nested pickers, then asks about an unsaved external draft, then exits the sheet.

## 8. Markdown output

### 8.1 Canonical append block

Default appended representation:

```markdown
### 2026-09-01 14:32

Captured text remains ordinary Markdown.

Source: <https://example.invalid/path>

![[attachments/capture-20260901-143200-photo.jpg]]
```

Rules:

- timestamp uses local time and ISO-like ordering;
- title replaces the timestamp heading when supplied, with timestamp available on the next line if configured;
- body text is inserted as supplied after newline normalization, not interpreted or fetched;
- source line is omitted when absent;
- attachment references use the application's ordinary local attachment syntax;
- one blank line separates fields;
- append adds exactly enough leading newlines to preserve a valid block boundary;
- the target note's existing LF or CRLF convention is preserved;
- no hidden capture ID is inserted into the Markdown.

The exact default may be exposed as a local capture template in a later phase. The first implementation keeps one versioned serializer to avoid arbitrary template execution.

### 8.2 New note representation

A new note contains optional supported frontmatter only when the user has configured capture defaults through existing settings. At minimum:

```markdown
# Release idea

Captured text.

Source: <https://example.invalid/path>
```

The visible heading is escaped as Markdown text. A title is not required.

### 8.3 URL behavior

The URL field is recorded literally after validation as an `http`, `https`, or other explicitly allowed user-facing URI scheme. It is never opened during capture and never used to fetch a title, favicon, preview, or content.

Potentially dangerous schemes are rendered as plain text unless the existing safe-link policy explicitly permits them.

## 9. Attachment ingestion

### 9.1 Limits

First-release limits:

- maximum 10 images per capture;
- maximum 25 MiB per image;
- maximum 100 MiB staged attachments per capture;
- maximum 250 MiB total pending-queue attachment storage;
- MIME must be `image/*` and content must be readable through the provided URI;
- unsupported items remain listed with a clear error and are not silently dropped.

Limits are checked before and during streaming because external metadata can be wrong.

### 9.2 Staging

For Android shares:

1. Native code receives the intent and validates count and declared MIME.
2. Each URI is streamed into an app-private file with a generated capture-item ID.
3. Actual byte count and basic image signature are recorded.
4. The staged manifest is committed atomically in app-private storage.
5. The UI receives only the pending item ID and safe metadata.

Original display names are sanitized for presentation and file generation. Path separators, control characters, bidirectional control characters, and reserved names are removed or replaced.

### 9.3 Workspace destination

Default attachment folder follows the workspace's existing attachment setting. Final names use:

```text
capture-<local-date>-<local-time>-<short-random>-<safe-name>.<ext>
```

The bridge chooses a collision-free contained path. Relative Markdown references are calculated from the destination note.

### 9.4 Retry-safe commit

A `CaptureCommitPlan` assigns final attachment paths before writes. Every staged file has a content fingerprint.

On retry:

- if the planned workspace attachment exists with the same fingerprint, reuse it;
- if it exists with different content, allocate a new path;
- never overwrite an existing attachment;
- keep staged files until the note commit succeeds;
- after success, remove staging data;
- if note commit fails after attachment copies, keep the plan and reuse those exact files on retry.

A user who discards a failed capture may be offered cleanup of new unreferenced files created by that capture. Cleanup is explicit and fingerprint-validated.

## 10. Pending queue

### 10.1 Storage

Pending captures live in platform app-private storage, not in the workspace:

```text
pending-captures/
  index.json
  <capture-id>/
    manifest.json
    attachments/
```

The index and manifests are versioned, runtime-decoded, and written atomically where supported.

```typescript
interface PendingCaptureV1 {
  version: 1;
  id: string;
  receivedAt: string;
  source: "in-app" | "deep-link" | "android-share";
  targetProfileId?: string;
  mode: "append" | "new" | "date";
  text: string;
  title?: string;
  sourceUrl?: string;
  openAfterCommit: boolean;
  attachments: PendingAttachment[];
  commitPlan?: CaptureCommitPlan;
  lastError?: PendingCaptureError;
}
```

### 10.2 Queue policy

- Maximum 50 pending captures.
- Text manifest storage is limited to 5 MiB total.
- Attachment storage follows the 250 MiB total limit.
- When a new external capture would exceed a limit, the user is shown a blocking choice to review existing pending items or reject the new share. Existing data is not deleted automatically.
- In-app drafts are not persisted unless the user chooses Save for later or a platform lifecycle event requires preservation.
- A successful commit removes the item only after all workspace writes are confirmed.
- Discard requires confirmation when attachments or nonempty text exist.

### 10.3 Privacy

Pending content is app-private but may still be included in device backups according to platform policy. The product documentation must state this and expose a `Clear pending captures` action. Platform backup exclusion may be applied to staged attachments if consistent with recovery expectations.

## 11. Commit protocol

### 11.1 Build plan

```typescript
interface CaptureCommitPlan {
  captureId: string;
  workspaceSession: number;
  profileId: string;
  notePath: string;
  noteMode: "append" | "create";
  expectedNoteFingerprint?: string;
  markdownBlock: string;
  attachments: PlannedCaptureAttachment[];
  createdAt: string;
}
```

The plan is recalculated when destination, body, title, URL, or attachment selection changes.

### 11.2 Activate destination

If the profile is not active:

1. preserve the current Capture Sheet draft in the pending queue;
2. call F20's authoritative profile activation flow;
3. drain current workspace saves and native operations;
4. on successful activation, rebuild the target plan against the active workspace;
5. on failure, return to the pending item with recovery actions.

The capture cannot write into a profile based only on a stored path or URI token while another workspace is active.

### 11.3 Commit attachments

Stream staged attachments to unique contained workspace paths. Record each successful copy in the pending plan for retry. Do not remove staging data.

### 11.4 Commit note

For an existing open target note:

- use the canonical in-memory document;
- append through one CodeMirror transaction at the document end;
- preserve current selection unless `Open after capture` requests navigation;
- serialize with the save coordinator;
- mark commit success only after the write succeeds.

For an existing closed target note:

- read through the bridge;
- compute and validate its fingerprint;
- construct append text with its line-ending convention;
- revalidate immediately before write;
- write through the bridge;
- fail closed on external change.

For a missing target note:

- create parent folders through contained operations;
- create the note only if the final path remains absent;
- never overwrite a file created concurrently.

### 11.5 Finalize

After note write success:

- incrementally update workspace metadata for the note;
- open and reveal the inserted block when requested;
- remove the pending manifest and staged files;
- report a truthful success message with destination profile and path;
- retain a lightweight in-memory undo opportunity only when it can safely perform a conflict-checked source removal. Persistent capture undo is out of scope.

## 12. Architecture

Recommended modules:

```text
src/capture/
  captureTypes.ts
  captureSettings.ts
  captureSerializer.ts
  captureDestinations.ts
  captureQueue.ts
  captureCommit.ts
  captureProtocol.ts
  CaptureSheet.tsx
  PendingCaptures.tsx

src/workspace/
  appendNote.ts

android/.../
  ShareIntentReceiver.kt
  PendingCaptureStore.kt
```

A native receipt layer stages external Android data. Shared TypeScript owns review, destination selection, Markdown serialization, and commit coordination. Platform bridges own contained reads, writes, directory creation, and attachment streams.

## 13. Bridge and manifest changes

### 13.1 Shared bridge

Add or expose typed operations for:

- append or replace contained note content under path authority;
- create contained parent directories;
- stream a staged attachment into a unique contained file;
- fingerprint a contained file when needed;
- remove a newly created capture attachment during explicit cleanup.

All operations participate in the existing in-flight bridge tracker and workspace transition drain.

### 13.2 Android manifest

Add narrow intent filters for the supported MIME types and actions. The main activity must handle both cold-start and already-running delivery. Intent payload parsing must occur in native code with count, size, and URI permission checks before data reaches JavaScript.

No broad file-management permission is requested. SAF workspace access remains authoritative.

### 13.3 Desktop protocol and shortcut

The desktop scheme registration routes only recognized Leotheca automation URLs. An optional global shortcut while the process is running opens an empty Capture Sheet. Shortcut registration errors, such as conflicts with another app, are shown in Settings and do not disable other capture routes.

## 14. Concurrency and lifecycle

- Every commit plan carries active profile ID and workspace session.
- Profile switch, workspace relink, or workspace generation change invalidates the plan and triggers rebuild.
- Pending external data survives process restart and Android activity recreation.
- A second share received while the Capture Sheet is open creates another pending item rather than overwriting the current draft.
- Multiple pending captures for one note commit serially by note path.
- Attachment streaming is bounded and cancellable.
- Open-document appends serialize with autosave and F02/F03/F04 mutations.
- A workspace transition cannot complete while a note or attachment write remains untracked.
- Stale completion callbacks cannot delete a newer pending item or show success in a different workspace.

## 15. Error and recovery model

Required errors and actions:

| Error | Required actions |
|---|---|
| No workspace profile | Choose or add workspace, Keep pending |
| Profile unavailable | Retry, Relink, Choose another profile, Keep pending |
| Target path invalid | Change destination |
| Note changed externally | Reload destination and retry, Create new note |
| Note save failed | Retry, Open destination, Keep pending |
| Attachment unreadable | Remove attachment, Retry |
| Attachment limit exceeded | Remove items, Keep text only, Cancel |
| Workspace storage full | Free space, Retry, Keep pending |
| Shortcut registration failed | Change shortcut, Disable global shortcut |
| Pending queue full | Review pending captures, Reject new capture |

Errors never discard the original staged content automatically.

## 16. Security and privacy

- No capture content leaves the device.
- URLs are recorded but never fetched.
- External deep links always require review in the first release.
- Input lengths, attachment counts, and stream sizes are bounded.
- Shared URIs are opened only with granted permissions and copied to app-private staging.
- External display names never become paths without sanitization.
- Workspace paths are selected from validated settings, not accepted from external parameters.
- Writes and directory creation are containment-checked.
- Existing files are never overwritten by attachment ingestion.
- Pending manifests never contain Android grant tokens after staging.
- Logs contain capture IDs and error classes, not captured text, URLs, or URI values.
- Rendered previews use existing safe-link and HTML sanitization rules.

## 17. Accessibility

- The Capture Sheet has a clear title, description, and logical field order.
- Imported versus user-entered content is not distinguished by color alone.
- Attachment remove controls include filenames in accessible names.
- Destination summaries are announced when changed.
- Commit progress and errors use polite live regions.
- Focus moves to the first invalid field after validation failure.
- A successful capture either restores prior focus or moves to the opened destination as requested.
- Pending Captures supports keyboard, screen-reader, and touch operation.
- Compact controls meet 44 by 44 CSS pixel targets and remain visible above the software keyboard.
- Discard confirmation clearly states what local staged data will be deleted.

## 18. Performance requirements

- Opening an empty in-app Capture Sheet should respond visually within 100 ms.
- External text-only capture staging should not block the UI thread.
- Attachment copies stream in bounded chunks and do not load complete images into JavaScript memory.
- Thumbnail generation is bounded and can fall back to an icon.
- Pending-list previews load lazily.
- Commit writes only the target note and selected attachments.
- A successful append reparses only the affected note in the workspace metadata index.
- Queue size checks use manifest metadata plus verified stream counts.
- Process startup should not decode full attachment bodies.

## 19. Functional requirements

**F05-FR-01** The application shall expose an in-app Quick Capture command and shortcut.  
**F05-FR-02** The application shall accept the defined `leotheca://capture` route with bounded validated parameters.  
**F05-FR-03** External deep-link captures shall require user review before writing.  
**F05-FR-04** Android shall accept supported text, URL, single-image, and multi-image share intents.  
**F05-FR-05** Android shared URIs shall be staged before transient permission can expire.  
**F05-FR-06** The Capture Sheet shall support append, new-note, and date-pattern destinations.  
**F05-FR-07** Destination paths shall be contained, validated, and prohibited under `.leotheca/`.  
**F05-FR-08** F20 profile UUIDs shall identify capture destinations.  
**F05-FR-09** A non-active destination profile shall be activated through F20 before commit.  
**F05-FR-10** Captures that cannot commit shall remain in a bounded app-private pending queue.  
**F05-FR-11** Pending data shall be removed only after successful commit or explicit discard.  
**F05-FR-12** Markdown output shall use the versioned local serializer and contain no hidden capture ID.  
**F05-FR-13** URLs shall never be fetched during capture.  
**F05-FR-14** Attachment count, item size, capture size, and total queue size shall be enforced.  
**F05-FR-15** Attachment filenames shall be sanitized and final paths shall be collision-free.  
**F05-FR-16** Existing attachment files shall never be overwritten.  
**F05-FR-17** Attachment retry shall reuse an existing planned file only when its fingerprint matches.  
**F05-FR-18** An open target note shall be changed through the canonical document and save coordinator.  
**F05-FR-19** A closed target note shall be re-read and conflict-checked before append.  
**F05-FR-20** New-note creation shall fail rather than overwrite a concurrently created file.  
**F05-FR-21** A commit shall report success only after attachments and note content are durable.  
**F05-FR-22** A successful commit shall refresh the target note's workspace metadata.  
**F05-FR-23** Multiple captures for one note shall serialize without lost updates.  
**F05-FR-24** Workspace transitions shall track and drain all capture writes.  
**F05-FR-25** Stale callbacks shall not delete pending data or publish success.  
**F05-FR-26** The feature shall require no account, telemetry, network service, or broad Android storage permission.  
**F05-FR-27** The Capture Sheet and Pending Captures shall be fully keyboard and screen-reader operable.  
**F05-FR-28** Core capture behavior shall be equivalent on desktop and Android.

## 20. Acceptance criteria

1. An in-app text capture appends one correctly separated Markdown block to the configured inbox.
2. Existing LF and CRLF line endings are preserved.
3. A missing inbox note and parent folder are created through contained operations.
4. A title collision in New note mode creates a safe unique filename without overwriting.
5. Date-pattern mode resolves against the user's local date at commit.
6. A deep link larger than the configured bound is rejected into a review error without writing.
7. A deep link cannot supply an absolute destination path or silently commit.
8. Android sharing of text opens a recoverable reviewed capture on cold start and warm start.
9. Android sharing of one or several images stages each readable item and reports unsupported items.
10. Revoking the transient source grant after staging does not lose the pending copy.
11. Attachment limits stop oversized input without deleting already pending captures.
12. Final attachment names are safe, unique, and never overwrite existing files.
13. Retrying after a note-write failure reuses same-fingerprint attachment copies instead of duplicating them.
14. A dirty open inbox note receives the append in memory and is not overwritten by an older disk snapshot.
15. An external change to a closed inbox note before write produces a conflict and preserves the pending capture.
16. Two captures committed rapidly to one note both appear exactly once.
17. Selecting another F20 profile invokes save-safe activation before any destination write.
18. Failed profile activation keeps the capture pending with Retry, Relink, and Change destination actions.
19. Process restart or Android activity recreation preserves every committed pending manifest and staged attachment.
20. Successful commit removes staging only after note durability is confirmed.
21. Discard requires confirmation and removes only the selected pending item's app-private data.
22. Shared URLs are stored as text and trigger no network request.
23. Capture progress, validation, and errors are accessible without color and every control is keyboard reachable.
24. The compact sheet works at 320 by 568 CSS pixels with the software keyboard visible.
25. No Android content URI, profile grant token, captured text, or source URL appears in logs.

## 21. Test plan

### 21.1 Unit tests

- Deep-link parameter decode, limits, and invalid values.
- Destination path validation and date tokens.
- Filename generation, sanitization, collision suffixes, and reserved names.
- Markdown append serializer for empty and nonempty files, LF, CRLF, Unicode, title, URL, and attachments.
- Pending manifest decode, unknown fields, corruption, and queue limits.
- Attachment fingerprint and retry-path selection.
- Commit-plan invalidation on profile or workspace generation change.

### 21.2 Component tests

- Empty in-app Capture Sheet.
- Prefilled external review.
- Destination profile and mode changes.
- Attachment list, errors, and remove actions.
- Pending-list Review, Retry, Change destination, and Discard.
- Keyboard submit, focus restoration, and unsaved-close confirmation.
- Compact software-keyboard layout.

### 21.3 Integration tests

- Append to clean open note.
- Append to dirty open note.
- Append to closed note changed externally.
- Create absent note and folders.
- Two same-note commits.
- Attachment copy success followed by note failure and retry.
- Workspace switch during attachment stream and note save.
- F20 activation success, relink requirement, and failure.
- Metadata index incremental refresh after commit.
- Deep-link cold start and already-running delivery.

### 21.4 Android tests

- `ACTION_SEND` text from multiple representative apps.
- `ACTION_SEND` text plus one image.
- `ACTION_SEND_MULTIPLE` with 1, 10, and more than 10 images.
- Incorrect MIME metadata and unreadable URI.
- Stream larger than declared size.
- Activity recreation during staging and review.
- Process death after staging and during commit.
- SAF grant loss and recovery.
- TalkBack, increased text size, and Android Back behavior.

### 21.5 Desktop tests

- Local protocol routing and payload limits.
- Protocol activation while app is closed and already running.
- In-app and optional global shortcut behavior.
- Shortcut conflict reporting.
- Unicode paths and Windows reserved filename handling.

### 21.6 Security tests

- Path traversal in title, deep-link parameters, and shared display name.
- Malicious URI schemes.
- Huge text and attachment denial-of-service attempts.
- Crafted content URI outside granted access.
- HTML and script payloads in capture body and title.
- Log inspection for content leakage.

## 22. Rollout plan

### Phase 1: In-app text capture

- Add settings, serializer, contained append, and Capture Sheet.
- Support active workspace only behind a feature flag.

### Phase 2: F20 profile and pending queue

- Add destination profile selector and save-safe activation.
- Add app-private pending storage and recovery UI.

### Phase 3: Local protocol

- Add reviewed `leotheca://capture` route and desktop lifecycle handling.
- Add optional running-process global shortcut.

### Phase 4: Android sharing and images

- Add narrow manifest filters, native URI staging, bounded attachment commit, and retry.
- Complete lifecycle and provider tests.

### Phase 5: General availability

- Enable by default after desktop and Android acceptance gates pass.
- Publish privacy, workflow, protocol, and troubleshooting documentation.

## 23. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Direct append races with dirty editor | Lost capture or note edits | Canonical open-document mutation and one save coordinator |
| External URI permission expires | Lost attachment | Native app-private staging during receipt |
| Malicious deep link writes content | Unwanted file modification | Review required, bounded parameters, no external target paths |
| Attachment retry duplicates files | Workspace clutter | Planned names, fingerprints, reuse, never overwrite |
| Queue grows without bound | Storage exhaustion | Count and byte limits with explicit user action |
| Profile switch writes to wrong workspace | Data leak | Profile UUID plus workspace session, F20 activation before commit |
| URL preview performs network access | Privacy violation | Store literal URL only, no fetch code path |
| Android provider behavior differs | Failed commit | Streamed bridge operations, explicit errors, lifecycle/provider tests |

## 24. Documentation changes

Update:

- user guide for Capture Sheet, inbox modes, and Android sharing;
- Settings reference for destination profile, note path, folder, and shortcut;
- local automation protocol documentation with limits and review semantics;
- privacy documentation for pending app-private data and no URL fetching;
- Android integration and manifest documentation;
- architecture documentation for pending queue and commit coordination;
- roadmap status for F05.

## 25. Definition of done

F05 is done when:

- in-app, deep-link, and Android share capture routes feed one validated request model;
- external data remains recoverable until a durable Markdown commit or explicit discard;
- no route can silently target an arbitrary path or inactive workspace;
- open and closed note writes are conflict-safe and serialize with existing saves;
- attachment ingestion is bounded, retry-safe, contained, and never overwrites files;
- F20 activation and workspace transitions are generation-authoritative;
- no URL fetch, account, telemetry, cloud queue, or broad storage permission is introduced;
- all functional requirements and acceptance criteria pass on desktop and Android;
- accessibility, lifecycle, privacy, and performance gates pass;
- documentation and tests land with the implementation;
- no unresolved critical or high-severity data-loss or security defect remains.


---

# F06 Software Design Document: Note Outline and Heading Breadcrumbs

**Status:** Approved for implementation design  
**Feature:** F06 Note Outline and Heading Breadcrumbs  
**Target:** Desktop and Android  
**Last updated:** 2026-09-01

## 1. Summary

F06 adds a live structural outline for the active note and a compact breadcrumb trail for the user's current section. The outline shows the note's heading hierarchy, follows the active Source or Preview location, supports precise keyboard navigation, and can copy or insert links through F04's shared serializer.

The feature is a projection of the current canonical note content. It does not generate a table of contents inside the Markdown, does not reorder sections, and does not rewrite headings. For open notes, the outline refreshes from in-memory content before save. For preview navigation, application-owned heading anchors map rendered sections back to the same source records.

F06 is the first recommended consumer of the shared heading scanner and note-location API. It can ship before the rest of F04 if copy-link controls remain disabled until the structured link serializer is available.

## 2. Motivation

Long notes are difficult to navigate when their structure is visible only by scrolling. A file tree answers where a note is in the workspace, but not where the current section is inside the note. Users also need a dependable way to copy a section link without manually reproducing heading text or guessing anchor syntax.

A useful outline must remain accurate while the note is dirty, preserve editor focus and selection, behave consistently in Source and Preview, and avoid writing generated structure back into the note. Breadcrumbs should add orientation without consuming excessive vertical space or becoming another navigation system with different heading rules.

## 3. Goals

1. Show every supported heading in the active note as a hierarchical outline.
2. Refresh the outline from canonical in-memory content while the user edits.
3. Highlight and reveal the section associated with the active Source or Preview location.
4. Navigate to a heading precisely without changing note content.
5. Display heading ancestry as clickable breadcrumbs.
6. Support keyboard, screen reader, pointer, and touch navigation.
7. Integrate copy-link and insert-link actions with F04's parser and serializer.
8. Handle duplicate headings without silently producing ambiguous links.
9. Scale to large notes through bounded parsing and rendering.
10. Fit the adaptive Inspector and compact sheet patterns defined by the visual refresh.

## 4. Non-goals

The first release does not include:

- writing a generated table of contents into the note;
- drag-and-drop section reordering;
- heading text editing from the outline;
- document folding or source-code folding controlled by outline expansion;
- automatic heading numbering;
- document-wide semantic summaries;
- workspace-wide outline aggregation;
- a minimap;
- arbitrary Markdown block navigation beyond headings;
- automatic block ID insertion;
- hidden heading metadata;
- persistent custom ordering separate from source order.

Outline expansion state changes only the outline presentation. It never hides source or preview content.

## 5. Heading model

F06 consumes the shared `HeadingRecord`:

```typescript
interface HeadingRecord {
  key: string;
  occurrence: number;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  rawText: string;
  displayText: string;
  sourceFrom: number;
  sourceTo: number;
  contentFrom: number;
  contentTo: number;
  line: number;
  column: number;
  sectionFrom: number;
  sectionTo: number;
  parentIndex?: number;
  childIndexes: number[];
}
```

`key` and `occurrence` follow F04 heading normalization. `parentIndex` is calculated by source order:

- a heading is a child of the nearest preceding heading with a lower level;
- when heading levels skip, the heading still attaches to the nearest valid ancestor;
- a level 1 heading has no heading parent;
- source order is authoritative.

Example:

```markdown
# Product
### Constraints
## Delivery
#### Android
```

Hierarchy:

```text
Product
  Constraints
  Delivery
    Android
```

The outline does not invent missing level 2 or level 3 nodes.

## 6. User interface

### 6.1 Entry points

The Outline is available through:

- an Outline tab in the contextual Inspector;
- Command Palette action `Show note outline`;
- configurable shortcut to show or focus the outline;
- a compact document-header action when the Inspector is not visible.

Before the refreshed shell lands, it may be hosted as a sidebar panel or dialog. The final behavior belongs in the adaptive Inspector on wide layouts and a full-height sheet on compact layouts.

### 6.2 Outline header

The header contains:

- `Outline` title;
- active heading count;
- optional filter field when the note has more than a small threshold, initially 20 headings;
- `Collapse all` and `Expand all` actions in an overflow menu;
- close or back control according to host surface.

The heading count is informational and not announced after every keystroke.

### 6.3 Outline rows

Each row shows:

- heading text;
- visual indentation derived from hierarchy, capped to preserve usable width;
- optional heading level in an accessible description;
- current-section indicator;
- duplicate-heading warning when relevant;
- context actions for Copy link and Insert link where available.

Empty headings display a localized placeholder such as `(Untitled heading)` while retaining exact source navigation.

The active row is visually distinct but is not automatically focused during typing. The outline follows the editor without stealing keyboard focus.

### 6.4 Collapse behavior

Users can collapse a heading's descendants inside the outline. Rules:

- collapse does not alter the note or preview;
- an active descendant of a collapsed node causes that ancestor to show an active-descendant indicator;
- by default, the active descendant is revealed without permanently expanding user-collapsed ancestors unless the user enabled `Auto-reveal active heading`;
- `Expand all` and `Collapse all` affect only current note outline state;
- collapse state is keyed by a bounded combination of note path, heading key, occurrence, and source fingerprint.

Initial release stores expansion state in memory. A bounded per-workspace persistence option may be added only if it does not create stale or unbounded settings.

### 6.5 Filter behavior

Filtering is case-insensitive over heading display text. Matching rows remain visible with their ancestor chain. Filtering does not change source order or collapse state. Clearing the filter restores the prior expansion state.

### 6.6 Empty states

- No note open: `Open a note to see its outline.`
- Note has no headings: `This note has no headings.`
- Filter has no match: `No headings match.` with `Clear filter`.
- Parser failure: preserve the last proven outline if safe and show `Outline could not be refreshed.` with Retry.

Malformed individual headings do not fail the complete outline.

## 7. Breadcrumbs

### 7.1 Placement

The breadcrumb trail appears in the Document Header when sufficient width exists. On compact layouts, the current section appears as one truncated row that opens a breadcrumb and outline sheet.

### 7.2 Content

Breadcrumb structure:

```text
Note title > Level 1 ancestor > Level 2 ancestor > Current heading
```

Rules:

- the note root is always first;
- only actual heading ancestors are shown;
- the current heading is last;
- before the first heading, only the note root appears;
- after the last heading, that heading remains current until note end;
- empty heading labels use the same placeholder as the outline;
- long trails collapse middle ancestors into an accessible overflow menu.

The note root opens the top of the note. Every heading segment navigates to that heading.

### 7.3 Source mode active section

The current Source section is calculated from the primary CodeMirror selection head:

- before the first heading: note root;
- inside a heading line: that heading;
- after a heading and before the next heading of equal or higher source position: nearest preceding heading;
- multi-range selection: use the main selection head;
- programmatic navigation updates after the editor transaction settles.

Cursor tracking is lightweight and does not rescan Markdown on every cursor move.

### 7.4 Preview mode active section

Rendered headings expose F04 application-owned anchor attributes. The active Preview section is calculated through `IntersectionObserver` plus scroll-position fallback:

- observe headings within the preview scroll container;
- choose the last heading whose top has crossed the configured reading threshold, initially the upper 25 percent of the viewport;
- before the first heading, use note root;
- on programmatic navigation, prefer the requested target until scrolling settles;
- disconnect observers when Preview unmounts or generation changes.

### 7.5 Split mode authority

In Split mode, breadcrumbs follow the pane the user most recently focused or directly scrolled:

- source cursor or keyboard action makes Source authoritative;
- direct Preview scroll, click, or keyboard navigation makes Preview authoritative;
- synchronized passive scrolling alone does not steal authority;
- the current authority is visually and accessibly identifiable in the mode control or breadcrumb description.

## 8. Navigation behavior

### 8.1 Outline selection

Selecting a row calls:

```typescript
openNote({
  path: activePath,
  location: {
    kind: "range",
    from: heading.contentFrom,
    to: heading.contentTo
  },
  focus: currentViewMode === "preview" ? "preview" : "source"
});
```

The note is already active in the common case, so the navigation layer should avoid re-reading or remounting it. It moves or reveals only the relevant pane.

### 8.2 Focus policy

Pointer activation leaves focus in the outline unless the user double-clicks or invokes `Go and focus editor`. Keyboard Enter navigates while retaining outline focus so users can explore multiple headings. A dedicated shortcut transfers focus to the editor at the active heading.

This policy must be tested with screen readers. A configuration is not needed in the first release.

### 8.3 Target highlight

The target heading may receive a brief nonessential highlight. It must:

- respect reduced motion;
- not alter selection when Preview is authoritative;
- not be the only navigation feedback;
- avoid continuous animation.

### 8.4 Stale headings

Every navigation request carries the active note generation. If the heading list changed after row activation:

- resolve by exact current source range only when it still matches the heading record;
- otherwise resolve unique `key` and occurrence from the latest canonical scan;
- if no safe target exists, keep the note open and show `That heading moved. The outline has been refreshed.`;
- never jump to an arbitrary duplicate heading.

## 9. Copy and insert link actions

### 9.1 Dependency on F04

F04's serializer is the only allowed creator of heading link text. Before F04 lands, F06 may ship navigation without copy or insert actions.

### 9.2 Copy link to heading

For a unique heading:

- select the shortest unambiguous note target according to the shared resolver;
- serialize `[[Note#Heading]]` with escaping;
- copy to clipboard;
- show a local confirmation.

When the note basename is ambiguous, use a path-qualified note target. When the note is unsaved and has no contained path, disable cross-note copy and offer Save note.

### 9.3 Duplicate headings

For a duplicate normalized heading, `Copy link` opens a choice:

1. `Create stable block link` on the selected heading, which delegates to F04 explicit block ID insertion;
2. `Copy note link only`;
3. Cancel.

F06 never copies an ambiguous heading link while presenting it as precise.

### 9.4 Insert link

`Insert link` inserts into the currently focused editable note, which may differ from the outlined reference note once F07 is present.

Rules:

- if the destination editor is the same note, same-note syntax may be used;
- if another note, include an unambiguous note target;
- insertion is one CodeMirror transaction at the current selection;
- selection replacement and undo behave like normal editor input;
- no insertion occurs when no writable editor has focus.

## 10. Live outline updates

### 10.1 Canonical source

For the active open note, the outline scans the current CodeMirror document or canonical workspace-store content, not the last disk save. This ensures heading changes appear before autosave.

### 10.2 Debounce and generation

- source changes schedule an outline scan after an initial 75 ms debounce;
- a newer edit cancels or supersedes an older pending result;
- short notes may scan synchronously when measured cost is low;
- large-note scans may run in a worker or cooperative task if profiling shows main-thread impact;
- cursor movement uses the latest completed heading list and does not trigger scanning.

### 10.3 Parse error resilience

Markdown is allowed to be incomplete while typing. The scanner returns provable headings from malformed content. A missing closing inline marker must not erase the rest of the outline unless structure truly cannot be determined.

### 10.4 Save and index integration

The active-note outline is local UI state. On save, the same scanner output or a verified equivalent updates the workspace metadata index for F04, F03, and other consumers. There must not be two heading normalizers.

## 11. State model

```typescript
interface NoteOutlineState {
  path?: string;
  documentGeneration: number;
  headings: HeadingRecord[];
  activeHeadingIndex?: number;
  authority: "source" | "preview";
  collapsedKeys: Set<string>;
  filterText: string;
  status: "idle" | "scanning" | "ready" | "error";
  error?: OutlineError;
}
```

`collapsedKeys` is bounded and cleared when a note identity changes through deletion or when the workspace switches. F03 path migrations update the note key without duplicating state.

## 12. Architecture

Recommended modules:

```text
src/outline/
  outlineTypes.ts
  outlineTree.ts
  outlineActiveSection.ts
  outlineStore.ts
  OutlinePanel.tsx
  OutlineRow.tsx
  HeadingBreadcrumbs.tsx
  outlineCommands.ts

src/markdown/
  headings.ts
```

CodeMirror integration supplies document-change and selection events. Preview integration supplies heading anchor registration and scroll-authority events. Both feed `outlineActiveSection.ts`, which contains no platform-specific code.

## 13. Concurrency and lifecycle

- Outline scans are tagged with note path, document generation, and workspace session.
- A result for an older note or edit cannot publish.
- File-open races follow the central note-open authority contract.
- Workspace switches clear observers, pending scans, active heading, filter, and transient errors.
- F03 path migration updates the active path under its mutation lock.
- F07 group changes select the active group's note as outline source.
- When the same note moves between groups, the outline follows the document identity without a rescan unless content changed.
- Preview observers disconnect when the rendered generation changes.

## 14. Security and privacy

- Heading content remains local.
- No network request or remote font is added.
- Heading text is rendered as text in the outline and breadcrumbs.
- Clipboard operations occur only after explicit user action.
- The feature does not persist note body excerpts.
- DOM anchor attributes are escaped application values and cannot inject HTML.
- Navigation cannot escape workspace containment because it targets the already active contained note.

## 15. Accessibility

### 15.1 Outline semantics

The outline uses a tree pattern only if complete tree keyboard behavior is implemented. Otherwise, use a nested list with buttons. A partial ARIA tree is not acceptable.

Required tree behavior when used:

- Up and Down move among visible rows;
- Right expands or enters children;
- Left collapses or moves to parent;
- Home and End move to first and last visible row;
- Enter navigates;
- Space may expand or collapse when the row has children;
- typeahead is optional because the filter field is available.

### 15.2 Announcements

- Active heading state is available but not announced on every editor cursor move.
- Navigating from the outline announces the destination heading and line.
- Duplicate warnings are textually described.
- Filter counts update through a polite live region after debounce.
- Copy success is announced once.

### 15.3 Breadcrumb semantics

Breadcrumbs use a named navigation landmark and ordered list. The current heading has `aria-current="location"`. Overflowed ancestors remain keyboard reachable.

### 15.4 Visual accessibility

- Active, hover, focus, duplicate, and collapsed states do not depend on color alone.
- Indentation remains understandable at 200 percent zoom and increased Android font size.
- Every compact action meets the minimum touch target.
- Focus indicators use the visual-system tokens and remain visible in forced colors.

## 16. Performance requirements

- Cursor movement and Preview scrolling must not rescan the Markdown.
- A typical note outline should refresh within 100 ms after the debounce.
- Notes with more than 500 headings use virtualized or windowed row rendering.
- Filtering should update within 100 ms for 10,000 heading fixture records.
- Only the active note has live CodeMirror-based outline tracking.
- Background indexed headings for other notes do not retain full source bodies.
- Intersection observers are scoped to one active preview and disconnected promptly.
- The feature adds no recursive workspace walk.

## 17. Functional requirements

**F06-FR-01** The outline shall show every supported active-note heading in source order.  
**F06-FR-02** The hierarchy shall use the nearest preceding lower-level heading without inventing missing levels.  
**F06-FR-03** The outline shall scan canonical in-memory content while the note is open.  
**F06-FR-04** Newer document generations shall supersede older scan results.  
**F06-FR-05** The active Source heading shall follow the main CodeMirror selection head.  
**F06-FR-06** The active Preview heading shall follow rendered heading position through bounded observers.  
**F06-FR-07** Split-mode breadcrumbs shall follow the last directly active pane.  
**F06-FR-08** Selecting an outline row shall navigate through the shared note-location API without remounting the editor.  
**F06-FR-09** Navigation shall fail safely when a heading moved or became ambiguous.  
**F06-FR-10** Outline collapse shall affect only outline presentation.  
**F06-FR-11** Filtering shall preserve source order and include matching ancestors.  
**F06-FR-12** Breadcrumbs shall show note root, actual ancestors, and current heading.  
**F06-FR-13** Long breadcrumb trails shall remain accessible through overflow.  
**F06-FR-14** Copy and insert actions shall use F04's resolver and serializer.  
**F06-FR-15** Duplicate headings shall not produce a falsely precise copied heading link.  
**F06-FR-16** Explicit block ID creation shall be delegated to F04 and require user action.  
**F06-FR-17** F07 shall determine which editor group's active note owns the outline.  
**F06-FR-18** F03 path migrations shall update outline state without creating duplicate state.  
**F06-FR-19** The feature shall work without accounts, telemetry, or network access.  
**F06-FR-20** The outline, breadcrumbs, filter, and link actions shall be keyboard and screen-reader operable.  
**F06-FR-21** Compact presentation shall avoid horizontal page scrolling at 320 CSS pixels.  
**F06-FR-22** The feature shall not modify note content except through an explicit F04 block-ID action.

## 18. Acceptance criteria

1. ATX and setext headings appear once, in exact source order, with correct display text and line number.
2. Skipped heading levels attach to the nearest preceding lower-level heading without placeholder nodes.
3. Editing a heading updates the outline from dirty in-memory content before autosave.
4. A stale scan result cannot replace the outline for a newer edit or another note.
5. Moving the Source cursor changes the active breadcrumb without rescanning the note.
6. Scrolling Preview changes the active breadcrumb according to the reading threshold.
7. Passive synchronized scrolling in Split does not steal authority from the pane the user last operated.
8. Selecting an outline row reveals the exact heading in Source and Preview.
9. Outline navigation does not remount CodeMirror, clear undo, or alter note content.
10. A moved or deleted target refreshes the outline and never jumps to an arbitrary duplicate.
11. Collapsing a node hides only descendant rows in the outline.
12. Filtering a deep child keeps its ancestor path visible and clearing restores prior expansion.
13. Breadcrumb overflow retains every hidden ancestor in a keyboard-accessible menu.
14. Before the first heading, the breadcrumb contains only the note root.
15. Copying a unique heading produces a valid escaped F04 link with an unambiguous note target.
16. Copying a duplicate heading offers stable block link creation instead of silently copying an ambiguous link.
17. An unsaved pathless note cannot copy a cross-note target and offers Save note.
18. The outline tree or list passes the selected keyboard interaction pattern completely.
19. Active changes during editor typing do not steal focus or trigger noisy screen-reader announcements.
20. A 10,000-heading fixture remains responsive and does not render every row at once.
21. Workspace switch clears stale outline and Preview observers.
22. F03 note rename preserves current outline state under the new path.
23. Desktop and Android compact presentations expose equivalent navigation and actions.
24. No network request or persistent note excerpt storage is introduced.

## 19. Test plan

### 19.1 Unit tests

- Heading hierarchy for all level transitions.
- Active Source section before, inside, between, and after headings.
- Active Preview selection from observed positions.
- Split authority transition rules.
- Collapse, active-descendant, and filter behavior.
- Breadcrumb construction and overflow grouping.
- Stale heading re-resolution.
- Duplicate-heading copy policy.

### 19.2 Parser fixtures

- ATX and setext forms;
- empty and formatted headings;
- escaped markers and trailing hashes;
- Unicode and surrogate pairs;
- LF and CRLF;
- code fences, comments, and malformed Markdown;
- duplicate normalized headings;
- notes with no headings and 10,000 headings.

### 19.3 Component tests

- Inspector and compact-sheet states.
- Keyboard tree or nested-list behavior.
- Filter and clear action.
- Collapse all and expand all.
- Breadcrumb navigation and overflow.
- Copy, insert, duplicate warning, and Save note actions.
- Focus retention during active-section updates.

### 19.4 Integration tests

- CodeMirror document and selection updates.
- Preview anchor observer registration and teardown.
- Source, Preview, and Split navigation.
- F04 serializer and explicit block-ID handoff.
- F07 active-group changes.
- F03 note path migration.
- Workspace switch during scan and preview observation.

### 19.5 Accessibility and platform tests

- Keyboard-only desktop navigation.
- Screen reader tree or list semantics.
- Breadcrumb landmark and current location.
- TalkBack on compact Android layout.
- 200 percent zoom, increased text size, reduced motion, and forced colors.
- 320 by 568 CSS pixel layout without page-level horizontal scrolling.

## 20. Rollout plan

### Phase 1: Shared heading scanner and read-only outline

- Land heading fixtures, tree construction, and active-note scan.
- Ship outline navigation behind a feature flag.

### Phase 2: Breadcrumbs and Preview tracking

- Add source cursor tracking, Preview observers, Split authority, and adaptive presentation.

### Phase 3: F04 actions

- Enable copy and insert link through the shared serializer.
- Add duplicate-heading stable block-link flow.

### Phase 4: Scale and accessibility

- Add large-outline virtualization, complete keyboard semantics, screen-reader validation, and compact hardening.

### Phase 5: General availability

- Enable by default and update documentation, shortcuts, and roadmap status.

## 21. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Parsing every cursor move is expensive | Typing latency | Scan only on debounced content changes; cursor uses existing records |
| Preview and Source disagree | Confusing breadcrumbs | One heading model, explicit Split authority, shared anchors |
| Duplicate heading link is ambiguous | Wrong navigation | Warn and delegate stable block ID creation |
| Outline steals editor focus | Poor writing experience | Active row follows without focus; explicit focus-transfer command |
| Large outline renders slowly | Unresponsive panel | Bounded scan, filtering, and virtualization |
| Persisted collapse state becomes stale | Incorrect presentation | In-memory bounded state first; fingerprinted keys if persistence is later added |
| Multiple heading parsers diverge | Broken F03/F04 behavior | One shared scanner and normalization contract |

## 22. Documentation changes

Update:

- user guide for Outline, breadcrumbs, filtering, and keyboard navigation;
- shortcut reference;
- accessibility documentation for tree or nested-list behavior;
- architecture documentation for heading scanner and active-section authority;
- F04 documentation for copy and block-link handoff;
- roadmap status for F06.

## 23. Definition of done

F06 is done when:

- the active note has one accurate live heading model shared with F04 and the workspace index;
- outline navigation and breadcrumbs work in Source, Preview, and Split without remounting the editor;
- duplicate headings never produce misleading precise links;
- no note content is changed except by an explicit delegated block-ID action;
- stale scans, note opens, preview generations, and workspace transitions cannot publish old state;
- large notes, keyboard use, screen readers, zoom, and compact layouts pass their gates;
- all functional requirements and acceptance criteria pass on desktop and Android;
- documentation and tests land with implementation;
- no unresolved critical or high-severity usability, accessibility, or data-integrity defect remains.


---

# F07 Software Design Document: Split Panes and Pinned Tabs

**Status:** Approved for implementation design  
**Feature:** F07 Split Panes and Pinned Tabs  
**Target:** Desktop and Android  
**Last updated:** 2026-09-01

## 1. Summary

F07 replaces Leotheca's single flat tab strip with a two-group document workspace. Users can split the document area into two editor groups, keep a reference note beside a working note, move and reorder tabs, pin important tabs, resize the divider, and restore the layout per workspace.

The first release supports a maximum of two groups. A note path belongs to exactly one group at a time, so Leotheca never creates two independent CodeMirror instances that can edit the same note concurrently. There is one canonical open-document state and one save authority per path.

On compact layouts, both groups continue to exist but only one is visible at a time. A group switcher replaces unusably narrow side-by-side editors. F07 owns the editor-group state model. Other features open or reveal notes through the shared `OpenNoteRequest` and do not mutate group arrays directly.

## 2. Motivation

The current flat tab model supports switching among notes but not comparing or referencing them. Common workflows require a source note beside a synthesis note, a task list beside project context, or a canvas beside its supporting Markdown. Users also need a reliable way to keep core notes open without `Close all` or tab overflow removing them.

A visual split is not only a layout change. It affects active-document authority, save coordination, open-note routing, workspace persistence, keyboard focus, compact behavior, note rename, and every feature that opens a location. F07 therefore introduces explicit editor groups and centralizes open-document ownership before rendering two editors.

## 3. Goals

1. Support one or two editor groups in the document area.
2. Show one active document per group when two groups exist.
3. Keep one canonical content and save state per open path.
4. Allow tabs to move and reorder within and between groups.
5. Allow tabs to be pinned and protected from broad close commands.
6. Persist group tabs, active paths, pinning, view mode, active group, and split ratio per workspace.
7. Migrate existing flat tab settings without data loss.
8. Provide predictable open-note routing for F02, F04, F06, F09, and F11.
9. Preserve editor selection, scroll, dirty content, save status, and undo behavior through layout operations.
10. Adapt to compact layouts without horizontal page scrolling or tiny editors.

## 4. Non-goals

The first release does not include:

- more than two editor groups;
- multiple application windows;
- the same note open independently in both groups;
- vertical top-and-bottom splitting;
- freeform docking;
- detached panes;
- synchronized scrolling between arbitrary notes;
- compare or diff mode;
- persistent editor selection and scroll across application restarts;
- per-tab custom colors;
- tab stacks or nested groups;
- automatic split creation based on note type;
- keeping the desktop process alive only to preserve layout;
- rendering both groups side by side on compact screens.

## 5. Core product decisions

### 5.1 Maximum two groups

The groups are stable logical identities:

```typescript
type EditorGroupId = "primary" | "secondary";
```

`primary` always exists. `secondary` exists when split state is enabled or when restored state contains tabs assigned to it. The maximum of two keeps the shell, keyboard model, Android presentation, and memory budget understandable.

### 5.2 Unique path ownership

An open note path appears in at most one group.

When an ordinary open request targets a path already open:

- focus that existing group and tab;
- reveal the requested location;
- do not open a duplicate.

When the explicit command is `Move to other group` or `Open in other group` for an already open path:

- move the existing tab and its view state to the requested group;
- keep the canonical document content and save state;
- do not create a second editor state for the same path.

This restriction may be revisited only after a shared-document multi-view architecture is separately designed.

### 5.3 One canonical document per path

```typescript
interface OpenDocument {
  path: string;
  content: string;
  savedFingerprint: string;
  documentGeneration: number;
  dirty: boolean;
  saveState: "clean" | "dirty" | "saving" | "saved" | "error";
  saveError?: WorkspaceError;
  loadingState: "idle" | "loading" | "ready" | "error";
  lastKnownMtime?: number;
}
```

Group state contains path references, not copied content. Save, external-change, indexing, and mutation systems address a canonical document by path.

### 5.4 View mode per group

Each group has its own Source, Split, or Preview mode. A reference group can remain in Preview while the working group remains in Source.

The current global view mode migrates to the primary group's view mode. Secondary defaults to Preview when first created from an explicit `Open in other group` action, unless the user initiated `Split current tab`, in which case it inherits the current group mode.

### 5.5 Pinning

Pinned tabs:

- appear before unpinned tabs inside their group;
- retain a stable order among pinned tabs;
- omit the ordinary close button;
- survive `Close others` and `Close all unpinned`;
- may be moved between groups while staying pinned;
- persist per workspace;
- are still ordinary Markdown documents, not bookmarks or copies.

A pinned tab can be closed through the explicit `Unpin and close` action. A separate `Close all including pinned` command requires confirmation when more than one pinned tab is affected.

## 6. User interface

### 6.1 Unsplit state

With one group, the document area behaves like the current single-tab workspace but uses the new group model. No empty secondary frame is rendered.

Available actions:

- `Split right`;
- `Open current note in other group` is unavailable because duplicate note views are not supported;
- `Move current tab to new group` creates secondary and moves the tab;
- `Open link in other group` creates secondary and opens the linked target there.

### 6.2 Split state

Wide layout:

```text
+-----------------------------+-----------------------------+
| Primary tab strip           | Secondary tab strip         |
+-----------------------------+-----------------------------+
| Primary active document     | Secondary active document   |
|                             |                             |
+-----------------------------+-----------------------------+
                 movable separator
```

Each group has:

- an accessible group label;
- its own tab strip;
- its own active document header controls where those controls are document-specific;
- its own view mode;
- an active-group visual indicator;
- a group overflow menu.

Global workspace actions remain outside groups.

### 6.3 Creating a split

Entry points:

- document header action `Split right`;
- tab context action `Move to new group`;
- link context action `Open in other group`;
- Command Palette `Create editor group`;
- keyboard shortcut.

`Split right` without a target creates the secondary group with an empty state. `Move to new group` moves the current tab and activates secondary. `Open in other group` opens the target in secondary while preserving the current tab in primary.

The secondary empty state offers:

- Quick Switcher;
- Open recent note;
- Move current primary tab here;
- Close group.

### 6.4 Closing a group

Closing secondary does not silently close its documents. The default action is `Merge into primary`:

1. append secondary pinned tabs after primary pinned tabs;
2. append secondary unpinned tabs after primary unpinned tabs;
3. keep path uniqueness;
4. preserve active-path preference by making the former secondary active tab active in primary when secondary was the active group;
5. preserve pin state and in-memory view state;
6. collapse to one group.

Additional actions:

- `Close unpinned and merge pinned`;
- `Cancel`.

If any affected document has an unresolved save error, group close first presents the existing save-recovery flow. Dirty state alone is handled by autosave and does not require a destructive close prompt unless saving cannot be confirmed.

Primary cannot be deleted. A command to close primary while secondary exists performs a symmetric merge into primary after swapping logical content, but the stable `primary` identity remains.

### 6.5 Group activation

A group becomes active when the user:

- focuses its editor or preview;
- activates one of its tabs;
- invokes a group-targeted command;
- directly scrolls its active document;
- selects its group switcher item on compact layouts.

Passive synchronized behavior and status updates do not change active group.

Global commands such as Save, Close tab, Toggle view mode, and Show outline operate on the active group unless they explicitly name another target.

### 6.6 Divider

The wide split separator:

- is pointer draggable;
- has a keyboard-focusable separator role;
- supports Arrow key adjustment in 2 percent steps and Shift+Arrow in 10 percent steps;
- exposes current percentage in its accessible value;
- supports `Reset split` to 50 percent;
- clamps each group to a minimum usable width.

Persisted ratio is a number between `0.30` and `0.70`. Layout may temporarily clamp more tightly when side panels reduce available space, without overwriting the user's preferred ratio.

### 6.7 Tab presentation

Each tab shows:

- note name;
- dirty or save-error status using text or icon plus accessible description;
- pin indicator when pinned;
- close button when unpinned;
- tooltip with workspace-relative path for duplicate names;
- active state scoped to its group.

Duplicate note names always show enough path context in tooltip and switcher. A future compact tab width setting is out of scope.

## 7. Tab interactions

### 7.1 Open routing

All features use:

```typescript
interface OpenNoteRequest {
  path: string;
  location?: NoteLocation;
  preferredGroupId?: EditorGroupId;
  focus?: "source" | "preview" | "preserve";
}
```

Routing policy:

1. If path is already open, activate its owner group.
2. Otherwise, use a valid explicit `preferredGroupId`.
3. Otherwise, use the active group.
4. If the active group does not exist during restoration, use primary.
5. Open path once and navigate after its authority-checked read completes.

A caller may request `other-group` semantically through a command adapter, but the document store resolves it to a concrete group ID before opening.

### 7.2 Reordering

Tabs can be reordered by:

- pointer drag within a group;
- keyboard commands `Move tab left` and `Move tab right`;
- context menu position actions for accessibility.

Pinned and unpinned regions are distinct. Dragging an unpinned tab into the pinned region does not pin it implicitly. The drop indicator snaps to the valid region. Pin or Unpin is explicit.

### 7.3 Moving between groups

A tab can move by:

- drag to the other tab strip;
- context action `Move to other group`;
- keyboard shortcut;
- Command Palette.

The move preserves:

- canonical document identity and content;
- dirty and save state;
- selection and scroll view state;
- pin state;
- note-level transient state such as active outline heading where possible.

If the target group already owns the path, which should be impossible under invariants, the operation focuses the existing tab and repairs duplicate placement state without duplicating the document.

### 7.4 Closing tabs

Required commands:

- Close tab;
- Close other unpinned tabs in group;
- Close unpinned tabs in group;
- Close unpinned tabs in all groups;
- Unpin and close;
- Close tabs to the right within the unpinned region.

A document is removed from the canonical document store only after no group references it and its save state is safely resolved.

### 7.5 Pinning

Pin and Unpin actions are available from tab context menu, Command Palette, and keyboard shortcut. Pinning moves the tab to the end of the pinned region. Unpinning moves it to the beginning of the unpinned region unless the implementation can preserve a prior unpinned position without stale state.

## 8. Compact and adaptive behavior

### 8.1 Available-width rule

The shell computes whether two groups can be shown from document-area width after navigation and Inspector panels, not only total viewport width.

Two groups render side by side only when:

- document-area width can satisfy both minimum group widths plus separator;
- the UX-01 layout mode permits it;
- platform text scaling does not reduce effective width below the threshold.

At or below the compact breakpoint, only one group is visible.

### 8.2 Compact group switcher

When secondary exists on a compact layout, the Document Header exposes a group switcher:

```text
Working: Project plan    Reference: Meeting notes
```

Only the selected group's active document is mounted as the visible editor or preview. Switching groups:

- preserves both groups' tabs and states;
- saves current view state before unmounting;
- restores the other group's state;
- does not close or merge anything;
- does not create horizontal page scrolling.

The open-tab switcher groups results under `Working` and `Reference` labels.

### 8.3 Android Back

Back handling order:

1. close menu, dialog, or sheet;
2. leave a transient full-screen preview or editor utility;
3. return from secondary compact group to primary when secondary was entered through a temporary navigation action and history permits;
4. follow existing note and application back behavior.

Back never silently closes a group or discards a dirty document.

### 8.4 Rotation and resize

Changing between compact and wide presentation preserves logical groups and preferred ratio. A rotation must not merge groups, duplicate tabs, or reset active paths.

## 9. State model

### 9.1 Group state

```typescript
interface EditorGroupState {
  id: EditorGroupId;
  tabPaths: string[];
  pinnedPaths: string[];
  activePath?: string;
  viewMode: "source" | "split" | "preview";
  navigationHistory: GroupHistoryEntry[];
}

interface EditorLayoutState {
  splitEnabled: boolean;
  preferredRatio: number;
  activeGroupId: EditorGroupId;
  compactVisibleGroupId: EditorGroupId;
  groups: Record<EditorGroupId, EditorGroupState>;
}
```

Invariants:

- primary always exists;
- path occurs in at most one `tabPaths` array;
- every pinned path occurs in its group's `tabPaths`;
- `pinnedPaths` order defines the pinned region;
- active path is absent only when the group has no tabs;
- active path belongs to its group;
- secondary may have tabs even when compact presentation hides it;
- ratio is finite and clamped;
- all paths are normalized contained workspace-relative Markdown paths or other explicitly supported document types.

### 9.2 Per-tab view state

```typescript
interface DocumentViewState {
  sourceSelection?: SerializedSelection;
  sourceScrollTop?: number;
  previewScrollTop?: number;
  lastFocusedPane?: "source" | "preview";
}
```

View state is session memory keyed by path. It moves with the tab. It is not persisted across app restarts in the first release.

### 9.3 Central document store

Recommended store split:

```text
workspaceStore
  active workspace identity and transition state

documentStore
  canonical OpenDocument by path
  path-scoped read and save generations

editorLayoutStore
  group tab placement, active group, modes, pinning, ratio

documentViewStateStore
  selection and scroll by path
```

A single monolithic store is acceptable only if these ownership boundaries remain explicit and independently testable.

## 10. Persistence and migration

### 10.1 Settings schema

Persist under `<workspace>/.leotheca/settings.json`:

```typescript
interface EditorLayoutSettingsV1 {
  version: 1;
  splitEnabled: boolean;
  preferredRatio: number;
  activeGroupId: EditorGroupId;
  compactVisibleGroupId?: EditorGroupId;
  groups: {
    primary: PersistedGroup;
    secondary?: PersistedGroup;
  };
}

interface PersistedGroup {
  tabPaths: string[];
  pinnedPaths: string[];
  activePath?: string;
  viewMode: "source" | "split" | "preview";
}
```

Settings decoding validates types, de-duplicates paths, removes invalid containment, repairs active paths, clamps ratio, and preserves unknown fields.

### 10.2 Legacy migration

Existing fields such as `lastOpenPaths`, `lastActivePath`, and global or workspace view mode migrate to:

- primary `tabPaths` in existing order;
- primary active path;
- no pinned paths;
- split disabled;
- primary view mode from existing setting;
- empty secondary group.

For one release cycle, write a compatible legacy mirror derived from primary group so rollback to the preceding app version retains a useful tab session. The mirror does not represent secondary tabs or pin state.

### 10.3 Restore

On workspace open:

1. runtime-decode layout settings;
2. normalize and de-duplicate paths;
3. restore group structures without reading every note body;
4. choose active group and active paths;
5. lazily read only active documents first;
6. restore remaining tab labels from paths and load content on activation;
7. skip or mark missing paths without blocking the workspace;
8. persist repaired settings after successful workspace readiness.

A missing pinned path remains visible as a recoverable missing tab only if current tab behavior already supports it safely. Otherwise it is removed with a non-blocking summary. No missing path is recreated automatically.

## 11. Editor rendering

### 11.1 Active editors

At most two active documents render full Source or Split editors on a wide layout. Inactive tabs do not retain mounted CodeMirror instances.

When switching tabs:

1. snapshot current view state;
2. activate or read the target canonical document with generation checks;
3. bind the group editor to that document;
4. restore selection and scroll after the editor accepts content;
5. keep save and dirty state in the document store.

### 11.2 Avoiding destructive remounts

The implementation must not remount an active CodeMirror editor merely because:

- divider ratio changes;
- Activity Rail or Inspector opens;
- theme or accent changes;
- the other group's tab changes;
- a global toolbar rerenders.

A note necessarily moves between editor components when moved between groups or when compact presentation switches mounted groups. Its serialized view state must be restored. Undo history should be preserved through a reusable CodeMirror state object where practical.

### 11.3 Undo guarantee

Required guarantee:

- normal tab activation within one mounted group retains the note's in-session undo history if the current editor architecture already provides it or the refactor introduces retained `EditorState` per open document;
- moving a tab between groups must not change note content or dirty state;
- if preserving full CodeMirror undo history across a group move is not technically reliable in the initial refactor, the UI must warn before the move only when the note has nonempty undo history and the limitation must block general availability unless explicitly accepted.

The preferred architecture stores a bounded CodeMirror `EditorState` per open Markdown document, separate from the DOM `EditorView`.

## 12. Save and mutation coordination

- One path has one save coordinator entry regardless of group.
- Group focus never changes write ownership.
- F02 task toggles, F04 block-ID insertion, F03 refactors, F05 appends, F09 property edits, and F11 table edits all mutate the canonical document.
- Closing or merging groups does not cancel a valid in-flight save.
- A document with no remaining tabs is removed only after save completion or an explicit recovery choice.
- Workspace transition drains all documents and persists layout before activating another workspace.
- F03 path migration updates document-store keys and every group reference under one mutation lock.
- Stale reads for a prior path, group, or workspace session cannot publish.

## 13. Commands and shortcuts

Required commands:

- Split right;
- Close secondary group;
- Focus primary group;
- Focus secondary group;
- Focus other group;
- Move active tab to other group;
- Open target in other group;
- Toggle pin active tab;
- Move tab left;
- Move tab right;
- Close active tab;
- Close other unpinned tabs;
- Reset split ratio.

Shortcuts are configurable through the existing shortcut system. Defaults must be audited against CodeMirror, platform, and accessibility conventions before assignment.

The Command Palette displays the target group in commands whose effect could be ambiguous.

## 14. Architecture

Recommended modules:

```text
src/workspace/
  documentStore.ts
  documentTypes.ts
  documentSaveAuthority.ts

src/editorGroups/
  editorGroupTypes.ts
  editorLayoutStore.ts
  openNoteRouter.ts
  layoutPersistence.ts
  layoutMigration.ts
  EditorWorkspace.tsx
  EditorGroup.tsx
  GroupTabBar.tsx
  SplitSeparator.tsx
  CompactGroupSwitcher.tsx
  groupCommands.ts
```

`App.tsx` composes the shell but does not own ad hoc tab arrays. `openNoteRouter.ts` is the only module that assigns a newly opened path to a group.

## 15. Concurrency and lifecycle

### 15.1 Note reads

Each path read carries:

- workspace session;
- document read generation;
- requested path;
- requesting group.

Publishing requires that the path remains open, the generation is latest, and the active workspace matches. Group movement during read updates the path's owner; it does not make the old group callback authoritative.

### 15.2 Rapid interactions

- Repeated split commands are idempotent.
- Repeated `Move to other group` operations serialize through the layout store.
- Drag and keyboard reorder cannot run concurrently on the same tab.
- Group close is disabled while its merge transaction is applying.
- Settings persistence is debounced and latest-generation authoritative.

### 15.3 Workspace transition

Before switch:

1. disable new group mutations;
2. flush canonical document saves;
3. persist current workspace layout;
4. await tracked bridge operations;
5. increment workspace generation;
6. clear document and view states;
7. restore the next workspace lazily.

No tab or document from the old workspace may appear after the new workspace becomes ready.

## 16. Error handling

Required states:

- active document read failed;
- note missing after restore;
- save failed;
- secondary merge blocked by save error;
- invalid persisted layout repaired;
- split unavailable because document area is too narrow;
- move blocked during F03 transaction;
- target group unavailable during workspace transition.

An editor group with a failed active note remains usable through Retry, Remove tab, and Open another note. Errors are scoped to the affected group and document where possible.

## 17. Security and privacy

- No content leaves the device.
- Persisted layout contains only workspace-relative paths and UI settings.
- Runtime decoding rejects absolute and traversal paths.
- Android workspace identity never relies on `/workspace` alone.
- Open routing cannot use a path outside the active workspace.
- Group and tab labels render paths as text, not HTML.
- No telemetry records which notes are pinned or viewed together.
- Stale workspace callbacks cannot expose a previous workspace's note in the current shell.

## 18. Accessibility

### 18.1 Tabs

Each group implements a complete tabs pattern:

- one tablist per group with an accessible group label;
- active tab has `aria-selected=true`;
- arrow keys move focus according to orientation;
- Enter or Space activates when manual activation is used;
- Delete closes an unpinned tab when safe;
- pinned state is announced;
- duplicate filenames include path context.

Pointer drag is never the only way to reorder or move a tab.

### 18.2 Groups

- Groups have meaningful names such as `Working group` and `Reference group`.
- The active group is not conveyed by color alone.
- Focus commands announce the destination group and note.
- Empty group controls are keyboard reachable in logical order.

### 18.3 Separator

The divider uses separator semantics with orientation, current value, minimum, and maximum. Keyboard adjustment works at 200 percent zoom and in forced colors.

### 18.4 Compact layout

The group switcher exposes both group names and active notes. Switching groups does not unexpectedly focus a hidden control. Touch targets meet the compact minimum and increased text size does not overlap tab controls.

## 19. Performance requirements

- At most two active group documents mount full editor or preview surfaces on wide layouts.
- Inactive tabs load lazily and do not retain DOM editor views.
- Splitting, resizing, and switching groups produces first visual feedback within 100 ms.
- Divider dragging uses animation-frame scheduling and does not persist settings on every pointer event.
- Restoring a workspace reads active notes first and must not synchronously read all tab bodies.
- Layout persistence is debounced and small.
- Per-document view and optional EditorState caches are bounded, with least-recently-used eviction only after content is safely saved and a restoration fallback exists.
- F07 must stay within the UX-01 startup and note-switch regression budgets.

## 20. Functional requirements

**F07-FR-01** The application shall support one primary and at most one secondary editor group.  
**F07-FR-02** A normalized path shall appear in at most one group.  
**F07-FR-03** One canonical document and save authority shall exist per open path.  
**F07-FR-04** Each group shall have independent tab order, active path, and view mode.  
**F07-FR-05** The user shall be able to create, focus, resize, and close the secondary group.  
**F07-FR-06** Closing secondary shall default to merging its tabs into primary.  
**F07-FR-07** Tabs shall be reorderable within a group by pointer and non-pointer controls.  
**F07-FR-08** Tabs shall be movable between groups without duplicating document content.  
**F07-FR-09** Ordinary open requests for an already open path shall focus its owner group.  
**F07-FR-10** Explicit other-group requests shall route through the central open-note router.  
**F07-FR-11** Pinned tabs shall occupy the leading region and persist per workspace.  
**F07-FR-12** Pinned tabs shall survive broad unpinned close commands.  
**F07-FR-13** Closing a pinned tab shall require an explicit unpin-and-close or confirmed include-pinned command.  
**F07-FR-14** The split ratio shall persist and remain clamped to a usable range.  
**F07-FR-15** Compact layouts shall show one group at a time without merging logical state.  
**F07-FR-16** Rotation and resize shall preserve groups, tabs, active paths, and preferred ratio.  
**F07-FR-17** Per-path selection and source or preview scroll state shall survive tab and group switching within the session.  
**F07-FR-18** Layout operations shall not alter note content, dirty state, or save state.  
**F07-FR-19** Active editors shall not remount solely due to divider, panel, or theme changes.  
**F07-FR-20** Workspace settings shall store a versioned runtime-decoded editor layout.  
**F07-FR-21** Legacy flat tabs and active path shall migrate to primary without loss.  
**F07-FR-22** A temporary legacy mirror shall support one release of downgrade compatibility.  
**F07-FR-23** Workspace transition shall flush documents and persist layout before activation changes.  
**F07-FR-24** F03 path refactors shall migrate all document and group references under a mutation lock.  
**F07-FR-25** Stale reads, saves, and settings writes shall not publish after newer workspace or layout generations.  
**F07-FR-26** Group and tab commands shall operate on the active group unless an explicit target is supplied.  
**F07-FR-27** All tab, group, pin, move, close, and resize actions shall be keyboard and screen-reader operable.  
**F07-FR-28** The feature shall work without accounts, telemetry, or network access.  
**F07-FR-29** Desktop and Android shall expose equivalent logical group behavior.  
**F07-FR-30** Other features shall open notes through `OpenNoteRequest` rather than manipulating group state directly.

## 21. Acceptance criteria

1. Creating a split produces exactly two logical groups and no duplicate note path.
2. Opening a new target in the other group leaves the current note in its original group.
3. Requesting an already open target focuses its existing group rather than creating another editor.
4. Moving a tab between groups preserves content, dirty status, selection, scroll, pin state, and save authority.
5. Each group can use a different Source, Split, or Preview mode.
6. Resizing the divider is pointer and keyboard operable, clamps to usable widths, and persists preferred ratio.
7. Closing secondary with Merge preserves every tab and its pin status in deterministic order.
8. A save error blocks a destructive merge or close until the user resolves it.
9. Pinned tabs appear before unpinned tabs and have no ordinary close button.
10. `Close others` and `Close all unpinned` do not close pinned tabs.
11. `Unpin and close` removes the pinned tab only after save state is safe.
12. Pointer drag and keyboard commands can reorder and move tabs equivalently.
13. At compact width, only one group surface is visible and the group switcher preserves both groups.
14. Rotating Android from compact to wide and back does not merge, duplicate, or reset groups.
15. Restoring a workspace lazily loads active documents and retains all valid tab placements.
16. Legacy flat tab state migrates in the original order to primary with the original active path.
17. Invalid or duplicate persisted paths are repaired without crashing or writing outside containment.
18. Theme, Inspector, and divider changes do not remount the active CodeMirror editor.
19. Switching tabs and groups retains in-session selection and scroll.
20. Source undo history remains intact across supported tab and group operations according to the required guarantee.
21. A stale file-open result cannot appear after the path moved groups, was closed, or the workspace switched.
22. F02, F04, F06, F09, and F11 location requests open in the existing or requested group and reveal the target.
23. F03 note rename updates every group and canonical document reference exactly once.
24. Workspace switching drains dirty saves and persists the outgoing layout before the incoming layout appears.
25. Tabs, groups, separator, menus, and compact switcher pass keyboard and screen-reader tests.
26. No note content, pinned path, or group pairing is sent over the network.

## 22. Test plan

### 22.1 Unit tests

- State invariants and repair functions.
- Open-note routing matrix.
- Pin, unpin, reorder, move, close, and merge reducers.
- Active-group command targeting.
- Ratio clamp and adaptive visibility.
- Persistence runtime decoding and unknown fields.
- Legacy migration and mirror generation.
- Path de-duplication and F03 path migration.

### 22.2 Component tests

- One-group and two-group rendering.
- Tab keyboard pattern in both groups.
- Pinned and unpinned regions.
- Context menus and Command Palette targets.
- Empty secondary state.
- Separator pointer and keyboard behavior.
- Compact group switcher and open-tab sheet.
- Save-error close and merge flows.

### 22.3 Editor integration tests

- Two distinct active CodeMirror editors on wide layout.
- View mode per group.
- Selection, scroll, focus, and undo across tab switches.
- Move tab between groups.
- Resize and theme changes without remount.
- Dirty save and close serialization.
- Preview and Source location navigation.

### 22.4 Concurrency tests

- Two note reads complete out of order.
- Same path requested in both groups simultaneously.
- Move while a read is pending.
- Close while save is pending.
- Workspace switch while both groups contain dirty notes.
- F03 rename while stale old-path read is pending.
- Debounced layout writes complete out of order.

### 22.5 Platform and accessibility tests

Desktop:

- mouse drag, keyboard reorder, shortcuts, 200 percent zoom, and forced colors.

Android:

- compact group switching, rotation, activity recreation, software keyboard, increased text size, TalkBack, and Back behavior.

Both:

- 0, 1, 20, and 100 restored tabs;
- duplicate note names;
- missing restored paths;
- light and dark themes;
- Source, Preview, and Split combinations.

## 23. Rollout plan

### Phase 1: Canonical document and group state

- Refactor flat tabs into document store and primary group behind compatibility selectors.
- Preserve current single-group UI and pass existing tests.

### Phase 2: Pinning and persistence

- Add pinned region, commands, settings schema, legacy migration, and lazy restore.

### Phase 3: Secondary group on desktop

- Add split shell, routing, group tab bars, divider, and independent view modes.
- Validate editor state and save authority before enabling broadly.

### Phase 4: Compact and Android

- Add group switcher, rotation preservation, lifecycle handling, and Android accessibility.

### Phase 5: Feature integrations

- Route F02, F04, F06, F09, F11, and existing link/search actions through `OpenNoteRequest`.
- Add F03 path migration adapter.

### Phase 6: General availability

- Remove flat-tab compatibility UI after one release of migration confidence.
- Keep legacy persisted mirror for the documented compatibility window.

## 24. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Two editors write same note | Lost updates | Unique path ownership and one canonical document per path |
| Store refactor breaks autosave | Data loss | Land single-group compatibility first and test one save authority |
| Editor remount loses undo or selection | Poor UX | Retained EditorState, view-state snapshots, explicit remount tests |
| Compact split is unusable | Mobile regression | One visible group with logical group switcher |
| Restore reads every tab | Slow startup | Lazy active-document-first restore |
| Pinned tabs become impossible to close | User frustration | Explicit Unpin and close plus confirmed include-pinned action |
| Feature callers manipulate arrays | State corruption | Central `OpenNoteRequest` and router; no exported raw reducers |
| F03 rename races with reads | Old content reappears | Mutation lock, path-key migration, generation checks |

## 25. Documentation changes

Update:

- user guide for groups, pinning, compact switching, and close semantics;
- shortcut and Command Palette reference;
- architecture documentation for canonical documents, group store, and open-note routing;
- workspace settings schema and migration documentation;
- accessibility documentation for tabs and separator patterns;
- F03 integration notes;
- roadmap status for F07.

## 26. Definition of done

F07 is done when:

- one canonical document and save authority exist per path;
- no path can appear in two groups;
- two-group, pin, move, resize, close, restore, and compact flows satisfy all requirements;
- active editors preserve content, dirty state, selection, scroll, and supported undo behavior;
- workspace transitions and F03 path migrations are generation-safe;
- every existing and approved note-opening feature uses the central routing API;
- legacy tab state migrates and downgrade compatibility is documented;
- desktop and Android accessibility and performance gates pass;
- all functional requirements and acceptance criteria pass;
- docs, settings schema, migration code, and tests land together;
- no unresolved critical or high-severity data-loss, lifecycle, or accessibility defect remains.


---

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


---

# F11 Software Design Document: Visual Markdown Table Editor

**Status:** Approved for implementation design  
**Feature:** F11 Visual Markdown Table Editor  
**Target:** Desktop and Android  
**Last updated:** 2026-09-01

## 1. Summary

F11 adds a focused visual editor for ordinary GitHub Flavored Markdown pipe tables. Users can create a table, edit header and body cells, add, delete, and reorder rows or columns, set column alignment, and paste rectangular tab-separated data. Applying the draft replaces only the proven table source range in one CodeMirror transaction.

The feature is not a spreadsheet engine. It does not add formulas, merged cells, proprietary metadata, or a parallel table file. Cell values remain raw inline Markdown text. The visual editor may normalize formatting inside the selected table, but it must preserve every byte outside that exact table range.

A table-editing session is tied to the active note, workspace session, document generation, and source fingerprint. If the source table changes externally or can no longer be proven, Apply fails closed and preserves the user's draft for copying or reloading.

## 2. Motivation

Markdown tables are portable but tedious to edit, especially on touch devices. Adding a column requires modifying every row, alignment markers are easy to mistype, and pasted spreadsheet data needs manual pipe escaping. A visual grid can make common structural edits much easier without replacing Markdown as the source of truth.

The challenge is safe round-tripping. Pipe characters may be escaped or appear inside inline code, rows may be ragged, and a broad formatter can unintentionally alter the rest of the note. F11 therefore uses a dedicated proven table parser, retains exact source ranges, makes normalization explicit, and applies one isolated source edit.

## 3. Goals

1. Detect supported GFM pipe tables at the active cursor or selection.
2. Create a new ordinary Markdown table at the current editor selection.
3. Edit header and body cell Markdown in a visual grid.
4. Add, remove, and reorder rows and columns.
5. Set left, center, right, or default alignment per column.
6. Paste rectangular tab-separated data into the grid.
7. Serialize a valid deterministic GFM table.
8. Replace only the selected table range in one undoable editor transaction.
9. Preserve dirty content, selection, save coordination, and workspace-generation safety.
10. Provide a practical full-screen compact experience and complete keyboard access.

## 4. Non-goals

The first release does not include:

- formulas or calculated cells;
- sorting data by a column;
- filtering rows;
- merged cells;
- multiple header rows;
- frozen columns;
- rich-text editing inside cells;
- live rendered preview inside every cell;
- Excel or OpenDocument file import or export;
- CSV parsing with dialect and quote inference;
- editing HTML tables;
- editing tables inside code blocks;
- editing multiline cell values;
- changing multiple tables in one Apply action;
- bulk table formatting across a note;
- a proprietary table model stored outside the Markdown;
- collaborative concurrent editing.

## 5. Supported table syntax

### 5.1 Required structure

A supported table has:

1. one header row;
2. one delimiter row;
3. zero or more body rows.

Examples:

```markdown
| Name | Status |
| --- | :---: |
| Alpha | Active |
```

```markdown
Name | Status
--- | ---:
Alpha | Active
```

Outer pipes are optional. The delimiter row must contain at least three hyphens per column, with optional leading or trailing colons for alignment.

### 5.2 Cell separators

A pipe is a cell separator only when it is:

- not escaped by an odd number of immediately preceding backslashes;
- not inside a recognized inline code span;
- not outside the logical row because it is an optional outer pipe.

Examples:

```markdown
| Escaped \| pipe | `code | pipe` |
```

Both examples contain two cells, not three.

### 5.3 Excluded contexts

The table scanner ignores table-like lines inside:

- fenced code blocks;
- indented code blocks;
- HTML comments;
- raw HTML blocks where the Markdown parser treats the content as raw.

A table inside a list item or blockquote is not supported in the first release unless the scanner can remove and restore a uniform container prefix for every row without ambiguity. Initial implementation should treat such tables as unsupported and offer `Edit in source`.

### 5.4 Ragged rows

A source table may have different cell counts across rows. The visual editor opens it only after showing:

`This table has uneven rows. Applying will make every row use <N> columns.`

The draft width is the maximum of header, delimiter, and body row cell counts. Missing cells become empty. Extra delimiter cells create empty header cells. The user must explicitly continue before editing.

### 5.5 Malformed tables

The editor refuses visual mode when:

- delimiter row cannot be proven;
- a delimiter cell has fewer than three hyphens;
- the table range overlaps a code or unsupported container region;
- row boundaries are ambiguous;
- source exceeds hard limits;
- a parse would require guessing whether an unescaped pipe is content or delimiter.

The note remains fully editable in Source mode.

## 6. Table record and locator

```typescript
interface MarkdownTableRecord {
  sourceFrom: number;
  sourceTo: number;
  lineFrom: number;
  lineTo: number;
  rawSource: string;
  sourceFingerprint: string;
  documentFingerprint: string;
  lineEnding: "\n" | "\r\n";
  outerPipeStyle: "both" | "none" | "mixed";
  columns: TableColumn[];
  header: TableCell[];
  rows: TableCell[][];
  warnings: TableParseWarning[];
}

interface TableCell {
  rawMarkdown: string;
  sourceFrom?: number;
  sourceTo?: number;
}

interface TableColumn {
  alignment: "default" | "left" | "center" | "right";
}
```

Offsets are UTF-16 positions compatible with CodeMirror. The parser retains raw cell Markdown after removing syntactic padding that GFM itself does not preserve semantically.

A visual editing session owns an immutable source locator:

```typescript
interface TableEditSession {
  id: string;
  path: string;
  workspaceSession: number;
  openedDocumentGeneration: number;
  sourceFrom: number;
  sourceTo: number;
  sourceFingerprint: string;
  draft: TableDraft;
  dirty: boolean;
  state: "editing" | "applying" | "conflict" | "closed";
}
```

## 7. Entry points

Required entry points:

- Command Palette `Edit table visually` when the primary selection is inside a supported table;
- editor context action `Edit table visually`;
- document action when a table selection is detected;
- Command Palette `Insert Markdown table`;
- keyboard shortcut, configurable through the existing shortcut system.

When the cursor is not inside a supported table, `Edit table visually` explains why it is unavailable or offers Insert table.

F11 applies to the writable Source document. From Preview, a table context action may map the rendered table to its source range and open visual editing only when that mapping is exact and current.

## 8. Editing surface

### 8.1 Desktop presentation

The editor opens in a large modal or dedicated document utility surface owned by UX-01. It contains:

- title and source note context;
- table size summary;
- toolbar for row, column, alignment, and paste actions;
- scrollable grid;
- normalization and warning summary;
- Cancel and Apply actions.

While the session is open, the underlying table source is not independently editable. The application may make the active note read-only behind the modal or use a document-level edit lock. Other notes may remain navigable only if doing so does not orphan or hide the active draft. The simplest first release uses a modal that keeps the source note as the owning document.

### 8.2 Compact presentation

On compact layouts, the editor is full screen:

- top app bar with table title, Cancel, and Apply;
- horizontally and vertically scrollable grid region;
- sticky column header controls where feasible;
- bottom or overflow structural actions;
- safe-area and software-keyboard handling;
- no page-level horizontal scrolling outside the grid.

Cell editing uses the platform keyboard and keeps the active cell visible above it.

### 8.3 Grid structure

The grid includes:

- one header row;
- zero or more body rows;
- column controls for alignment, move, insert, and delete;
- row controls for move, insert, and delete;
- a clear distinction between table header cells and application controls.

The delimiter row is not directly edited as text. It is represented by alignment controls and generated during serialization.

### 8.4 Cell content

Cells edit raw inline Markdown as single-line text. The editor does not render the cell as HTML while typing.

Rules:

- literal tab input moves between cells rather than inserting a tab;
- line breaks are not permitted in one cell;
- pasted single-cell line breaks are normalized to spaces after explicit warning, unless they form a recognized rectangular TSV paste;
- leading and trailing padding spaces are not treated as semantic cell content;
- backslashes and inline Markdown are preserved as typed;
- pipe escaping is handled by serializer logic, not by blind global replacement.

An optional read-only rendered preview for the current cell may be considered after the core editor is stable, but is not required.

## 9. Grid operations

### 9.1 Rows

Required actions:

- add row above;
- add row below;
- delete row;
- move row up;
- move row down;
- append row.

The header row cannot be deleted or moved into the body. Deleting all body rows is allowed and serializes a valid header plus delimiter table.

### 9.2 Columns

Required actions:

- add column before;
- add column after;
- delete column;
- move column left;
- move column right;
- append column;
- set alignment.

A table must retain at least one column. Deleting the last column is blocked with an explanation.

Adding a column inserts an empty cell in header and every body row. Deleting a column removes its cells only from the in-memory draft until Apply.

### 9.3 Alignment

Alignment options:

- Default: `---`
- Left: `:---`
- Center: `:---:`
- Right: `---:`

Changing alignment never changes cell content.

### 9.4 Rectangular paste

When clipboard plain text contains tabs or multiple lines:

1. parse rows by CRLF, LF, or CR;
2. parse cells by tab;
3. remove one final empty line caused by a trailing newline;
4. preserve all other cell text;
5. calculate rectangle dimensions;
6. preview expansion if the paste exceeds current bounds;
7. commit the paste into the draft after limits are checked.

Paste starts at the active cell and may expand body rows and columns. It cannot replace the header as body accidentally. Pasting into a header cell fills header and subsequent rows according to the rectangle.

Quoted CSV semantics are not inferred. Commas remain text.

### 9.5 Keyboard interaction

Required desktop behavior:

- Tab moves to the next editable cell and may append a body row from the last cell when enabled;
- Shift+Tab moves to the previous cell;
- Arrow keys move the caret inside text, and grid movement uses a documented modified shortcut or navigation mode;
- Enter commits the current cell edit and moves down when not composing text;
- Escape reverts the active cell edit first, then closes an open menu, then requests session cancellation;
- Ctrl+Enter or platform equivalent applies the table;
- structural actions are available through shortcuts or menus, not pointer-only drag.

Input Method Editor composition must never be interrupted by grid navigation shortcuts.

## 10. Creating a table

`Insert Markdown table` opens a small setup step:

- number of columns, default 2;
- number of body rows, default 2;
- optional header labels;
- alignment defaults.

Limits are applied. Confirming inserts a serialized table at the current Source selection in one transaction and places the cursor in the first header cell or opens the visual editor immediately according to the chosen action.

Insertion rules:

- add surrounding line breaks only as needed for a separate Markdown block;
- replace selected text only after explicit confirmation when the selection is nonempty;
- preserve note line-ending convention;
- remain one undo step;
- never insert inside a code block or another proven table without warning.

## 11. Draft and dirty behavior

### 11.1 Draft ownership

All visual edits remain in memory until Apply. The note is not updated on every cell keystroke. The surface shows `Unsaved table changes` after the first draft mutation.

### 11.2 Cancel

Cancel with a clean draft closes immediately. Cancel with changes asks:

- Discard table changes;
- Keep editing.

`Copy draft as Markdown` is available from this confirmation and from conflict recovery.

### 11.3 Application lifecycle

The first release does not persist drafts across process termination. On Android activity recreation within the same process, the draft must survive through the application state holder. If the operating system kills the process, the user may lose an unapplied draft; the compact UI must not imply otherwise.

A later app-private draft recovery file requires separate privacy and lifecycle design.

## 12. Serialization

### 12.1 Canonical output

F11 writes a canonical table with outer pipes:

```markdown
| Name | Status |
| --- | :---: |
| Alpha | Active |
```

Rules:

- one space follows the opening pipe and precedes the closing pipe around each cell;
- delimiter cells use at least three hyphens and canonical alignment markers;
- every row has exactly the draft column count;
- missing cells serialize as empty;
- one source line per table row;
- the original note line-ending convention is preserved;
- no trailing whitespace is written;
- outer-pipe style is normalized even when the source omitted outer pipes;
- only the table range is normalized.

The Review area states when source formatting will normalize.

### 12.2 Cell escaping

The serializer tokenizes inline code spans and escaped characters. For cell text outside inline code:

- an unescaped separator pipe is escaped as `\|`;
- an already escaped pipe is not double-escaped;
- backslash parity is preserved correctly;
- tabs become spaces after paste processing;
- newlines are not permitted;
- outer padding is trimmed because GFM table cell padding is nonsemantic.

Pipes inside valid inline code spans remain unchanged. If a cell contains malformed code delimiters and an unescaped pipe, the serializer escapes the pipe rather than risking a new column.

### 12.3 Formatting disclosure

Before Apply, show a non-blocking notice when output differs in formatting beyond user cell changes, including:

- outer pipes added;
- ragged rows made rectangular;
- delimiter dashes normalized;
- cell padding normalized;
- unsafe pipes escaped.

The user can inspect `Preview Markdown` to see the exact replacement text.

## 13. Apply protocol

### 13.1 Document edit lock

Opening visual edit acquires a note-scoped edit-session lock for the table. Autosave may continue for the existing canonical document, but no other F11 session or structural source mutation may edit the same table range. F03 workspace refactor Apply is blocked until the table session closes or is explicitly cancelled.

### 13.2 Validation

On Apply:

1. validate draft dimensions and byte limits;
2. serialize canonical table text;
3. confirm workspace session and note path still match;
4. obtain current canonical document content;
5. confirm the exact source range still contains the original table fingerprint;
6. confirm no external-change conflict is unresolved;
7. apply one CodeMirror transaction replacing `sourceFrom..sourceTo`;
8. set the selection to a sensible position within the replacement;
9. release the edit-session lock;
10. let the normal save coordinator persist the changed note;
11. update workspace metadata after save.

A successful Apply means the canonical editor accepted the transaction. The surface may close before disk save only if the document header truthfully shows Dirty or Saving and save errors remain visible. It must not claim `Saved` until persistence succeeds.

### 13.3 Undo

The complete table replacement is one CodeMirror transaction with one user-event annotation. One Undo restores the exact original table source, including its prior spacing and outer-pipe style, because CodeMirror retains the deleted source in history.

### 13.4 Conflict

If validation fails:

- keep the draft in memory;
- do not change the note;
- enter Conflict state;
- show `The source table changed while the visual editor was open.`;
- offer `Reload source table`, `Copy draft as Markdown`, `Open source`, and `Cancel`.

The first release does not attempt an automatic three-way merge. Reload replaces the draft only after confirmation.

## 14. Size and resource limits

Interactive limits:

- maximum 200 body rows;
- maximum 50 columns;
- maximum 10,000 total cells including header;
- maximum 2 MiB serialized table source;
- maximum 100,000 characters in one cell.

A table exceeding any limit opens a read-only summary with:

- dimensions and source size;
- `Open in source`;
- `Copy table Markdown`;
- explanation that visual editing is unavailable.

There is no `Edit anyway` bypass in the first release. Paste or structural operations that would exceed limits are rejected before changing the draft.

## 15. Preview source mapping

To support a Preview context action, the Markdown render pipeline may annotate rendered tables with a generation-scoped source table ID. The mapping must:

- derive from exact parser records;
- remain in memory only;
- be invalidated on source or preview generation change;
- never use user-controlled HTML IDs without escaping;
- open F11 only when the mapped source fingerprint still matches.

If mapping is stale, the action opens Source at the table and asks the user to retry.

## 16. Architecture

Recommended modules:

```text
src/markdown/
  tables.ts
  tableTokenizer.ts

src/tableEditor/
  tableTypes.ts
  tableDraft.ts
  tableSerializer.ts
  tableClipboard.ts
  tableSessionStore.ts
  TableEditor.tsx
  TableGrid.tsx
  TableToolbar.tsx
  TableConflict.tsx
  tableCommands.ts
```

Parser and serializer are pure modules with round-trip fixtures. UI code does not locate source with ad hoc line splitting.

The table session store references the canonical `documentStore` from F07 or the compatible current workspace store. It does not own a second note body.

## 17. Concurrency and lifecycle

- Session open and Apply carry workspace session, path, document generation, and source fingerprint.
- A workspace transition with a dirty table draft asks the user to Apply, Discard, or Cancel transition.
- A note rename through F03 is blocked while its table session is open, or the session path migrates only through an explicitly tested typed adapter before Apply.
- F07 may move the owning note between groups, but the table session remains bound to the canonical path and document.
- External file change handling can mark the session conflicted.
- A stale Apply callback cannot mutate a newer note, another path, or another workspace.
- Only one visual table session may own a given note at a time. The application may allow sessions in different notes only after modal and state ownership are proven; the first release may permit one global session.

## 18. Error handling

Required errors:

- no supported table at cursor;
- malformed or unsupported table context;
- ragged table normalization warning;
- table exceeds limits;
- clipboard rectangle exceeds limits;
- source table changed;
- note changed externally;
- workspace switched or unavailable;
- serializer validation failure;
- canonical editor unavailable;
- save failure after Apply.

A save failure after Apply is a normal note save error. The canonical dirty content remains visible and recoverable; F11 must not roll back an accepted editor transaction automatically.

## 19. Security and privacy

- No table content leaves the device.
- Clipboard is read only after explicit paste and written only after explicit copy.
- Cell Markdown is edited as text, not executed.
- Any optional preview uses the existing sanitized Markdown renderer.
- Source mapping values are application-owned and generation-scoped.
- The feature cannot read or write outside the active contained note.
- Size limits protect memory and paste denial-of-service behavior.
- Logs contain dimensions and error classes, not cell content.
- No remote fonts, scripts, telemetry, or network service are added.

## 20. Accessibility

### 20.1 Grid semantics

The implementation must choose and fully implement either:

- a semantic table containing labeled text inputs and structural controls; or
- an ARIA grid with complete grid keyboard interaction.

A partial spreadsheet pattern is not acceptable.

Required information for each cell:

- row type and number;
- column number or header name;
- current value;
- whether it is a header cell;
- relevant validation error.

### 20.2 Structural actions

Add, delete, move, and alignment controls have explicit names such as `Move column Status left`. Pointer drag is optional and never required.

Deleting a row or column announces the result and places focus on a predictable adjacent cell. Destructive actions affecting nonempty cells require confirmation or immediate undo within the draft.

### 20.3 Keyboard and composition

- All operations are reachable without pointer.
- Focus order stays within the modal or full-screen route while open.
- IME composition is not interrupted by Enter, arrows, or Apply shortcuts.
- Escape behavior is layered and documented.
- Error summary links focus to the affected cell or control.

### 20.4 Compact and visual access

- Active cell, selection, header, and alignment are not conveyed by color alone.
- Focus indicators remain visible in forced colors.
- The grid supports 200 percent zoom and increased Android text size.
- Touch targets meet the compact minimum.
- Horizontal and vertical scroll regions are labeled and do not trap screen-reader navigation.

## 21. Performance requirements

- Table detection around the active cursor should complete within 50 ms for a typical note using precomputed structure or bounded local scanning.
- Opening a 10,000-cell table may take longer but must show visual feedback within 100 ms and remain cancellable before the editor is ready.
- Draft operations update only affected rows or columns and avoid cloning multi-megabyte structures unnecessarily.
- Grid rendering virtualizes rows and, when required, columns for large supported tables.
- Clipboard parsing and serialization run off the critical typing path and remain bounded by limits.
- Apply performs one source transaction and reparses only the affected note.
- No full workspace scan is triggered.

## 22. Functional requirements

**F11-FR-01** The system shall detect supported GFM pipe tables with exact UTF-16 source ranges.  
**F11-FR-02** The parser shall distinguish escaped pipes and pipes inside valid inline code spans from separators.  
**F11-FR-03** Table-like syntax in excluded code, comment, or unsupported container regions shall not open in visual mode.  
**F11-FR-04** Ragged tables shall require a normalization warning before editing.  
**F11-FR-05** The application shall support creating a new table at the current Source selection.  
**F11-FR-06** The visual editor shall edit one header row and zero or more body rows.  
**F11-FR-07** Users shall be able to add, delete, and reorder body rows.  
**F11-FR-08** Users shall be able to add, delete, and reorder columns while retaining at least one.  
**F11-FR-09** Users shall be able to set default, left, center, and right alignment per column.  
**F11-FR-10** Rectangular TSV paste shall fill and safely expand the draft within limits.  
**F11-FR-11** The draft shall remain in memory until Apply and shall not mutate the note per cell keystroke.  
**F11-FR-12** A dirty draft shall require confirmation before discard.  
**F11-FR-13** The serializer shall output valid canonical GFM Markdown with outer pipes.  
**F11-FR-14** The serializer shall safely escape separator pipes outside inline code without double-escaping.  
**F11-FR-15** Formatting normalization shall be disclosed and exact replacement Markdown shall be inspectable.  
**F11-FR-16** Apply shall validate workspace session, path, document generation, source range, and fingerprint.  
**F11-FR-17** Apply shall fail closed when the table can no longer be proven.  
**F11-FR-18** Apply shall replace only the table source range in one CodeMirror transaction.  
**F11-FR-19** One Undo shall restore the exact prior table source.  
**F11-FR-20** Bytes outside the table range shall remain unchanged.  
**F11-FR-21** A conflict shall preserve the draft and offer Reload, Copy draft, Open source, and Cancel.  
**F11-FR-22** Interactive row, column, cell, and byte limits shall be enforced before draft mutation.  
**F11-FR-23** Tables above limits shall remain available in Source and a read-only summary.  
**F11-FR-24** F07 group moves shall not duplicate or detach the canonical note during a table session.  
**F11-FR-25** F03 refactor Apply and table source Apply shall not run concurrently on the same note.  
**F11-FR-26** Save state after Apply shall remain truthful and use the normal save coordinator.  
**F11-FR-27** All cells and structural actions shall be keyboard and screen-reader operable.  
**F11-FR-28** Compact presentation shall provide equivalent editing without page-level horizontal scrolling.  
**F11-FR-29** The feature shall operate without accounts, telemetry, proprietary table storage, or network access.  
**F11-FR-30** Parser and serializer fixtures shall cover LF, CRLF, Unicode, escapes, code spans, and malformed input.

## 23. Acceptance criteria

1. A supported table at the Source cursor opens with the correct header, rows, alignments, and raw cell Markdown.
2. A pipe escaped with an odd backslash count does not create a column.
3. A pipe inside a valid inline code span does not create a column.
4. Table-like content in fenced code, indented code, comments, and unsupported block containers does not open visually.
5. A ragged table shows the exact rectangular width and requires confirmation before normalization.
6. Adding or deleting a row changes every column consistently in the draft only.
7. Adding, moving, or deleting a column updates header, every body row, and alignment together.
8. The last column cannot be deleted.
9. TSV paste begins at the active cell, expands safely, and rejects a result above limits without partial mutation.
10. Commas remain ordinary text and are not interpreted as CSV separators.
11. The canonical serializer produces valid GFM with correct alignment markers and line endings.
12. Unescaped separator pipes are escaped exactly once; pipes in inline code are retained.
13. `Preview Markdown` matches the exact text applied.
14. Apply changes no byte before or after the proven table range.
15. One Undo restores the exact original table, including ragged spacing and outer-pipe style.
16. A document or external source change that alters the table causes Conflict and no source mutation.
17. Conflict retains the complete draft and `Copy draft as Markdown` returns canonical text.
18. A save failure after Apply leaves the note dirty with standard Retry behavior and does not falsely show Saved.
19. Creating a table inserts one valid block with required surrounding newlines in one undo step.
20. A table above 200 rows, 50 columns, 10,000 cells, 2 MiB, or cell limit opens only the read-only summary.
21. Moving the note between F07 groups during the session does not change path ownership, content, or draft.
22. F03 structural Apply cannot mutate the same note until the table session reaches a safe state.
23. Desktop and Android support every structural action without drag.
24. Screen readers receive row, column, header, value, alignment, and error context.
25. No table content is logged, transmitted, or stored in proprietary persistent data.

## 24. Test plan

### 24.1 Parser unit tests

- Outer pipes present, absent, and mixed.
- All alignment forms and invalid delimiter cells.
- Escaped pipes with odd and even backslashes.
- Inline code spans with variable backtick delimiters and pipes.
- Empty cells, trailing cells, ragged rows, and zero body rows.
- LF, CRLF, Unicode, combining marks, and surrogate pairs.
- Fenced code, indented code, comments, lists, and blockquotes.
- Malformed tables and ambiguous row boundaries.

Property-based or fuzz tests should assert that parser output never produces overlapping source ranges and never throws on arbitrary text.

### 24.2 Serializer unit tests

- Alignment output.
- Rectangular padding.
- Pipe escaping without double-escape.
- Inline code preservation.
- Padding normalization.
- Line-ending preservation.
- Parse, serialize, parse structural equivalence for supported fixtures.
- One-column and empty-body tables.

### 24.3 Draft operation tests

- Add, delete, and move every row and column boundary.
- Preserve cell data through moves.
- Alignment follows columns.
- Header cannot become body.
- Minimum column constraint.
- TSV paste dimensions, expansion, final newline, and limit rejection.
- Unsaved dirty and cancel behavior.

### 24.4 Component and accessibility tests

- Desktop modal and compact full-screen surface.
- Complete selected table or grid keyboard pattern.
- IME composition.
- Focus after row or column deletion.
- Error summary and conflict actions.
- 200 percent zoom, forced colors, increased Android text size, and touch targets.
- Grid-local scrolling without page-level horizontal scrolling.

### 24.5 Integration tests

- Open dirty note, edit table, Apply, save, and Undo.
- External file change during session.
- Workspace switch with clean and dirty draft.
- F07 move between groups.
- F03 transaction lock.
- Preview source-map entry and stale mapping.
- Metadata index update after save.
- Save failure after accepted Apply.

### 24.6 Performance tests

- Typical 10 by 10 table.
- Maximum 200 by 50 table.
- 2 MiB boundary.
- Large clipboard input above limits.
- Repeated add, move, and delete operations without unbounded memory growth.

## 25. Rollout plan

### Phase 1: Parser and serializer

- Land fixture corpus, source ranges, canonical serializer, and round-trip tests.
- Add developer-only table inspection.

### Phase 2: Read and edit grid

- Add desktop visual surface, draft model, row, column, alignment, and Apply behind a feature flag.
- Verify byte isolation and one-step Undo.

### Phase 3: Create and paste

- Add table insertion, TSV paste, warnings, and limit handling.

### Phase 4: Compact and accessibility

- Add Android full-screen presentation, keyboard and screen-reader pattern, IME, zoom, and touch hardening.

### Phase 5: Integrations and general availability

- Add Preview mapping, F07 group safety, F03 mutation lock, docs, and telemetry-free performance tests.
- Enable by default after all gates pass.

## 26. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Parser splits pipes incorrectly | Corrupted table | Context-aware tokenizer, exact fixtures, fail closed on ambiguity |
| Formatter changes unrelated note text | Data loss | Exact range replacement and byte-isolation tests |
| Source changes while draft is open | Overwritten edits | Note-scoped lock, fingerprint validation, no auto-merge |
| Large grid freezes mobile | Unusable feature | Hard limits, virtualization, bounded clipboard parsing |
| Keyboard pattern conflicts with cell editing | Accessibility and input failure | Complete documented pattern and IME-aware handling |
| Normalization surprises users | Trust loss | Warning summary and exact Markdown preview |
| Save fails after Apply | False success | Canonical dirty state and existing Retry, never claim Saved early |
| Visual editor becomes spreadsheet scope | Complexity | Explicit non-goals and raw Markdown cell model |

## 27. Documentation changes

Update:

- user guide for supported table syntax, visual editing, paste, normalization, and limits;
- keyboard and accessibility reference;
- architecture documentation for table parser, serializer, and edit-session lock;
- troubleshooting for unsupported or conflicted tables;
- visual refresh integration documentation;
- roadmap status for F11.

## 28. Definition of done

F11 is done when:

- supported tables parse with exact safe ranges and ambiguous tables fail closed;
- every required row, column, alignment, creation, and TSV action works on desktop and Android;
- serializer output is deterministic valid GFM and normalization is disclosed;
- Apply changes only the table range in one undoable CodeMirror transaction;
- stale source, external edits, F03 refactors, workspace changes, and save failures cannot cause silent data loss;
- limits, virtualization, IME, keyboard, screen-reader, zoom, and compact gates pass;
- no formulas, proprietary table storage, accounts, telemetry, or network access are introduced;
- all functional requirements and acceptance criteria pass;
- documentation and comprehensive parser, serializer, component, integration, and platform tests land with implementation;
- no unresolved critical or high-severity data-integrity or accessibility defect remains.

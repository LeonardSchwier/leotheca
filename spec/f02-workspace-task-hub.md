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

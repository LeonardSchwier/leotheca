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

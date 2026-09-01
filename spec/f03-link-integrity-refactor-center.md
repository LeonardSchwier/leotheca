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

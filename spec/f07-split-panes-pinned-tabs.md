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

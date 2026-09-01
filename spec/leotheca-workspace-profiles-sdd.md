# Workspace Profiles and Recent Workspaces

**Status:** Approved for implementation design  
**Feature label:** F20  
**Target:** Desktop and Android  
**Priority:** P1  
**Owners:** TBD  
**Last updated:** 2026-09-01

## 1. Summary

Leotheca shall maintain a local catalog of previously opened workspaces and allow the user to switch between them without selecting the folder again each time.

Each catalog entry is a workspace profile with a stable application-local ID, a user-editable display name, a fixed icon, a platform-specific workspace locator, and a last-opened timestamp. Exactly one workspace may be active at a time.

The feature must preserve Leotheca's existing product boundaries:

- Notes remain ordinary Markdown files in user-selected folders.
- Workspace-specific settings remain in `<workspace>/.leotheca/settings.json`.
- No account, cloud service, network request, telemetry, proprietary sync, or application content database is introduced.
- The application must not copy, move, merge, or delete workspace files as part of profile management.

## 2. Context

The current global configuration stores only the last workspace path, the global theme, and an optional Android workspace token. This is sufficient for reopening one workspace, but not for maintaining several named workspaces.

Desktop workspaces have distinct native paths. Android workspaces use the same synthetic application path, `/workspace`, and are distinguished by their persisted Storage Access Framework URI tokens. Therefore, a workspace profile must have its own stable ID and must not use `workspacePath` as its cross-platform identity.

The existing settings store already owns workspace initialization, settings loading, tab restoration, and workspace-session changes. Workspace Profiles must extend this path rather than introduce a second workspace activation mechanism.

## 3. Dependencies

### 3.1 Required before release

Workspace switching must use the authoritative workspace-transition work tracked by roadmap items N-001 and N-003. That transition must:

- stop new edits during the transition;
- cancel or drain outgoing delayed saves;
- wait for outgoing in-flight saves;
- prevent asynchronous results from the old session from mutating the new session;
- restore or retain the outgoing workspace when target activation fails;
- make the newest transition request authoritative.

The stale file-open protection tracked by N-002 must also be complete or included in this feature. A file-open result started in workspace A must never create or replace a tab after workspace B becomes authoritative.

### 3.2 Reused behavior

- Per-workspace settings parsing and persistence
- Workspace tab persistence and restoration
- Desktop folder picker
- Android SAF folder picker and persisted URI token
- Existing `workspaceSession` isolation
- Existing theme preference behavior

## 4. Problem statement

Users who keep separate folders for personal notes, work, study, projects, or archives must currently choose the folder again when changing workspaces. The application does not provide a persistent list, recognizable labels, or a fast switcher.

Repeated switching also increases the importance of transition correctness. Delayed note saves, delayed settings writes, stale file reads, or Android URI changes must not cross workspace boundaries.

## 5. Goals

1. Let users add and retain multiple workspace profiles locally.
2. Let users switch to a previously opened workspace without invoking the folder picker again.
3. Let users assign a recognizable name and icon to each profile.
4. Sort workspaces by successful recent use.
5. Restore each workspace's existing settings and tabs independently.
6. Recover gracefully when a folder is missing, moved, or no longer accessible.
7. Prevent implicit loss of unsaved note changes during a switch.
8. Preserve current offline, local-first, and portable-file guarantees.
9. Provide equivalent core behavior on Desktop and Android.

## 6. Non-goals

The first release does not include:

- more than one active workspace at the same time;
- opening workspaces in separate application windows;
- cross-workspace search, backlinks, graph edges, or tabs;
- profile synchronization between devices;
- account-backed profiles;
- moving, copying, importing, merging, or deleting note files;
- a database containing note content or a cross-workspace content cache;
- background scanning or validation of all profiles;
- arbitrary emoji, uploaded profile images, or filesystem-based profile icons;
- revoking an Android persisted URI permission when a profile is forgotten;
- profile-specific themes in the first release;
- automatic discovery of workspace folders.

## 7. Product decisions

The following decisions are settled for the first release.

### 7.1 Profile metadata location

Profile metadata is application-local global configuration. It is not written into the workspace folder.

Rationale:

- The switcher must be renderable before a workspace is opened.
- An unavailable workspace must remain visible and recoverable.
- Users may prefer different local labels for the same folder on different devices.
- The workspace remains portable and does not gain device-specific path or token metadata.

### 7.2 Workspace-specific state

`<workspace>/.leotheca/settings.json` remains the source of truth for workspace-specific UI settings and tab state. Workspace Profiles must not duplicate those fields in global configuration.

### 7.3 Active workspace count

Exactly zero or one workspace is active. Zero is allowed during first use, after forgetting the active profile, and during recovery from an unavailable active profile.

### 7.4 Icons

Profiles use a fixed, application-bundled icon enum. The initial set is:

- `folder`
- `book`
- `journal`
- `briefcase`
- `school`
- `code`
- `home`
- `archive`

Unknown future icon values fall back visually to `folder` and are preserved in configuration when possible.

### 7.5 Ordering

Profiles are ordered by descending `lastOpenedAt`. A timestamp changes only after the target workspace has opened successfully and become authoritative.

Ties are resolved by case-insensitive profile name and then stable profile ID.

### 7.6 Capacity

There is no product-level hard cap. The interface must remain usable with at least 100 profiles.

### 7.7 Forget semantics

Forgetting a profile removes only application-local catalog metadata. It does not alter the folder, its notes, `.leotheca/settings.json`, attachments, or platform permission state.

### 7.8 Theme

Theme remains global. Switching profiles does not change the active theme.

## 8. User stories

### US-01: Reopen a known workspace

As a user with multiple note folders, I can choose a known workspace from a recent-workspaces list and open it without using the folder picker.

### US-02: Recognize workspaces

As a user, I can rename a profile and choose an icon so that similar folder names are easy to distinguish.

### US-03: Add a workspace

As a user, I can select another local folder and add it to my profile list.

### US-04: Preserve independent state

As a user, I return to the tabs, active note, and settings previously stored for that workspace.

### US-05: Recover an unavailable workspace

As a user, I can retry or relink a profile when its folder was moved or its Android access is no longer valid.

### US-06: Forget without deleting

As a user, I can remove a profile from the application while leaving all files untouched.

### US-07: Safe switching

As a user editing a note, I can switch workspaces without losing a delayed or in-flight save.

## 9. Entry points

### 9.1 Workspace button in the application header

Replace the static workspace identity area with a button that shows:

- active profile icon;
- active profile name;
- disclosure indicator;
- accessible label `Switch workspace`.

When no workspace is active, the button shows `Open workspace`.

Desktop may show icon and full name. Narrow mobile layouts may show the icon and a truncated name, but the accessible name must contain the full profile name.

### 9.2 Command palette

Add commands:

- `Switch workspace...`
- `Add workspace...`
- `Manage workspace profiles...`

`Switch workspace...` opens the switcher with its search field focused.

No dedicated global operating-system shortcut is required in the first release.

### 9.3 Settings

The General settings page gains a `Workspace profiles` section containing:

- active workspace summary;
- profile list;
- `Add workspace` action;
- per-profile actions for rename, icon, relink, and forget.

The current `Change Folder` control is replaced by profile-aware actions. The user must not be routed through a separate legacy switch path.

### 9.4 Startup and welcome screen

When no profiles exist, keep the current first-run folder-selection experience.

When profiles exist but none is active, show a workspace launcher containing:

- recent profiles;
- status for an unavailable profile when known;
- `Add workspace`;
- recovery actions for a selected unavailable profile.

## 10. Workspace switcher UX

### 10.1 Layout

The switcher contains:

1. Search field
2. Ordered profile results
3. `Add workspace` action
4. Optional `Manage profiles` action

Each result shows:

- icon;
- display name;
- current-workspace checkmark when applicable;
- a secondary locator label;
- an unavailable indicator only after a failed access attempt in the current run or a persisted, non-sensitive availability state defined later.

Desktop secondary label: native folder path, elided in the middle when necessary.  
Android secondary label: non-sensitive display label only. Never display the raw content URI token.

### 10.2 Search

Search is case-insensitive and matches:

- profile display name;
- desktop folder basename;
- desktop path text.

Android URI tokens are never searchable.

An empty query preserves recent ordering. Search results preserve recent ordering among equal match classes.

### 10.3 Keyboard and touch

- `ArrowUp` and `ArrowDown` change the highlighted item.
- `Enter` activates the highlighted item.
- `Escape` closes the switcher without side effects.
- The currently active item is announced to assistive technology.
- Interactive rows meet the application's minimum touch-target standard and are at least 44 CSS pixels high on touch layouts.
- Focus returns to the opener when the switcher closes.

### 10.4 Selecting the active profile

Selecting the already active profile closes the switcher. It performs no filesystem work, does not increment the workspace session, and does not alter recency.

## 11. Add-workspace flow

1. User invokes `Add workspace`.
2. The existing platform folder picker opens.
3. The picker returns a platform selection containing `path`, optional `token`, and optional `suggestedName`.
4. The application computes the selection's locator key.
5. When the selection already belongs to a recognized profile, the application activates that profile instead of creating a duplicate.
6. Otherwise, the application creates an in-memory candidate profile:
   - random stable ID;
   - default name from `suggestedName`, Desktop folder basename, or `Workspace`;
   - icon `folder`;
   - selected locator;
   - no committed `lastOpenedAt` yet.
7. The application activates the candidate through the authoritative transition coordinator.
8. Only after successful activation is the candidate committed to global configuration and assigned `lastOpenedAt`.
9. The user may rename or change the icon later. A naming dialog is not required during the picker flow.

Picker cancellation leaves all state unchanged.

## 12. Profile identity and deduplication

### 12.1 Stable identity

`WorkspaceProfile.id` is the application identity. It is generated once and remains stable across rename, icon change, relink, and recency changes.

Recommended format: a cryptographically random UUID generated with the platform Web Crypto API.

### 12.2 Locator key

The locator key is used only for duplicate detection.

- When a non-empty Android or platform token exists, the key is based on the exact token.
- Otherwise, the key is based on a normalized Desktop path.

Desktop normalization must be platform-aware and must not falsely merge distinct case-sensitive paths. The implementation should use a platform helper rather than applying unconditional lowercase conversion.

The raw locator key is not persisted as a second source of truth. It is derived from profile fields.

### 12.3 Android constraint

On Android every active workspace may use `/workspace` internally. Therefore:

- `/workspace` is never a valid unique profile identity;
- profile lookup uses profile ID;
- duplicate detection uses the persisted token;
- transition rollback must restore the outgoing token mapping before making the outgoing session editable again.

## 13. Rename and icon editing

### 13.1 Rename validation

Profile names:

- are trimmed before persistence;
- must contain at least 1 Unicode scalar value after trimming;
- may contain at most 80 Unicode scalar values;
- do not have to be unique;
- must not contain line-break characters.

Duplicate display names are allowed because the locator subtitle and icon can disambiguate them.

### 13.2 Icon editing

Only known fixed icon IDs may be selected through the UI. An unknown persisted value is rendered as `folder` without deleting the original value during unrelated writes.

Rename and icon changes do not open the workspace and do not change `lastOpenedAt`.

## 14. Relink and access recovery

Relink replaces a profile's locator while preserving its ID, name, icon, and recency.

Flow:

1. User chooses `Relink folder` or `Grant access again`.
2. Platform folder picker opens.
3. Application rejects a selection already owned by another recognized profile and identifies that profile by display name.
4. Application validates the new selection by attempting to restore access and load the target workspace settings.
5. When validation succeeds, the new locator is committed.
6. When relinking the active profile, the operation uses the full safe workspace transition protocol.
7. On failure or picker cancellation, the old locator remains unchanged.

Relink does not inspect note content to prove that the selected folder is the same historical workspace. The confirmation UI must therefore state which profile will point to the newly selected folder.

## 15. Forget flow

### 15.1 Inactive profile

The confirmation text must state that files are not deleted. On confirmation, the profile is removed from the catalog and global configuration.

### 15.2 Active profile

Forgetting the active profile requires an authoritative transition to the no-workspace state:

1. Flush and drain outgoing work using the normal transition protocol.
2. Clear workspace-scoped UI state.
3. Commit `activeWorkspaceId = null`.
4. Remove the profile from the catalog.
5. Show the workspace launcher.

When outgoing work cannot be saved, the forget action is aborted by default.

A secondary `Forget without saving` action may be offered only after a second explicit confirmation that names the unsaved consequence. It must not be the primary action.

### 15.3 File and permission guarantees

Forget must not:

- delete or modify the folder;
- delete `.leotheca/settings.json`;
- revoke Android SAF permission in the first release;
- clear other profiles;
- alter another workspace's settings.

## 16. Safe transition protocol

All activation paths, including startup, switcher selection, add, relink-active, and forget-active, must call one authoritative transition coordinator.

### 16.1 Transition state

```ts
export type WorkspaceTransitionState =
  | { status: "idle" }
  | { status: "saving"; targetProfileId: string | null }
  | { status: "opening"; targetProfileId: string }
  | {
      status: "error";
      targetProfileId: string | null;
      phase: "save" | "access" | "settings" | "global-config";
      message: string;
    };
```

The user interface may derive more specific copy from typed internal errors. Raw Android tokens and full exception dumps must not appear in user-facing messages.

### 16.2 Transition generation

Each requested transition receives a monotonically increasing generation value.

After every asynchronous boundary, the coordinator checks that its generation is still authoritative. A superseded transition exits silently after cleaning up its own temporary work. It may not publish signals, restore tabs, alter the Android path mapping, or update recency.

### 16.3 Required sequence for A to B

1. Capture outgoing profile ID, workspace path, token, session, and transition generation.
2. Enter `saving` and prevent new editor mutations.
3. Flush all delayed note saves belonging to the outgoing session.
4. Wait for all outgoing in-flight note saves to settle.
5. Flush the outgoing tab state and workspace-settings write queue.
6. Abort on a save failure. Keep A authoritative and editable after showing recovery actions.
7. Enter `opening`.
8. Restore B access through the existing platform bridge.
9. Load B workspace settings.
10. Prepare B's active tab restoration without publishing it to global UI state.
11. Check authority after every await.
12. Atomically publish B's path, token, settings, workspace session, active profile ID, and initial tab state.
13. Reset or replace all workspace-scoped stores using the new session.
14. Restore additional tabs according to the existing lazy-restoration behavior.
15. Update B's `lastOpenedAt` in memory.
16. Persist global configuration, including the active profile and compatibility mirror.
17. Return to `idle` and re-enable editing.

### 16.4 Target-open failure

When B cannot be opened:

- A remains or becomes authoritative again;
- Android restores A's token-to-`/workspace` mapping before editing resumes;
- B remains in the catalog;
- B's recency is unchanged;
- the switcher offers Retry, Relink or Grant access, and Open another workspace;
- no target tabs or settings may leak into A.

### 16.5 Global-configuration write failure

A global-config write failure after B has opened does not invalidate successful note and workspace access. The application:

- keeps B active in memory;
- shows a non-blocking error with Retry;
- retains the unsaved global-config mutation in a serialized retry queue;
- does not claim that recency or active-profile persistence succeeded;
- never rewrites global configuration from a stale snapshot.

### 16.6 Switch without saving

When outgoing note or settings writes fail, the primary behavior is to cancel the switch.

A destructive fallback may be shown as `Switch without saving`. It requires explicit confirmation and must:

- identify that unsaved editor changes can be lost;
- discard only outgoing in-memory changes;
- invalidate all outgoing async work before changing access;
- never delete persisted files.

## 17. Startup behavior

### 17.1 Normal startup

1. Read and decode global configuration once.
2. Migrate legacy configuration in memory when needed.
3. Resolve `activeWorkspaceId` to a recognized profile.
4. Attempt activation through the same authoritative transition coordinator used at runtime.
5. On success, show the normal application and persist migration if required.

### 17.2 Unavailable active profile

When the active profile cannot be opened:

- retain the profile and its locator in global configuration;
- do not automatically null or delete it;
- do not overwrite the configuration merely because access failed;
- show the recovery workspace launcher;
- offer Retry, Relink or Grant access, Open another, and Add workspace;
- keep `activeWorkspaceId` as the user's last intended profile until another profile successfully opens or the user forgets it.

### 17.3 No recognized active profile

When profiles exist but `activeWorkspaceId` is missing or references an invalid entry, show the launcher with recent profiles. Do not choose a profile solely because it is first in the array.

## 18. Global configuration model

### 18.1 Logical TypeScript model

```ts
export type WorkspaceIcon =
  | "folder"
  | "book"
  | "journal"
  | "briefcase"
  | "school"
  | "code"
  | "home"
  | "archive";

export interface WorkspaceProfile {
  id: string;
  name: string;
  icon: WorkspaceIcon | string;
  path: string;
  token?: string;
  lastOpenedAt: number;
}

export interface GlobalConfigV2 {
  version: 2;
  theme: ThemePreference;
  activeWorkspaceId: string | null;
  workspaceProfiles: WorkspaceProfile[];

  // Compatibility mirror for one release cycle.
  lastWorkspacePath: string | null;
  workspaceToken?: string;
}
```

The runtime decoder may use a stricter recognized-profile type than the persisted interface.

### 18.2 Validation

A recognized profile requires:

- non-empty string `id`;
- valid trimmed `name` according to Section 13.1;
- non-empty string `path`;
- optional non-empty string `token`;
- finite, non-negative `lastOpenedAt`;
- string `icon`, with unknown values allowed for forward compatibility.

The global document requires a supported `version`, a valid theme, an array-like profile field, and a string-or-null active ID.

### 18.3 Non-destructive decoding

The global decoder must preserve forward compatibility and avoid erasing recoverable configuration.

Requirements:

- Preserve unknown top-level fields on unrelated writes.
- Preserve unknown fields inside recognized profile records.
- Keep unrecognized profile records verbatim in their original relative position when serializing unrelated edits.
- Exclude unrecognized profiles from activation and normal UI results.
- Resolve duplicate valid IDs deterministically for the runtime view, while retaining the original records until the user explicitly repairs or removes them.
- Never replace malformed global configuration with defaults during ordinary startup.
- Surface a recoverable configuration warning and provide an explicit rewrite or repair action when persistence cannot be performed safely.

The implementation may represent the persisted document and the decoded runtime view separately.

### 18.4 Serialized writes

All global-config writes use one serialized, latest-state-aware queue. Theme changes, recency changes, profile edits, and active-profile changes must not each reconstruct the document from stale captured values.

A write operation receives or reads the latest canonical in-memory document immediately before serialization.

## 19. Migration from legacy configuration

### 19.1 Input

Legacy configuration may contain:

- `lastWorkspacePath`
- `theme`
- optional `workspaceToken`
- unknown future or historical fields

### 19.2 Migration rule

When no v2 profile catalog exists and `lastWorkspacePath` is non-null:

1. Create one profile with a new UUID.
2. Use the final Desktop path component as the default name when available.
3. Use `Workspace` when the path is synthetic or has no usable basename.
4. Set icon to `folder`.
5. Copy `lastWorkspacePath` and `workspaceToken` into the locator.
6. Set `lastOpenedAt` to migration time in memory.
7. Set `activeWorkspaceId` to the new ID.
8. Preserve unknown fields.

Persist the migration only after the legacy workspace has opened successfully or after an explicit user edit that safely commits the new document.

When the legacy workspace cannot open, retain the legacy locator in the recovery launcher and do not erase it.

### 19.3 Compatibility mirror

For one release cycle, every successful active-profile persistence mirrors:

- active profile path to `lastWorkspacePath`;
- active profile token to `workspaceToken`;
- null when no profile is active.

This lets the immediately previous application version reopen the most recently active workspace. The mirror is not used as the primary source once a valid v2 catalog exists.

Removal of the mirror requires a separate migration decision after the compatibility window.

## 20. Store and API changes

The exact module split may follow the N-001 transition implementation, but the public UI-facing surface should be equivalent to:

```ts
export const workspaceProfiles: ReadonlySignal<readonly WorkspaceProfileView[]>;
export const activeWorkspaceId: ReadonlySignal<string | null>;
export const workspaceTransition: ReadonlySignal<WorkspaceTransitionState>;

export async function addWorkspaceFromPicker(): Promise<void>;
export async function activateWorkspaceProfile(id: string): Promise<void>;
export async function renameWorkspaceProfile(id: string, name: string): Promise<void>;
export async function setWorkspaceProfileIcon(id: string, icon: WorkspaceIcon): Promise<void>;
export async function relinkWorkspaceProfile(id: string): Promise<void>;
export async function forgetWorkspaceProfile(id: string, options?: { discardUnsaved?: boolean }): Promise<void>;
```

`setWorkspacePath` must no longer be called directly by UI surfaces. It may remain temporarily as a private compatibility wrapper for tests or migration, but all user-visible activation must flow through profile actions and the transition coordinator.

The active workspace token remains private store state and must not be exposed through a general profile view model used by components.

## 21. Suggested module ownership

The final filenames may adapt to concurrent transition work.

- `src/settings/globalConfig.ts`
  - v2 persisted schema
  - non-destructive decoder
  - legacy migration
  - serialized persistence
- `src/settings/workspaceProfiles.ts`
  - pure profile validation, sorting, naming, and deduplication helpers
- `src/settings/store.ts` or a new focused profile store
  - profile signals and actions
  - integration with the authoritative transition coordinator
- `src/settings/WorkspaceSwitcher.tsx`
  - searchable recent-workspace UI
- `src/settings/WorkspaceProfileEditor.tsx`
  - rename and icon controls when separation is useful
- `src/settings/WelcomeDialog.tsx`
  - first-use and recovery launcher states
- `src/settings/SettingsPanel.tsx`
  - profile management section
- `src/app/App.tsx`
  - workspace header button, command-palette entries, and transition blocking UI
- `src/workspace/tauriBridge.ts`
  - optional `suggestedName` on picker result
- Desktop and Android bridge implementations
  - provide safe display metadata where available
- Save and transition coordinator modules
  - session-wide flush, drain, authority checks, and rollback

The UI must not own filesystem transition sequencing.

## 22. Platform behavior

### 22.1 Desktop

- Persist the native folder path in application-local global configuration.
- Display the path as the secondary label.
- Derive a default name from the path basename.
- Normalize only for duplicate comparison using platform-appropriate semantics.
- A moved or deleted folder remains listed and can be relinked.

### 22.2 Android

- Persist the SAF content URI token only in application-local global configuration.
- Continue using `/workspace` as the synthetic runtime root.
- Never identify a profile by `/workspace`.
- Never show, search, or log the raw token.
- The native picker should return a safe folder display name when practical. Otherwise, use `Workspace` and let the user rename it.
- Switching must seed the path-to-URI mapping for the selected token before target file access.
- Failed target activation must restore the outgoing token mapping before the outgoing editor becomes active again.

## 23. Error model and recovery

Use typed internal errors and concise user copy.

### `save_failed`

Outgoing note or settings data could not be saved.

Actions: Retry, Cancel switch, optional confirmed Switch without saving.

### `permission_missing`

The application no longer has access to the selected Android folder.

Actions: Grant access again, Open another workspace, Forget profile.

### `workspace_missing`

The Desktop folder no longer exists or cannot be read.

Actions: Retry, Relink folder, Open another workspace, Forget profile.

### `settings_corrupt`

Workspace settings are malformed, but the folder itself is accessible.

Behavior should follow the existing recoverable workspace-settings policy. The workspace may open with safe defaults while avoiding an automatic destructive rewrite.

### `global_config_corrupt`

The global catalog cannot be decoded safely.

Actions: Open a folder without overwriting the file, inspect or back up configuration, explicit repair or rewrite.

### `global_config_save_failed`

The active workspace opened, but profile metadata could not be persisted.

Actions: Retry. Do not imply that the active selection will survive restart until persistence succeeds.

### `transition_superseded`

Internal control-flow outcome. No user-facing error.

## 24. Privacy and security requirements

1. The feature performs no network requests.
2. The profile catalog contains no note body, title index, tag index, attachment content, or extracted content.
3. Desktop absolute paths and Android URI tokens remain in the existing application-local configuration location.
4. Android URI tokens are excluded from UI text, search, clipboard actions, analytics, and logs.
5. User-facing error messages do not include raw tokens or unrestricted exception dumps.
6. Only user-selected folders may become profiles.
7. Profile icon selection cannot read arbitrary files.
8. Forgetting a profile does not delete user content.
9. Transition authority prevents asynchronous work from writing through a newly selected Android grant.
10. No telemetry is added to measure usage or success.

## 25. Performance requirements

1. Opening the switcher performs no filesystem access and no workspace scan.
2. Search and ordering operate on the in-memory profile view.
3. The list remains responsive with at least 100 profiles.
4. Workspace activation does not recursively index the target before the initial editor becomes usable.
5. Load only the workspace settings and initial tab state required by existing startup behavior before first interaction.
6. Global configuration is read once during normal startup.
7. Coalesce logically related profile mutations into one serialized write where practical.
8. Do not add a content cache or background profile health checker.

No unmeasured millisecond promise is introduced. Performance tests should assert bounded work and absence of unnecessary filesystem calls.

## 26. Accessibility requirements

- The workspace button, switcher, profile action menus, icon choices, and confirmation dialogs are fully keyboard accessible.
- Active, selected, loading, unavailable, and error states are conveyed without relying only on color.
- Icon choices have text labels.
- Search results expose name, status, and locator label in an understandable accessible name or description.
- Focus is trapped appropriately in modal surfaces and restored to the opener on close.
- Transition progress uses an announced live region without repeatedly interrupting the user.
- Destructive actions identify the affected profile by name in the confirmation dialog.

## 27. Functional requirements

### WSP-FR-001

The application shall persist zero or more workspace profiles in global configuration.

### WSP-FR-002

The application shall maintain zero or one active profile ID.

### WSP-FR-003

The application shall display profiles ordered by successful recent use.

### WSP-FR-004

The application shall add a selected folder as a profile or activate its existing profile when it is a duplicate.

### WSP-FR-005

The application shall let the user rename a profile and choose a fixed icon.

### WSP-FR-006

The application shall switch profiles through one authoritative transition coordinator.

### WSP-FR-007

The application shall flush or explicitly discard outgoing unsaved work before switching.

### WSP-FR-008

The application shall prevent stale saves, reads, tab restorations, settings writes, and Android mappings from an outgoing session from mutating the incoming session.

### WSP-FR-009

The application shall update recency only after successful activation.

### WSP-FR-010

The application shall retain unavailable profiles and offer recovery actions.

### WSP-FR-011

The application shall relink a profile without changing its stable ID or display metadata.

### WSP-FR-012

The application shall forget a profile without altering workspace files.

### WSP-FR-013

The application shall migrate the legacy last-workspace pointer non-destructively.

### WSP-FR-014

The application shall preserve unknown configuration fields during unrelated writes.

### WSP-FR-015

The application shall never display or log Android workspace tokens.

### WSP-FR-016

The application shall expose profile switching from the header, command palette, settings, and startup recovery launcher.

## 28. Acceptance criteria

### AC-01: Legacy migration

Given a valid legacy configuration with one last workspace, when the application starts, then it presents that workspace as one profile, opens it through the normal transition coordinator, and persists v2 only after successful access.

### AC-02: Multiple Desktop profiles

Given two distinct Desktop folders, when both are added, then both appear in the switcher with stable IDs and can be activated without reopening the folder picker.

### AC-03: Android synthetic path isolation

Given two Android folders whose runtime path is `/workspace` but whose tokens differ, when the user switches between them, then they remain distinct profiles and each file operation resolves through the selected profile's token.

### AC-04: Duplicate add

Given an existing profile, when the same locator is selected again, then no duplicate profile is created and the existing profile is activated.

### AC-05: Successful dirty-note switch

Given a modified note with a pending delayed save in workspace A, when the user activates B, then A's save completes before B becomes editable and the saved content is present in A after switching back.

### AC-06: Save failure

Given an outgoing save that fails, when the user requests a switch, then the switch is cancelled by default, A remains active, and the UI offers retry and an explicitly confirmed discard fallback.

### AC-07: Latest transition wins

Given rapid requests A to B and then A to C, when asynchronous access resolves out of order, then only the newest authoritative request may publish workspace state, recency, tabs, settings, or Android mappings.

### AC-08: Stale read isolation

Given a file read started in A, when B becomes active before the read completes, then the completion cannot open, replace, or modify a tab in B.

### AC-09: Independent workspace state

Given different tab and settings state in A and B, when the user switches between them, then each workspace restores only its own persisted state.

### AC-10: Unavailable profile recovery

Given a missing Desktop folder or invalid Android access token, when activation fails, then the profile remains listed, recency is unchanged, and Retry plus Relink or Grant access are available.

### AC-11: Safe relink

Given an unavailable profile, when the user relinks it to an accessible folder, then the stable profile ID, name, and icon remain unchanged and the locator changes only after validation succeeds.

### AC-12: Forget does not delete files

Given any profile, when it is forgotten, then only catalog metadata is removed and all workspace files remain byte-for-byte untouched by the forget operation.

### AC-13: Active-profile forget

Given an active profile with no save errors, when it is forgotten, then the application safely enters the no-workspace launcher and clears only workspace-scoped in-memory state.

### AC-14: Non-destructive config handling

Given unknown top-level fields, unknown profile fields, or an unrecognized profile record, when another profile is renamed, then unrelated persisted data remains present.

### AC-15: Global-config write failure

Given a successful workspace activation and a failed global-config write, then the target remains active in memory, a retryable warning appears, and no stale configuration snapshot overwrites newer profile edits.

### AC-16: Current-profile selection

Given A is active, when A is selected in the switcher, then the switcher closes without filesystem calls, session increment, or recency update.

### AC-17: Accessibility

Given keyboard-only or screen-reader use, when the user opens and operates the switcher, then all selection, activation, editing, recovery, and destructive actions are available with meaningful state announcements.

### AC-18: Offline boundary

Given any profile action, when it completes, then no network request, account operation, or telemetry event has occurred.

## 29. Test plan

### 29.1 Unit tests

Global configuration:

- decode valid v2 document;
- reject unsafe scalar types without destructive rewrite;
- preserve unknown top-level and profile fields;
- retain unrecognized profile records;
- migrate legacy path and token;
- defer migration persistence until successful activation;
- maintain one-release legacy mirror;
- serialize concurrent theme and profile updates from latest state.

Profile helpers:

- stable sort by recency, name, and ID;
- name trimming and length validation;
- fixed icon validation and unknown fallback;
- Desktop locator comparison under platform semantics;
- Android token-based duplicate detection;
- duplicate IDs and locators in malformed input;
- default name generation.

Transition coordinator:

- session-wide delayed-save flush;
- in-flight-save drain;
- settings-write drain;
- save failure abort;
- explicit discard flow;
- generation authority after every asynchronous stage;
- outgoing-state rollback after target failure;
- Android mapping rollback;
- global-config write retry queue;
- selecting current profile as a no-op.

### 29.2 Component tests

Workspace switcher:

- recent ordering;
- search behavior;
- keyboard navigation;
- focus restoration;
- current checkmark;
- loading and unavailable states;
- token absence from rendered text;
- add and manage actions;
- accessibility labels and status announcements.

Profile management:

- rename validation;
- icon selection;
- relink confirmation;
- duplicate relink rejection;
- inactive forget;
- active forget;
- destructive fallback confirmation.

Startup launcher:

- no profiles;
- profiles with no active ID;
- unavailable active profile;
- retry and alternate activation;
- corrupt global-config warning.

### 29.3 Integration tests

- Add A and B, customize both, restart, and verify catalog restoration.
- Switch A to B and B to A with independent settings and tab state.
- Switch while note autosave is delayed.
- Switch while a note save is in flight.
- Switch while a file read is in flight.
- Switch while workspace settings persistence is pending.
- Rapidly request multiple targets and resolve promises out of order.
- Fail target access and verify the outgoing workspace remains authoritative.
- Fail global-config persistence after successful activation and retry.
- Relink an unavailable profile.
- Forget the active profile and return to launcher.
- Verify no profile operation recursively scans all profiles.

### 29.4 Platform contract tests

Desktop:

- picker returns path and suggested basename;
- path duplicate comparison follows platform semantics;
- missing folder recovery;
- path subtitle elision does not alter the underlying path.

Android:

- two tokens remain distinct despite `/workspace`;
- restore access seeds the correct token mapping;
- failed activation restores the prior token mapping;
- persisted token never appears in UI or logs;
- process restart can restore either previously selected profile;
- relink updates only the selected profile.

### 29.5 Manual verification

At minimum, perform release verification on:

- one supported Desktop environment;
- one physical Android device using two different SAF folders;
- startup after process termination;
- revoked or unavailable folder access;
- rapid switching under artificial filesystem delay;
- keyboard-only operation;
- screen-reader announcements for switcher and errors.

## 30. Rollout and documentation

1. Ship as an additive configuration migration.
2. Keep the legacy active-workspace mirror for one release cycle.
3. Do not hide the feature behind a network or analytics-dependent flag.
4. Update:
   - `README.md` feature list and usage;
   - `docs/ARCHITECTURE.md` global storage model and transition ownership;
   - `ROADMAP.md` status and dependency notes;
   - user-facing change log;
   - platform permission documentation when Android recovery copy changes.
5. Because Leotheca has no telemetry, release confidence comes from automated tests, manual platform verification, and user-reported issues rather than usage metrics.

## 31. Definition of done

The feature is complete when:

- all functional requirements are implemented;
- all acceptance criteria pass;
- N-001, N-002, and N-003 transition guarantees are satisfied;
- legacy migration is covered by automated tests;
- Android supports at least two retained, switchable SAF workspaces;
- Desktop supports retained switching without reopening the picker;
- no stale async operation can cross workspace sessions;
- no profile management operation modifies note content or deletes files;
- no raw Android token appears in UI or logs;
- architecture and user documentation are updated;
- the complete test suite and platform builds pass.

## 32. Deferred extensions

The following ideas may build on the profile catalog later but are outside this specification:

- profile-specific themes or appearance presets;
- pinned profiles or manual ordering;
- profile groups;
- per-profile startup behavior;
- opening a profile in a new window;
- cross-workspace search;
- optional Android permission revocation on forget;
- profile export or synchronization without note content.

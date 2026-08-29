# Leotheca Codebase Audit

Audit date: 2026-08-29 UTC  
Audited repository: `LeonardSchwier/leotheca`  
Audited branch: `main`  
Audited commit: `1f2fed5b5ec37b3b39bacf43532c2f45e46f8ece` (`Extend local canvas cards and links`)  
Audited tree: `66d794cc9ec0139682a816ae1e40263b875a4039`

## 1. Executive Summary

Leotheca has a coherent local-first architecture, unusually strong repository documentation, and a broad fast test suite. The current pinned commit passed its hosted frontend, Rust, Android-build, and release-build jobs. The code is generally understandable and can be corrected incrementally. It is not yet safe to treat those green builds as evidence that persistence and Android workspace switching are reliable: the highest-risk failures sit at lifecycle and platform boundaries that the current tests do not exercise.

The most important risks are:

1. **Android gives every selected folder the same `/workspace` identity.** Switching between two SAF folders can leave the old tree, link index, bookmarks, search, and pending writes attached to the new folder. A stale action can consequently read, overwrite, rename, or delete a same-named file in the wrong workspace.
2. **Startup can overwrite workspace settings before loading them.** Publishing `workspacePath` synchronously triggers the tab-persistence effect while default settings and empty tabs are still active.
3. **Autosave is neither ordered nor lifecycle-safe.** Overlapping writes can complete out of order, failed writes are unhandled, and closing or switching can lose a final edit or direct a delayed Android write into another folder.
4. **The search memory guard does not enforce its documented 8 MiB bound.** It flushes only after exceeding the limit, admits a single file up to 50 MiB, treats unknown sizes as zero, and sends non-image binary files through Android string serialization. This is the same path that recently produced a confirmed on-device 288 MiB allocation failure.
5. **Native mutation APIs lack containment and no-overwrite semantics.** User-controlled names and configured relative folders can escape the workspace, while list-then-write and list-then-rename checks remain vulnerable to external synchronization races.
6. **Editable YAML and canvas data are lossy.** A small frontmatter parser changes types, ordering, comments, and comma-containing values; canvas edits discard unknown and malformed records and do not resolve relative file references.
7. **Release confidence is overstated by the enforced controls.** The current CI does not run the documented lint command, native Android tests, or dependency checks; publishing is independent of CI; `main` has no required checks; and multiple version sources disagree.

The repository appears safe to modify incrementally if work is staged around explicit workspace identity and an ordered persistence coordinator first. Do not begin by changing UI components independently: the cross-platform file contract and lifecycle ordering are prerequisites for several downstream fixes.

Systemic themes are implicit identity, check-then-act filesystem operations, static TypeScript types being trusted as runtime schemas, asynchronous effects without ownership generations, and documentation or tests that validate the happy path while missing native boundary behavior.

Important limitations: there was no repository checkout in the provided workspace, and the instruction initially allowed creation of only this report. The audit therefore pinned and read the complete relevant remote tree instead of cloning it. Local working-tree status and local command exit codes were unavailable. Baseline evidence comes from the successful workflow runs for the exact audited commit. No physical Android device, desktop windowing environment, browser-extension host, signing setup, or real synchronized vault was available. Generated schemas, generated dependency manifests, binary assets, and third-party source were excluded except where their integration affects repository behavior.

**Recommended first implementation milestone:** make settings hydration non-persistent until complete, serialize settings writes, and add the startup race regression test described in F-002. This is a comparatively contained change that immediately prevents automatic configuration loss and establishes the write-ordering pattern required by later persistence work.

## 2. Repository Snapshot

| Item | Snapshot |
|---|---|
| Branch | `main`, the default branch |
| Commit | `1f2fed5b5ec37b3b39bacf43532c2f45e46f8ece` |
| Commit date | 2026-08-29 08:54:14 UTC |
| Working tree before audit | Not observable: `/workspace/scratch/2d1c264b5373` was not a Git worktree (`git status` exited 128). No checkout was created. |
| Remote protection | `main` reported unprotected; no required status checks and no repository rulesets were present at review time |
| Relevant source reviewed | 178 text files, 20,252 lines, 874,215 characters; 280 blobs were inventoried in the complete recursive tree |
| Primary language/UI | TypeScript, Preact 10, Preact Signals, CodeMirror 6, Vite 6, Vitest 4, ESLint 10 |
| Desktop shell | Tauri 2 and Rust 2021 edition; native filesystem commands in `src-tauri/src/commands.rs` |
| Mobile shell | Capacitor 7, Java, Android SAF custom plugin; API 29 minimum, API 35 compile/target |
| Package managers | npm lockfile v3; Cargo lockfile; Gradle wrapper 8.11.1 |
| CI runtimes | Node 22, JDK 21, stable Rust resolving to `rustc 1.98.0` in the audited run |
| Other deliverables | Standalone WebExtension clipper, Linux AppImage/Flatpak, Android APK, macOS DMG, Windows MSI, draft F-Droid metadata |
| Database/migrations | None. User data is plain filesystem content and JSON metadata. |

Main entry points are `src/main.tsx` and `src/app/App.tsx` for the shared UI; `src/workspace/tauriBridge.ts` for platform dispatch; `src-tauri/src/lib.rs` and `src-tauri/src/commands.rs` for desktop; `android/app/src/main/java/com/leonardschwier/leotheca/MainActivity.java` and `FolderAccessPlugin.java` for Android; `extensions/web-clipper/manifest.json` plus its background/content/popup scripts for the extension; and `.github/workflows/ci.yml` / `release.yml` for validation and distribution.

Repository-provided commands:

- Frontend tests: `npm test`
- Lint: `npm run lint`
- Type-check and web build: `npm run build`
- Explicit type-check used by CI: `npx tsc -p tsconfig.json --noEmit`
- Desktop check/tests: `cd src-tauri && cargo check`, `cd src-tauri && cargo test`
- Desktop application: `npm run tauri dev`; distributable build: `npx tauri build`
- Android sync/build: `npx cap sync android`, then `cd android && ./gradlew assembleDebug`
- No repository migration, dependency-audit, native Android test, or end-to-end command is defined.

## 3. System Map

| Component | Responsibility | Entry points | Depends on | Data owned | Risk notes |
|---|---|---|---|---|---|
| Shared application shell | Startup, panels, view routing, command palette, autosave, deep links | `src/main.tsx`, `src/app/App.tsx` | Settings, workspace stores, editor, links, platform bridge | In-memory UI state and save timers | Cross-cutting lifecycle work is concentrated in one component |
| Workspace and tabs | File tree, selection, create/rename/delete/search, open tabs | `src/workspace/fileTreeStore.ts`, `FileTree.tsx`, `Sidebar.tsx`, `store.ts` | Platform bridge, settings, link index | Tree/search/tab signals | Module-level state lacks an explicit workspace generation |
| Platform bridge | One frontend filesystem contract dispatched to desktop or Android | `src/workspace/tauriBridge.ts`, `tauriBridgeImpl.ts`, `capacitorBridgeImpl.ts` | Tauri invoke or Capacitor plugin | Android path-to-URI cache; app-data pointer | Contract omits containment, atomicity, collision mode, cancellation |
| Desktop native shell | Real filesystem traversal and mutation, dialog, deep link, clipboard | `src-tauri/src/lib.rs`, `commands.rs` | Rust standard filesystem, Tauri plugins | OS files selected by path | Commands accept arbitrary paths and writes are non-atomic |
| Android native shell | SAF folder grant and document operations | `MainActivity.java`, `FolderAccessPlugin.java` | `ContentResolver`, `DocumentFile`, Capacitor | Persisted SAF grant; documents under selected tree | Opaque URI identity and provider semantics differ from desktop |
| Editor and preview | CodeMirror editing, attachments, rendering, properties | `MarkdownEditor.tsx`, `MarkdownPreview.tsx`, `FrontmatterPropertiesPanel.tsx` | File bridge, frontmatter/link helpers, DOMPurify, marked | Note content; attachment files | Autosave and frontmatter round-trip can lose data |
| Links, tags, graph | Recursive metadata index, aliases, backlinks, tags, graph layout | `src/linking/store.ts`, `src/tags/`, `src/graph/` | Native walks/reads, cache file, settings | `.leotheca/link-index-cache.json`; in-memory maps | Cache trust and synchronous quadratic layout are scaling risks |
| Canvas | JSON-backed spatial cards, edges, local file links | `src/canvas/CanvasView.tsx` | Autosave and file-open callback | `.canvas` JSON files | Parser and serializer are lossy; file reference semantics incomplete |
| Workspace settings/bookmarks | Global pointer, per-workspace preferences, restore, shortcuts | `src/settings/`, `src/bookmarks/` | File bridge and signals | App config; `.leotheca/settings.json`; bookmarks JSON | Runtime JSON is mostly unchecked and writes are unordered |
| Web clipper | Converts selection to Markdown and invokes browser download | `extensions/web-clipper/manifest.json`, `background.js`, `content.js`, `popup.js` | WebExtension APIs | Downloaded `.md` file only | Browser compatibility is not integration-tested |
| Build and release | Tests/builds targets and publishes development/version artifacts | `.github/workflows/ci.yml`, `release.yml`, packaging directories | npm, Cargo, Gradle, platform builders | Build artifacts and release metadata | Release can publish without the CI workflow succeeding |

### Critical flows reviewed

1. **Startup and workspace selection:** global config read -> SAF access restoration/list check -> workspace signal publication -> workspace settings read -> tab restoration -> link/bookmark/tree background loads.
2. **Edit and persistence:** CodeMirror or canvas change -> tab signal update -> 400 ms timer -> native text write -> tab marked saved; rename and keyboard-save flush paths were traced separately.
3. **Create/rename/delete:** UI name prompt or configured relative directory -> frontend preflight list -> synthetic path construction -> desktop filesystem or Android URI mutation -> tree/link/tab refresh.
4. **Android folder switching:** folder picker returns opaque token -> constant synthetic root -> URI cache reseed -> module-level state and effects react to root path.
5. **Search:** native recursive enumeration -> query parser -> filename/path/tag match -> lazily batched content reads -> concurrent match publication.
6. **Link and graph:** recursive Markdown walk -> persisted metadata cache -> bounded note reads -> link/tag maps -> synchronous force layout and canvas draw.
7. **Frontmatter and canvas edit:** disk text -> minimal parser/filter -> UI edit -> full serializer -> normal autosave.
8. **Build and distribution:** push/PR -> separate CI workflow; push to `main` or `v*` tag -> independent platform builds -> development release or draft version release.

Authentication, accounts, remote APIs, queues, and server databases do not exist by design. Security boundaries are the user-selected workspace, Android's SAF grant, Tauri command surface, deep-link input, browser content, and locally persisted configuration.

## 4. Review Coverage

| Area | Key paths inspected | Review depth | Validation performed | Coverage limitations |
|---|---|---|---|---|
| Governing contracts/docs | `AGENTS.md`, `CONSTITUTION.md`, `README.md`, `CONTRIBUTING.md`, `documentation/ARCHITECTURE.md`, `PHILOSOPHY.md`, `ROADMAP.md`, `CHANGELOG.md`, packaging READMEs | Full | Compared enforced tests, code, releases, and documented claims | Historical intent was not inferred beyond current checked-in text |
| Frontend application | All 103 relevant files under `src/` | Full static trace of state, persistence, workspace, search, editor, canvas, graph, settings; tests compared to implementation | Current exact-commit frontend CI logs reviewed: 45 files and 582 tests passed; type-check/build passed | No interactive DOM/webview run or local coverage instrumentation |
| Desktop native | `src-tauri/` source, config, capabilities, Cargo manifests/lock | Full for repository-owned code | Current `cargo check` and 26-test `cargo test` runs passed | No live desktop filesystem, interruption, disk-full, or packaging install test |
| Android native | All repository-owned Java, manifests, Gradle/config files | Full static review of SAF plugin and bridge | Current sync and debug APK assembly passed | No JVM unit tests, emulator tests, provider matrix, lifecycle test, or physical device |
| Data formats | Settings, bookmarks, link cache, Markdown/frontmatter, canvas, trash behavior | Full contract comparison and deterministic traces | Existing related Vitest/Rust tests inspected | No corpus of externally authored YAML/canvas files or real synchronized-vault run |
| Extension | All nine extension files | Full static review; core tests inspected | Core conversion tests included in frontend suite | No unpacked extension run in supported browsers |
| CI/release/packaging | Both workflows, Flatpak, F-Droid, Homebrew docs/config, manifests | Full static review plus current run/release metadata | All current release build jobs reported success | No signature/notarization, install/upgrade, store submission, or rollback exercise |
| Dependencies/supply chain | Direct manifests plus complete npm and Cargo lockfiles | Manifest/config integration review | Lockfiles present and npm uses `npm ci` | No configured audit/SCA result; third-party source and generated manifests excluded |
| Generated/vendor/binary | Generated Tauri schemas, generated Flatpak source lists, wrapper JAR, images/fonts/icons/screenshots | Inventory/integration only | Generation and use sites checked where relevant | Contents not source-audited, per scope rule |

The review covered the complete relevant text tree but was not runtime-exhaustive. Native UI, OS integration, provider-specific SAF behavior, and failure injection remain the material unexecuted areas.

## 5. Baseline Validation Results

The exact commit's CI run `33244229131` and release run `33244229118` both concluded successfully. A successful shell step is recorded below as exit status 0 by the runner. No command was re-run locally because there was no checkout and creating one would have violated the original one-file write constraint.

| Command | Result | Interpretation |
|---|---|---|
| `npm ci` | Success, exit 0 in frontend and Android jobs | Lockfile installs reproducibly on Node 22 in the hosted runner |
| `npx tsc -p tsconfig.json --noEmit` | Success, exit 0 | Static TypeScript contracts compile at the pinned commit |
| `npm test` | Success, exit 0; 45 test files, 582 tests passed | Existing Vitest suite is green; it does not cover the boundary races in this report |
| `npm run build` | Success, exit 0; Vite 6.4.3 build completed | Type-check and production frontend bundle succeed |
| `cd src-tauri && cargo check` | Success, exit 0 | Rust desktop code checks with stable Rust (`rustc 1.98.0` in this run) |
| `cd src-tauri && cargo test` | Success, exit 0; 26 tests passed | Existing native desktop tests are green |
| `npx vite build` | Success, exit 0 in Android job | Shared web assets build for Capacitor |
| `npx cap sync android` | Success, exit 0 | Capacitor project generation/synchronization succeeds |
| `cd android && ./gradlew assembleDebug` | Success, exit 0 with JDK 21 | Debug APK compiles; this does not execute Java unit or instrumentation tests |
| Release platform builds | Success: AppImage, Flatpak, debug unsigned APK, universal DMG, x64 MSI | Buildability is confirmed, not installation, signing, update, or runtime correctness |
| `npm run lint` | Could not run locally; absent from current CI | The repository-documented lint gate remains unverified for the pinned commit |
| `cd src-tauri && cargo clippy` | Could not run locally; not configured in CI | No current lint result for native Rust |
| `cd android && ./gradlew testDebugUnitTest connectedDebugAndroidTest` | Could not run; not configured and no emulator/device | Native Android behavior is almost entirely untested; the checked-in instrumentation template contains a known wrong package assertion |
| Dependency/security audit | Unavailable: no audit workflow or repository command | Dependency vulnerability state is unverified; no vulnerability is inferred from absence alone |
| Migration validation | Not applicable | Repository has no database or migration system |

Baseline failures were not observed in the commands that ran. The missing checks are enforcement and coverage gaps, not proof that their targets currently fail, except for the deterministic wrong-package Android instrumentation assertion described in F-014.

## 6. Findings Summary

| ID | Priority | Confidence | Category | Finding | Affected area | Effort | Depends on |
|---|---|---|---|---|---|---|---|
| F-001 | P1 | Medium | Data/Correctness | Android folder switches reuse one workspace identity and retain stale state/writes | Android bridge, settings, tree, links, bookmarks, autosave | L | None |
| F-002 | P1 | Medium | Data | Startup and concurrent settings writes can overwrite newer persisted state | Settings lifecycle and both native writers | M | F-001 for final workspace-keying |
| F-003 | P1 | Medium | Data/Correctness | Autosave permits out-of-order, failed, and post-lifecycle writes | App autosave, tabs, native writers | L | F-001 |
| F-004 | P2 | Medium | Security/Data | File mutation contract permits workspace escape and check-then-act overwrites | Names, configured folders, bridge/native commands | L | F-001 |
| F-005 | P1 | Medium | Performance/Correctness | Search's 8 MiB memory bound is not enforced and binary data is serialized as text | Search batching, Android plugin, desktop bridge | M | None |
| F-006 | P2 | Medium | Correctness | Older searches can replace or re-enable state for newer/cleared searches | Search store and sidebar | M | F-001 |
| F-007 | P2 | Medium | Correctness/Data | Android URI cache retains stale descendants after directory mutations | Capacitor bridge | M | F-001 |
| F-008 | P2 | Medium | Data/Correctness | Persisted settings and bookmarks trust unchecked JSON as typed runtime data | Settings, bookmarks, consumers | M | F-002 |
| F-009 | P2 | Medium | Data | Properties editing rewrites unrelated YAML semantics and layout | Frontmatter parser/panel | L | F-003 |
| F-010 | P2 | Medium | Data/Correctness | Canvas editing is lossy and local file-reference resolution is incomplete | Canvas and file-open dispatch | M | F-003, F-004 |
| F-011 | P2 | Medium | Correctness | Session restore opens canvases as text and can select a missing tab | Settings restore and tab store | S | F-002 |
| F-012 | P2 | Medium | Correctness/Architecture | Link metadata cache can be stale and one unreadable note aborts the rebuild | Link index/cache, tags, backlinks, graph | M | F-001, F-003 |
| F-013 | P2 | Medium | Performance | Graph layout performs quadratic work for hundreds of iterations on the UI thread | Graph layout/view | M | None |
| F-014 | P2 | High | Testing/Operations | Required checks do not cover lint, Android behavior, or release eligibility | CI, release workflow, branch policy, Android tests | M | Safety net for all findings |
| F-015 | P2 | High | Operations | Version and release metadata disagree across distributables and update channels | Manifests, workflow, changelog, docs | M | F-014 |

Counts: **P0: 0, P1: 4, P2: 11, P3: 0.** Confidence describes evidence strength independently of priority. Static race findings remain Medium because the relevant native/lifecycle scenarios were not executable in this environment.

## 7. Detailed Findings

### F-001 - Android workspace switches reuse one identity and retain stale state and writes

- **Priority:** P1
- **Confidence:** Medium
- **Category:** Data/Correctness
- **Affected components:** Android platform bridge, settings store, file tree/search store, link index, bookmarks, App autosave
- **Effort:** L
- **Dependencies:** None

#### Evidence

- `src/workspace/capacitorBridgeImpl.ts:105-110`, constant `WORKSPACE_ROOT` and `isWorkspacePath`: every SAF folder is represented as `/workspace`.
- `src/workspace/capacitorBridgeImpl.ts:173-188`, `pickWorkspaceFolder` and `restoreWorkspaceAccess`: the opaque token changes and the URI map is reseeded, but the returned logical path is always `/workspace`.
- `src/settings/store.ts:144-165`, `setWorkspacePath`: publishes the path, not a unique workspace/session identity.
- `src/workspace/FileTree.tsx:20-26`, `FileTree`: reload depends only on `rootPath`; cached `dirChildren` remains addressable under `/workspace`.
- `src/app/App.tsx:186-192`: link-index and bookmark effects depend on the root path only.
- `src/linking/store.ts:95-103` and `117-127`: module caches and loaded-root tracking are keyed by path.
- `src/settings/store.test.ts:58-76` and `src/workspace/Sidebar.test.tsx:116-130`: switch tests use distinct `/workspaceA` and `/workspaceB` roots, so they cannot expose equal-path token changes.

#### Observed behavior

Selecting Android folder B after folder A changes the root URI token without changing the reactive path. Effects keyed to the path need not rerun, and module-level maps still contain A's `/workspace/...` entries. A stale tree row or pending operation then resolves the same synthetic path against B's new root URI. If B contains the same relative name, the operation targets B; if not, it fails while stale A data remains visible.

#### Expected behavior

A folder grant is a workspace identity, even when its display/synthetic path is unchanged. `CONSTITUTION.md:89-94` makes the selected folder the source of truth and explicitly warns about external synchronization and stale state. Existing switch cleanup in `src/settings/store.ts:145-158` also proves that outgoing state must not leak into the incoming workspace.

#### Impact

Any Android user who switches folders during one process lifetime can see stale notes, tags, bookmarks, or search results. Clicking, renaming, deleting, or allowing a pending save on a same-named relative path can mutate the wrong folder. The consequence ranges from confusing UI to cross-workspace data loss.

#### Trigger or reproduction

1. **Preconditions:** Android build; folders A and B are both granted; each contains `/note.md` with different content. Open A and edit `note.md` so a save is pending.
2. **Input/event:** Select folder B before the timer and background loads settle.
3. **Execution path:** `pickWorkspaceFolder` returns `{path: "/workspace", token: B}` -> `setWorkspacePath` publishes the same path -> path-keyed effects/caches do not acquire a new identity -> stale `/workspace/note.md` action resolves via B's URI root.
4. **Actual result:** A's UI state remains possible and the delayed/read mutation can target B's `note.md`.
5. **Expected result:** all A-owned tasks are cancelled or drained before B becomes active; B starts with empty workspace-scoped state and loads only B data.

This is a deterministic code-path trace; it was not executed on a device.

#### Root cause

The cross-platform abstraction treats a path string as both a display location and a stable workspace identity. That assumption is true enough for distinct desktop paths but false for Android's synthetic root. Async work and caches consequently have no ownership generation.

#### Implementation guidance

1. Introduce a `WorkspaceSession` value in `src/settings/store.ts` with at least `{rootPath, accessToken, generation}`; increment `generation` whenever a folder grant changes, including equal-path changes.
2. Keep `/workspace` as Android's path namespace, but pass or expose the session identity separately. Do not put opaque `content://` tokens in user-visible paths or logs.
3. Add one workspace-transition coordinator. In order: stop accepting outgoing edits, await or explicitly cancel saves per F-003, invalidate async request generations, clear tabs/tree/search/selection/link/bookmark state and Android URI descendants, restore the new grant, then publish the new session and load its settings/data.
4. Update `App.tsx`, `FileTree.tsx`, `Sidebar.tsx`, `linking/store.ts`, `bookmarks/store.ts`, and any memo/cache keyed only by root to depend on or key by `generation` plus path.
5. Add explicit `resetForWorkspaceChange()` functions to stores rather than mutating their internal signals from the settings module. Ensure reset clears `dirChildren`, `expandedDirs`, selections, context menu, query/results/progress, link maps/cache ownership, bookmarks, and in-flight request authority.
6. Preserve desktop paths, on-disk formats, and the user-visible `/workspace` abstraction. No data migration is required.
7. Do not publish the new session until grant restoration and a root list succeed. On failure, leave no active workspace and show a recoverable folder-selection error.

#### Required tests

- Extend `src/settings/store.test.ts` with a unit/integration test that switches from token A to token B while both roots equal `/workspace`; assert session generation changes and reset occurs before new loads.
- Extend `src/workspace/Sidebar.test.tsx` and `FileTree.test.tsx` with real signals for two equal-path sessions; seed A children/search/selection, switch, and assert none render for B before B's load resolves.
- Extend `src/linking/store.test.ts` and bookmarks tests with two equal root paths but different session IDs; resolve A's delayed read after B starts and assert B remains authoritative.
- Add `src/workspace/capacitorBridgeImpl.test.ts` coverage for two tokens and same relative file name; assert all operations after the switch use B and never a cached A URI.
- Add an Android integration test using two temporary document-tree providers if feasible; otherwise document a mandatory emulator/manual two-folder scenario.

At least the same-root/different-token store test must fail before the fix and pass after it.

#### Acceptance criteria

- [ ] Changing only the Android SAF token creates a new workspace session.
- [ ] No outgoing tree, tab, bookmark, tag, link, graph, or search state appears in the new session.
- [ ] A delayed outgoing read cannot publish into the new session.
- [ ] A delayed outgoing write is either completed against the old grant before transition or cancelled without targeting the new grant.
- [ ] Failed access restoration leaves the application with no active workspace and an actionable error.
- [ ] Desktop workspace selection behavior and existing persisted formats remain compatible.

#### Validation commands

1. `npm test -- src/settings/store.test.ts src/workspace/Sidebar.test.tsx src/workspace/FileTree.test.tsx src/linking/store.test.ts`
2. `npm test`
3. `npm run lint`
4. `npm run build`
5. `npx cap sync android`
6. `cd android && ./gradlew testDebugUnitTest assembleDebug`
7. Run the documented two-folder Android emulator/device scenario.

#### Risks and rollback

The principal risk is partially converting consumers, leaving a second implicit path key. Land session type, reset APIs, and consumers together. The change is reversible because it does not migrate files; rollback must occur only after draining/cancelling sessions created by the new code. Never log the SAF token.

#### Out of scope

Do not redesign Android storage, expose raw URIs to the UI, or add a sync service. Do not combine this with canvas/frontmatter format changes.

### F-002 - Startup and concurrent settings writes can overwrite newer persisted state

- **Priority:** P1
- **Confidence:** Medium
- **Category:** Data
- **Affected components:** Settings store, workspace settings persistence, Settings panel, desktop and Android text writers
- **Effort:** M
- **Dependencies:** F-001 for final workspace-keying

#### Evidence

- `src/settings/store.ts:77-85`, top-level tab-persistence `effect`: once `workspacePath` is non-null, it invokes `void updateWorkspaceSettings(...)` with current tabs.
- `src/settings/store.ts:116-135`, `initSettings`: line 131 publishes `workspacePath` before line 133 loads workspace settings and before tabs are restored.
- `src/settings/store.ts:144-165`, `setWorkspacePath`: contains a detailed `lastPersistedTabsKey` suppression for the analogous outgoing-tab write, while `initSettings` has no hydration guard.
- `src/settings/store.ts:177-181`, `updateWorkspaceSettings`: merges into current in-memory state and starts an unsequenced full-file write.
- `src/settings/SettingsPanel.tsx:123-138`, `239-257`, `328-345`, and `379-405`: multiple inputs fire unawaited settings updates as values change.
- `src-tauri/src/commands.rs:452-461`, `write_text_file`, and `android/.../FolderAccessPlugin.java:499-516`, `writeTextFile`: both replace the file with the supplied full contents; neither orders callers.
- Existing settings-store tests cover explicit folder switches but not `initSettings` with an existing settings file and a synchronously triggered effect.

#### Observed behavior

On remembered-workspace startup, the signal effect can run immediately after line 131 with default workspace settings and empty tabs. It starts a write before the existing settings read at line 133 completes. Separately, rapid Settings panel updates launch full-file writes concurrently; completion order, rather than input order, decides disk state.

#### Expected behavior

Loading existing settings must be read-only until hydration is complete. Persisted settings should reflect the most recent accepted in-memory revision. The comments at `src/settings/store.ts:50-53` promise restoration, and lines 145-154 explicitly protect outgoing last-open state from an internal clear.

#### Impact

A normal restart can reset preferences or last-open tabs. Rapid edits can revert a newer value after an older write finishes late. Because settings live inside the workspace, the corrupted value can synchronize to other devices.

#### Trigger or reproduction

1. **Preconditions:** saved `.leotheca/settings.json` contains non-default preferences and tabs; global config points to that workspace.
2. **Input/event:** launch the app.
3. **Execution path:** `initSettings` publishes path -> effect observes empty tabs/default state -> `updateWorkspaceSettings` starts write -> `loadWorkspaceSettings` reads concurrently.
4. **Actual result:** default/empty state may overwrite or race the real file.
5. **Expected result:** no settings write occurs until the existing file and tabs are fully hydrated.

For concurrent updates, inject writes A and B, resolve B before A, and observe A incorrectly becoming the disk value. Both traces are deterministic but were not executed here.

#### Root cause

Hydration and persistence share live signals without a lifecycle phase, and every caller performs a blind full-document write with no per-workspace serialization or revision check.

#### Implementation guidance

1. Add explicit `settingsPhase: "loading" | "ready" | "switching" | "error"` or an equivalent non-reactive persistence suspension.
2. In `initSettings`, restore access and read/validate workspace settings into local variables before publishing the active session. Populate settings and restore tabs inside one batch, seed the persisted-tab key from the hydrated state, then enter `ready`.
3. Replace direct `saveWorkspaceSettings` calls from `updateWorkspaceSettings` with one per-session queue. Coalesce pending patches, assign monotonically increasing revisions, and allow only one native write at a time. Resolve each caller only when its revision or a newer coalesced revision is durable.
4. Capture session identity and root at enqueue time; never reread global `workspacePath.value` after an `await`.
5. Surface a local persistent error state on failure and keep the in-memory revision dirty for retry. Do not silently report settings as saved.
6. After F-003 introduces atomic file replacement, use it for settings too. Until then, serialization still removes ordering loss but not crash truncation.
7. Keep unknown validated forward-compatible fields only if F-008 defines that contract; do not accidentally erase them during patch merging.

#### Required tests

- Extend `src/settings/store.test.ts` with deferred `loadWorkspaceSettings` and `saveWorkspaceSettings` mocks. Assert zero writes between path restoration and hydration completion, then exactly the hydrated tab state is eligible for later persistence.
- Add a regression test where two updates enqueue, the underlying first write is delayed, and the final disk payload is the newest merged revision.
- Test write rejection: error state becomes visible, later retry writes the latest value, and no earlier payload overwrites it.
- Test a session switch while a settings write is queued; assert the captured old root is used or the write is safely cancelled according to the transition contract.
- Extend `src/settings/SettingsPanel.test.tsx` to assert user input remains responsive while queued and the final payload contains all rapid changes.

The startup test and reversed-completion test must fail before the fix.

#### Acceptance criteria

- [ ] Startup performs no workspace-settings write before hydration completes.
- [ ] Rapid updates produce a durable document equivalent to the latest in-memory revision.
- [ ] No write changes target after a workspace switch.
- [ ] A failed write remains observable and retryable.
- [ ] Existing settings and last-open tabs survive restart unchanged when the user makes no change.

#### Validation commands

1. `npm test -- src/settings/store.test.ts src/settings/SettingsPanel.test.tsx src/settings/workspaceSettings.test.ts`
2. `npm test`
3. `npm run lint`
4. `npm run build`
5. `cd src-tauri && cargo test`
6. `cd android && ./gradlew testDebugUnitTest assembleDebug`

#### Risks and rollback

Queue coalescing can drop fields if patches are merged against stale bases; tests must combine changes to different fields. A hydration guard that is never released can suppress all persistence, so expose/test phase transitions. No migration is needed. Rollback is code-only, but avoid rolling back after introducing a new on-disk schema from F-008.

#### Out of scope

Do not redesign the Settings UI or move workspace settings outside the workspace.

### F-003 - Autosave permits out-of-order, failed, and post-lifecycle writes

- **Priority:** P1
- **Confidence:** Medium
- **Category:** Data/Correctness
- **Affected components:** `App` autosave, tab store, text/canvas editors, workspace transition, desktop and Android writers
- **Effort:** L
- **Dependencies:** F-001

#### Evidence

- `src/app/App.tsx:171-173` creates a component-local map of timeout handles keyed only by path.
- `src/app/App.tsx:283-300`, `handleChange`: the timer callback starts `writeTextFile(path, capturedContent)`, does not remove its map entry, has no rejection handler, and calls `markTabSaved(path)` without checking whether the saved revision is current.
- `src/app/App.tsx:310-321`, `flushPendingAutosave`: only knows timer presence, not an already-started write; a fired handle remains in the map and can cause an additional write.
- `src/workspace/store.ts:36-57`, tab close functions: closing does not flush, cancel, or confirm dirty state.
- `src-tauri/src/commands.rs:452-461` uses direct `fs::write`; Android `FolderAccessPlugin.java:499-516` opens the target in truncating `wt` mode. Neither provides atomic replace semantics.
- `src/app/App.test.tsx:125-175` and `205-230` cover debounce/explicit flush happy paths, not reversed completion, rejection, process lifecycle, in-flight rename, or workspace generation.

#### Observed behavior

Two writes for one path can overlap. If an older write completes last, it overwrites newer content and then marks the current tab clean. Rejections become unhandled promises. Closing a dirty tab or process within 400 ms loses the edit. Rename flushing can start a second write while the original is already in flight. On Android, F-001 allows an outgoing timer to resolve the same synthetic path under a newly selected grant.

#### Expected behavior

For each file and workspace session, durable revisions must be monotonic; only the content corresponding to the latest successfully persisted revision may mark the tab clean. Destructive lifecycle transitions must either await the current revision or make data-loss risk explicit. A failed write must remain visible and retryable.

#### Impact

Ordinary typing followed by save, rename, close, folder switch, app backgrounding, provider latency, or disk failure can silently lose content or overwrite newer content. Direct writes also permit a crash or full disk to leave a truncated note.

#### Trigger or reproduction

1. **Preconditions:** one open note; mock `writeTextFile` with deferred promises.
2. **Input/event:** edit to revision A; let its timer fire; edit to B; let B's timer fire; resolve B, then A.
3. **Execution path:** both closures write independently -> B persists -> A persists -> each invokes `markTabSaved(path)`.
4. **Actual result:** disk contains A while UI contains B and reports it saved.
5. **Expected result:** disk contains B and only B's acknowledged generation can clear dirty state.

Also test close/switch before the debounce and a rejected write. The trace was not executed in this audit.

#### Root cause

The timeout map is a debounce mechanism, not a persistence state machine. It tracks neither workspace ownership, content revision, in-flight work, failure, nor application lifecycle. Native write APIs expose truncating replacement rather than atomic durable semantics.

#### Implementation guidance

1. Extract a `SaveCoordinator` from `App.tsx`, keyed by `{workspaceGeneration, canonicalPath}`. Track `editedRevision`, `queuedRevision`, `inFlightRevision`, `savedRevision`, latest content, timer, and last error.
2. Permit one write per key at a time. If content changes during a write, immediately write only the latest queued revision after completion. Never start A and B concurrently.
3. Mark a tab saved only when `savedRevision === editedRevision` and the tab still belongs to the same session/path.
4. Remove timer handles when they fire. `flush(path)` must cancel the timer, await in-flight work, and continue until the latest revision is durable.
5. Rename/delete/workspace-switch/close paths must call coordinator APIs in dependency order. Rename flushes old path, blocks new edits during the atomic rename, then rekeys state. Delete cancels only after confirmation. Tab/app close must flush or show a clear unsaved-change choice; mobile background should trigger a best-effort immediate flush and retain dirty state if the OS interrupts it.
6. Add a visible per-tab or global save-error state with Retry. Never swallow the rejection.
7. Add `writeTextFileAtomic` at both platform implementations: desktop writes a same-directory temporary file, flushes/closes it, then replaces target; Android should use the safest provider-supported create/write/rename sequence and explicitly fall back with a reported reduced-guarantee error if atomic replacement is unavailable. Determine provider behavior with a focused emulator test rather than assuming POSIX semantics.
8. Reuse the coordinator for canvas content and settings where feasible, but keep independent data types and error messages.

#### Required tests

- Extend `src/app/App.test.tsx` with deferred writes resolved in reverse order; assert single-flight ordering, final B content, and no premature clean state.
- Add rejection/retry, fired-timer cleanup, close-before-debounce, switch-before-debounce, rename-during-in-flight, and canvas-save cases.
- Extend `src/workspace/store.test.ts` for dirty close behavior.
- Add Rust regression tests in `src-tauri/src/commands.rs` for atomic replace success and injected/feasible failure behavior; assert the previous complete file remains if replacement fails before commit.
- Add Android native tests around provider write/rename behavior and a manual background/kill scenario.

The reverse-completion and close-before-debounce tests must fail before the fix.

#### Acceptance criteria

- [ ] At most one native write is in flight per session/path.
- [ ] Durable revisions never move backward.
- [ ] A tab is clean only when its current revision is durable.
- [ ] Write failure is visible, retains dirty state, and can be retried.
- [ ] Rename, delete, close, and workspace switch cannot redirect or silently discard a pending save.
- [ ] Interrupted desktop replacement leaves either the old complete file or the new complete file, not a truncated intermediate.

#### Validation commands

1. `npm test -- src/app/App.test.tsx src/workspace/store.test.ts`
2. `cd src-tauri && cargo test`
3. `npm test`
4. `npm run lint`
5. `npm run build`
6. `cd android && ./gradlew testDebugUnitTest assembleDebug`
7. Execute documented desktop interruption and Android background/switch manual scenarios.

#### Risks and rollback

Incorrect queue shutdown can deadlock navigation or write after disposal. Bound UI waits, expose progress, and test rejected writes. Atomic replacement behavior varies by SAF provider; gate provider-specific implementation behind the same contract and retain the old writer as an explicit fallback only if failure is surfaced. File format is unchanged, so rollback is code-only.

#### Out of scope

Do not add cloud history, synchronization, or a proprietary journal format. Version history is separate product work.

### F-004 - File mutation contract permits workspace escape and check-then-act overwrites

- **Priority:** P2
- **Confidence:** Medium
- **Category:** Security/Data
- **Affected components:** Name prompt, file tree operations, attachment/template folders, platform bridge, desktop commands, Android SAF plugin
- **Effort:** L
- **Dependencies:** F-001

#### Evidence

- `src/workspace/NamePrompt.tsx:34-37` validates only `trim()` and non-empty input.
- `src/workspace/fileTreeStore.ts:167-176`, `219-229`, `271-293`, and `463-473`: create/folder/template/rename paths are made by string interpolation; collision handling is `listDir` followed by a separate blind write/rename.
- `src/editor/attachments.ts:55-62` strips outer slashes from `attachmentsFolder` but accepts `..`, separators, absolute/drive-like forms, and control/reserved names; lines 83-89 write the resulting path.
- `src/settings/SettingsPanel.tsx:239-257` and `328-345` persist attachment/template folder text without path validation.
- `src-tauri/src/commands.rs:427-493`: native read/write/create/rename commands accept arbitrary path strings. `write_text_file` creates parents and truncates existing targets; Unix `fs::rename` may replace a destination.
- `src-tauri/tauri.conf.json:22-27` enables asset protocol scope `**`, so the configured webview asset boundary is not a workspace containment control.
- `android/.../FolderAccessPlugin.java:460-496`, `resolveOrCreateTargetUri`: a write deliberately reuses an existing child with the requested name.
- Existing `fileTreeStore.test.ts:131-153` covers a collision already visible during the preflight list, not a target created between preflight and mutation.

#### Observed behavior

A note or folder name such as `../outside` escapes the selected desktop directory; configured `attachmentsFolder` or `templatesFolder` can do the same. Separators create unintended nested paths, and Windows-specific forms are not rejected. Separately, an external sync client or second action can create the target after the frontend checks it. The native write then truncates it, or rename behavior varies by platform/provider.

#### Expected behavior

Workspace-scoped operations must stay under the selected root. A create operation must either create a new entry or return a typed collision without modifying an existing entry; rename must never replace an unrelated target. `CONSTITUTION.md:106-109` specifically requires validation at filesystem and IPC boundaries, and the settings UI describes these directories as workspace-relative.

#### Impact

Users can accidentally write attachments, templates, notes, or settings outside the workspace, overwrite an externally synchronized file, or receive platform-dependent rename behavior. The app has no remote attacker surface, so this is not rated as broad compromise, but the data-integrity consequence is material.

#### Trigger or reproduction

1. **Preconditions:** desktop workspace `/vault`; write permission to `/outside.md` or a sibling directory.
2. **Input/event:** create a note named `../outside` or configure attachments as `../attachments` and paste an image.
3. **Execution path:** UI accepts text -> string path joins -> Tauri command receives the escaped path -> `create_dir_all`/`fs::write` operates outside `/vault`.
4. **Actual result:** out-of-workspace file creation or overwrite.
5. **Expected result:** validation rejects the value before mutation and native containment rejects bypasses.

For the race, pause after `listDir`, create the same target externally, then resume write/rename; the new target must not be replaced. These are deterministic traces, not executed here.

#### Root cause

The bridge contract models mutations as unrestricted path-based write/rename calls. It lacks a workspace capability, canonical containment check, validated path-segment type, and atomic create-new/no-replace operation mode. Frontend preflight checks are incorrectly treated as enforcement.

#### Implementation guidance

1. Define shared validators in `src/workspace/paths.ts`: a single entry name rejects `.`, `..`, `/`, `\\`, NUL/control characters, platform-reserved device names, and trailing dot/space where Windows would reinterpret it. Decide and test hidden-name policy explicitly. Treat `.md` suffix case-insensitively.
2. Define a workspace-relative directory validator for settings. Normalize separators, reject absolute/drive/URI forms and any `..` component, and return canonical forward-slash relative paths.
3. Replace raw native mutation signatures with workspace-session/capability plus relative path. Desktop canonicalizes the root and nearest existing parent, then verifies every target remains under the root; reject symlink escapes according to an explicit policy. Android verifies every URI is a descendant of the active persisted tree rather than accepting arbitrary caller URIs.
4. Add `createTextFileNew`, `createBinaryFileNew`, and `renameNoReplace` semantics. The native layer, not the frontend, must atomically enforce collision behavior. Quick-note creation may retry the next generated name only on the typed `AlreadyExists` error.
5. Map native errors to stable codes (`invalid_name`, `outside_workspace`, `already_exists`, `permission_denied`, `io_failure`) and show actionable UI messages.
6. Update file-tree, template, canvas-file creation, attachment, settings, rename, and trash call sites. Preserve explicit overwriting only for saving an already-open known file, routed through F-003's atomic replace contract.
7. No on-disk migration is needed. On loading old invalid folder settings, F-008 should fall back safely and report the rejected value without deleting it.

#### Required tests

- Extend `src/workspace/paths.test.ts` with empty, dot, dot-dot, slash/backslash, absolute, drive, URI, Unicode, control, reserved Windows, trailing-dot/space, case-insensitive `.md`, and valid international names.
- Extend `src/workspace/fileTreeStore.test.ts` with a race injected between preflight and native create/rename; assert typed collision and unchanged existing contents.
- Extend `src/editor/attachments.test.ts` and settings tests for invalid configured paths and a valid nested relative folder.
- Add Rust tests using temp directories for containment, symlink escape, create-new, and no-replace rename.
- Add Android native/emulator tests for tree ancestry and provider collision behavior.

Traversal and injected-race tests must fail before the fix.

#### Acceptance criteria

- [ ] No workspace-scoped API can resolve outside its active root.
- [ ] Invalid names/configured folders are rejected consistently before writes on all platforms.
- [ ] Native create-new and rename-no-replace never alter an existing target.
- [ ] Quick creation retries only on an actual collision.
- [ ] Save-existing remains possible and uses F-003's ordered atomic replacement.
- [ ] Error codes and user messages are consistent across desktop and Android.

#### Validation commands

1. `npm test -- src/workspace/paths.test.ts src/workspace/fileTreeStore.test.ts src/editor/attachments.test.ts src/settings/SettingsPanel.test.tsx`
2. `cd src-tauri && cargo test`
3. `npm test`
4. `npm run lint`
5. `npm run build`
6. `cd android && ./gradlew testDebugUnitTest assembleDebug`

#### Risks and rollback

Overly strict validation can reject existing legitimate cross-platform names; derive rules from actual target semantics and distinguish display names from relative paths. Symlink policy can break intended linked folders, so answer the open question in section 14 before rollout. Rollback is code-only because no migration occurs.

#### Out of scope

Do not build a general file manager, normalize user file names automatically, or change the default `.trash` behavior.

### F-005 - Search's 8 MiB memory bound is not enforced and binary data is serialized as text

- **Priority:** P1
- **Confidence:** Medium
- **Category:** Performance/Correctness
- **Affected components:** Full-text search batching, native recursive metadata, Android batch reader, desktop batch reader
- **Effort:** M
- **Dependencies:** None

#### Evidence

- `src/workspace/fileTreeStore.ts:308-319` defines an 8 MiB `SEARCH_BATCH_MAX_BYTES` but separately permits one searchable file up to 50 MiB.
- `src/workspace/fileTreeStore.ts:335-375`, `createBatchedContentReader`: line 369 adds the file size before line 370 checks the total, so two 5 MiB files are sent together as a 10 MiB call. A single 49 MiB file is also sent in one call. Missing size is passed as zero at line 443.
- `src/workspace/fileTreeStore.ts:392-443`, `runSearch`: all non-image files are candidates for content reads, regardless of whether their extension is textual.
- `android/.../FolderAccessPlugin.java:406-423`, `readOneFileOrNull`: the comment says invalid UTF-8 returns null, but `ByteArrayOutputStream.toString("UTF-8")` replaces malformed sequences rather than rejecting them.
- `src-tauri/src/commands.rs:447-450` uses `read_to_string`, which does reject invalid UTF-8, producing cross-platform behavior differences.
- `ROADMAP.md:43-47` records a real Android `OutOfMemoryError` allocating about 288 MiB in JSON serialization and says the current size-based change is not yet confirmed on-device.
- `src/workspace/fileTreeStore.test.ts:381-402` only proves that three 5 MiB entries produce at least two calls. It does not assert each call is at most 8 MiB, so a first 10 MiB batch passes.

#### Observed behavior

The batching algorithm enforces neither its comment nor constant. Known sizes can exceed the limit by the size of the last file; a permitted single file can exceed it by more than six times; unknown-size files have no effective bound. PDFs, archives, and other non-image files can be read and serialized as replacement-character strings on Android.

#### Expected behavior

No one native response should require serializing more than the explicitly supported memory budget. Files not in the supported text set should remain searchable by name/path only. Desktop and Android should agree on invalid UTF-8 handling.

#### Impact

Large or mixed vaults can freeze or crash Android during search, particularly because Java bytes, Java strings, JSON, bridge serialization, and JavaScript strings coexist. Binary replacement expansion makes metadata size an unreliable upper bound. Search is a core feature and the same execution path already caused a confirmed device crash.

#### Trigger or reproduction

1. **Preconditions:** search falls back to content; native reader is instrumented to record each batch.
2. **Input/event:** enumerate two nonmatching text files reported as 5 MiB each.
3. **Execution path:** both requests enter one microtask -> pending bytes become 10 MiB -> batch flushes.
4. **Actual result:** one native call receives 10 MiB despite the 8 MiB limit.
5. **Expected result:** the first 5 MiB batch flushes before adding the second; every request stays within the limit.

Repeat with size `undefined`, one 49 MiB file, and a binary PDF. Static trace was not run on a device.

#### Root cause

The code treats a post-addition threshold as a hard cap, uses a contradictory larger single-file threshold, trusts optional provider metadata, and defines text as “not an image.” The Android decoder does not implement the invalid-UTF-8 contract documented above it.

#### Implementation guidance

1. Before adding a known-size file, flush the current non-empty batch when `pendingBytes + size > limit`. Never send a single item larger than the same hard per-call budget.
2. Replace the 50 MiB exemption with either a streaming/chunked search API that bounds bytes and JSON per response or name/path-only behavior for files over the hard limit. Do not merely raise the batch limit.
3. Treat missing/zero-untrusted sizes conservatively: query a reliable size natively, process one bounded stream, or exclude content search with an observable “content skipped” count. Do not group arbitrary unknown-size files.
4. Introduce one canonical supported-text predicate shared by search behavior and tests. Include Markdown/plain-text formats the product intentionally supports; exclude PDF, office, archive, executable, and image formats from content reads.
5. On Android, use a `CharsetDecoder` configured with `CodingErrorAction.REPORT`, or perform bounded UTF-8 decoding natively. Return a structured per-file skipped reason rather than replacement text.
6. Consider returning matches from native streaming search instead of whole contents only if profiling shows bounded batching still creates excessive bridge allocation. Keep that as a follow-up, not a prerequisite.
7. Expose local aggregate diagnostics: files scanned, content-read, skipped by size/type/encoding, batch count, largest serialized byte count. No telemetry or network output.

#### Required tests

- Extend `src/workspace/fileTreeStore.test.ts` to capture every batch and assert each known-size sum is `<= SEARCH_BATCH_MAX_BYTES` for 5+5 MiB, exact-limit, limit+1, single 49 MiB, zero/unknown, duplicate-path, and 40-file cases.
- Assert binary extensions never call `readTextFilesBatch` but still match name/path queries.
- Add Android Java unit tests for valid multibyte UTF-8, malformed UTF-8, size limit, and per-file failure.
- Add a desktop Rust test confirming invalid UTF-8 yields `None` for only that item.
- Add a manual Android regression using the previously failing approximately 500-note vault and record peak memory/no-crash evidence.

The 5+5 MiB hard-cap assertion and binary-read test must fail before the fix.

#### Acceptance criteria

- [ ] Every serialized content batch is within the documented hard byte limit.
- [ ] Oversized and unknown-size inputs cannot bypass the bound.
- [ ] Binary files are never decoded or serialized for content search.
- [ ] Invalid UTF-8 behavior is equivalent on both platforms.
- [ ] Search completes without an OOM on the previously failing Android vault.
- [ ] Skipped content remains discoverable by name/path and is locally diagnosable.

#### Validation commands

1. `npm test -- src/workspace/fileTreeStore.test.ts src/workspace/searchQuery.test.ts`
2. `cd src-tauri && cargo test`
3. `cd android && ./gradlew testDebugUnitTest assembleDebug`
4. `npm test`
5. `npm run lint`
6. `npm run build`
7. Run the documented large-vault Android device test and capture memory/no-crash result.

#### Risks and rollback

Excluding types or oversized files changes which content matches. Preserve name/path matching and explain skipped content. Size metadata can be provider-dependent, so tests need both trusted and absent sizes. Rollback restores crash risk but does not change data format.

#### Out of scope

Do not implement document text extraction, remote indexing, or an unbounded in-memory index as part of this fix.

### F-006 - Older searches can replace or re-enable state for newer or cleared searches

- **Priority:** P2
- **Confidence:** Medium
- **Category:** Correctness
- **Affected components:** File-tree search store, Sidebar search lifecycle, workspace transition
- **Effort:** M
- **Dependencies:** F-001

#### Evidence

- `src/workspace/fileTreeStore.ts:425-456`, `runSearch`: every invocation writes global query/progress/results, but there is no request generation, cancellation token, or workspace ownership check.
- `src/workspace/fileTreeStore.ts:458-461`, `clearSearch`: clears visible values without invalidating a running request.
- `src/workspace/Sidebar.tsx:72-81` and `128-182`: the component cancels pending debounce timers, not native walks or matching already in progress.
- Existing Sidebar tests exercise debounce and distinct-root switching with mocked `runSearch`; no test resolves two real searches out of order or clears during an in-flight search.

#### Observed behavior

If search A starts, then search B starts and finishes first, A can later replace B's results. Calling `clearSearch` during A does not stop A from repopulating results. The `finally` for an older request can also set `searchInProgress` false while a newer request is still active. A workspace change has the same stale-publication risk.

#### Expected behavior

Only the newest search for the current workspace session and query may publish results or progress. Clear and workspace switch must invalidate all older work.

#### Impact

Users can see results for the wrong query or workspace and act on stale file paths. Progress can disappear while work remains active, making the UI misleading.

#### Trigger or reproduction

1. **Preconditions:** defer `findAllFiles` independently for two calls.
2. **Input/event:** start `runSearch(root, "old")`, then `runSearch(root, "new")`; resolve new then old.
3. **Execution path:** both calls share `searchResults` and `searchInProgress` without authority checks.
4. **Actual result:** old results become visible and old `finally` controls progress.
5. **Expected result:** only new results and new progress state are published.

Repeat by calling `clearSearch()` before old resolves and by switching session. This deterministic trace was not executed here.

#### Root cause

Debounce is mistaken for cancellation. Store state has no request identity, and async boundaries do not re-check ownership before publication or cleanup.

#### Implementation guidance

1. Add a monotonically increasing search request generation keyed to F-001's workspace session.
2. Capture `{generation, sessionId, normalizedQuery}` at start and check it after `findAllFiles`, after batched matching, before results publication, and in `finally`.
3. `clearSearch` and workspace reset must increment/invalidate the generation. Only the current request may clear its own progress.
4. If native cancellation becomes available, propagate an abort signal to walks/reads. Correctness must not depend on physical cancellation; stale completions still need authority checks.
5. Preserve current query syntax, filename short-circuiting, and result order.

#### Required tests

- Extend `src/workspace/fileTreeStore.test.ts` with out-of-order deferred searches, clear-during-search, and workspace-session-switch cases.
- Extend `src/workspace/Sidebar.test.tsx` to exercise debounce plus a real deferred `runSearch`, asserting that teardown invalidates it.
- Assert `searchInProgress` remains true for the current request when an older one finishes.
- Add an error case: only a current request may surface or clear its error/progress state.

The out-of-order and clear-during-search tests must fail before the fix.

#### Acceptance criteria

- [ ] An older search can never replace newer results.
- [ ] Clearing search cannot be undone by an in-flight completion.
- [ ] A workspace-session change invalidates all previous search publications.
- [ ] Progress reflects only the authoritative request.
- [ ] Query syntax and deterministic ordering remain unchanged.

#### Validation commands

1. `npm test -- src/workspace/fileTreeStore.test.ts src/workspace/Sidebar.test.tsx src/workspace/searchQuery.test.ts`
2. `npm test`
3. `npm run lint`
4. `npm run build`

#### Risks and rollback

Generation checks placed only at final publication still allow unnecessary reads but remain correct. Avoid clearing progress from stale `finally` blocks. This is in-memory only and readily reversible.

#### Out of scope

Do not redesign query syntax or add persistent indexing in this change.

### F-007 - Android URI cache retains stale descendants after directory mutations

- **Priority:** P2
- **Confidence:** Medium
- **Category:** Correctness/Data
- **Affected components:** Android Capacitor bridge path-to-URI cache, directory rename/trash/delete
- **Effort:** M
- **Dependencies:** F-001

#### Evidence

- `src/workspace/capacitorBridgeImpl.ts:130-170` defines the module-level `pathToUri` cache and resolves a cached path without verifying it.
- `src/workspace/capacitorBridgeImpl.ts:311-317`, `renamePath`: deletes only the exact old path and sets only the exact new path.
- `src/workspace/capacitorBridgeImpl.ts:322-342`, `trashPath`: deletes only the exact moved path.
- `src/workspace/capacitorBridgeImpl.ts:346-350`, `deletePathPermanent`: deletes only the exact deleted path.
- Descendant entries populated by directory listing remain under old prefixes. No bridge test covers a directory mutation followed by descendant resolution.

#### Observed behavior

After renaming `/workspace/a` to `/workspace/b`, a cached `/workspace/a/note.md` still points to the old document URI while `/workspace/b/note.md` is unresolved. After trash/delete, old descendants remain cached. Recreating the old directory/name can cause reads or mutations to use a stale moved/deleted URI instead of walking the current tree.

#### Expected behavior

Directory mutation must update or invalidate every cached descendant atomically with the root entry. A stale cache hit must not bypass current tree resolution.

#### Impact

Android users can receive failures or operate on a moved document through an obsolete path after folder rename, trash, delete, or recreate. The issue is persistent for the process lifetime unless the entire cache is cleared.

#### Trigger or reproduction

1. **Preconditions:** list `/workspace/a` so both the directory and `/workspace/a/note.md` are cached.
2. **Input/event:** rename `a` to `b`, then recreate `a`, then read old and new descendant paths.
3. **Execution path:** `renamePath` changes only two exact cache entries; descendant old key survives.
4. **Actual result:** `/workspace/a/note.md` returns the URI of the moved old document or fails without walking recreated `a`.
5. **Expected result:** old prefix has no cache entries and new descendants resolve under `b`; recreated `a` resolves independently.

This is a deterministic map-state trace; it was not executed against SAF.

#### Root cause

The cache is hierarchical, but mutation invalidation is exact-key. There is no prefix eviction/rewrite primitive or cache ownership version.

#### Implementation guidance

1. Add tested helpers `evictUriSubtree(prefix)` and, only if URI stability is verified, `rewriteUriSubtree(oldPrefix, newPrefix)`.
2. Prefer eviction for trash/delete and provider-ambiguous rename. For rename, either rewrite every cached descendant path while retaining its URI or evict descendants and lazily re-resolve. Eviction is safer and simpler.
3. Invoke invalidation only after native success; on ambiguous partial failure, invalidate both old and new prefixes.
4. Combine cache data with F-001's session generation so no URI from an old grant can be returned.
5. Ensure path-prefix matching is segment-aware: `/workspace/a` must not evict `/workspace/ab`.
6. Keep URI values opaque and never persist/log them beyond the existing access token requirements.

#### Required tests

- Add/extend `src/workspace/capacitorBridgeImpl.test.ts` with a fake `FolderAccess` plugin and cached nested trees.
- Cover rename, trash, permanent delete, failed mutation, recreation, prefix boundary (`a` vs `ab`), and session switch.
- Assert no stale descendant URI is sent to the plugin after mutation.
- Add a focused Android emulator test with a directory containing nested files.

The nested rename/recreate test must fail before the fix.

#### Acceptance criteria

- [ ] Successful directory rename leaves no old-prefix cache entry.
- [ ] Trash/delete evicts the complete subtree and no sibling prefix.
- [ ] Failed/partial mutation cannot leave a trusted ambiguous cache entry.
- [ ] Recreated paths are resolved from the current tree.
- [ ] Old-session URIs cannot be used after a workspace switch.

#### Validation commands

1. `npm test -- src/workspace/capacitorBridgeImpl.test.ts`
2. `npm test`
3. `npm run lint`
4. `npm run build`
5. `npx cap sync android`
6. `cd android && ./gradlew testDebugUnitTest assembleDebug`

#### Risks and rollback

Aggressive eviction increases SAF list calls but is correctness-safe; measure before attempting a more complex rewrite. Incorrect prefix matching could evict unrelated entries. No disk migration is involved.

#### Out of scope

Do not replace SAF or attempt to synthesize child URIs.

### F-008 - Persisted settings and bookmarks trust unchecked JSON as typed runtime data

- **Priority:** P2
- **Confidence:** Medium
- **Category:** Data/Correctness
- **Affected components:** Global config, workspace settings, bookmarks, session restore, settings consumers
- **Effort:** M
- **Dependencies:** F-002

#### Evidence

- `src/settings/globalConfig.ts:24-30`, `loadGlobalConfig`: casts parsed JSON to `Partial<GlobalConfig>` and shallow-merges defaults without checking theme, path, or token types.
- `src/settings/workspaceSettings.ts:168-174`, `loadWorkspaceSettings`: casts parsed JSON to `Partial<WorkspaceSettings>` and shallow-merges it. Enums, numbers, arrays, nested snippet entries, relative folders, and session paths are unchecked.
- `src/bookmarks/store.ts:39-56`, `loadBookmarks`: checks only `Array.isArray`, then casts every member to `Bookmark`.
- Consumers immediately use these values in CSS variables, array loops, path operations, mode selection, sorting, delete behavior, restore reads, and component controls.
- Parse/read errors silently return defaults. There is no schema version, quarantine, local error, or distinction between missing and corrupt files.

#### Observed behavior

Syntactically valid but wrong-shaped synchronized JSON enters runtime as if TypeScript had validated it. Examples include `lastOpenPaths: "x"` being iterated as characters, `fontSize: {}` becoming an invalid CSS value, an invalid delete behavior selecting the non-default branch by accident, malformed bookmark objects reaching path rendering, and path settings containing traversal from F-004. A syntax error silently resets the in-memory view to defaults, which F-002 may later persist over the corrupt source.

#### Expected behavior

Persisted data is untrusted runtime input. Valid fields should be accepted individually, invalid fields should fall back with a visible local diagnostic, and corrupt source should be preserved for recovery rather than silently overwritten. Defaults and enums in `workspaceSettings.ts` are the current canonical contract.

#### Impact

External synchronization, hand editing, older/newer application versions, or partial writes can crash rendering, perform unintended file operations, lose preferences, or propagate default replacement to other devices.

#### Trigger or reproduction

1. **Preconditions:** create valid JSON settings with `{ "lastOpenPaths": "abc", "deleteBehavior": "other", "attachmentsFolder": "../x" }`.
2. **Input/event:** open the workspace.
3. **Execution path:** JSON parse -> unchecked cast/merge -> restore loop and behavior/path consumers.
4. **Actual result:** characters can be treated as paths, invalid enum changes branching, and escaped folder reaches writes.
5. **Expected result:** each invalid field is rejected, safe defaults are used, and the user can inspect/recover the original file.

Static trace was not executed.

#### Root cause

Static interfaces are being used as runtime schemas. Error handling collapses missing, unreadable, malformed, incompatible, and invalid content into the same silent-default path.

#### Implementation guidance

1. Define small explicit decoders for `GlobalConfig`, `WorkspaceSettings`, `Bookmark`, and nested types. A reviewed schema library is optional; manual validators are adequate if exhaustive and tested.
2. Validate field-by-field: exact enum membership; finite numeric ranges; booleans; arrays of validated strings/objects; unique bookmark IDs; discriminated bookmark fields; and F-004 canonical relative paths.
3. Add an on-disk `schemaVersion` only if a migration is needed. Readers must accept the current unversioned shape as version 0 and preserve forward-compatible unknown fields according to an explicit policy.
4. Return a structured load result: `{value, warnings, sourceStatus}` where status distinguishes missing, permission failure, malformed JSON, invalid fields, and unsupported future version.
5. Preserve malformed files. Do not write defaults until the user makes a valid change after acknowledging/recovering the problem. Consider a timestamped local backup before the first correcting write.
6. Update settings initialization, panel, bookmarks, restore, and save code. Never include note contents, URI tokens, or raw corrupt documents in logs.
7. Keep valid current files byte-compatible apart from deliberate canonical writes after user changes.

#### Required tests

- Extend `src/settings/workspaceSettings.test.ts` and `globalConfig.test.ts` with every field's wrong type, enum, `NaN`-like boundary where representable, extreme number, nested malformed item, unknown field, unversioned file, and future version.
- Extend `src/bookmarks/store.test.ts` with mixed valid/invalid members, duplicates, wrong discriminants, missing paths/queries, and corrupt JSON.
- Extend `src/settings/store.test.ts` to assert corrupt settings are not overwritten during startup.
- Add recovery-write tests asserting backup/preservation behavior.

At least the string `lastOpenPaths` and invalid delete/path tests must fail before the fix.

#### Acceptance criteria

- [ ] No unchecked parsed JSON is cast directly to an application model.
- [ ] Invalid fields cannot reach path, restore, CSS, enum, or iteration consumers.
- [ ] Valid fields survive alongside invalid fields according to the documented decoder policy.
- [ ] Missing and corrupt files produce distinct behavior.
- [ ] Startup never overwrites a corrupt source with defaults.
- [ ] Valid unversioned current files continue to load.

#### Validation commands

1. `npm test -- src/settings/workspaceSettings.test.ts src/settings/globalConfig.test.ts src/settings/store.test.ts src/bookmarks/store.test.ts`
2. `npm test`
3. `npm run lint`
4. `npm run build`

#### Risks and rollback

Strict decoders can reject values older releases accepted. Begin with permissive version-0 compatibility for valid current shapes and preserve source. If adding a version, ship reader support before writer changes. Roll back the writer before rolling back the compatible reader.

#### Out of scope

Do not introduce a database or move workspace metadata to a remote service.

### F-009 - Properties editing rewrites unrelated YAML semantics and layout

- **Priority:** P2
- **Confidence:** Medium
- **Category:** Data
- **Affected components:** Frontmatter parser/serializer, Properties panel, aliases/tags extraction
- **Effort:** L
- **Dependencies:** F-003

#### Evidence

- `src/linking/frontmatter.ts:30-40`, `parseInlineList`: splits on every comma without respecting YAML quoting; lines 104-108 acknowledge the limitation.
- `src/linking/frontmatter.ts:150-205`, `parseFrontmatterFields`: represents every recognized scalar as a JavaScript string, losing YAML boolean/number/null/date/tag/style semantics.
- `src/linking/frontmatter.ts:208-220` serializes every recognized scalar and list item as a double-quoted string.
- `src/linking/frontmatter.ts:121-148` claims raw unsupported content is kept verbatim and in original order, but `applyFrontmatterFields` at lines 230-241 emits all parsed fields first and all raw lines afterward.
- `src/editor/FrontmatterPropertiesPanel.tsx:51-63` reserializes the entire block on each field input.
- `src/linking/frontmatter.test.ts:224-253` accepts reordering and excludes comma-containing list items rather than protecting YAML semantics.
- `ROADMAP.md:16` describes editing frontmatter fields while preserving unsupported raw content.

#### Observed behavior

Editing one title can change `published: true` to `published: "true"`, `count: 5` to `count: "5"`, move comments/nested blocks to the end, normalize line endings, and split `["Doe, Jane"]` into two values. Unchanged fields are modified even though the UI did not edit them.

#### Expected behavior

An edit to one supported property should preserve every unedited frontmatter token's value semantics, order, comments, quoting, and line endings. Unsupported structures should remain byte-for-byte unless the user edits them through a representation that understands them.

#### Impact

Leotheca can silently change how other Markdown/YAML tools interpret a note, break automation based on typed values, create noisy sync conflicts, and lose comments or list item boundaries.

#### Trigger or reproduction

1. **Preconditions:** note frontmatter contains `# keep`, `published: true`, `person: ["Doe, Jane"]`, and a nested map between editable fields.
2. **Input/event:** change only an unrelated scalar in Properties.
3. **Execution path:** parse into string fields/raw lines -> panel commit -> serialize all fields then raw lines.
4. **Actual result:** boolean becomes a string, comma item splits, comments/nested block move, newline style changes.
5. **Expected result:** only the selected scalar's source range changes.

The transformation follows directly from the functions above; it was not executed during this audit.

#### Root cause

A deliberately minimal extraction parser has been extended into a general editor. Its lossy value model and two-bucket serializer cannot preserve a YAML concrete syntax tree.

#### Implementation guidance

1. Separate read-only alias/tag extraction from editable frontmatter representation so performance-sensitive indexing does not force the editor design.
2. Use a YAML parser capable of preserving a concrete syntax tree, comments, scalar styles/types, anchors/tags, and source ranges, or implement surgical source-range replacement for only the explicitly supported simple fields. A dependency is justified only after license, lockfile, offline build, and maintenance review under `CONSTITUTION.md`.
3. Keep unsupported or ambiguous fields read-only. If a selected field has duplicate keys or an unsupported node type, show a clear message and do not rewrite the block.
4. Preserve original line ending, delimiter placement, field order, comments, and every unedited token. Parse quoted commas and escaped values correctly.
5. Define the editable contract explicitly: key grammar, duplicate-key behavior, scalar types the UI can edit, list behavior, insertion position, deletion behavior, and empty frontmatter removal.
6. Add changes atop F-003 so every keystroke does not launch unsafe whole-note writes. Consider commit-on-blur or debounced validated edits.
7. Do not migrate existing notes. The new reader must handle files produced by the current serializer.

#### Required tests

- Extend `src/linking/frontmatter.test.ts` with booleans, integers/floats, null, dates, quoted commas, escaped quotes/backslashes, comments before/between/after fields, nested maps, block scalars, duplicate keys, anchors/tags, CRLF, and missing terminal newline.
- For each case, edit one field and assert all unrelated source slices are byte-identical.
- Extend `src/editor/FrontmatterPropertiesPanel.test.tsx` to verify unsupported/duplicate fields are read-only with a visible explanation.
- Keep alias/tag extraction tests independent and verify current supported forms.

Boolean preservation, comment-order, and quoted-comma tests must fail before the fix.

#### Acceptance criteria

- [ ] Editing one supported field changes no unrelated token or line ending.
- [ ] YAML booleans, numbers, nulls, dates, comments, nested structures, and quoted comma items retain semantics.
- [ ] Unsupported or ambiguous structures are never silently rewritten.
- [ ] Existing current-format notes remain readable and editable where supported.
- [ ] Alias/tag extraction behavior remains compatible.

#### Validation commands

1. `npm test -- src/linking/frontmatter.test.ts src/editor/FrontmatterPropertiesPanel.test.tsx src/tags/tags.test.ts`
2. `npm test`
3. `npm run lint`
4. `npm run build`
5. If adding a dependency, run the repository's new offline/license/dependency validation gate from F-014.

#### Risks and rollback

YAML libraries can normalize documents unless configured for CST preservation. Build golden byte-level fixtures before replacement. A surgical editor has a smaller blast radius but must refuse unsupported syntax. No migration means rollback is safe if the new writer has not emitted syntax older versions cannot parse.

#### Out of scope

Do not add a general schema designer, autoformat all notes, or change tag/alias product semantics.

### F-010 - Canvas editing is lossy and local file-reference resolution is incomplete

- **Priority:** P2
- **Confidence:** Medium
- **Category:** Data/Correctness
- **Affected components:** Canvas parser/view, App file-open routing, autosave, workspace paths
- **Effort:** M
- **Dependencies:** F-003, F-004

#### Evidence

- `src/canvas/CanvasView.tsx:9-17`, `parseCanvas`: filters malformed nodes/edges and returns only `{nodes, edges}`, dropping unknown top-level and record fields.
- `src/canvas/CanvasView.tsx:24-31`: the next edit serializes that reduced model with `JSON.stringify`, making filtered/unknown data loss permanent.
- `src/canvas/CanvasView.tsx:34`: file paths are stored and sent directly to `onOpenFile` without normalization or base-directory resolution.
- `src/app/App.tsx:209-216` opens images specially, canvases specially, and every other path as UTF-8 text; `App.tsx:706` passes the raw canvas path to this dispatcher.
- `ROADMAP.md:8` and `59` promise an open JSON canvas with local references that open notes, images, or documents.
- `src/canvas/CanvasView.test.ts:5-12` uses an absolute path and tests dangling-edge filtering, not preservation, relative paths, duplicate IDs, documents, or cross-platform resolution.

#### Observed behavior

Opening a forward-compatible or hand-edited canvas silently hides unknown/malformed records; moving a card or editing text then deletes them from disk. A relative `note.md` is opened as process-relative on desktop and cannot resolve under Android's `/workspace` namespace. A referenced PDF/document is sent to `readTextFile`, not a document viewer or system opener.

#### Expected behavior

An editable canvas must either validate and preserve the complete supported document or refuse destructive editing. Relative local references need one canonical base and containment rule. Promised document types must have a defined dispatch behavior.

#### Impact

Users can lose canvas data created by another version/tool and encounter broken links that work differently by platform. Document references advertised by the UI may fail as encoding/read errors.

#### Trigger or reproduction

1. **Preconditions:** canvas JSON has unknown top-level metadata, one valid node with an unknown field, one malformed future node, and `filePath: "notes/a.md"`.
2. **Input/event:** open canvas, move the valid card, then click its file link.
3. **Execution path:** parser filters/reduces -> save serializes reduced document -> raw relative path reaches `handleOpenFile`.
4. **Actual result:** unknown/malformed data disappears and relative open fails or uses the wrong base.
5. **Expected result:** unedited data is preserved or editing is blocked; reference resolves according to the declared contract.

This deterministic trace was not executed.

#### Root cause

The parser doubles as a sanitizer and canonical serializer without a versioned format or lossless representation. File references have no documented base/type contract, and the generic open dispatcher assumes non-image means UTF-8 text.

#### Implementation guidance

1. Declare the canvas schema and compatibility policy in a colocated format document/test fixtures. If compatibility with an external JSON-canvas standard is intended, identify the exact version and map its fields; do not infer it from the `.canvas` extension.
2. Parse into a lossless source model retaining unknown fields and records. Validate unique node IDs, finite coordinates, edge references, and supported field types. If a document cannot be safely preserved, render a read-only error with export/open-as-text options.
3. Resolve relative file references against the canvas file's directory or workspace root, whichever product decision is documented. Use F-004's canonical path/containment helpers; reject traversal outside the active workspace unless an explicit external-reference feature is approved.
4. Define dispatch: Markdown/text opens in editor, images in viewer, canvas recursively in canvas view, and unsupported documents either open through a safe system-default action or show an explicit unsupported message. Do not decode arbitrary binary as text.
5. Update `CanvasView` props to receive canvas path/session and a typed `openWorkspaceResource` callback rather than an unqualified string callback.
6. Use F-003's revision-safe persistence. Keep current `{nodes, edges}` files readable; no bulk migration.

#### Required tests

- Extend `src/canvas/CanvasView.test.ts` with preservation of unknown top-level/node/edge fields, malformed documents becoming read-only, duplicate IDs, non-finite coordinates, relative nested paths, traversal rejection, and each supported resource type.
- Add pure path-resolution tests to `src/workspace/paths.test.ts` for canvas base semantics on desktop-style and Android synthetic roots.
- Extend `src/app/App.test.tsx` for typed resource dispatch and unsupported binary behavior.
- Add a golden round-trip fixture where one card edit changes only the intended fields.

Unknown-field preservation and relative-path tests must fail before the fix.

#### Acceptance criteria

- [ ] Editing a supported canvas preserves all unedited supported and unknown data.
- [ ] Unsafe/malformed canvases cannot be destructively saved.
- [ ] Relative references resolve identically on desktop and Android under the documented base.
- [ ] Traversal is rejected according to F-004.
- [ ] Notes, images, canvases, and unsupported documents receive explicit correct dispatch.
- [ ] Existing minimal canvases continue to open without migration.

#### Validation commands

1. `npm test -- src/canvas/CanvasView.test.ts src/workspace/paths.test.ts src/app/App.test.tsx`
2. `npm test`
3. `npm run lint`
4. `npm run build`
5. `cd android && ./gradlew assembleDebug`

#### Risks and rollback

Choosing a reference base incorrectly creates incompatible links; resolve the open question before emitting new relative paths. Lossless merge logic must not preserve actively dangerous fields into executable behavior. Since existing files stay readable, rollout and rollback can be version-tolerant.

#### Out of scope

Do not add collaboration, remote embeds, a binary document renderer, or a proprietary canvas sync service.

### F-011 - Session restore opens canvases as text and can select a missing tab

- **Priority:** P2
- **Confidence:** Medium
- **Category:** Correctness
- **Affected components:** Settings startup restore, tab store, canvas/image/text dispatch
- **Effort:** S
- **Dependencies:** F-002

#### Evidence

- `src/settings/store.ts:54-69`, `restoreLastOpenTabs`: images get kind `image`; every non-image file is read and opened with kind `text`. It does not call `isCanvasPath`.
- `src/app/App.tsx:209-216`, `handleOpenFile`: normal interactive opening classifies `.canvas` as `canvas`, proving the intended behavior.
- `src/settings/store.ts:65-69`: missing/unreadable paths are skipped, but `activeTabPath` is assigned `lastActivePath` even when that path did not restore.
- No existing settings-store test restores a canvas or a missing last-active path.

#### Observed behavior

A canvas saved in `lastOpenPaths` reopens in the text editor after restart. If the persisted active path was deleted or unreadable, `activeTabPath` points to no open tab; restored tabs can exist while none is active.

#### Expected behavior

Startup restore and interactive open must share the same resource classification. The active path must be one of the successfully restored tabs or a deterministic fallback.

#### Impact

Users get the wrong editor for a valid canvas and a blank/inconsistent workspace after files are moved by an external sync tool.

#### Trigger or reproduction

1. **Preconditions:** workspace settings contain `lastOpenPaths: ["/vault/board.canvas", "/vault/note.md"]` and `lastActivePath: "/vault/missing.md"`.
2. **Input/event:** start the app; missing file read rejects.
3. **Execution path:** restore opens board as `text`, note as `text`, skips missing, then assigns missing active path.
4. **Actual result:** canvas has wrong kind and no restored tab is active.
5. **Expected result:** board is `canvas`; active falls back to the last successfully restored tab according to a documented rule.

Static trace was not executed.

#### Root cause

Resource classification is duplicated between startup and interactive open, and active selection trusts persisted input rather than the set of successful restores.

#### Implementation guidance

1. Extract a pure `classifyWorkspaceResource(path)` used by both `App.handleOpenFile` and `restoreLastOpenTabs`.
2. Restore tabs into a local ordered list. After reads finish, select `lastActivePath` only if it is present; otherwise select the last or first restored tab according to existing tab-opening semantics. Use `null` if none restored.
3. Preserve saved order and best-effort skipping. Record a local non-sensitive count/message for skipped paths instead of silently leaving inconsistent state.
4. Coordinate with F-002 so restore occurs during hydration without persistence effects writing intermediate state.
5. Do not add document behavior here; F-010 owns the resource dispatch expansion.

#### Required tests

- Extend `src/settings/store.test.ts` with text, image, canvas, missing active, missing non-active, all-missing, and empty-list cases.
- Add/extend a pure classifier test covering case policy for `.canvas` and image extensions.
- Assert restored order and exactly one valid active tab.

Canvas restore and missing-active tests must fail before the fix.

#### Acceptance criteria

- ✅ A restored canvas uses the canvas view.
- ✅ A restored image and text note retain their current correct kinds.
- ✅ `activeTabPath` is always null or present in `openTabs` after restore.
- ✅ Missing files do not prevent other tabs from restoring.
- ✅ Hydration does not persist intermediate restore state.

#### Validation commands

1. `npm test -- src/settings/store.test.ts src/workspace/types.test.ts`
2. `npm test`
3. `npm run lint`
4. `npm run build`

#### Risks and rollback

Case-insensitive extension classification should match existing interactive behavior exactly. The change is local and format-neutral; rollback is simple.

#### Out of scope

Do not add restore history, reopen unsupported binary documents, or redesign tab ordering.

### F-012 - Link metadata cache can be stale and one unreadable note aborts the rebuild

- **Priority:** P2
- **Confidence:** Medium
- **Category:** Correctness/Architecture
- **Affected components:** Link index, aliases, tags, backlinks, graph, persisted metadata cache
- **Effort:** M
- **Dependencies:** F-001, F-003

#### Evidence

- `src/linking/store.ts:72-99` defines metadata cache entries keyed by path with only `mtime`, and tracks loaded caches by root path.
- `src/linking/store.ts:117-127` trusts a persisted cache entry's shape after only checking top-level version.
- `src/linking/store.ts:216-240`: equal `mtime` reuses links/aliases/tags without reading content. External synchronization can replace content while preserving or coarsening modification time.
- `src/linking/store.ts:227-233`: any current note read failure is rethrown from the bounded map, aborting the full build rather than skipping one file.
- `src/app/App.tsx:186-188` launches `void rebuildLinkIndex(...)` without a rejection handler or visible error state.
- `CONSTITUTION.md:89-94` explicitly warns that caches become stale when another device changes files; `documentation/ARCHITECTURE.md` calls files the source of truth.

#### Observed behavior

If a note's content changes while its path and reported modification time stay equal, backlinks/tags/aliases remain from the old content across rebuilds and restarts. If one note is unreadable or disappears during the scan, the entire current rebuild rejects, the prior index can remain visible, and the user receives no error.

#### Expected behavior

Metadata visible to the user must correspond to current file contents or be explicitly marked incomplete. One unreadable note should not discard usable metadata for every other note, and cache files must be runtime-validated.

#### Impact

External-sync users can navigate stale backlinks/tags or see a graph inconsistent with disk. A single permission/transient race can disable all metadata while presenting old results as current.

#### Trigger or reproduction

1. **Preconditions:** index note A at mtime `t`; cache says tag `old`.
2. **Input/event:** replace A's bytes with tag `new` while preserving reported mtime `t`, then rebuild.
3. **Execution path:** equal-mtime branch uses cached entry and skips read.
4. **Actual result:** `old` remains indexed.
5. **Expected result:** `new` is indexed or the UI explicitly indicates an unverified/incomplete cache.

For failure, make one of two note reads reject; current `mapWithConcurrency` rejects the whole build. Static traces were not executed.

#### Root cause

The cache freshness contract assumes modification time uniquely identifies content, contrary to the product's external-sync model. The rebuild is all-or-nothing at the note-read boundary and its caller ignores rejection.

#### Implementation guidance

1. Define a cache identity using the strongest cheap native metadata available, such as stable file identifier plus size plus high-resolution mtime, and document remaining limits. For providers without trustworthy metadata, always re-read or use a bounded content hash generated during reads.
2. Explicitly invalidate the current note's cache after every successful F-003 save and every create/rename/delete. Session-key the cache per F-001.
3. Runtime-validate persisted cache version, entry object, finite metadata, and string arrays. Discard only invalid entries, not the whole app state.
4. Change the concurrent mapper result to per-note success/failure. Build and publish metadata from successful notes, set `linkIndexIncomplete` plus a failure count, and offer Retry. Never retain a prior index without labeling it stale.
5. Preserve latest-request authority checks already present at `src/linking/store.ts:100-103` and `177-188`.
6. Avoid logging note contents or SAF tokens. Local diagnostics may include relative path only if the UI needs to identify a failed file.
7. Consider removing persisted cache if correctness cannot be demonstrated under common sync tools; performance must not override the source-of-truth contract.

#### Required tests

- Extend `src/linking/store.test.ts` with same-path/same-mtime/different-content, size change, missing mtime, own-save invalidation, one unreadable note, deletion during read, corrupt entry shape, and stale request cases.
- Assert partial index publication, incomplete signal, failure count, and retry clearing.
- Add native metadata tests for precision/availability on desktop and Android providers where feasible.
- Add a real synchronized-folder manual scenario that replaces content while preserving timestamp if the sync tool supports it.

Same-mtime content-change and one-read-failure tests must fail before the fix.

#### Acceptance criteria

- [ ] A successful local save is reflected in the next link/tag/backlink view regardless of timestamp granularity.
- [ ] Missing/untrustworthy metadata never produces an unverified cache hit.
- [ ] One unreadable note does not suppress all other metadata.
- [ ] Incomplete/stale state is visible and retryable.
- [ ] Invalid persisted cache entries cannot reach application maps.
- [ ] Latest-request and workspace-session isolation remain intact.

#### Validation commands

1. `npm test -- src/linking/store.test.ts src/tags/tags.test.ts src/graph/GraphView.test.tsx`
2. `cd src-tauri && cargo test`
3. `npm test`
4. `npm run lint`
5. `npm run build`

#### Risks and rollback

More reads can regress large-vault performance, especially on SAF. Measure cache hits, scan time, and read count locally without telemetry. Content hashing also reads bytes and must remain bounded. Cache schema changes need a version bump and safe invalidation, not migration of untrusted entries.

#### Out of scope

Do not cache note display content, add a server index, or change wikilink resolution semantics.

### F-013 - Graph layout performs quadratic work for hundreds of iterations on the UI thread

- **Priority:** P2
- **Confidence:** Medium
- **Category:** Performance
- **Affected components:** Force layout, Graph view filtering/resizing
- **Effort:** M
- **Dependencies:** None

#### Evidence

- `src/graph/layout.ts:1-9` documents `O(nodes^2 * iterations)` and assumes the graph sizes are modest.
- `src/graph/layout.ts:40-64`, `computeLayout`: iterations are `min(300, 80 + 2n)` and every iteration visits every unordered node pair.
- At 580 nodes this performs roughly 50.4 million pair iterations before attraction and rendering work.
- `src/graph/GraphView.tsx:240-260`, `layoutAndDraw`: calls `computeLayout` synchronously.
- `src/graph/GraphView.tsx:264-278`: opening, filter/show-local changes, and every `ResizeObserver` callback relayout synchronously and reset pan/zoom.
- Tests cover small deterministic graphs; there is no performance budget, large fixture, worker, threshold, or resize debounce.

#### Observed behavior

Opening or resizing a graph with hundreds of notes can monopolize the JavaScript/UI thread for millions of pair operations. Repeated resize notifications can recompute from scratch. Input, paint, and mobile responsiveness are blocked until completion.

#### Expected behavior

Graph opening and resize must remain responsive at the repository's plausible large-vault scale, with work bounded or moved off the UI thread. Layout should remain deterministic enough for existing interactions and tests.

#### Impact

Large workspaces can freeze the app or trigger mobile watchdog/poor-response behavior. The link/search documentation already discusses approximately 500-note real vaults, making this scale plausible rather than theoretical.

#### Trigger or reproduction

1. **Preconditions:** construct a graph with 580 visible nodes and representative edges.
2. **Input/event:** open graph or resize its container repeatedly.
3. **Execution path:** `layoutAndDraw` -> 300 iterations -> 167,910 unordered pairs per iteration (50,373,000 pair steps total) on the UI thread.
4. **Actual result:** synchronous long task proportional to quadratic pair count.
5. **Expected result:** bounded response, progressive/worker layout, or an explicit reduced-detail mode within a measured budget.

This cost follows directly from loop bounds; elapsed time was not benchmarked here.

#### Root cause

A simple force layout was selected without a production size threshold or asynchronous execution policy. Resize invalidation treats geometry changes as requiring a full fresh layout.

#### Implementation guidance

1. Add a benchmark fixture based on 100, 500, 1,000, and 2,000 nodes and representative sparse/dense edges. Establish device-class budgets before choosing an algorithm.
2. Short term: debounce/coalesce `ResizeObserver`, preserve normalized positions across resize, avoid layout when only canvas dimensions change, and add a node threshold that uses a deterministic cheaper layout or asks the user to filter.
3. Medium term: move force computation to a Web Worker with request generations and cancellation, or use a Barnes-Hut/spatial approximation. Keep render and hit-test data transfer bounded.
4. Do not publish stale worker results after filter, workspace, or close. Preserve pan/zoom when a resize does not change visible nodes.
5. Keep layout deterministic for a fixed graph/size or update tests to assert stable invariants rather than exact incidental coordinates.
6. Add a local long-task/layout-duration diagnostic in development mode only; no telemetry.

#### Required tests

- Extend `src/graph/layout.test.ts` with large deterministic fixtures, finite-position invariants, duplicate/self-edge handling, and cancellation/request identity if workerized.
- Extend `src/graph/GraphView.test.tsx` to emit a burst of resize callbacks and assert one coalesced layout; verify stale async results cannot draw after filter/close.
- Add a benchmark script under the existing test tooling and a documented budget. Do not make shared CI depend on unstable wall-clock timing; enforce operation counts or a generous dedicated performance threshold.
- Manually profile a roughly 500-note Android vault.

The resize-coalescing test must fail before the fix; the benchmark establishes, rather than presumes, the final budget.

#### Acceptance criteria

- [ ] A resize burst does not trigger one full layout per callback.
- [ ] UI input remains responsive while a 500-node graph computes on target Android hardware.
- [ ] Stale layouts cannot publish after graph/filter/workspace changes.
- [ ] Positions remain finite and interactions remain correct.
- [ ] Small-graph visual behavior remains materially unchanged.

#### Validation commands

1. `npm test -- src/graph/layout.test.ts src/graph/GraphView.test.tsx src/graph/transform.test.ts`
2. Run the new repository graph benchmark command documented by the implementation.
3. `npm test`
4. `npm run lint`
5. `npm run build`
6. Profile the documented Android large-graph scenario.

#### Risks and rollback

Workers add build/message lifecycle complexity; thresholds can surprise users if not explained. First land resize coalescing and measurements, then the algorithm/worker change separately. A fallback to the old layout should be restricted to small graphs.

#### Out of scope

Do not change graph semantics, backlink direction, coloring rules, or add a network layout service.

### F-014 - Required checks do not cover lint, Android behavior, or release eligibility

- **Priority:** P2
- **Confidence:** High
- **Category:** Testing/Operations
- **Affected components:** CI workflow, release workflow, branch policy, Android tests, dependency controls
- **Effort:** M
- **Dependencies:** Safety net for all findings

#### Evidence

- `.github/workflows/ci.yml:8-56` runs TypeScript, Vitest, build, Cargo check/test, and Android assemble, but never runs `npm run lint`, Cargo lint, Gradle tests, instrumentation tests, or a dependency/security audit.
- `CONTRIBUTING.md:47-62` tells contributors to run `npm test`, `npm run lint`, `npm run build`, and Cargo tests, so enforced CI is weaker than the documented local gate.
- `android/app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java:1-16` is the untouched `2 + 2` template.
- `android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java:1-24` is in the template package and asserts `com.getcapacitor.app`, while `android/app/build.gradle:10-11` and the application config use `com.leonardschwier.leotheca`; the test would fail if executed.
- The custom `FolderAccessPlugin.java` is roughly 650 lines and has no native behavior tests.
- `.github/workflows/release.yml:218-230` publishes when Linux and Android build jobs succeed, regardless of the separate CI workflow. It can intentionally publish even when other platform jobs fail.
- Repository metadata at review time reported `main` unprotected, no required status checks, and no rulesets.
- Current exact-commit CI/release runs were green, which confirms existing gates execute but not the omitted behavior.

#### Observed behavior

A push can publish a development release even if tests or lint in the separate CI workflow fail. A direct push to `main` is not blocked by required checks. Android code is compiled but never exercised, and its only instrumentation test is already inconsistent with the actual package. No recurring dependency vulnerability gate is configured.

#### Expected behavior

Documented checks must be enforced, native platform behavior must have executable coverage, and publishing must depend on the same verified commit. Release tolerance for optional platform artifact failures should remain explicit, but it must not bypass correctness/security gates.

#### Impact

Regressions in the highest-risk SAF, lifecycle, and validation paths can merge and be distributed while all enforced jobs appear green. The rolling release increases exposure because every `main` push republishes artifacts.

#### Trigger or reproduction

1. **Preconditions:** a commit fails `npm run lint` or a future Android native regression test but still compiles.
2. **Input/event:** push directly to `main`.
3. **Execution path:** CI may fail/omit the check; independent release jobs build; publish requires only Linux and Android build success.
4. **Actual result:** development artifacts can be published from an unverified commit.
5. **Expected result:** release publication requires the exact SHA to pass the canonical validation workflow.

The wrong package assertion is directly demonstrable statically. Workflow/branch behavior is confirmed by repository metadata; no failing commit was created.

#### Root cause

Validation is duplicated between documentation and workflows without one canonical reusable gate. “Builds” are treated as tests for Android. Release orchestration is independent of CI, and repository policy does not require checks.

#### Implementation guidance

1. Create one reusable validation workflow or composite job for the exact SHA. Include `npm ci`, `npm run lint`, `npm run build`, `npm test`, `cargo fmt --check`, `cargo clippy --all-targets --all-features -- -D warnings` after confirming compatibility, `cargo test`, Gradle unit tests, and Android assemble.
2. Replace template Android tests. Move helpers from `FolderAccessPlugin` into testable classes where necessary; cover UTF-8, path/tree validation, name collision, recursive traversal limits, batching limits, write failures, rename/trash/delete, and grant restoration.
3. Add emulator/instrumentation coverage for SAF provider interactions that cannot be unit-tested. Fix the package assertion to the actual application ID and enforce `connectedDebugAndroidTest` in an emulator job at a practical cadence.
4. Add repository-supported dependency checks for npm, Cargo, and Gradle with lockfile-aware, reviewed failure policy. Pin third-party workflow actions to immutable commit SHAs or document the chosen trust/update policy.
5. Make `release.yml` invoke or depend on validation for the same commit before publish. Keep optional artifact tolerance only after validation passes; clearly list missing artifacts.
6. Configure branch/ruleset protection outside the code repository: require pull requests or at minimum required validation checks, block force pushes/deletion, and restrict direct pushes according to maintainer workflow. Record the exact settings in contributor/release docs.
7. Add a workflow contract test or lightweight script verifying the documented command list matches CI.

#### Required tests

- Replace both Java templates in their existing locations or correctly packaged equivalents with meaningful unit/instrumentation tests.
- Add unit and emulator tests listed above; at least the current wrong-package instrumentation test must fail before correction and pass after.
- Add a workflow fixture/check showing a failing canonical validation job prevents publish for the same SHA.
- Add a lint-regression sample through a temporary branch/PR or workflow test, not by committing broken production code.
- Verify branch rules through repository settings/API after configuration.

#### Acceptance criteria

- [ ] Every command documented as required in `CONTRIBUTING.md` runs in CI.
- [ ] Android native tests execute and contain no template assertions/packages.
- [ ] A release cannot publish unless canonical validation for the exact SHA succeeds.
- [ ] Optional platform build failure does not masquerade as a complete release.
- [ ] `main` requires the canonical checks and disallows unsafe ref updates per documented policy.
- [ ] Dependency checks run on a documented cadence with actionable failure policy.

#### Validation commands

1. `npm ci && npm run lint && npm run build && npm test`
2. `cd src-tauri && cargo fmt --check && cargo clippy --all-targets --all-features -- -D warnings && cargo test`
3. `npx cap sync android`
4. `cd android && ./gradlew testDebugUnitTest assembleDebug connectedDebugAndroidTest`
5. Run the new dependency-validation commands documented in the repository.
6. Verify a test pull request reports all required checks and a deliberately failed check blocks release publication.

#### Risks and rollback

New gates can initially expose baseline failures; record them and fix in focused changes rather than disabling the gate. Emulator jobs can be slow/flaky, so separate deterministic unit coverage and retry only infrastructure failures. Branch protection is an administrative change and should have a documented emergency procedure, not be silently removed.

#### Out of scope

Do not require signing credentials to validate code, mandate a particular hosted service for contributors, or make optional platform availability a correctness gate unless the release promises that artifact.

### F-015 - Version and release metadata disagree across distributables and update channels

- **Priority:** P2
- **Confidence:** High
- **Category:** Operations
- **Affected components:** Application manifests, Android packaging, extension, Flatpak/F-Droid metadata, release workflow, changelog, architecture/roadmap docs
- **Effort:** M
- **Dependencies:** F-014

#### Evidence

- `package.json:4`, `src-tauri/Cargo.toml:3`, `src-tauri/tauri.conf.json:4`, and `extensions/web-clipper/manifest.json:4` declare `0.1.0`.
- `android/app/build.gradle:10-11` declares `versionCode 1` and `versionName "1.0"`.
- `flatpak/com.leonardschwier.leotheca.metainfo.xml:54-59` declares release `1.0.0` dated 2026-08-27.
- `packaging/f-droid/com.leonardschwier.leotheca.yml:21-38` declares `0.1.0`, version code 1, and builds mutable `main` rather than an immutable tag/commit.
- A `v1.0.0` tag exists, but current development desktop artifacts are named version `0.1.0`; no tag-to-manifest validation is present. Android version code has no automated monotonicity check.
- `CHANGELOG.md:3` contains only `Unreleased`; there is no dated `1.0.0` entry despite the tag and Flatpak release record.
- `.github/workflows/release.yml:241-251` creates every version-tag release as a draft and every main push as a public prerelease. `README.md:53-66` recommends release-based update/install paths while the public release state at review time exposed only the rolling development prerelease.
- `documentation/ARCHITECTURE.md` still says Flatpak has not been test-built and macOS/Windows have no targets, while the audited release run successfully built all three. `ROADMAP.md:59-61` duplicates Canvas and says automation is desktop-only, while `App.tsx:265-270` implements Android URL handling.

#### Observed behavior

Different artifacts report 0.1.0, 1.0, or 1.0.0 for the same product state. A version tag does not prove embedded versions match. A future Android build can reuse version code 1 and be non-upgradeable. F-Droid metadata is non-reproducible against moving `main`. Installation documentation directs ordinary users toward a stable/versioned channel that is not currently public, and architecture/status comments contradict successful builds/current code.

#### Expected behavior

One release version and monotonically increasing Android version code must be propagated to every distributable and validated against immutable release refs. The changelog and user-facing channels must accurately distinguish stable, draft, and development artifacts. `CONSTITUTION.md:99-100` requires accurate release history.

#### Impact

Users and package systems can misidentify builds, fail upgrades, or consume an unreviewed prerelease believing a stable channel exists. Maintainers can tag a release whose binaries embed a different version. Stale docs cause implementation agents to repeat or avoid already-completed work.

#### Trigger or reproduction

1. **Preconditions:** build the audited `main` or push tag `v1.0.0` without changing manifests.
2. **Input/event:** inspect desktop, Android, Flatpak, extension, and F-Droid versions.
3. **Execution path:** each build reads its independent version source; workflow does not compare them.
4. **Actual result:** artifacts/metadata identify the release inconsistently and Android keeps version code 1.
5. **Expected result:** tag, embedded versions, package metadata, changelog, and update channel agree; immutable packaging refs are used.

Manifest/tag/release evidence is directly observed; install/upgrade behavior was not executed.

#### Root cause

Version and release state are duplicated without a canonical source or validation. Documentation is updated manually and workflow comments preserve obsolete assumptions. Stable signing/publishing policy is unresolved, so the tagged channel remains draft while installation docs imply availability.

#### Implementation guidance

1. Choose a canonical release version source. Add a repository script that reads it and validates or updates `package.json`, Cargo/Tauri config, Android `versionName`, extension manifest, Flatpak metadata, F-Droid metadata, and any artifact naming.
2. Define Android version-code generation that is strictly increasing and reproducible. Never derive a lower/reused code from semantic version text without tests.
3. In tag builds, validate `vX.Y.Z` equals every embedded/package version before any build or publish. Fail early on mismatch. Use the immutable tag or full commit in F-Droid metadata.
4. Add a dated changelog entry before stable tagging. Decide whether `v1.0.0` is an actual release, a mistaken tag, or pending draft; correct metadata through a documented maintainer decision rather than silently rewriting published history.
5. Keep `dev-build` visibly prerelease/debug/unsigned. Either publish a reviewed stable channel with the documented signature policy or change README installation/update guidance to state precisely what is available.
6. Refresh `documentation/ARCHITECTURE.md`, `ROADMAP.md`, workflow comments, and packaging READMEs from verified current build status. Remove duplicate Canvas item and reconcile Android automation support.
7. Add CI tests for version consistency, monotonic Android code relative to latest immutable release metadata, changelog entry, and non-moving packaging refs.

#### Required tests

- Add a unit-tested version-validation script under an appropriate existing tooling directory; test equal versions, one mismatched manifest, malformed tag, prerelease version, missing changelog, reused Android code, and mutable F-Droid ref.
- Add the script to CI and release before builds.
- Build representative artifacts and inspect their reported versions.
- Test Android upgrade from the previous release code to the new code on an emulator.
- Add a documentation link/status check for the chosen stable and development channels.

At least the current manifest mismatch and mutable F-Droid ref must fail the new validator before correction.

#### Acceptance criteria

- [ ] All distributables and metadata report one release version.
- [ ] Android version code increases for every published Android release.
- [ ] A mismatched tag cannot build or publish artifacts.
- [ ] Package recipes use immutable source refs.
- [ ] The changelog contains a dated entry for each stable tag.
- [ ] README and architecture/roadmap claims match the actual public channels and successful build targets.
- [ ] Development artifacts remain unmistakably prerelease/debug/unsigned where applicable.

#### Validation commands

1. Run the new repository version-consistency command.
2. `npm test`
3. `npm run lint`
4. `npm run build`
5. `cd src-tauri && cargo test`
6. `npx cap sync android && cd android && ./gradlew testDebugUnitTest assembleDebug`
7. Run workflow validation on a non-publishing test tag/branch and inspect artifact versions.

#### Risks and rollback

Rewriting an existing public tag can break consumers and must not be done casually. Prefer a new corrected tag if `v1.0.0` is already consumed. Version-code mistakes are difficult to reverse after publication; validate against released history before upload. Documentation-only corrections can land independently once the release decision is known.

#### Out of scope

Do not introduce signing secrets, publish a stable release, rewrite tags, or submit package-store metadata without an explicit maintainer release decision.

## 8. Cross-Cutting Inconsistencies

| Concern | Canonical source | Conflicting locations | Current differences | Recommended convergence |
|---|---|---|---|---|
| Workspace identity | Active folder grant/session, per `CONSTITUTION.md` source-of-truth rule | Android `WORKSPACE_ROOT`; path-keyed App effects, tree, links, bookmarks, saves | Distinct desktop folders have distinct paths; every Android folder is `/workspace` | Add explicit session identity/generation and require it at every state/cache/async boundary |
| Workspace containment | User-selected root and settings descriptions | Raw `NamePrompt`, attachments/templates, Tauri path commands, Android URI calls | UI preflight and string joins imply containment; native APIs enforce none | Canonical relative-path/name types plus native capability and ancestry checks |
| Collision semantics | User-facing “already exists” errors in file-tree store | Frontend list checks, `fs::write`, `fs::rename`, Android `findFile` reuse | Frontend promises no overwrite; native operation can overwrite after a race | Native atomic create-new and rename-no-replace with stable error codes |
| Save completion | Tab dirty/saved state | Debounce timer, settings writes, canvas writes, native truncating writes | UI treats promise completion as current durability; writes have no revision/order | One per-session/per-path revisioned coordinator and atomic replacement contract |
| Runtime data contract | Defaults/interfaces in `workspaceSettings.ts`, `globalConfig.ts`, bookmark types | JSON casts and shallow merge | Static types describe valid data; runtime accepts any parsed shape | Explicit decoders, source-status errors, version compatibility, corruption preservation |
| Search memory limit | `SEARCH_BATCH_MAX_BYTES` and comments | Post-add flush, 50 MiB single-file threshold, unknown size zero, all non-images | Documented hard 8 MiB bound is not a bound | One enforced serialized-byte cap, conservative unknown handling, canonical text predicate |
| Async request authority | Link index already uses `latestIndexRequest` | Search has no generation; workspace/session ownership missing broadly | One background subsystem rejects stale results; others publish globally | Reusable session/request-generation pattern across search, index, image/tree/bookmark loads |
| Frontmatter preservation | `ParsedFrontmatter.rawLines` comments and roadmap | Two-bucket serializer and string-only model | Documentation promises original order/verbatim; implementation reorders/retypes | Lossless CST/source-range edits and read-only handling for unsupported structures |
| Canvas file references | Roadmap promise for notes/images/documents | Raw `filePath`, generic text fallback, no schema/base | UI implies broad local-resource support; runtime handles absolute known text/image paths only | Versioned/lossless schema, canonical reference base, typed resource dispatcher |
| Quality gate | `CONTRIBUTING.md` checks and engineering rules | CI omits lint/native Android tests; release independent; no branch rules | Documented contributor obligations exceed enforced repository controls | One reusable same-SHA validation workflow required by branch and release |
| Release version | Intended release tag/version | npm/Cargo/Tauri/extension 0.1.0, Android 1.0, Flatpak 1.0.0, tag v1.0.0 | Independent values can drift and package recipe tracks moving `main` | One canonical version plus validation/update script and immutable packaging ref |
| Platform/status documentation | Current code and successful exact-commit workflows | Architecture/roadmap/workflow comments | Docs say some targets/features are absent/failing despite current builds/code | Update status from verified evidence and add automated consistency checks where possible |

## 9. Suspected or Unverified Concerns

These are not confirmed findings because a supported-platform decision or live runtime was unavailable.

### U-001 - Web clipper may be incompatible with Chromium-family extension APIs

- **Evidence:** `extensions/web-clipper/background.js`, `content.js`, and `popup.js` call the global `browser` API directly; no compatibility shim or `chrome` alias is present. `manifest.json` is Manifest V3 and the repository describes a “compatible browser” without naming a matrix.
- **Missing information:** The officially supported browser list and whether the target browsers inject a `browser` compatibility global.
- **Exact verification step:** Load the unpacked extension from the audited commit in the latest supported Firefox and Chromium browser. Exercise popup capture, keyboard shortcut, content-script selection, download prompt, unsafe-link filtering, empty selection, and error display. Capture console errors and downloaded content.
- **Potential impact if confirmed:** Popup/background/content execution can fail immediately in Chromium, making the extension unusable there.

### U-002 - Ordinary preview links may navigate the embedded webview instead of the system browser

- **Evidence:** `CONSTITUTION.md:38` requires remote links to open in the default browser. `src/editor/MarkdownPreview.tsx:205-223` intercepts wikilinks, but no ordinary-anchor handler or shell-opener dependency/call is visible.
- **Missing information:** Actual Tauri/Capacitor webview navigation policy and any shell-level interception outside repository code.
- **Exact verification step:** On each supported packaged shell, click `https://`, `mailto:`, fragment, relative local, and unsafe-scheme links in preview. Assert remote/mail links open the OS handler, the app stays on its note, fragments work locally, and unsafe schemes do nothing.
- **Potential impact if confirmed:** The application can navigate away from the editor or violate the explicit external-browser contract.

### U-003 - Deep-link “read current note” may expose content through the global clipboard without sufficient consent

- **Evidence:** `src/app/App.tsx:230-240` handles `leotheca://read-current-note` by copying the active note. Android's activity is exported for browsable deep links in `android/app/src/main/AndroidManifest.xml:19-30`. The feature is intentionally local automation, but caller trust/confirmation is not specified.
- **Missing information:** Threat model, desired unattended-automation behavior, OS caller attribution availability, and whether clipboard access indicators/history are considered acceptable.
- **Exact verification step:** From an unrelated local app and browser page, launch the scheme while a sensitive test note is active. Determine whether any caller can cause clipboard population without foreground confirmation and whether the OS exposes the caller. Conduct a product/security decision review before changing behavior.
- **Potential impact if confirmed:** A local origin can cause note content to enter clipboard history or become readable by other local software.

### U-004 - Android stats may perform redundant URI resolution and abort on one file

- **Evidence:** `src/workspace/capacitorBridgeImpl.ts:476-496`, `getWorkspaceStats`, walks entries then reads each synthetic path; unlike other walkers, the returned URI is not clearly reused by the read stage. The desktop implementation skips unreadable files in some aggregate paths.
- **Missing information:** Full provider call counts under current cache population and intended partial-result policy for workspace statistics.
- **Exact verification step:** Instrument a fake/native provider for a 500-file tree, record list/resolve/read calls, inject one unreadable file, and compare Android result/error behavior with desktop.
- **Potential impact if confirmed:** Statistics are unnecessarily slow on SAF or fail entirely because of one inaccessible file.

### U-005 - On-device search memory safety remains unproven after correcting the code-level cap

- **Evidence:** `ROADMAP.md:43-47` explicitly says the latest batching mitigation has not been rerun against the real vault that produced the 288 MiB OOM. F-005 confirms the checked-in mitigation is not a hard cap.
- **Missing information:** Peak Java/native/webview memory and provider behavior with the real vault after a correct bound is implemented.
- **Exact verification step:** Run the same query/vault/device scenario with memory sampling before and after F-005, repeat cold/warm runs, and verify no process death, result correctness, and bounded largest bridge response.
- **Potential impact if confirmed:** Further native streaming or a smaller cap will be required even after the deterministic batching defect is fixed.

## 10. Test and Observability Gaps

Leotheca correctly avoids telemetry. The signals below should therefore be local UI state, development logs, or opt-in diagnostics with no note contents, opaque SAF tokens, or absolute sensitive paths.

### Tests required for known defects

- Equal synthetic root with different Android tokens, store reset ordering, stale async publication, and delayed outgoing writes: F-001.
- Startup hydration with an existing settings file, reversed settings-write completion, write rejection/retry: F-002.
- Reversed autosave completion, dirty close/switch/background, rename while in flight, atomic-write failure: F-003.
- Path/name corpus, native containment, symlink/tree ancestry, create/rename collision races: F-004.
- Strict per-batch byte assertions, unknown/oversized/binary/invalid-UTF-8 search cases, real-device OOM regression: F-005.
- Out-of-order/cleared/workspace-switched searches: F-006.
- Android subtree cache mutation and recreation: F-007.
- Field-by-field runtime JSON validation and corruption preservation: F-008.
- Byte-preserving YAML golden tests: F-009.
- Lossless canvas round trips and cross-platform relative references: F-010.
- Canvas and missing-active session restore: F-011.
- Same-mtime content changes and partial link-index failure: F-012.
- Large graph operation/performance and resize coalescing: F-013.
- Native Android, same-SHA release gate, version/tag consistency: F-014/F-015.

### Preventative coverage

- Add a platform contract suite that runs the same create/read/replace/rename/trash/delete/error cases against desktop and an Android fake/emulator implementation.
- Add property-based or table-driven tests for path normalization, query parsing, runtime decoders, and frontmatter/canvas round trips.
- Add installation/upgrade smoke tests for each advertised artifact, including Android version-code upgrade and URL-scheme dispatch.
- Add browser-extension integration tests for each officially supported browser.
- Add a synchronized-folder scenario matrix: external create/delete/rename, timestamp preservation, permission loss, and simultaneous collision.
- Add workflow consistency validation so documented commands, CI jobs, and release prerequisites cannot drift silently.

### Runtime signals needed to detect failures

- Save state per tab: queued, saving, saved revision, failed, retrying; a local aggregate unsaved count on close/switch.
- Workspace session generation and transition phase in development diagnostics, with token redacted.
- Search request generation, files scanned/read/skipped, skipped reasons, batch count, and largest serialized bytes.
- Link-index status: building, complete/incomplete/stale, failed-file count, cache hit/miss/invalidation counts.
- Graph layout duration/node/edge counts and whether reduced-detail/worker mode was used.
- Release artifact completeness and embedded-version report generated by workflow.

### Diagnostics needed to investigate failures

- Stable typed error codes across both bridges, preserving causal chains without dumping file contents.
- A user-accessible local diagnostic summary that can be copied deliberately, with absolute paths and SAF tokens redacted by default.
- Development-only assertions that stale session/request generations never publish or mutate.
- Failure-injection adapters for delayed/rejected reads/writes and provider collision behavior.
- Documented manual runbooks for Android folder switching, app background/kill, large search, SAF permission revocation, deep links, and artifact installation.

## 11. Prioritized Implementation Roadmap

The ordering below follows dependencies rather than priority alone. Batches are intentionally reviewable and reversible. “Deploy together” means the listed frontend/native contract changes must be present in the same released artifact; it does not require one giant commit.

| Order | Finding IDs | Exact objective | Files/components | Prerequisites | Completion checks |
|---|---|---|---|---|---|
| 1 | F-002 | Stop startup persistence until hydration completes; serialize/coalesce settings writes; expose failure | `src/settings/store.ts`, settings persistence/tests, Settings panel | None; design session-key parameter compatible with F-001 | Startup/deferred/reversed-write tests pass; no write before ready; latest revision durable |
| 2 | F-001 | Introduce explicit workspace session identity and ordered transition/reset APIs | Settings store, App, tree/search, links, bookmarks, Android bridge, tests | Batch 1 queue can capture session | Same-root/different-token tests pass; no stale state/read/write crosses session; deploy together |
| 3 | F-007 | Make Android URI cache session-owned and subtree-safe | `capacitorBridgeImpl.ts`, focused bridge/native tests | Batch 2 session identity | Rename/trash/delete/recreate tests pass; no stale descendant URI |
| 4 | F-003 | Add revisioned single-flight save coordinator, lifecycle drain/error UI, atomic native replace | `App.tsx`, tab store, both bridge implementations/native writers | Batches 1-2; Android provider behavior investigation | Reverse-order, failure, close/switch/rename tests pass; interruption leaves complete file; deploy frontend/native together |
| 5 | F-004 | Enforce validated relative paths, native containment, atomic create-new/no-replace operations | Paths/name/settings/attachments/file tree; Rust and Java native layers | Batches 2 and 4 define session/save contracts; symlink policy decision | Traversal and injected collision tests pass on both platforms; deploy bridge/native together |
| 6 | F-005 | Enforce hard search serialization budget and text-only content reads | Search store, Rust batch read, Android decoder/tests | Native test harness from F-014 may land early | Every batch within cap; malformed/binary skipped consistently; real-vault device run has no OOM |
| 7 | F-006 | Add authoritative search generations and invalidation | Search store, Sidebar, workspace reset | Batch 2 session identity; compatible with batch 6 batching | Out-of-order, clear, progress, and switch tests pass |
| 8 | F-008, F-011 | Decode persisted JSON safely, preserve corrupt source, then correct resource/session restore | Settings/global/bookmark loaders, store restore, tests | Batch 1 hydration; F-004 path validator | Invalid inputs cannot reach consumers; corrupt source not overwritten; canvas and active fallback restore pass |
| 9 | F-009 | Replace lossy editable frontmatter path with lossless or surgical edits | Frontmatter module, Properties panel/tests | Batch 4 save correctness; parser/dependency decision | Golden byte-preservation suite passes; unsupported YAML read-only |
| 10 | F-010 | Define lossless canvas contract and canonical resource references/dispatch | Canvas view/tests, App dispatcher, paths | Batches 4-5; canvas format/base decision | Unknown data preserved; relative refs equivalent on both platforms; unsupported docs explicit |
| 11 | F-012 | Correct link cache freshness, validation, invalidation, and partial-failure state | Link store/cache, tags/graph panels, native metadata | Batches 2 and 4 provide session/save invalidation | Same-mtime/own-save/unreadable-note tests pass; incomplete state visible; large-vault read count measured |
| 12 | F-013 | Measure and bound graph layout; coalesce resize; worker/algorithm if budget requires | Graph layout/view/tests/benchmark | None; can proceed independently after safety-net agreement | Large fixture meets budget; UI responsive on target device; stale result blocked |
| 13 | F-014 | Make one same-SHA validation gate authoritative; add Android native/emulator and dependency checks; protect `main` | Workflows, Android test source, contributor docs, repository settings | Test commands added by prior batches as they land | Canonical checks required; failed validation blocks publish; Android tests execute; branch rules verified |
| 14 | F-015 | Converge versions, immutable release inputs, changelog, public-channel truth, and stale docs | All manifests, release script/workflow, packaging metadata, README/architecture/roadmap | Batch 13 release gate; maintainer release decision | Current mismatch makes validator fail before correction; all artifact versions agree; upgrade test passes |

Safe independent work: F-013 measurement/resize coalescing can proceed independently. The runtime validation decoder design in F-008 can be prepared while persistence work lands, but its writer/migration behavior must wait for F-002. F-014's noncontroversial addition of current `npm run lint` to CI and replacement of Android templates can start early, but release/branch enforcement should require the final canonical job set.

Changes that must deploy together: F-001's frontend session transition and Android bridge identity handling; F-003's coordinator and native atomic-write contract; F-004's frontend path/collision calls and native enforcement; any version/tag release switch in F-015.

### Start Here

**First task: prevent startup settings corruption and establish ordered settings persistence (F-002).**

1. Inspect `src/settings/store.ts`, `src/settings/workspaceSettings.ts`, `src/settings/SettingsPanel.tsx`, `src/settings/store.test.ts`, and `workspaceSettings.test.ts`.
2. Add an explicit loading/ready phase. In `initSettings`, read access and workspace settings into locals, hydrate signals/tabs in one batch, seed the last-persisted tab key, then enable effects.
3. Replace direct concurrent settings saves with a per-workspace single-flight revision queue that coalesces patches and captures the target root/session at enqueue time.
4. On failure, retain dirty state and expose Retry; do not overwrite corrupt/unloaded input with defaults.
5. Add two mandatory regression tests: (a) existing settings cause zero writes before hydration completes, and (b) rapid updates with deliberately reversed underlying completion leave the newest merged value on disk.
6. Run, in order:
   - `npm test -- src/settings/store.test.ts src/settings/workspaceSettings.test.ts src/settings/SettingsPanel.test.tsx`
   - `npm test`
   - `npm run lint`
   - `npm run build`
   - `cd src-tauri && cargo test`
7. Do not change the settings file format, workspace UI, or Android storage mechanism in this first batch.

## 12. Important Existing Behavior to Preserve

- **Offline/local-first boundary:** application code initiates no network requests, has no account, telemetry, proprietary sync, or server dependency. Do not add one to solve local consistency.
- **Plain-file ownership:** Markdown notes and workspace metadata remain user-accessible files in the selected folder. External edits and sync are supported operating conditions, not exceptional misuse.
- **Single platform abstraction:** frontend modules use `src/workspace/tauriBridge.ts`; platform-specific filesystem behavior remains in the two implementations/native layers.
- **SAF permission model:** Android keeps workspace content under the user-selected document tree and persists only the grant token needed to restore access. Never copy the vault into app-private storage to simplify paths.
- **User-visible path namespace:** retaining `/workspace` as an Android display/relative namespace is acceptable once it is no longer used as unique identity.
- **App data split:** the small global pointer remains outside the workspace; notes and per-workspace state stay in the workspace.
- **Safe default deletion:** deletion moves to `<workspace>/.trash` unless the user explicitly selected permanent deletion; collision-avoidance in trash must remain.
- **Best-effort restore:** one externally moved/deleted tab should not prevent other valid tabs from reopening.
- **Latest link-index request authority:** `latestIndexRequest` already prevents an older link scan from replacing a newer one; extend, do not remove, this pattern.
- **Bounded link reads and native recursive walks:** the existing concurrency limit and one-call native traversal address real SAF costs. Correct cache/search bugs without returning to one bridge call per directory/file.
- **Markdown preview sanitization:** keep DOMPurify-based output sanitization and unsafe-link filtering while correcting external-link dispatch.
- **No note contents in diagnostics:** save/search/index observability must remain local and redact note bodies, SAF tokens, and sensitive absolute paths.
- **Cross-platform path normalization:** the Rust boundary's forward-slash normalization supports shared frontend path logic; containment changes must preserve it.
- **Development versus stable distinction:** rolling `dev-build` remains plainly prerelease/debug/unsigned where applicable. Do not relabel it as stable.
- **Focused tests and reproducible locks:** retain npm/Cargo lockfiles, `npm ci`, deterministic pure tests, and real temp-directory Rust tests.
- **Single-instance/deep-link behavior:** current local automation relies on single-instance forwarding; security clarification must not casually remove supported commands.

## 13. Open Questions and Review Limitations

| Question or limitation | Why it matters | Who or what can answer it | Safest default until answered |
|---|---|---|---|
| Should workspace-relative paths be allowed to traverse symlinks that point outside the selected root? | Determines F-004 canonical containment and compatibility with linked folders | Maintainer/product decision plus existing user reports; platform tests | Reject resolved targets outside the canonical root; preserve read-only visibility only if explicitly approved |
| What is the canonical base for a relative canvas `filePath` and is an external JSON-canvas standard intended? | Determines interoperability and whether current files can be losslessly upgraded | Product/format documentation, sample user canvases, maintainer | Treat current minimal shape as version 0, preserve unknown data, resolve relative to the canvas directory only after explicit confirmation |
| Which non-Markdown text extensions are officially content-searchable/openable? | F-005 needs a text predicate without silently reducing supported behavior | Product documentation and representative vault corpus | Search Markdown and explicitly documented plain-text types; keep all other files name/path-searchable only |
| Is unattended `read-current-note` clipboard automation an intentional privacy tradeoff? | Controls whether deep links require foreground/confirmation/caller restrictions | Maintainer threat-model decision and OS capability review | Require foreground user confirmation for note-content export; keep non-content commands unchanged |
| Which browsers are supported by the Web clipper? | Determines whether direct `browser` API use is correct | README/product decision and live extension tests | Claim only browsers that pass the integration matrix; do not add broad compatibility claims |
| What constitutes a stable public release, and is existing `v1.0.0` authoritative? | Required before correcting versions, changelog, README, and update channels | Maintainer/release owner and public release history | Do not rewrite the tag or publish new stable artifacts; keep development channel clearly prerelease |
| What SAF providers/devices are supported for atomic replace and no-overwrite rename? | Android provider semantics decide F-003/F-004 implementation and fallback behavior | Emulator/provider matrix plus physical-device tests | Prefer fail-closed typed errors over silently truncating/replacing when guarantees are unavailable |
| What UI latency/memory budget defines acceptable 500-note search/graph behavior? | Needed for binary acceptance of F-005/F-013 beyond “does not crash” | Maintainer with representative low-end Android device and real vault | Use hard serialization bounds immediately; keep graph responsive with filtering/reduced detail while measurement is gathered |
| No local checkout was available | Prevented direct working-tree status, local lint, instrumentation, and failure injection | A future audit/implementation checkout at the pinned commit | Treat current workflow success as baseline only; rerun every listed command before and after implementation |
| No physical device, emulator, desktop GUI, or browser host was available | Leaves OS lifecycle, SAF provider, deep-link, external-link, extension, installation, and real-memory behavior unverified | Target-platform validation in implementation/release work | Keep these items unconfirmed and require the exact manual/integration steps above before release claims |
| Generated, binary, and third-party code was not source-audited | Such content can still contain defects outside repository-owned integration | Upstream audits and reproducible generation tooling | Regenerate through pinned repository processes; review diffs and scan dependencies in F-014 |

### Audit quality gate

- Every confirmed finding above names exact paths, symbols/ranges, an observed/expected contract, impact, root cause, deterministic trigger, concrete dependency-ordered implementation steps, required regression tests, binary acceptance criteria, validation commands, rollback risks, and out-of-scope boundaries.
- No P0 finding was supported by the repository evidence. Every P1 has a strong deterministic trace and is marked Medium, not High, because native/lifecycle reproduction was unavailable.
- Repeated symptoms were consolidated by root cause: workspace identity, persistence ordering, mutation contract, search memory, runtime schemas, lossy formats, cache freshness, graph complexity, and release governance.
- Baseline successes are reported as exact-commit workflow evidence, not attributed to this audit. Missing commands are called unavailable rather than failed.
- No secret value was found or included. The Android test token in fixtures is non-production dummy data; opaque SAF tokens are discussed only by type.
- No application source, test, configuration, dependency, lockfile, migration, generated file, or asset was modified by the audit. This report is the sole repository file created.

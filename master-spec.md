# Leotheca master specification

| Field | Value |
| --- | --- |
| Status | Living specification of the current application |
| Application version described | 1.0.0 (`VERSION`) |
| First written | 2026-11-06, from the code on `main` |
| Normative language | MUST, MUST NOT, SHOULD, SHOULD NOT, MAY as defined in RFC 2119 and RFC 8174 |
| Update rule | See `CONSTITUTION.md`, "Master specification rule", and `skills/master-spec-maintenance.md` |

This document describes what the application does today, so that a competent team or agent can rebuild it without the source. It is derived from reading the code. Where older documents disagree with the code, the code wins and the disagreement is listed in [section 17](#17-document-discrepancies).

**How to read verification labels.**

- A requirement's *Test* column names the file that covers it. A link was accepted only after searching that file for the behavior's identifier or keyword. Not every individual test case was read, so a link means "this file exercises this behavior", not "every clause of the requirement is asserted".
- `NONE` means no automated coverage was confirmed. It is not a claim that the behavior is broken.
- **Traced** means confirmed by reading code paths. **Observed** means run during the pass that wrote this document. **Unverified** means neither.
- Rust tests live in `#[cfg(test)]` modules inside the named `.rs` file.

## Table of contents

1. [Purpose and non-goals](#1-purpose-and-non-goals)
2. [Product principles and hard constraints](#2-product-principles-and-hard-constraints)
3. [Glossary](#3-glossary)
4. [Personas and platform matrix](#4-personas-and-platform-matrix)
5. [System architecture and module boundaries](#5-system-architecture-and-module-boundaries)
6. [Data model and on-disk formats](#6-data-model-and-on-disk-formats)
7. [Bridge contract](#7-bridge-contract)
8. [Functional requirements](#8-functional-requirements)
9. [UI specification](#9-ui-specification)
10. [Non-functional requirements](#10-non-functional-requirements)
11. [Build, packaging and release](#11-build-packaging-and-release)
12. [Test strategy](#12-test-strategy)
13. [Rebuild order](#13-rebuild-order)
14. [Traceability](#14-traceability)
15. [Coverage gaps](#15-coverage-gaps)
16. [Known gaps and defects](#16-known-gaps-and-defects)
17. [Document discrepancies](#17-document-discrepancies)
18. [Change log](#18-change-log)

## 1. Purpose and non-goals

Leotheca is a free, MIT-licensed, offline Markdown viewer and editor. Notes are plain files in a folder the user owns. One TypeScript frontend runs inside two native shells: Tauri (Rust) on desktop and Capacitor (Java) on Android.

**Goals.** Edit and read Markdown with wikilinks, frontmatter, tags, tasks, outline, graph, canvas, ink drawing and PDF annotation, all from local files. Keep every piece of user data readable without this application.

**Non-goals**, each enforced by product rules:

- No account, hosted sync, paid tier, proprietary storage or lock-in.
- No telemetry, analytics, crash reporting, update checks or feature-flag fetches.
- No AI or LLM features, local or remote.
- No encryption or key management, and no execution of third-party plugin code. Both are unauthorized deferred capabilities.
- Sync is out of scope. External tools may sync the folder, so the app must tolerate files changing beneath it.

## 2. Product principles and hard constraints

Principles, in priority order (`PHILOSOPHY.md`): free and open source without compromise; standing on existing conventions rather than inventing formats; a user's notes belong to the user.

| ID | Hard constraint |
| --- | --- |
| HC-01 | The running app MUST NOT initiate network requests. A deliberate external link may open the user's browser. |
| HC-02 | All fonts, scripts and assets MUST be bundled. Remote embedded images MUST NOT load. |
| HC-03 | The Android main manifest MUST NOT request `INTERNET`. |
| HC-04 | Notes MUST stay plain Markdown. App data lives in plain JSON under `.leotheca/` or in the app config directory. |
| HC-05 | Corrupt or future-version data MUST remain recoverable and MUST NOT be silently overwritten. |
| HC-06 | Markdown, persisted data, file paths and IPC input MUST be treated as untrusted. |
| HC-07 | Any feature queued through a competitor scan MUST have a setting to turn it off. |
| HC-08 | Dependencies MUST be license-compatible and free of undeclared proprietary blobs, and source builds reproducible. |
| HC-09 | Competitor names MUST NOT appear in code, comments, commits or docs; use "Market Solution #1/#2". |

## 3. Glossary

| Term | Meaning |
| --- | --- |
| Workspace | One user-selected folder. Also called vault in some UI text. |
| Profile | A catalog entry in global config pointing at a workspace. |
| Workspace session | Monotonic counter (`workspaceSession`) distinguishing workspace openings. Needed because every Android workspace shares the same synthetic path. |
| Synthetic root | The constant path `/workspace` that stands for the granted SAF tree on Android. |
| Token | On Android, the persistable tree URI of a workspace. Unused on desktop. |
| SAF | Android Storage Access Framework. |
| Note | A Markdown file, normally `.md`. |
| Wikilink | `[[target#fragment\|label]]`. |
| Embed | `![[target]]`, expanded in preview. |
| Block id | Marker `^id` naming a block. |
| Tab kind | `text`, `image`, `canvas`, `ink` or `pdf`. |
| Editor group | `primary` or `secondary` split pane. |
| Link index | In-memory metadata built by reading notes: backlinks, names, aliases, tags, tasks. |
| Save coordinator | Debounced, revision-ordered note writer. |
| Workspace transition | The staged switch from one workspace to another. |
| Containment | The check that a path stays inside the allowed root after resolving symlinks. |

## 4. Personas and platform matrix

| Persona | Need |
| --- | --- |
| Local-first note taker | Owns a folder of Markdown, may sync it with an external tool. |
| Mobile capturer | Saves shared text and images on Android, uses home-screen widgets. |
| Automator | Drives the app from scripts through `leotheca://` URLs. |
| Reader and annotator | Reads Markdown and annotates PDFs in place. |

| Capability | Linux | macOS | Windows | Android (API 29+) |
| --- | --- | --- | --- | --- |
| Shell | Tauri 2 | Tauri 2 | Tauri 2 | Capacitor 7 |
| File access | Native filesystem | Native filesystem | Native filesystem | SAF through `FolderAccess` |
| Workspace path | Real absolute | Real absolute | Real absolute, `/` separators | `/workspace` plus URI token |
| Local image source | asset protocol | asset protocol | asset protocol | `data:` URL |
| Atomic overwrite | Yes, temp and rename | Yes | Yes | Not atomic (provider stream) |
| No-replace rename | `renameat2` | `renamex_np` | `MoveFileExW` flags 0 | Provider rename, checked |
| Print | Webview print | Webview print | Webview print | `PrintExport` plugin |
| HTML export | Save dialog command | Save dialog command | Save dialog command | `PrintExport` plugin |
| OS file open | argv, single instance | `RunEvent::Opened` | argv, single instance | No-op on this path |
| Share target, widgets | No-op | No-op | No-op | Yes |
| Speech | Unavailable, see KG-002 | Unavailable | Unavailable | Platform recognizer |
| Channels | AppImage, Flatpak | Homebrew Cask (draft) | Repository release | F-Droid, Obtainium |

Only Linux CI builds and launches a desktop artifact as a smoke test. macOS and Windows artifacts are built in the release workflow. Physical-device behavior was not verified while writing this document.

## 5. System architecture and module boundaries

```
           Shared frontend: src/ (Preact, @preact/signals, CodeMirror 6)
                                 |
                  src/workspace/tauriBridge.ts  (dispatcher)
                 /                                         \
   tauriBridgeImpl.ts                             capacitorBridgeImpl.ts
   invoke() -> src-tauri/src/*.rs                 registerPlugin -> android/.../*.java
```

**Rules.**

- Components and stores MUST import storage through `workspace/tauriBridge.ts`. Only this module picks an implementation, using `Capacitor.isNativePlatform()`. A small number of desktop-only helpers are imported directly from `tauriBridgeImpl.ts`.
- There is one authoritative parser per concept. New features reuse `markdown/*`, `linking/wikiSyntax.ts` and `linking/store.ts`.
- All bridge calls are tracked so `drainWorkspaceOperations()` can await them during a workspace transition.

| Module | Responsibility |
| --- | --- |
| `src/main.tsx`, `src/app/` | Entry point, `App.tsx` shell and commands, palette, capture sheet, layout (`ActivityRail`, `DocumentHeader`, `Inspector`), automation parsing, shortcuts. |
| `src/workspace/` | Bridges, path math, file tree, search, save coordinator, document store, editor group layout, transition coordinator. |
| `src/settings/` | Decoders, workspace settings, global config, profiles, settings UI, custom CSS, default-handler contract. |
| `src/editor/` | CodeMirror editor, preview, live preview, attachments, frontmatter editing, slash commands, snippets, text direction. |
| `src/markdown/` | Scanners and renderers for headings, blocks, tasks, tables, highlights, Mermaid. |
| `src/linking/` | Wikilink syntax, resolver, frontmatter parsing, link index, backlinks. |
| `src/refactor/` | Rename planning, execution, metadata migration, folder plans, preview dialog. |
| `src/diagnostics/` | Link classification, health audit, panel. |
| `src/capture/` | Quick capture destinations, commit, pending queue, Android share. |
| `src/collections/` | Smart collection schema, decoding, evaluation, builder, views. |
| `src/tasks/`, `src/tags/`, `src/bookmarks/`, `src/outline/` | Feature panels over the link index or the active note. |
| `src/graph/`, `src/canvas/`, `src/ink/`, `src/pdf/` | Non-text surfaces. |
| `src/editorGroups/` | Split pane UI and per-document view state. |
| `src/export/` | Print and HTML export. |
| `src/speech/`, `src/spellcheck/` | Optional input aids. |
| `src/ui/` | The Android back button wiring, `overlayBackButton` (Capacitor back button wired into Leoforma's overlay stack); no UI component lives here any more. `Button`, `IconButton`, `Dialog`, `Sheet`, `StatusIndicator`, `EmptyState`, `Icon` and its 28 icons, `Menu`, `Tooltip`, `SegmentedControl`, `Spinner` and the overlay stack come from `@leonardschwier/leoforma`. |
| `src/styles/theme.css` | Maps the app's token names onto Leoforma's `--ds-*` tokens; keeps highlight, mark, accent-choice, reading-font and zoom variables. |
| `src-tauri/src/` | `commands.rs`, `workspace_mutations.rs`, `external_open.rs`, `default_handler.rs`, `speech_commands.rs`, `lib.rs`. |
| `android/app/src/main/java/.../` | `MainActivity`, `FolderAccessPlugin`, `WorkspaceMutationPlugin`, `PrintExportPlugin`, `SpeechRecognitionPlugin`, `CaptureIntentHandler`, widget providers. |
| `extensions/web-clipper/` | Standalone WebExtension for Chrome and Firefox (Manifest V3, install notes in its README). It does not communicate with the app. |

**Startup sequence (Traced).**

1. `App` calls `initSettings()`, which loads global config, then restores the active profile.
2. `restoreWorkspaceAccess(path, token)` sets the native root. `null` is sent first so a failed restore leaves no root authorized.
3. Workspace settings load and apply; `viewMode` takes `defaultViewMode`; tabs restore from `editorLayout`.
4. `settingsLoaded` becomes true whether or not this succeeded. Automation commands await it through `waitForSettingsLoaded()`.
5. Pending external files, deep links and Android share data are consumed.

**Desktop process setup.** `main.rs` sets `WEBKIT_DISABLE_WEBGL`, `WEBKIT_DISABLE_COMPOSITING_MODE` and `WEBKIT_DISABLE_GPU` to `1` before launching. The window is titled Leotheca, 1200x800, minimum 720x480. Plugins are single-instance (desktop), dialog, fs, deep-link and clipboard-manager. Release builds use `panic = "abort"`, LTO, one codegen unit, `opt-level = "s"` and stripping.

## 6. Data model and on-disk formats

### 6.1 Workspace layout

```
<workspace>/
  *.md, folders, attachments, *.canvas, *.ink, *.pdf     user files
  Templates/                                             default templatesFolder
  .leotheca/
    settings.json                                        workspace settings
    bookmarks.json                                       bookmarks
    collections.json                                     smart collections
    link-index-cache.json                                rebuildable cache
    custom.css                                           optional, default customCssPath
    dictionary.aff, dictionary.dic                       optional, user supplied
  .trash/                                                project trash
```

Entries starting with `.` are hidden from the tree, search and statistics on both platforms, so `.leotheca` and `.trash` are never indexed. The workspace MUST remain usable if `.leotheca/` is deleted: settings fall back to defaults and the cache rebuilds. Bookmarks and collections are lost in that case.

App-level data lives outside the workspace:

| Item | Desktop | Android |
| --- | --- | --- |
| `config.json` | Tauri `appConfigDir()` | `/leotheca-appdata/config.json`, under `Directory.Data` |
| Pending captures | `localStorage` `leotheca-pending-captures` | Same |
| Widget data | None | SharedPreferences `LeothecaWidgetData` |
| Pending share | None | SharedPreferences, read by `getPendingShareData` |

### 6.2 Workspace settings: `.leotheca/settings.json`

UTF-8, pretty-printed with 2 spaces. `version` is 1 by default, or 2 once a legacy tab list has migrated. Unknown keys MUST be preserved. Defaults and validation:

| Key | Type | Default | Validation |
| --- | --- | --- | --- |
| `version` | 1 or 2 | 1 | Other value sets corrupt; the value is kept in memory |
| `sortOrder` | enum | `name-asc` | `name-asc`, `name-desc`, `modified-desc` |
| `searchSortMode` | enum | `relevance` | `relevance`, `name`, `modified` |
| `fontSize` | number | 15 | 12 to 24 |
| `defaultViewMode` | enum | `source` | `source`, `split`, `preview` |
| `deleteBehavior` | enum | `project-trash` | `project-trash`, `permanent` |
| `lastOpenPaths` | string[] | `[]` | Entries outside workspace dropped and corrupt set |
| `lastActivePath` | string or null | null | Outside workspace becomes null and corrupt |
| `editorLayout` | object | one empty primary group | See 6.3 |
| `uiZoom` | number | 100 | 50 to 200 |
| `frontmatterAliasesEnabled` | boolean | true | |
| `mathRenderingEnabled` | boolean | true | |
| `mermaidRenderingEnabled` | boolean | true | Decoded for corruption only; see KG-005 |
| `pasteImagesEnabled` | boolean | true | |
| `attachmentsFolder` | relative folder | `""` | No absolute path or `..` |
| `frontmatterPropertiesEnabled` | boolean | true | |
| `graphColorGroups` | array | `[]` | `{id, query, color}`, nonempty id, `#RRGGBB`; bad entries dropped |
| `tagsEnabled` | boolean | true | |
| `templatesEnabled` | boolean | true | |
| `templatesFolder` | relative folder | `Templates` | As `attachmentsFolder` |
| `canvasEnabled` | boolean | true | |
| `themesEnabled` | boolean | true | |
| `accentColor` | enum | `warm` | `warm`, `ocean`, `forest`, `plum` |
| `readingFont` | enum | `sans` | `sans`, `serif`, `mono` |
| `snippetsEnabled` | boolean | true | |
| `snippets` | string | `todo<TAB>- [ ] ` | One `trigger<TAB>replacement` per line |
| `headingLinksEnabled` | boolean | true | |
| `markdownImportEnabled` | boolean | true | Offers the "Import Markdown vault..." command (desktop). |
| `collectionsEnabled` | boolean | false | |
| `rtlWorkspaceEnabled` | boolean | false | |
| `speechToTextEnabled` | boolean | false | |
| `spellcheckEnabled` | boolean | false | |
| `captureInboxFolder` | relative folder | `""` | As `attachmentsFolder` |
| `captureInboxNote` | string | `Inbox.md` | |
| `captureDatePattern` | string or null | `""` | |
| `customCssEnabled` | boolean | false | |
| `customCssPath` | relative path | `.leotheca/custom.css` | As `attachmentsFolder` |

**Corrupt-data rules.**

- Missing file: defaults, not corrupt.
- Invalid JSON or a non-object root: defaults, corrupt.
- A missing key is not corruption. A present key of the wrong shape uses the default for that key and sets corrupt.
- While corrupt, the file MUST NOT be replaced until the user chooses **Rewrite settings file**.

### 6.3 Editor layout

```ts
{ activeGroupId: "primary"|"secondary", splitEnabled: boolean,
  preferredRatio: number /* 0.30..0.70 */, compactVisibleGroupId: "primary"|"secondary",
  groups: { primary: Group, secondary?: Group } }
Group = { id, tabPaths: string[], pinnedPaths: string[], activePath: string|null,
          viewMode: "source"|"split"|"preview" }
```

A layout is valid only if: no path has NUL, `..` or a backslash, or is empty; an absolute path stays in the workspace; a path appears in only one group; pinned paths are a subset of that group's tabs; `activePath` is a member of `tabPaths`, or null when empty; and a `secondary` reference has a `secondary` group. A missing `viewMode` becomes `source` for primary and `preview` for secondary.

**Migration.** When `editorLayout` is absent and `lastOpenPaths` is an array or `lastActivePath` is present, the file is legacy. Paths dedupe in order; the active path is `lastActivePath` if it is present in the list, else the last path. The result is one primary group with `viewMode: source` and file `version` 2.

An invalid `editorLayout` on a non-legacy file falls back to the default layout and sets corrupt.

### 6.4 Global config: `config.json`

```ts
{ version: 2, theme: "system"|"light"|"dark", activeWorkspaceId: string|null,
  workspaceProfiles: Profile[], lastWorkspacePath: string|null,
  workspaceToken?: string, externalFileOpenEnabled: boolean /* default true */ }
Profile = { id, name, icon, path, token?, lastOpenedAt }
```

Icons shown are `folder`, `book`, `journal`, `briefcase`, `school`, `code`, `home`, `archive`. An unknown icon string is preserved and displayed as `folder`.

**Migration from v1.** When there is no v2 catalog and `lastWorkspacePath` is set, one profile is created with a random UUID, the basename as name (`Workspace` for `/workspace`), `lastWorkspacePath`, and `workspaceToken` as token, and it becomes active. Invalid profiles are dropped and corrupt is set. Unknown keys are preserved. Corrupt config is only replaced by the **Rewrite app configuration** action.

### 6.5 Bookmarks: `.leotheca/bookmarks.json`

An unversioned JSON array:

```ts
{ id, kind: "file", label, path } | { id, kind: "search", label, query }
```

Paths are workspace-absolute in the platform's own form. Invalid entries are dropped in memory and set corrupt; invalid JSON or a non-array root yields an empty list and corrupt.

### 6.6 Collections: `.leotheca/collections.json`

```ts
{ version: 1, collections: SmartCollection[], order: string[] }
SmartCollection = { id, name, description?, query: Node, view: View, sort: Sort[], createdAt, updatedAt }
Node = { type: "group", operator: "and"|"or", children: Node[] }
     | { type: "clause", field: Field, operator: Op, value?: Value }
Field = { kind: "system", field: "name"|"path"|"folder"|"tag"|"modified"|"hasFrontmatter" }
      | { kind: "property", key: string }
Value = { type: "string"|"date"|"datetime"|"path", value: string } | { type: "number", value: number }
      | { type: "boolean", value: boolean } | { type: "string-list", value: string[] }
View  = { mode: "list"|"table"|"card"|"kanban", groupBy?, groupOrder?, filters?, columns?, fields? }
Sort  = { field: { kind: "system", field: "name"|"path"|"folder"|"modified" } | { kind: "property", key },
          direction: "asc"|"desc", missing: "first"|"last" }
```

`kanban` requires `groupBy`. Operators are `is`, `is-not`, `contains`, `does-not-contain`, `starts-with`, `ends-with`, `exists`, `does-not-exist`, `equals`, `does-not-equal`, `greater-than`, `greater-than-or-equal`, `less-than`, `less-than-or-equal`, `is-true`, `is-false`, `before`, `on-or-before`, `after`, `on-or-after`, `contains-item`, `contains-all-items`, `contains-any-item`, `contains-no-item`, `is-empty`, `is-not-empty`, `is-under-folder`, `is-not-under-folder`, `contains-segment`. Limits are 3 nested levels and 100 clauses. An empty AND group matches every note. An unrecognized version sets corrupt, and unknown fields are retained in `unknown`.

### 6.7 Link index cache: `.leotheca/link-index-cache.json`

`{ version: 8, entries: { [path]: { mtime, size?, wikilinks, ... } } }`. This file is a rebuildable cache: read failures and version mismatches MUST fall back to re-reading notes, and write failures are ignored. A cache hit requires equal `mtime` and `size`. A missing size is a miss. Notes themselves MUST NOT be cached in a way that goes stale.

### 6.8 Frontmatter

A note has frontmatter when it begins with `---` newline, a body, and a closing `---` line, matching `/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/`. Parsing is a line-based subset, not full YAML:

- Top-level keys match `[A-Za-z0-9_.-]+:`.
- Values are scalars, inline lists `[a, b]`, or block lists of `- item`.
- Double-quoted values unescape `\"` and `\\`; single quotes strip only.
- Unparsed lines are retained and MUST NOT be lost by a property edit.
- Recognized keys are `aliases` and `tags`. All others are displayed as properties.

### 6.9 Link and block syntax

```
[[Note]]  [[Note|Label]]  [[Note#Heading]]  [[Note#^block-id]]  [[#Heading]]  ![[Note]]
```

- Escapes: backslash before `\ # | [ ]`.
- The first unescaped `|` starts the label. The first unescaped `#` before it starts the fragment.
- A fragment beginning `^` is a block reference; anything else is a heading.
- `[[]]` is not a link. An unterminated `[[` is ignored.
- Block markers are ` ^id` at the end of a block's last line, or a standalone `^id` line. `id` matches `[A-Za-z0-9][A-Za-z0-9-]{0,63}`.
- Heading matching uses a normalized key: case-folded with whitespace collapsed. Duplicates are numbered by occurrence.
- Resolution statuses are `resolved` (optionally `legacyFallback`), `missing-note`, `missing-fragment`, `ambiguous-fragment`, `malformed`.
- A hyphen inside a tag is allowed. Tags match `#` then `[\p{L}\p{N}_][\p{L}\p{N}_-]*` with optional `/` segments.

Tasks match `^( *)([-*+])([ \t]+)\[([ xX])\](?:([ \t]+)(.*)|())$`.

### 6.10 Trash

Project trash is `<workspace>/.trash/` and mirrors the original relative path. Collisions use `<epoch-ms>-<name>`. There is no restore UI and no automatic purge. **Traced.**

### 6.11 Canvas: `*.canvas`

JSON `{ version?: 1, nodes: Node[], edges: Edge[] }`. `Node` has `id` (non-empty), `text`, numeric `x` and `y`, optional `filePath`. `Edge` is `{from, to}`. Records that do not validate but are objects are retained and re-emitted. `decodeCanvas` returns `null` only for unparseable JSON, a non-object root, or non-array `nodes`/`edges`. A new document writes `version: 1`; a file with an existing `version` keeps it.

### 6.12 Ink: `*.ink`

JSON `{ version: 1, strokes: Stroke[], viewport: {x, y, zoom} }`, viewport default `{0, 0, 1}`. Points have finite `x`, `y`, `pressure` in 0..1 and tilt in -90..90. Unknown strokes and extra fields are retained. A `version` in the file is preserved.

### 6.13 PDF annotations

Annotations are written into the PDF using `pdf-lib`: markup subtypes highlight, underline and strikeout using QuadPoints; plus ink, sticky notes and shapes. There is no sidecar file. Annotations are standard PDF objects, so other readers can show them (Unverified against specific third-party readers).

### 6.14 Pending captures

`localStorage` key `leotheca-pending-captures`, a JSON array of `{ id, receivedAt, source: "in-app"|"deep-link"|"android-share", text, title?, sourceUrl?, mode, targetNote?, targetFolder?, targetProfileId?, openAfterCommit?, status: "pending"|"retrying"|"failed", lastError?, attachments? }`.

## 7. Bridge contract

### 7.1 Path trust

Two gates exist on desktop:

- **Unscoped gate** `check_unscoped_path_allowed`: the target, after resolving its nearest existing ancestor and any symlink, MUST be inside the `ActiveWorkspaceRoot` set by `set_active_workspace_root`, or inside the app config directory. `set_active_workspace_root` accepts a root only when it resolves (canonical path) to an entry of the native workspace grant registry.
- **Scoped gate** `resolve_within_workspace(root, relative)`: rejects empty, absolute, root or prefix components and any `..`, then resolves against the canonical `root`, including a final symlink.

The scoped gate takes `workspace_root` from the frontend and does not compare it with `ActiveWorkspaceRoot`. See KG-001.

`set_active_workspace_root` also swaps asset protocol scope: `forbid_directory` on the old root and `allow_directory` on the new root. Static scope is `[]`.

**Workspace grant registry** (`src-tauri/src/workspace_grants.rs`, file `<app_data_dir>/workspace-grants.json`, `{ "version": 1, "roots": [canonical paths] }`). A root enters it only through the native `pick_workspace_folder` command (folder dialog plus registration in one Rust call) or a one-time seed, performed only when the registry file does not exist, from the legacy `config.json` in the app config dir (every `workspaceProfiles[].path` and `lastWorkspacePath` that is an absolute, existing directory). A corrupt registry file loads empty and is not reseeded. The app data dir is not on the unscoped allow-list, so the webview has no command that edits the registry. Android is unaffected.

Android has no path gate natively. `capacitorBridgeImpl.ts` only derives URIs from a listing that begins at the granted tree, and refuses non-`/workspace` paths for listing. Native methods accept any URI string and rely on the OS grant. Treat this as an OS boundary, not an allow-list. See KG-003.

### 7.2 Tauri commands

All return `Result<T, String>` unless noted. `FsEntry` is `{ name, path, isDir, mtime? (ms), size? }`. JS argument names are camelCase.

| Command | Input | Output | Gate | Errors and notes |
| --- | --- | --- | --- | --- |
| `pick_workspace_folder` | none | `string\|null` | Native dialog | Async. Returns the canonical granted folder path, `null` when cancelled. Registers the folder in the grant registry. |
| `set_active_workspace_root` | `path: string\|null` | `()` | Sets the gate | Error when `path` is not a granted root (state and asset scope unchanged). `null` always clears. Poisoned mutex error. Asset scope errors ignored. |
| `list_dir` | `path, workspaceRoot` | `FsEntry[]` | `path` and `workspaceRoot` must both lie inside the active workspace or the app config dir (checked natively against `ActiveWorkspaceRoot`); canonical start with `workspaceRoot` | Dirs then files, case-folded name order, no dotfiles, no escaping symlinks. |
| `find_markdown_files` | `path` | `FsEntry[]` with size | Unscoped | Depth 40, `.md` case-insensitive. |
| `find_all_files` | `path` | `FsEntry[]` with size | Unscoped | Files only. |
| `find_all_entries` | `path` | `FsEntry[]` | Unscoped | Directories included. |
| `workspace_stats` | `path` | `WorkspaceStats` | Unscoped | `folderCount, noteCount, imageCount, averageLinesPerNote, oldestNoteDate?, newestNoteDate?` (seconds). |
| `read_text_file` | `path` | `string` | Unscoped | Rejects non-UTF-8. |
| `read_binary_file` | `path` | `number[]` | Unscoped | |
| `read_text_files_batch` | `paths[]` | `(string\|null)[]` | Unscoped per path | Not a Result; failures are null. |
| `write_text_file` | `path, contents` | `()` | Unscoped | Creates parents, atomic. |
| `write_binary_file` | `path, data: number[]` | `()` | Unscoped | Creates parents, atomic. |
| `create_dir` | `path` | `()` | Unscoped | `create_dir_all`. |
| `rename_path` | `from, to` | `()` | Unscoped, both | Replaces per OS `rename`. |
| `delete_path_permanent` | `path` | `()` | Unscoped | Recursive for directories. |
| `trash_path` | `workspaceRoot, path` | `()` | Scoped | See 6.10. |
| `write_workspace_text_file` | `workspaceRoot, relativePath, contents` | `()` | Scoped | Overwrite, atomic. |
| `write_workspace_binary_file` | `workspaceRoot, relativePath, data` | `()` | Scoped | Overwrite, atomic. |
| `create_workspace_dir` | `workspaceRoot, relativePath` | `()` | Scoped | |
| `rename_workspace_path` | `workspaceRoot, from, to` | `()` | Scoped, both | Creates target parents. May replace. |
| `delete_workspace_path_permanent` | `workspaceRoot, relativePath` | `()` | Scoped | |
| `create_workspace_text_file_new` | `workspaceRoot, relativePath, contents` | `()` | Scoped, coded | `create_new`; removes partial on failure. |
| `create_workspace_binary_file_new` | `workspaceRoot, relativePath, data` | `()` | Scoped, coded | As above. |
| `create_workspace_dir_new` | `workspaceRoot, relativePath` | `()` | Scoped, coded | Target must not exist. |
| `rename_workspace_path_no_replace` | `workspaceRoot, from, to` | `()` | Scoped, coded | OS-level no-replace. |
| `export_text_file_via_dialog` | `defaultFileName, contents` | `boolean` | User picks | `false` on cancel. HTML filter. |
| `import_markdown_vault` | `targetFolder` | `ImportReport\|null` | User picks source; target scoped | Native folder dialog supplies the source (never the webview). `null` on cancel. Emits `markdown-import-progress`. Desktop only; other platforms return an error. |
| `cancel_markdown_import` | none | `()` | none | Sets the cancel flag of the running import. |
| `take_pending_open_file` | none | `{path, content}\|null` | Consume once | Not a Result. |
| `pick_and_read_external_markdown_file` | none | `{path, content}\|null` | User picks | `.md` filter. |
| `detect_platform` | `userAgent` | `Platform` | None | Pure. |
| `default_handler_for_platform` | `platform` | Contract | None | Pure. |
| `init_speech_recognition` | `model` (`tiny`, `base`, `small`, `medium`) | `()` | Name allow-list; the file is `<app_data_dir>/whisper-models/ggml-<model>.bin`, a path is refused | See KG-002. |
| `transcribe_audio` | `audioData: f32[], language?` | `string` | None | Empty audio gives `""`. See KG-002. |
| `get_speech_status` | none | Status | None | See KG-002. |
| `get_whisper_models` | none | `WhisperModelInfo[]` | None | tiny 39, base 75, small 244, medium 769 MB. |
| `check_whisper_models` | none | `WhisperModelFile[]` | Fixed directory `<app_data_dir>/whisper-models` | Existence probe for `ggml-*.bin`. |

Event: `open-external-file` carrying `{path, content}`.

**Coded mutation errors.** Native strings have the form `code: message`, where `code` is one of `invalid_name`, `outside_workspace`, `already_exists`, `permission_denied`, `io_failure`. `tauriBridge.ts` normalizes them to `WorkspaceMutationError`. Uncoded failures become `io_failure`.

### 7.3 Capacitor plugins

Registered in `MainActivity`: `WorkspaceMutationPlugin` (subclass of `FolderAccessPlugin`, exposed under the plugin name `FolderAccess`), `PrintExportPlugin`, `SpeechRecognitionPlugin`. Rejections are `call.reject(message)`, with a coded prefix for no-replace mutations.

**`FolderAccess`**

| Method | Input | Output | Notes |
| --- | --- | --- | --- |
| `pickFolder` | none | `{uri\|null, name?}` | Takes a persistable read and write grant. Null on cancel. |
| `listDir` | `{uri}` | `{entries:[{name,uri,isDir,mtime?}]}` | Rejects non-directories. |
| `findMarkdownFiles` | `{uri}` | `{markdownFiles:[{relativePath,uri,mtime?,size}],folderCount,imageCount}` | One call for the whole walk, depth 40, dotfiles skipped. |
| `findAllFiles` | `{uri}` | `{files:[...]}` | |
| `findAllEntries` | `{uri}` | `{entries:[...]}` | |
| `readTextFile` | `{uri}` | `{content}` | Capped at 8 MiB. UTF-8. |
| `readTextFilesBatch` | `{uris}` | `{contents:(string\|null)[]}` | |
| `writeTextFile` | `{uri}` or `{parentUri,name}`, `contents` | `{uri}` | Creates if absent. |
| `writeBinaryFile` | as above, `base64Data` | `{uri}` | |
| `createDir` | `{parentUri,name}` | `{uri}` | |
| `renamePath` | `{uri,newName}` | `{uri}` | |
| `movePath` | `{uri,fromParentUri,toParentUri}` | `{uri}` | |
| `deletePath` | `{uri}` | none | |
| `readFileAsDataUrl` | `{uri}` | `{dataUrl}` | Capped at 8 MiB. Used as `fileSrc`. |
| `getPendingShareData` | none | `{data\|null,timestamp}` | |
| `hasPendingShareData` | none | `{hasData}` | |
| `updateFavoritesWidget` | `{entries:[{label,path}]}` | none | |
| `updateRecentNotesWidget` | `{entries:[{label,path,mtime?,size?}]}` | none | Native cap 10. |
| `setViewNote` | `{path,title}` | none | Preview capped at 500 chars by the provider. |
| `createTextFileNew` | `{parentUri,name,contents}` | `{uri}` | Coded. Rejects names with `/`, `.` or `..`. A provider-altered name is deleted and reported `already_exists`. |
| `createBinaryFileNew` | `{parentUri,name,base64Data}` | `{uri}` | Coded. |
| `createDirNew` | `{parentUri,name}` | `{uri}` | Coded. |
| `renamePathNoReplace` | `{uri,parentUri,newName}` | `{uri}` | Coded. |

**`PrintExport`**: `printHtml({html,title?})` rejects when printing is unavailable or the page fails; `exportHtml({html,defaultFileName?})` returns `{saved}`.

**`SpeechRecognition`**: `startRecognition({language?="en",preferOffline?=true})` returns `{success,error?,text?,language?}`, and resolves only on a final result or error; `stopRecognition()`; `isOfflineSupported()` returns `{supported}`; `getAvailableLanguages()` returns `{languages}`. Requires `RECORD_AUDIO`.

**Android manifest.** Permissions are `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS`. `MainActivity` is `singleTask`, with intent filters for launcher, `VIEW` on scheme `leotheca`, `SEND` for `text/plain`, `text/uri-list`, `image/*`, and `SEND_MULTIPLE` for `image/*`. There are six non-exported widget receivers and two `RemoteViews` services, plus a non-exported `FileProvider`. `android:allowBackup` is `true` and `largeHeap` is `true`.

**Share limits (native).** 10 attachments, 25 MiB each, 100 MiB per share, 250 MiB queue, matching the JS constants.

### 7.4 Bridge dispatcher functions

`pickWorkspaceFolder`, `restoreWorkspaceAccess`, `listDir`, `findMarkdownFiles`, `findAllFiles`, `findAllEntries`, `readTextFile`, `readBinaryFile`, `readTextFilesBatch`, `writeTextFile`, `writeBinaryFile`, `createDir`, `renamePath`, `trashPath`, `deletePathPermanent`, the scoped and no-replace mutators, `writeActiveWorkspaceTextFile`, `writeActiveWorkspaceBinaryFile`, `getAppConfigFilePath`, `getAppVersion`, `fileSrc`, `getWorkspaceStats`, `setStatusBarAppearance`, `getPendingShareData`, `hasPendingShareData`, `updateFavoritesWidget`, `takePendingExternalFile`, `onExternalFileOpen`, `drainWorkspaceOperations`, `isNativePlatform`.

Every platform-only function MUST resolve cleanly on the other platform. Android's `onExternalFileOpen` returns a no-op disposer. Desktop's share and widget calls resolve to empty values.

Android walks are cached in memory for 30 seconds per root, and the path-to-URI cache is evicted by subtree on mutation.

### 7.5 Automation URLs

| URL | Parameters |
| --- | --- |
| `leotheca://read-current-note` | none |
| `leotheca://open-favorites` | none |
| `leotheca://open-note` | `path` (required, up to 4096) |
| `leotheca://new-note` | `content` |
| `leotheca://capture` | `text` or `content`, `title`, `url`, `mode`, `profile`, `open=true`; combined UTF-8 up to 32 KiB |
| `leotheca://insert-heading` | `path`, `heading`, `content` (required, up to 32 KiB), `position`, `exactLevel` |

The URL parser is not the security boundary. The native gate on the eventual read or write is.

## 8. Functional requirements

### Workspaces and profiles (FR-WS)

| ID | Requirement | Acceptance | Test |
| --- | --- | --- | --- |
| FR-WS-001 | The app MUST treat a workspace as one user-selected folder and MUST NOT copy notes into any app-owned store. | Given a folder is picked, When it opens, Then every note read and write targets a path inside that folder. | `src/settings/store.test.ts` |
| FR-WS-002 | Without a usable workspace the app MUST show the welcome dialog with a folder-choice action. | Given no active profile, When the app starts, Then the dialog titled "Welcome to Leotheca" offers folder selection. | `src/settings/WelcomeDialog.test.tsx` |
| FR-WS-003 | If the active profile's folder cannot be opened, the app MUST offer retry and relink for that profile and MUST NOT delete the profile. | Given an active profile whose folder is unavailable, When the app starts, Then "Couldn't open" with Retry and Relink actions is shown. | `src/settings/WelcomeDialog.test.tsx` |
| FR-WS-004 | Global config MUST keep a catalog of opened workspaces, each with id, name, icon, path, optional token and lastOpenedAt, sorted by lastOpenedAt descending, then case-folded name, then id. | Given profiles with equal lastOpenedAt, When sorted, Then order falls back to name and then id. | `src/settings/workspaceProfiles.test.ts` |
| FR-WS-005 | Profile names MUST be trimmed, non-empty, single-line and at most 80 Unicode scalars; otherwise they are rejected. | Given a name with a newline or 81 scalars, When normalized, Then the result is null. | `src/settings/workspaceProfiles.test.ts` |
| FR-WS-006 | Two profiles MUST be treated as the same location when both have the same token, or, without tokens, the same path. | Given the Android synthetic root with two different tree-URI tokens, When compared, Then they are different profiles. | `src/settings/workspaceProfiles.test.ts` |
| FR-WS-007 | A workspace switch MUST run the stages save, access, settings, publish, global-config in order; a newer switch supersedes an older one. | Given a transition in flight, When a second starts, Then only the newest result is published. | `src/workspace/workspaceTransition.test.ts` |
| FR-WS-008 | If outgoing saves fail, the switch MUST stop before access changes and MUST keep the current workspace open. | Given a failing save during prepareOutgoing, When switching, Then the transition fails in phase save and the old workspace remains. | `src/settings/workspaceTransition.test.ts` |
| FR-WS-009 | A failed in-session transition MUST expose typed recovery actions by error kind: save_failed, permission_missing, workspace_missing, global_config_save_failed, unknown. | Given failure phase access, When classified, Then permission_missing or workspace_missing is returned by platform and only applicable actions are offered. | `src/workspace/workspaceTransitionRecovery.test.ts` |
| FR-WS-010 | Forgetting the active profile with unsaved work MUST require explicit confirmation. | Given unsaved work and the active profile, When forget is requested, Then WorkspaceForgetUnsavedWorkError or a confirmation path stops silent loss. | `src/settings/store.test.ts` |
| FR-WS-011 | The command palette MUST include Switch workspace, Add workspace and Manage workspace profiles, and the switcher MUST filter profiles by fuzzy name match; a token-backed profile's opaque path MUST NOT be searched. | Given a profile with a token and a query matching only its path, When searched, Then it does not match. | `src/settings/workspaceProfiles.test.ts` |
| FR-WS-013 | Desktop `set_active_workspace_root` MUST accept only a root that is in the native workspace grant registry (granted by `pick_workspace_folder` or seeded once from legacy profiles), and a refused root MUST leave the previous root and asset scope unchanged. | Given an ungranted, parent, missing or traversal path, When set_active_workspace_root is called, Then it errors and the granted root stays active. | `src-tauri/src/commands.rs`, `src-tauri/src/workspace_grants.rs`, `src/workspace/tauriBridgeImpl.test.ts` |
| FR-WS-012 | Desktop workspace access MUST clear the active root before validating a new one, so a failed restore never leaves the old root authorized for the new session. | Given restoreWorkspaceAccess is called, When it starts, Then set_active_workspace_root(null) precedes the new root. | `src/workspace/tauriBridge.test.ts` |

### File tree and file operations (FR-FS)

| ID | Requirement | Acceptance | Test |
| --- | --- | --- | --- |
| FR-FS-001 | The tree MUST list directories before files, skip dot-entries, and skip symlinks that escape the workspace. | Given a folder with a dotfile and a directory, When listed, Then the directory is first and the dotfile absent. | `src-tauri/src/commands.rs` |
| FR-FS-002 | Sort order MUST be one of name-asc, name-desc, modified-desc and MUST persist per workspace. | Given sort modified-desc, When entries are sorted, Then newest mtime is first. | `src/workspace/fileTreeStore.test.ts` |
| FR-FS-003 | Ctrl+N and the New note command MUST create a collision-free auto-named note in the selected directory, or the root if none, through the no-replace bridge and open it. | Given Untitled.md exists, When creating a quick note, Then Untitled 2.md is created. | `src/workspace/fileTreeStore.test.ts` |
| FR-FS-004 | Named creation MUST append .md when missing and MUST fail with an already-exists message rather than overwrite. | Given notes/a.md exists, When creating a, Then an error is raised and the file is unchanged. | `src/workspace/fileTreeStore.test.ts` |
| FR-FS-005 | With deleteBehavior project-trash, delete MUST move the entry to .trash/<same relative path> in the workspace, prefixing the name with a millisecond timestamp and a dash on collision. | Given .trash/a.md exists, When a.md is trashed, Then the target is .trash/<ms>-a.md. | `src-tauri/src/commands.rs` |
| FR-FS-006 | With deleteBehavior permanent, delete MUST call the workspace-scoped permanent delete. | Given setting permanent, When deleteEntry runs, Then deleteWorkspacePathPermanent is called and trashPath is not. | `src/workspace/fileTreeStore.test.ts` |
| FR-FS-007 | Files MUST be classified by extension into text, image, canvas, ink or pdf tabs; extension-less files are text unless a known directory basename. | Given a file named notes, When classified, Then it is text; given .canvas, Then canvas. | `src/workspace/types.test.ts` |
| FR-FS-008 | An older pending file open MUST NOT override a newer one or reopen a tab after a workspace switch. | Given two opens awaiting reads, When the older settles last, Then the newer stays active. | `src/workspace/fileOpenAuthority.test.ts` |
| FR-FS-009 | The file context menu MUST expose actions for the targeted entry. | Given a context menu, When opened on a file, Then its actions render as menu items. | `src/workspace/FileContextMenu.test.tsx` |
| FR-FS-010 | Native atomic overwrite MUST write a dot-prefixed temp file in the target directory and rename it over the target, removing the temp on rename failure. | Given an overwrite, When write_workspace_text_file succeeds, Then no .leotheca-tmp file remains. | `src-tauri/src/commands.rs` |
| FR-FS-011 | Directory walks MUST stop descending at depth 40 on every platform. | Given a deeper tree, When walked, Then walking terminates without error. | `src-tauri/src/commands.rs` |
| FR-FS-012 | A template picker MUST create a new note from a .md file in templatesFolder when templates are enabled. | Given a template, When selected, Then a new note with its content opens. | `src/workspace/TemplatePicker.test.tsx` |
| FR-FS-013 | Native atomic overwrite's temp-file name MUST be unique per call within a process, not just per millisecond and PID, so two writes to the same target started close together never share a temp file. | Given many threads atomically-writing the same target at once, When all complete, Then every call succeeds and the final content is exactly one caller's complete payload. | `src-tauri/src/commands.rs` |

### Editor and saving (FR-EDIT)

| ID | Requirement | Acceptance | Test |
| --- | --- | --- | --- |
| FR-EDIT-001 | Edits MUST autosave after a 400 ms debounce keyed by session and path, and each write MUST carry the latest revision. | Given rapid edits, When 400 ms pass, Then one write with the newest content occurs. | `src/workspace/saveCoordinator.test.ts` |
| FR-EDIT-002 | Ctrl+S MUST flush pending autosave for the active tab immediately. | Given a pending edit, When flush is called, Then the write happens before the debounce elapses. | `src/workspace/saveCoordinator.test.ts` |
| FR-EDIT-003 | A failed save MUST keep the tab dirty, record saveError and allow retry; it MUST NOT report saved. | Given a rejected write, When it settles, Then lastError is set and the revision is not marked saved. | `src/workspace/saveCoordinator.test.ts` |
| FR-EDIT-004 | Once a session is being left, new edits for it MUST be rejected, timers cancelled, and in-flight native writes drained before access changes. | Given prepareForTransition, When an edit arrives, Then it is not written to the next session. | `src/workspace/saveCoordinator.test.ts` |
| FR-EDIT-005 | A note write MUST go through the active-workspace writer and MUST reject when no workspace is active or the path equals or escapes the root. | Given a path outside the root, When writeActiveWorkspaceTextFile runs, Then it rejects without a native call. | `src/workspace/tauriBridge.test.ts` |
| FR-EDIT-006 | Live preview MUST hide Markdown markers on lines outside the selection and reveal raw text on selected lines. | Given a heading line without selection, When decorated, Then # is hidden; with selection on the line, Then it shows. | `src/editor/livePreview.test.ts` |
| FR-EDIT-007 | Typing / at column start MUST offer slash commands: table, task, heading, h1, h2, h3, quote, code, link, image, hr, wiki, callout, bold, italic. | Given /ta, When completing, Then table and task are offered. | `src/editor/slashCommands.test.ts` |
| FR-EDIT-008 | With snippets enabled, ;trigger then Tab MUST expand a snippet; lines without a tab separator, invalid triggers and duplicates MUST be ignored. | Given "todo\t- [ ] ", When parsed, Then trigger todo maps to "- [ ] ". | `src/editor/snippets.test.ts` |
| FR-EDIT-009 | Pasting or dropping an image with pasteImagesEnabled MUST save a file to attachmentsFolder, or next to the note if empty, and insert a relative Markdown image link. | Given a pasted PNG and empty folder setting, When handled, Then the file is beside the note. | `src/editor/attachments.test.ts` |
| FR-EDIT-010 | Attachment names MUST replace the characters \ / : * ? " < > \| with - and MUST carry a random suffix. The suffix, not the writer, prevents collisions: the write itself uses the overwrite command. | Given a name with a colon, When named, Then the character becomes - and a suffix is present. | `src/editor/attachments.test.ts` |
| FR-EDIT-011 | ==text== MUST render as a highlight; an initial 🔴 🟠 🟢 🔵 🟣 MUST select red, orange, green, blue or purple and be removed from rendered text. | Given ==🔵note==, When rendered, Then the mark has the blue class and text note. | `src/markdown/highlight.test.ts` |
| FR-EDIT-012 | The frontmatter panel MUST edit scalar properties in place, preserving unrelated lines and comments, when frontmatterPropertiesEnabled is true. | Given a key with an inline comment, When updated, Then the comment stays. | `src/editor/frontmatterEdits.test.ts` |
| FR-EDIT-013 | Table commands MUST add or delete a row or column for the table under the cursor, including a cursor at a cell's trailing edge. | Given the cursor at sourceTo of a cell, When add-row-below runs, Then a row is added. | `src/markdown/tableCommands.test.ts` |
| FR-EDIT-014 | External content changes MUST be synced into CodeMirror as the minimal single replacement. | Given old and new text, When diffed, Then only the changed span is replaced. | `src/editor/textDiff.test.ts` |
| FR-EDIT-015 | Lines with RTL first-strong characters MUST be displayed right-to-left in editor and preview. | Given an Arabic line, When detected, Then direction is rtl. | `src/editor/textDirection.test.ts` |
| FR-EDIT-016 | View mode MUST be source, split or preview, per editor group; defaultViewMode applies when a workspace opens. | Given an invalid defaultViewMode, When decoded, Then the default source is used. Application on workspace open has no confirmed test. | `src/settings/workspaceSettings.test.ts` |
| FR-EDIT-017 | Font size MUST step by 1 between 12 and 24 and UI zoom by 10 between 50 and 200. | Given size 24, When increased, Then it stays 24. | `src/app/fontSizeControls.test.ts` |

### Markdown preview (FR-VIEW)

| ID | Requirement | Acceptance | Test |
| --- | --- | --- | --- |
| FR-VIEW-001 | Preview HTML MUST pass DOMPurify with only data-mermaid-source added to the allowed attributes. | Given a <script> in a note, When rendered, Then no script element exists. | `src/editor/MarkdownPreview.test.tsx` |
| FR-VIEW-002 | Relative image targets MUST resolve against the note's folder and MUST only be loaded when inside the workspace. | Given ![](../../etc/x.png) escaping the root, When rendered, Then no native read is issued. | `src/editor/MarkdownPreview.test.tsx` |
| FR-VIEW-003 | Remote images MUST NOT load; CSP is the enforcement. | Given an https image, When CSP is evaluated, Then img-src has no remote origin. | `src/offline.test.ts` |
| FR-VIEW-004 | With mathRenderingEnabled, $inline$ and $$block$$ MUST render through KaTeX. | Given $x^2$, When rendered, Then KaTeX markup appears. | `src/editor/MarkdownPreview.test.tsx` |
| FR-VIEW-005 | With mermaid enabled, mermaid fences MUST render as sanitized SVG, falling back to an error notice with the reason and the diagram source as a code block if rendering fails. | Given hostile SVG output, When sanitized, Then script and event attributes are removed; given a syntax error, When rendered, Then the notice and the escaped source appear and nothing throws. | `src/markdown/mermaidSanitize.test.ts`, `src/markdown/mermaid.test.ts` |
| FR-VIEW-010 | Mermaid diagrams MUST be drawn in the app's current theme (data-theme, else the OS preference) and redrawn when it changes, scale to the note width, and offer zoom in/out/reset, Ctrl/Cmd+wheel zoom, drag to pan and a full-screen view without leaving the device. | Given a dark app, When a diagram renders, Then Mermaid's dark theme is used; when Zoom in is pressed, Then the canvas scales by 1.25. | `src/markdown/mermaid.test.ts`, `src/markdown/mermaidFigure.test.ts`, `src/styles/mermaid.test.ts` |
| FR-VIEW-006 | Embeds ![[Note]] MUST expand at most 3 levels deep, 25 instances and 1 MiB per render. | Given an embed cycle, When rendered, Then expansion stops at the cap without hanging. | `src/editor/MarkdownPreview.test.tsx` |
| FR-VIEW-007 | Footnotes MUST render with reference and back-reference anchors. | Given [^a] with a definition, When rendered, Then fnref and fn anchors exist. | `src/editor/MarkdownPreview.test.tsx` |
| FR-VIEW-008 | Stale async render results MUST NOT overwrite a newer note's preview. | Given two renders, When the older finishes last, Then the newer output stays. | `src/editor/MarkdownPreview.concurrency.test.tsx` |
| FR-VIEW-009 | Search-query highlight MUST wrap only text, never tags or character references. | Given a query amp, When highlighted, Then &amp; stays intact. | `src/editor/MarkdownPreview.test.tsx` |

### Wikilinks, headings and blocks (FR-LINK)

| ID | Requirement | Acceptance | Test |
| --- | --- | --- | --- |
| FR-LINK-001 | Wikilink parsing MUST support [[Note]], [[Note\|Label]], [[Note#Heading]], [[Note#^block]], [[#Heading]], ![[embed]] and backslash escapes of \ # \| [ ]. | Given [[A\\|B#H\|L]], When parsed, Then noteTarget is A\|B, heading H, label L. | `src/linking/wikiSyntax.test.ts` |
| FR-LINK-002 | An empty block or heading fragment MUST produce parseStatus malformed and resolution status malformed. | Given [[A#^]], When parsed, Then status is malformed. | `src/linking/wikiSyntax.test.ts` |
| FR-LINK-003 | Serialization MUST round-trip through parsing. | Given a target with reserved characters, When serialized and reparsed, Then values match. | `src/linking/wikiSyntax.test.ts` |
| FR-LINK-004 | If the fragment-aware target is missing, the resolver MUST try the whole legacy text as a note name for backwards compatibility. | Given a note literally named A#B, When [[A#B]] resolves, Then legacyFallback is true. | `src/linking/wikiResolver.test.ts` |
| FR-LINK-005 | Heading resolution MUST report resolved, missing-fragment or ambiguous-fragment. | Given two equal headings, When matched, Then ambiguous-fragment with candidates is returned. | `src/linking/wikiResolver.test.ts` |
| FR-LINK-006 | Block ids MUST match [A-Za-z0-9][A-Za-z0-9-]{0,63}, be matched case-insensitively, and may be trailing or standalone. | Given text ^Abc, When [[N#^abc]] resolves, Then the block is found. | `src/markdown/blocks.test.ts` |
| FR-LINK-007 | Copy block link MUST reuse an existing unique id at the cursor or generate one not already present. | Given a block with ^x, When copying, Then the link uses x and no text is inserted. | `src/editor/blockLinkActions.test.ts` |
| FR-LINK-008 | The heading scanner MUST recognize ATX and setext headings at top level, skip fenced code and HTML comments, and not scan inside blockquotes or list items. | Given # in a fence, When scanned, Then there is no heading. | `src/markdown/headings.test.ts` |
| FR-LINK-009 | The link index MUST compute backlinks, note names, aliases, tags and tasks, and reuse a cached note only when both mtime and size match. | Given unchanged mtime with changed size, When rebuilt, Then the note is re-read. | `src/linking/store.test.ts` |
| FR-LINK-010 | The index MUST cap read concurrency at 24 on desktop and 8 on Android. | Given many notes on Android, When indexing, Then at most 8 reads are in flight. | `src/linking/store.test.ts` |
| FR-LINK-011 | With frontmatterAliasesEnabled, the aliases frontmatter list MUST resolve as note names. | Given aliases: [x], When [[x]] resolves, Then the note is found. | `src/linking/frontmatter.test.ts` |
| FR-LINK-012 | The backlinks panel MUST list notes linking to the current note. | Given a backlink, When rendered, Then its source is listed. | `src/linking/BacklinksPanel.test.tsx` |
| FR-LINK-013 | With headingLinksEnabled off, [[...]] MUST use the plain whole-text wikilink path rather than fragment resolution. | Given the setting off, When a note with [[A#B]] renders, Then fragment resolution is not applied. | `src/editor/MarkdownPreview.test.tsx` |

### Search (FR-SEARCH)

| ID | Requirement | Acceptance | Test |
| --- | --- | --- | --- |
| FR-SEARCH-001 | The query language MUST support bare terms, tag:, path:, leading - negation, quoted phrases, and whitespace-delimited uppercase OR between AND groups. | Given foo -"bar baz" OR tag:x, When parsed, Then two groups result. | `src/workspace/searchQuery.test.ts` |
| FR-SEARCH-002 | A blank query MUST clear search, not match all. | Given whitespace only, When runSearch is called, Then results are null. | `src/workspace/fileTreeStore.test.ts` |
| FR-SEARCH-003 | Negated text terms MUST be evaluated against real content. | Given -word and a note whose body has word, When searched, Then that note is excluded. | `src/workspace/fileTreeStore.test.ts` |
| FR-SEARCH-004 | Files over 50 MiB, images and non-text files MUST NOT be read for content; content batches MUST NOT exceed 8 MiB except a single smaller-than-cap file. | Given a 60 MiB file, When searched by content, Then it is never read. | `src/workspace/fileTreeStore.test.ts` |
| FR-SEARCH-005 | An older search MUST NOT publish after a newer search or workspace switch. | Given two searches, When the older resolves last, Then the newer results remain. | `src/workspace/searchOwnership.test.ts` |
| FR-SEARCH-006 | Search sort MUST be relevance, name or modified and persist per workspace. | Given mode name, When results publish, Then they are name-sorted. | `src/workspace/fileTreeStore.test.ts` |
| FR-SEARCH-007 | Search results MUST be ordered by the score from scoreSearchResult in relevance mode. | Given a name match and a body match, When scored, Then the name match ranks higher. | `src/workspace/searchQuery.test.ts` |

### Tags (FR-TAG)

| ID | Requirement | Acceptance | Test |
| --- | --- | --- | --- |
| FR-TAG-001 | Tags MUST come from the frontmatter tags list and from inline #tag, excluding fenced code, inline code and mid-word or URL-fragment #. | Given `#x` and foo#bar, When extracted, Then there are no tags. | `src/tags/tags.test.ts` |
| FR-TAG-002 | Tag paths with / MUST form a hierarchical tree. | Given a/b, When built, Then a has child b. | `src/tags/tags.test.ts` |
| FR-TAG-003 | With tagsEnabled off, the Tags panel and palette command MUST NOT be offered. | Given tagsEnabled false, When the panel gate is evaluated, Then no Tags destination shows. | `src/app/layout/ActivityRail.test.tsx` |

### Task hub (FR-TASK)

| ID | Requirement | Acceptance | Test |
| --- | --- | --- | --- |
| FR-TASK-001 | Tasks MUST be GFM list items with [ ], [x] or [X], skipping fences and HTML comments. | Given - [ ] a in a fence, When scanned, Then there is no task. | `src/markdown/tasks.test.ts` |
| FR-TASK-002 | The hub MUST default to status open, no filters, no grouping, sort by note. | Given defaults, When queried, Then only open tasks are returned. | `src/tasks/taskQuery.test.ts` |
| FR-TASK-003 | Toggling MUST re-match the task against current content, and report stale without writing if it no longer matches. | Given changed content, When toggled, Then status stale and no write occurs. | `src/tasks/taskMutation.test.ts` |
| FR-TASK-004 | Toggling an open note MUST go through the save coordinator; a closed note through a per-path serialized write. | Given an open tab, When toggled, Then save.change and flush are called. | `src/tasks/taskMutation.test.ts` |

### Outline and breadcrumbs (FR-OUTLINE)

| ID | Requirement | Acceptance | Test |
| --- | --- | --- | --- |
| FR-OUTLINE-001 | The outline MUST list the note's headings and clicking MUST reveal that source range, including repeat clicks on the same row. | Given a row clicked twice, When requested, Then requestId increments. | `src/outline/OutlinePanel.test.tsx` |
| FR-OUTLINE-002 | The filter input MUST appear only above 20 headings and announcements MUST debounce at 300 ms. | Given 21 headings, When rendered, Then a filter shows. | `src/outline/OutlinePanel.test.tsx` |
| FR-OUTLINE-003 | Above 500 headings the list MUST virtualize with 28 px rows and 8 overscan rows. | Given 501 headings, When windowed, Then only visible and overscan rows render. | `src/outline/outlineVirtualization.test.ts` |
| FR-OUTLINE-004 | In split view, breadcrumbs MUST follow the pane last acted in and reset on note change. | Given a note-changed event, When transitioned, Then authority resets. | `src/outline/splitAuthority.test.ts` |
| FR-OUTLINE-005 | Heading link actions MUST copy and insert links to a heading. | Given a heading, When the action runs, Then link text is produced. | `src/outline/HeadingLinkActions.test.tsx` |

### Bookmarks (FR-BOOK)

| ID | Requirement | Acceptance | Test |
| --- | --- | --- | --- |
| FR-BOOK-001 | Bookmarks MUST be file or search entries stored as a JSON array in .leotheca/bookmarks.json. | Given a file bookmark, When saved, Then the array holds kind, id, label and path. | `src/bookmarks/store.test.ts` |
| FR-BOOK-002 | Invalid entries MUST be dropped in memory and the file flagged corrupt. | Given one bad entry, When decoded, Then valid ones remain and corrupt is true. | `src/bookmarks/store.test.ts` |
| FR-BOOK-003 | A superseded load MUST NOT publish after a workspace switch. | Given two loads, When the older finishes last, Then newer data stays. | `src/bookmarks/store.test.ts` |

### Smart collections (FR-COLL)

| ID | Requirement | Acceptance | Test |
| --- | --- | --- | --- |
| FR-COLL-001 | Collections MUST default to off and be stored in .leotheca/collections.json at version 1. | Given defaults, When settings are read, Then collectionsEnabled is false. | `src/settings/workspaceSettings.test.ts` |
| FR-COLL-002 | Queries MUST support and/or groups nested up to 3 levels and 100 total clauses. | Given depth 4, When decoded, Then the collection is rejected as corrupt. | `src/collections/collectionDecode.test.ts` |
| FR-COLL-003 | A clause missing a required value MUST be invalid unless its operator is exists, does-not-exist, is-true, is-false, is-empty or is-not-empty. | Given is without a value, When decoded, Then it is rejected. | `src/collections/collectionDecode.test.ts` |
| FR-COLL-004 | Unrecognized version MUST be flagged corrupt and unknown fields preserved. | Given version 2, When decoded, Then corrupt is true. | `src/collections/collectionDecode.test.ts` |
| FR-COLL-005 | Evaluation MUST use the metadata index and MUST NOT read note bodies while rendering a view. | Given a NoteRecord set, When evaluated, Then results depend only on records. | `src/collections/collectionQuery.test.ts` |
| FR-COLL-006 | Quoted scalars MUST stay strings; unquoted true/false, numbers, dates and datetimes MUST infer types. | Given "0012" quoted, When inferred, Then string. | `src/collections/collectionTypesInference.test.ts` |
| FR-COLL-007 | Views MUST include list, table, card and kanban; kanban is read-only for data and requires groupBy. | Given mode kanban, When decoded, Then groupBy is required. | `src/collections/collectionDecode.test.ts` |
| FR-COLL-008 | Group columns MAY be manually ordered with groupOrder; unlisted columns follow derived order. | Given groupOrder, When ordered, Then listed columns come first. | `src/collections/groupOrder.test.ts` |
| FR-COLL-009 | Filter rows MUST support all-views and this-view scopes. | Given a this-view row, When moved, Then it transfers to the root query. | `src/collections/filterRows.test.ts` |

### Quick capture (FR-CAP)

| ID | Requirement | Acceptance | Test |
| --- | --- | --- | --- |
| FR-CAP-001 | Ctrl/Cmd+Shift+C and the palette MUST open the capture sheet; Ctrl/Cmd+Enter MUST submit. | Given an open sheet, When Ctrl+Enter is pressed, Then submission runs. No test exercises either key binding. | NONE |
| FR-CAP-002 | Capture MUST support modes append, new and date. | Given an invalid mode, When validated, Then it is rejected. | `src/capture/captureDestinations.test.ts` |
| FR-CAP-003 | Append MUST preserve the existing line-ending style with one blank line separating content. | Given a CRLF inbox note, When appended, Then the separator is CRLF CRLF. | `src/capture/captureCommit.test.ts` |
| FR-CAP-004 | Captures MUST NOT target paths under .leotheca/. | Given .leotheca/x.md, When committed, Then it rejects. captureCommit.test.ts has no such case. | NONE |
| FR-CAP-005 | Date patterns MUST resolve {{date:YYYY-MM-DD}}, {{date:YYYY-MM}} and {{date:YYYY}}. | Given a date, When resolved, Then the tokens are replaced. | `src/capture/captureDestinations.test.ts` |
| FR-CAP-006 | Captures that cannot commit MUST queue with limits: 50 entries, 5 MiB total text, 32 KiB per capture, 10 attachments per capture, 25 MiB per attachment, 100 MiB per capture, 250 MiB in total. | Given a 51st capture, When added, Then it is refused. | `src/capture/pendingCaptures.test.ts` |
| FR-CAP-007 | The queue MUST persist in localStorage under leotheca-pending-captures and recover from corrupt data without throwing. | Given invalid JSON, When initialized, Then the queue is empty and the app continues. Traced by reading only; entries inside a valid array are not validated (KG-010). | NONE |
| FR-CAP-008 | Android share intents MUST be drained into the pending queue. | Given pending share data, When processed, Then a capture with source android-share is added. | `src/capture/androidShareBridge.test.ts` |
| FR-CAP-009 | The pending panel MUST let the user see, retry and remove queued captures. | Given a queued capture, When rendered, Then it is listed with actions. | `src/capture/PendingCapturesPanel.test.tsx` |
| FR-CAP-010 | When Templates is enabled and the templates folder has Markdown files, the capture sheet MUST offer a Template select defaulting to None; None MUST produce the plain capture format. A chosen template MUST be read from the templates folder at submit time and rendered by single-pass substitution of {{content}}, {{title}}, {{url}}, {{date}} and {{time}} (values never re-scanned); the body is appended when {{content}} is absent and an unused source URL becomes a Source line; no built-in header is added. | Given a template `## {{date}}\n\n{{content}}`, When captured to an inbox, Then the note ends with that rendered block and no timestamp header. | `src/capture/captureTemplate.test.ts` |
| FR-CAP-011 | A template that cannot be read, exceeds 64 KiB or lies outside the templates folder MUST abort the capture with a visible error, write nothing and keep the typed text. | Given a deleted template, When Capture is pressed, Then an alert names the failure, no write occurs and the sheet stays open. | `src/app/CaptureSheet.test.tsx` |

### Automation URLs (FR-AUTO)

| ID | Requirement | Acceptance | Test |
| --- | --- | --- | --- |
| FR-AUTO-001 | leotheca:// hosts read-current-note, open-favorites, open-note, new-note, capture and insert-heading MUST parse to typed commands; anything else MUST return null without throwing. | Given leotheca://unknown, When parsed, Then null. | `src/app/automationCommands.test.ts` |
| FR-AUTO-002 | open-note MUST require path and reject paths over 4096 characters. | Given a 4097 char path, When parsed, Then null. | `src/app/automationCommands.test.ts` |
| FR-AUTO-003 | capture MUST accept text or content, title, url, mode, profile, open and reject combined text+title+url over 32 KiB of UTF-8. | Given multi-byte text over 32 KiB bytes, When parsed, Then null. | `src/app/automationCommands.test.ts` |
| FR-AUTO-004 | insert-heading MUST require path, heading, content; position MUST be prepend or append (default append); exactLevel MUST be an integer 1 to 6; content MUST be at most 32 KiB. | Given exactLevel 7, When parsed, Then null. | `src/app/automationCommands.test.ts` |
| FR-AUTO-005 | Heading insert MUST match heading text case-insensitively, the first match winning. | Given content and a heading, When inserted with append, Then it lands before the next heading. | `src/headingInsert.test.ts` |
| FR-AUTO-006 | Heading insert writes MUST use the workspace-contained bridge. | Given a path outside the workspace, When committed, Then an error results. | `src/capture/headingInsertCommit.test.ts` |

### Rename and refactor (FR-REN)

| ID | Requirement | Acceptance | Test |
| --- | --- | --- | --- |
| FR-REN-001 | Renaming a note MUST plan structured wikilink and Markdown link rewrites without touching files, and show a preview. | Given a backlink, When planned, Then an edit is listed and no file changes. | `src/refactor/renamePlan.test.ts` |
| FR-REN-002 | Edits that cannot be safely rewritten MUST be reported as blocked. | Given an ambiguous reference, When planned, Then it is in the blocked list. | `src/refactor/renamePlan.test.ts` |
| FR-REN-003 | One mutation lock per workspace MUST prevent concurrent rename operations. | Given the lock held, When acquired again, Then false. | `src/refactor/renameExecutor.test.ts` |
| FR-REN-004 | On partial failure the executor MUST roll back using its in-memory journal. | Given a failing file rename, When executed, Then wikilink edits are restored. | `src/refactor/renameExecutor.test.ts` |
| FR-REN-005 | Metadata migration MUST update known path-bearing app metadata and preserve unknown fields. | Given a bookmark for the old path, When migrated, Then it points to the new path. | `src/refactor/metadataMigrator.test.ts` |
| FR-REN-006 | Folder rename planning MUST map every contained file and enforce limits of 100 file moves and 1000 edits by default. | No dedicated test file exists for folderOperations.ts. | NONE |
| FR-REN-007 | Create and rename-no-replace MUST surface already_exists as a typed error. | Given a colliding target, When renaming, Then the error code is already_exists. | `src-tauri/src/workspace_mutations.rs` |

### Diagnostics and health (FR-DIAG)

| ID | Requirement | Acceptance | Test |
| --- | --- | --- | --- |
| FR-DIAG-001 | Every structured wikilink MUST be classified resolved, broken, missing-heading or ambiguous-heading. | Given a missing note, When classified, Then broken. | `src/diagnostics/diagnostics.test.ts` |
| FR-DIAG-002 | The health audit MUST report orphaned and empty notes, stripped of frontmatter. | Given a frontmatter-only note, When audited, Then it is empty. | `src/diagnostics/healthAudit.test.ts` |
| FR-DIAG-003 | The panel MUST present findings with loading and empty states. | Given no findings, When rendered, Then an empty state shows. | `src/diagnostics/DiagnosticsPanel.test.tsx` |

### Graph (FR-GRAPH)

| ID | Requirement | Acceptance | Test |
| --- | --- | --- | --- |
| FR-GRAPH-001 | The graph layout MUST use exact all-pairs repulsion for small graphs and a deterministic budget for large ones: 500000 interactions, 24 sampled neighbors and 20000 attraction edges per iteration. | Given a huge graph, When budgeted, Then interactions stay within the limit. | `src/graph/layoutBudget.test.ts` |
| FR-GRAPH-002 | Only the newest layout generation MAY publish. | Given two requests, When the older finishes later, Then it is dropped. | `src/graph/layoutCoordinator.test.ts` |
| FR-GRAPH-003 | Graph color groups MUST be stored as id, query and 6-digit hex color; invalid entries are dropped and the file flagged corrupt. | Given color red, When decoded, Then the entry is dropped. | `src/settings/workspaceSettings.test.ts` |
| FR-GRAPH-004 | Pan and zoom MUST clamp scale to 0.15 to 4. | Given a large zoom, When computed, Then scale is clamped. | `src/graph/transform.test.ts` |
| FR-GRAPH-005 | A note timeline data model exists but MUST NOT be presented as a shipped view until rendered accessibly. | Given note dates, When built, Then ordering is deterministic. | `src/graph/noteTimeline.test.ts` |

### Canvas (FR-CANVAS)

| ID | Requirement | Acceptance | Test |
| --- | --- | --- | --- |
| FR-CANVAS-001 | .canvas files MUST be JSON with nodes and edges; invalid but object-shaped nodes and edges MUST be retained across saves. | Given an unknown node, When decoded and serialized, Then it survives. | `src/canvas/canvasDocument.test.ts` |
| FR-CANVAS-002 | Unparseable canvas files MUST return null and MUST NOT be overwritten automatically. | Given bad JSON, When decoded, Then null and the UI shows an error state. | `src/canvas/canvasDocument.test.ts` |
| FR-CANVAS-003 | With canvasEnabled off, canvas creation MUST NOT be offered. | Given canvasEnabled false, When commands build, Then New canvas is absent. Only the default value is tested. | NONE |

### Ink drawing (FR-INK)

| ID | Requirement | Acceptance | Test |
| --- | --- | --- | --- |
| FR-INK-001 | .ink files MUST persist version 1 JSON with strokes and viewport, retaining unknown strokes and extra fields. | Given an unknown stroke, When round-tripped, Then it remains. | `src/ink/inkDocument.test.ts` |
| FR-INK-002 | Pointer samples MUST normalize pressure 0..1 and tilt -90..90. | Given out-of-range values, When normalized, Then they are clamped. | `src/ink/strokeProcessing.test.ts` |
| FR-INK-003 | The eraser MUST split strokes into surviving runs; undo and redo MUST restore prior states. | Given an erase through the middle, When erased, Then two strokes remain. | `src/ink/inkEditing.test.ts` |
| FR-INK-004 | The toolbar MUST offer pen, highlighter, eraser, color, width, undo and redo with labels. | Given the view, When rendered, Then labelled controls exist. | `src/ink/InkView.test.tsx` |

### PDF viewer and annotation (FR-PDF)

| ID | Requirement | Acceptance | Test |
| --- | --- | --- | --- |
| FR-PDF-001 | PDFs MUST open with page navigation, zoom 0.25 to 4 and text search. | Given a PDF, When zoom is applied, Then scale is clamped. | `src/pdf/PdfViewer.test.tsx` |
| FR-PDF-002 | Highlight, underline and strikeout annotations MUST be stored as standard PDF QuadPoints markup inside the PDF. | Given a selection, When saved and re-read, Then the markup round-trips. | `src/pdf/pdfAnnotations.test.ts` |
| FR-PDF-003 | Ink, sticky note and shape annotations MUST round-trip through the PDF bytes. | Given a saved sticky note, When re-read, Then it is returned. | `src/pdf/pdfAnnotations.test.ts` |
| FR-PDF-004 | PDF saves MUST use the active-workspace binary overwrite. | Given an annotated PDF, When saved, Then writeActiveWorkspaceBinaryFile receives its bytes. Rejection of an out-of-root path is traced by reading only. | `src/pdf/PdfViewer.test.tsx` |

### Tabs and split groups (FR-TAB)

| ID | Requirement | Acceptance | Test |
| --- | --- | --- | --- |
| FR-TAB-001 | One open document record MUST exist per path, and a path MUST appear in at most one group. | Given a path in both groups in persisted layout, When validated, Then it is invalid. | `src/settings/workspaceSettings.test.ts` |
| FR-TAB-002 | Pinned tabs MUST be kept by Close all unpinned; Close-all and pin commands MUST act per group. | Given a pinned tab, When closing all unpinned, Then it stays. | `src/workspace/store.test.ts` |
| FR-TAB-003 | Split ratio MUST stay within 0.30 to 0.70. | Given ratio 0.9, When persisted layout is validated, Then it is rejected. | `src/settings/workspaceSettings.test.ts` |
| FR-TAB-004 | At compact width one group MUST be visible at a time with a switcher. | Given compact width, When split is on, Then one group shows. | `src/workspace/documentGroups.test.ts` |
| FR-TAB-005 | Legacy lastOpenPaths and lastActivePath MUST migrate into a one-group editorLayout at version 2. | Given a legacy file, When decoded, Then version is 2 and tabs match. | `src/settings/workspaceSettings.test.ts` |
| FR-TAB-006 | Renaming an open file MUST retarget its tab. | Given an open tab, When renamed, Then the tab has the new path. | `src/workspace/store.test.ts` |
| FR-TAB-007 | The secondary pane MUST render its own document. | Given a secondary document, When rendered, Then its content shows. | `src/editorGroups/SecondaryEditorPane.test.tsx` |

### Settings persistence (FR-SET)

| ID | Requirement | Acceptance | Test |
| --- | --- | --- | --- |
| FR-SET-001 | Workspace settings MUST be written to .leotheca/settings.json with 2-space JSON through the workspace-scoped writer. | Given an update, When saved, Then writeWorkspaceTextFile receives that path. | `src/settings/workspaceSettings.test.ts` |
| FR-SET-002 | A missing settings file MUST mean defaults without corruption; an unreadable or invalid file MUST set corrupt. | Given invalid JSON, When decoded, Then defaults with corrupt true. | `src/settings/workspaceSettings.test.ts` |
| FR-SET-003 | A corrupt settings file MUST NOT be rewritten implicitly; only the Rewrite action may replace it. | Given a corrupt file, When a toggle changes, Then the file on disk is unchanged until Rewrite settings file. | `src/settings/store.test.ts` |
| FR-SET-004 | Unknown fields MUST be preserved on read and write; a future version number MUST be flagged corrupt. | Given version 3, When decoded, Then corrupt true and extra keys kept. | `src/settings/workspaceSettings.test.ts` |
| FR-SET-005 | Folder settings MUST reject absolute paths and .. segments. | Given ../x, When decoded, Then default and corrupt true. | `src/settings/workspaceSettings.test.ts` |
| FR-SET-006 | Global config MUST migrate v1 lastWorkspacePath into one v2 profile, keeping the token. | Given a v1 file, When decoded, Then one profile is active. | `src/settings/globalConfig.test.ts` |
| FR-SET-007 | A corrupt global config MUST NOT be rewritten implicitly; Rewrite app configuration MUST be the explicit action. | Given a corrupt config, When decoded, Then corrupt true. | `src/settings/globalConfig.test.ts` |
| FR-SET-008 | The Settings panel MUST offer category navigation and search, plus General, Feature selection, Appearance, Keyboard shortcuts, Health and About sections. | Given a search term, When filtered, Then matching sections remain. No test exercises Search settings or category navigation. | NONE |
| FR-SET-009 | Vault stats MUST show folders, notes, images, average lines and date bounds. | Given stats, When rendered, Then the counts appear. | `src/settings/VaultStatsPanel.test.tsx` |
| FR-SET-010 | The default-handler section MUST give per-platform steps from a pure contract. | Given a platform, When queried, Then the steps match the Rust contract. | `src/settings/defaultHandler.test.ts` |

### Themes and appearance (FR-THEME)

| ID | Requirement | Acceptance | Test |
| --- | --- | --- | --- |
| FR-THEME-001 | Theme preference MUST be system, light or dark in global config; system removes data-theme, others set it on the root. | Given dark, When applied, Then data-theme is dark. | `src/settings/store.test.ts` |
| FR-THEME-002 | Accent MUST be warm, ocean, forest or plum per workspace when themesEnabled is true; reading font sans, serif or mono. | Given an invalid accent, When decoded, Then default with corrupt true. | `src/settings/workspaceSettings.test.ts` |
| FR-THEME-003 | Custom CSS MUST be read only from inside the workspace and injected as one style element, default off. | Given an escaping path, When applied, Then it returns false. See KG-004: the shipped argument order defeats the feature. | `src/settings/customCss.test.ts` |
| FR-THEME-004 | The zoom key mapping MUST accept both = and + for zoom in, - for out, 0 for reset, and Ctrl+wheel MUST zoom. | Given key =, When mapped, Then zoom-in. | `src/app/zoomControls.test.ts` |

### Print and export (FR-EXP)

| ID | Requirement | Acceptance | Test |
| --- | --- | --- | --- |
| FR-EXP-001 | Print MUST wrap the rendered preview HTML in a standalone print document. | Given body HTML, When built, Then a full document with print CSS results. | `src/export/printNote.test.ts` |
| FR-EXP-002 | HTML export MUST inline local images as data so the file is portable. | Given a local image, When exported, Then its src is a data URI. | `src/export/exportNoteHtml.test.ts` |
| FR-EXP-003 | A cancelled save dialog MUST resolve as not saved, not as an error. | Given a cancelled dialog, When export runs, Then the result is false. | `src/workspace/tauriBridgeImpl.test.ts` |

### External file open (FR-EXT)

| ID | Requirement | Acceptance | Test |
| --- | --- | --- | --- |
| FR-EXT-001 | A .md path from argv, relaunch or macOS Opened event MUST be read natively and delivered as {path, content} once. | Given argv with --flag and a.md, When extracted, Then a.md is chosen. | `src-tauri/src/external_open.rs` |
| FR-EXT-002 | External files outside the workspace MUST open in a dedicated view rather than as workspace tabs. | Given an external file, When shown, Then ExternalFileView displays its path and content. | `src/app/ExternalFileView.test.tsx` |
| FR-EXT-003 | externalFileOpenEnabled MUST default true and gate the feature. | Given false, When an event arrives, Then it is ignored. | `src/settings/globalConfig.test.ts` |

### Markdown vault import (FR-IMPORT)

| ID | Requirement | Acceptance | Test |
| --- | --- | --- | --- |
| FR-IMPORT-001 | On desktop with a workspace open and markdownImportEnabled true, the command palette MUST offer "Import Markdown vault..."; on Android or with the setting off it MUST NOT. | Given Android or the setting off, When the palette opens, Then the command is absent. | `src/markdownImport/markdownImport.test.ts` |
| FR-IMPORT-002 | The source folder MUST come from a native dialog inside the command, and the source MUST NOT be modified. | Given an import, When it finishes, Then a byte snapshot of the source is unchanged and the webview supplied only targetFolder. | `src-tauri/src/markdown_import.rs` (cargo test) |
| FR-IMPORT-003 | Notes MUST be copied to Imported/<source folder name> inside the workspace; an existing file MUST never be overwritten (a clash is saved as `name (imported)` and reported). | Given a clashing name, When imported, Then the old file is unchanged and the report lists the rename. | `src-tauri/src/markdown_import.rs` (cargo test) |
| FR-IMPORT-004 | Symlinks MUST NOT be followed, hidden top-level source folders MUST be skipped, a target folder or destination escaping the workspace or lying inside the source MUST be rejected. | Given a symlinked target, a `..` target or a destination inside the source, When imported, Then an error is returned and nothing is written outside the workspace. | `src-tauri/src/markdown_import.rs` (cargo test) |
| FR-IMPORT-005 | Only attachment embeds and links, nested heading links and %%comments%% MUST be rewritten; code, front matter and already supported syntax MUST stay byte-identical; non-UTF-8 notes MUST be copied unchanged and reported. | Given a note with each syntax, When imported, Then only the three kinds change and the report counts each finding. | `src-tauri/src/markdown_import.rs` (cargo test) |
| FR-IMPORT-006 | The dialog MUST show progress with Cancel, then a report with exact counts and capped lists; a native failure MUST show an error dialog and the tree MUST refresh after files were written. | Given a finished import, When the dialog shows, Then converted, unsupported, renamed, skipped and failed items are listed. | `src/markdownImport/importStore.test.tsx` |

### Speech to text (FR-SPEECH)

| ID | Requirement | Acceptance | Test |
| --- | --- | --- | --- |
| FR-SPEECH-001 | Speech MUST default off and be offline only. | Given defaults, When read, Then speechToTextEnabled is false. | `src/settings/workspaceSettings.test.ts` |
| FR-SPEECH-002 | Android MUST use the platform recognizer with preferOffline true by default, resolving only on final result or error. | Given a start call, When recognized, Then the long-lived promise resolves. | `src/speech/speechController.test.ts` |
| FR-SPEECH-003 | Desktop MUST report offlineSupported only when a model is actually loaded and MUST NOT fabricate text. No whisper backend is compiled by default. | Given modelLoaded false, When status is read, Then offlineSupported is false. | `src/workspace/speechBridgeImpl.test.ts` |
| FR-SPEECH-004 | Empty audio MUST return an empty string. | No test confirmed for the Tauri command path; see KG-002. | NONE |

### Spell check (FR-SPELL)

| ID | Requirement | Acceptance | Test |
| --- | --- | --- | --- |
| FR-SPELL-001 | Spell check MUST default off and read only .leotheca/dictionary.aff and .dic; missing files silently disable it. | Given text and a checker, When checked, Then misspellings are reported. | `src/spellcheck/spellCheck.test.ts` |

### Android widgets (FR-WID)

| ID | Requirement | Acceptance | Test |
| --- | --- | --- | --- |
| FR-WID-001 | Providers for new note, favorites, favorites list, quick capture, recent notes and view note MUST exist with their resources. | Given the manifest and resources, When unit-tested, Then each provider's resources resolve. | `android/app/src/test/java/com/getcapacitor/myapp/WidgetResourcesUnitTest.java` |
| FR-WID-002 | Recent notes MUST be capped at 10 and favorites at 25. | Given 11 recent notes, When selected, Then 10 remain. | `src/workspace/fileTreeStore.test.ts` |
| FR-WID-003 | A cold new-note launch MUST predict the quick-note name and show bounded feedback. | Given a new-note URL, When tracked, Then it is recognized. | `android/app/src/test/java/com/leonardschwier/leotheca/NewNoteColdStartTrackerTest.java` |

### Web clipper extension (FR-CLIP)

| ID | Requirement | Acceptance | Test |
| --- | --- | --- | --- |
| FR-CLIP-001 | The clipper MUST save selection as Markdown through the browser save dialog with activeTab and downloads permissions only, and MUST NOT contact the app or a server. | Given selected HTML, When converted, Then Markdown is produced. | `extensions/web-clipper/clipperCore.test.js` |
| FR-CLIP-002 | Extension scripts MUST work in Chrome and Firefox: use `globalThis.browser ?? globalThis.chrome`, and answer messages through `sendResponse` (a bare return value is ignored by Chrome). | Given a `build-clip` message with a selection, When the listener runs, Then `sendResponse` receives the clip synchronously. | `extensions/web-clipper/messaging.test.js` |
| FR-CLIP-003 | The background script MUST report a refused download as `{ ok: false, error }` and the keyboard command MUST NOT reject on a page without the content script. | Given a rejected `downloads.download`, When `save-clip` arrives, Then the reply is `ok: false`. | `extensions/web-clipper/messaging.test.js` |

### Shell, UI primitives and accessibility (FR-UI)

| ID | Requirement | Acceptance | Test |
| --- | --- | --- | --- |
| FR-UI-001 | The palette MUST open with Ctrl/Cmd+K, filter fuzzily, navigate with arrows, and close with Escape. | Given the palette, When ArrowDown then Enter, Then the second command runs. | `src/app/CommandPalette.test.tsx` |
| FR-UI-002 | Fuzzy matching MUST be case-insensitive and rank word-start matches higher. | Given a word-start and a mid match, When scored, Then word-start wins. | `src/fuzzyMatch.test.ts` |
| FR-UI-003 | Layout classes MUST be compact under 720, medium 720-1099, wide 1100-1279, expanded 1280+. | Given 719, When classified, Then compact. | `src/app/layout/adaptiveLayout.test.ts` |
| FR-UI-004 | The activity rail MUST appear at 720 px and above; medium MUST overlay the navigation panel. | Given medium, When queried, Then overlay is true. | `src/app/layout/adaptiveLayout.test.ts` |
| FR-UI-005 | Dialogs and sheets MUST trap focus and close via Escape or the hardware back through one overlay stack. | Given two overlays, When Escape is pressed, Then only the topmost closes. Stack and focus trap live in Leoforma and are tested there; the app tests the Android back wiring. | `src/ui/overlayBackButton.test.ts`, `src/ui/overlayBackButton.sheet.test.tsx` |
| FR-UI-006 | Menus MUST support arrow navigation and Escape. | Given an open menu, When ArrowDown is pressed, Then focus moves. Menu behavior is tested in Leoforma; the app tests its overflow menu items. | `src/app/layout/DocumentHeader.test.tsx` |
| FR-UI-007 | The sidebar width MUST stay within 180 to 480 px, default 260. | Given a drag past 480, When resized, Then the width is clamped. | `src/app/useResizableSidebar.test.ts` |
| FR-UI-008 | The file tree MUST be keyboard navigable. | Given focus in the tree, When ArrowDown is pressed, Then the next row is focused. | `src/workspace/FileTree.test.tsx` |
| FR-UI-009 | With no open note, the editor area MUST show an empty state with a local quote. | Given no tab, When rendered, Then a quote shows. | `src/app/EmptyEditorState.test.tsx` |
| FR-UI-010 | rtlWorkspaceEnabled MUST mirror the sidebar and toolbar layout. | No test was confirmed during this pass. | NONE |
| FR-UI-011 | Both themes MUST honor prefers-reduced-motion and forced-colors-compatible focus outlines. | Implemented in CSS; no automated assertion exists. | NONE |
| FR-UI-012 | Ctrl/Cmd W, Tab, Shift+Tab, Shift+P and Shift+U MUST close, cycle, pin and unpin the active tab. | Given two tabs, When Ctrl+Tab is pressed, Then focus moves to the next. | `src/app/App.test.tsx` |

## 9. UI specification

### 9.1 Shell

Regions are activity rail (720 px and above), navigation panel, tab bar and document header, editor area, optional secondary group, and inspector. The rail's destinations are Files, Bookmarks, Tags (when enabled), Graph view and Settings. Sidebar width is 180 to 480 px, default 260.

| Layout class | Width | Behavior |
| --- | --- | --- |
| Compact | below 720 | Top bar and sheets, one visible editor group |
| Medium | 720 to 1099 | Activity rail, overlay navigation panel |
| Wide | 1100 to 1279 | Rail, docked panel |
| Expanded | 1280 and above | Rail, docked panel |

Navigation panels are mutually exclusive. Loading, error and empty states are required by product rules; they were not audited panel by panel in this pass.

### 9.2 Commands

Palette commands (conditional ones in parentheses): Switch workspace, Add workspace, Manage workspace profiles, toggle sidebar, toggle bookmarks, (toggle tags), toggle task hub, (toggle collections), Markdown formatting help, Open Settings, Quick Capture, (Open file from outside the vault, desktop with the feature on), (New note from template), New note, (New canvas), New drawing, Increase font size, Decrease font size, Open graph view, Switch to Source, Split and Preview view; for an active note (Print note, Export note to HTML, bookmark toggle, Copy block link, Create block link, table add and delete row or column), Rename current note, Close current tab, (Pin, Unpin, Unpin and close), Close all unpinned tabs. This list was extracted from `App.tsx` and is not exhaustive for split-group commands.

### 9.3 Keyboard shortcuts

| Keys (Ctrl or Cmd) | Action | Source |
| --- | --- | --- |
| `N` | New note | `App.tsx` |
| `K` | Command palette | `App.tsx` |
| `W` | Close current tab | `App.tsx` |
| `Tab` / `Shift+Tab` | Next or previous tab | `App.tsx` |
| `S` | Flush save | `App.tsx` |
| `Shift+C` | Quick Capture | `App.tsx` |
| `+` or `=` / `-` | Zoom in or out | `zoomControls.ts` |
| `0` | Reset zoom | `zoomControls.ts` |
| `,` | Settings | `App.tsx` |
| `Shift+P` / `Shift+U` | Pin or unpin | `App.tsx`, not in the displayed list |
| `Enter` in capture | Submit capture | `CaptureSheet.tsx` |
| Wheel with modifier | Zoom | `App.tsx` |

Inside the editor, the CodeMirror default, history, search and completion keymaps apply, plus `Tab` for snippets. Inside the preview, Ctrl or Cmd-click opens a link in the other group. Escape closes the topmost overlay. Android's hardware back also dismisses overlays through the overlay stack.

The Settings panel displays the `KEYBOARD_SHORTCUTS` list from `src/app/shortcuts.ts`.

### 9.4 Settings UI

Sections are General, Feature selection, Appearance, Keyboard shortcuts, Health and About (with a license viewer). The panel has a search field and category navigation. Keys and defaults are in 6.2 and 6.4. Saving is reflected by a "Saving…" indicator from `workspaceSettingsSaving`. The in-memory value updates synchronously.

### 9.5 Themes and tokens

`src/styles/theme.css` defines tokens on `:root`, redefined under `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])`, and for `data-theme="dark"`.

Tokens, bundled fonts and shared primitives come from the public package `@leonardschwier/leoforma` (release 0.2.0, installed from its release asset with a lockfile integrity hash), imported in `src/main.tsx` before `theme.css`. Leoforma owns the light and dark palettes, selected by `data-theme` on the root or the OS preference. Light base values: canvas `#f5efe3`, panel `#faf6ec`, raised `#fffdf7`, text `#1a2830`, secondary `#4a5559`, muted `#59625f`, border `#dcd3bf`, accent `#785618`, success `#2a6346`, warning `#75510c`, danger `#9c352c`, focus `#1c5a74`. Dark base values: canvas `#131e25`, panel `#18252c`, raised `#1f2d35`, text `#f2ebdd`, secondary `#c4bdae`, muted `#aca89b`, border `#2d3c44`.

Radii are 4, 6, 10, 14 and 999 px. Motion durations are 100, 160, 200 and 1500 ms. Fonts are bundled by Leoforma: Figtree (interface and sans reading), Literata (serif reading) and Source Code Pro (source editor and code), so no font depends on the system. `theme.css` keeps the app-only values: search highlight, the six `==mark==` colors, the Ocean, Forest and Plum accent choices, `--font-reading`, `--content-font-size` and `--ui-zoom`.

### 9.6 Accessibility

- Icon buttons have accessible names.
- `prefers-reduced-motion` blocks exist in `theme.css` and `App.css`.
- Focus uses `outline` so it survives forced-colors mode.
- Outline uses a `role="status"` live region for announcements. Capture has an announcement signal.
- Toolbars use `role="toolbar"`, `radiogroup` and labels in ink.

Screen-reader behavior on real assistive technology is **Unverified**. No WCAG conformance level is claimed.

### 9.7 Compact and Android behavior

- `windowSoftInputMode` is `adjustResize`. `viewport-fit=cover` is set.
- Status bar appearance follows theme through `setStatusBarAppearance`.
- Sheets replace popovers in compact layouts.
- Split shows one group with a switcher.
- Android image display uses `data:` URLs, capped at 8 MiB per read.

## 10. Non-functional requirements

Only numbers that exist in code, configuration or an observed run appear here. No performance budget is claimed, because no benchmark is enforced in CI.

| ID | Requirement | Verification | Test |
| --- | --- | --- | --- |
| NFR-OFF-001 | CSP in `tauri.conf.json` MUST block external origins. | Observed passing | `src/offline.test.ts` |
| NFR-OFF-002 | Rendering the App MUST NOT call fetch, XHR, WebSocket, EventSource or remote Image. | Observed passing | `src/offline.test.ts` |
| NFR-OFF-003 | `index.html` MUST carry its CSP meta tag, as the shared enforcement for both shells. | Traced | NONE |
| NFR-OFF-004 | The Android manifest MUST NOT include `INTERNET`. | Observed by search of `android/app/src` | NONE |
| NFR-SEC-001 | Asset protocol scope MUST start empty and follow the active root. | Observed passing | `src/assetProtocolScope.test.ts` |
| NFR-SEC-002 | Unscoped commands MUST reject paths outside the active root and config directory. | Observed passing | `src-tauri/src/commands.rs` |
| NFR-SEC-003 | Scoped commands MUST reject `..`, absolute paths and escaping symlinks. | Observed passing | `src-tauri/src/commands.rs` |
| NFR-SEC-004 | Preview HTML MUST be sanitized with DOMPurify; Mermaid SVG MUST be sanitized. | Observed passing | `src/markdown/mermaidSanitize.test.ts` |
| NFR-SEC-005 | Stored `lastOpenPaths` and layout paths MUST NOT escape the workspace. | Observed passing | `src/settings/workspaceSettings.test.ts` |
| NFR-REL-001 | Bridge calls MUST be drained before a workspace transition changes access. | Observed passing | `src/workspace/saveCoordinator.test.ts` |
| NFR-REL-002 | Native overwrite MUST be atomic on desktop. Android writes are provider streams and not atomic. | Traced | `src-tauri/src/commands.rs` |
| NFR-REL-003 | Failed saves MUST leave prior disk content and keep the tab dirty. | Observed passing | `src/workspace/saveCoordinator.test.ts` |
| NFR-REL-004 | Non-UTF-8 text reads MUST reject, not crash. | Traced | NONE |
| NFR-LIM-001 | Android single-file reads MUST NOT buffer over 8 MiB. | Traced | NONE |
| NFR-LIM-002 | Search batch 8 MiB, per-file cap 50 MiB, unknown size assumed 4 MiB, concurrency 40. | Traced | `src/workspace/fileTreeStore.test.ts` |
| NFR-LIM-003 | Walks depth 40. Embeds 3 levels, 25 instances, 1 MiB. Capture 32 KiB. | Traced | `src/editor/MarkdownPreview.test.tsx` |
| NFR-LIM-004 | Graph layout work budget as FR-GRAPH-001. | Observed passing | `src/graph/layoutBudget.test.ts` |
| NFR-A11Y-001 | Both themes and keyboard navigation for shell surfaces. | Partial, by component tests (Leoforma's suite includes axe checks) | `src/app/layout/DocumentHeader.test.tsx` |
| NFR-CRASH-001 | Main MUST launch on the Linux AppImage smoke and install on an API 35 emulator. | CI | `.github/workflows/ci.yml` |
| NFR-CRASH-002 | Tests MUST fail on unhandled errors in jsdom, using the polyfills in `src/test/setup-jsdom.ts`. | Observed | `vitest.config.ts` |
| NFR-CRASH-003 | A Markdown parser failure on pathological input (for example deeply nested blockquotes) MUST NOT blank the app; the Preview MUST show the text escaped in a `<pre>` and recover on the next edit. | Observed passing | `src/editor/MarkdownPreview.test.tsx` |
| NFR-CRASH-004 | Clipboard writes, workspace search and first-level tree expansion MUST NOT produce unhandled promise rejections when the native or clipboard call fails. | Observed passing | `src/workspace/fileTreeStore.test.ts`, `src/workspace/FileContextMenu.test.tsx` |
| NFR-CRASH-005 | On Android, a plugin method MUST NOT let an exception escape to the Capacitor bridge: `pickFolder` and `exportHtml` reject when no document picker exists, and malformed share-intent extras drop the share. | Traced, JVM tests for the decision logic | `android/app/src/test/java/com/leonardschwier/leotheca/NativeBoundaryPolicyTest.java` |

**Measured figures on record.** `documentation` and code comments cite a ~580-note SAF vault taking 90+ seconds with per-directory bridge calls, which motivated the single-call walk. This is a historical comment, not a current budget, and was not reproduced here.

**Bundle figures on record.** A 2026-10-11 roadmap review recorded a 3,039 kB main chunk (949 kB gzip). Not re-measured here, and not a budget.

## 11. Build, packaging and release

**Toolchain.** Node 22, Rust stable with `tauri-cli` 2, Java 21 for Android, Android compile and target SDK 35, min SDK 29. Frontend libraries are in `package.json`.

| Command | Purpose |
| --- | --- |
| `npm ci` | Install |
| `npm run dev` | Vite on port 1420 per `devUrl` |
| `npm run build` | `tsc --noEmit` then `vite build` into `dist/` |
| `npm test` | Vitest |
| `npm run lint` | ESLint |
| `npm run check-version` | `VERSION`, `package.json`, `Cargo.toml`, Android and other metadata agree |
| `npm run ci`, `ci:quick`, `ci:frontend`, `ci:backend` | `scripts/ci-local.sh` |
| `npx tauri build` | Desktop bundle |
| `npx cap sync android`, `./gradlew assembleDebug` | Android |

**Versioning.** `VERSION` is authoritative. Android `versionName` mirrors it, and `versionCode = major*10000 + minor*100 + patch`.

**Identity.** App id `com.leonardschwier.leotheca`, product name Leotheca, deep-link scheme `leotheca`, `.md` file association with mime `text/markdown` and role Editor.

| Workflow | Trigger | Does |
| --- | --- | --- |
| `ci.yml` | Push (ignoring `ROADMAP.md` and `.agents/handoffs/**`), PR, call | Jobs `frontend`, `e2e`, `backend`, `android`, `appimage-smoke`, `validation` (`validation` requires every other job) |
| `rules.yml` | Push, PR, weekly schedule | Commit convention, added-line rules, secret-shaped tokens, dependency intake, fast-forward-only main, prettier on changed files, licenses, action pinning, `npm audit` (reported, non-blocking until triaged) |
| `agent-policy.yml` | Push on policy paths; every pull request and merge-queue run; weekly schedule (Monday 05:17 UTC) | Python helper tests, ledger and roadmap format, hosted CI evidence in finished items; the schedule runs only the `ledger-audit` job |
| `audit.yml` | Pull requests and pushes to main that change `package.json` or `package-lock.json`; weekly schedule (Monday 05:41 UTC) | `npm audit --omit=dev --audit-level=high`; not a required merge check, so a new advisory turns the weekly run red without blocking unrelated pull requests |
| `release.yml` | Tag `v*`, implementation push to main, manual | Builds Linux, Android, Flatpak, macOS, Windows, then publishes |
| `flathub-submission-verify.yml`, `fdroid-submission-verify.yml` | Workflow-defined | Verify store recipes |

**Release channels.** A `v*` tag publishes a draft versioned release (draft because no Android signing keys exist). A push to main replaces the rolling `dev-build` release, which is published as a normal release and marked Latest, and is the only published release unless a `v*` tag is released. Publication requires `validation`, `version-guard`, Linux and Android success. Flatpak, macOS and Windows are optional, and their absence is recorded in the release body. Manual runs never publish. The `publish` job runs in a concurrency group (`release-publish-<tag>` for a tag, `release-publish-dev-build` otherwise) with `cancel-in-progress: false`, so overlapping runs queue instead of racing on the release assets.

**Packaging.** `flatpak/` (GNOME 50 runtime, offline `cargo-sources.json`, `node-sources.json`), `packaging/f-droid/`, `packaging/homebrew/` (draft Cask with TODO placeholders), `packaging/macos/` (app and Quick Look), `snap/` (draft). External store submission status is not confirmed by the code.

**Local hooks.** `core.hooksPath=hooks` is set in the local repository config by `npm ci` (`prepare` runs `scripts/install-hooks.mjs`) or `npm run hooks:install`; the script is idempotent, never touches global config and skips CI and Flatpak builds. `hooks/pre-commit` checks staged files (whitespace, conflict markers, size, em dashes, competitor names, secret-shaped tokens, prettier, eslint, `cargo fmt`, optional gitleaks with a reported skip). `hooks/commit-msg` enforces the commit convention. `hooks/pre-push` runs the rule checks over the pushed range, refuses force pushes and deleting main, then `scripts/verify-fast.sh` (`tsc`, `eslint`, vitest, version, ledger); the e2e smoke runs only when the suite exists. `PREPUSH_FULL=1` runs the slow `scripts/ci-local.sh`. `scripts/guard-command.mjs` is an opt-in destructive-command guard. See `hooks/README.md`.

## 12. Test strategy

| Layer | Location | Count on 2026-11-06 |
| --- | --- | --- |
| Frontend unit and component | `src/**/*.test.*`, `mermaid.smoke.test.ts`, `scripts/*.test.js`, `extensions/web-clipper/*.test.js` under Vitest | 3221 tests in 171 files, all passing (Observed) |
| Rust | `#[cfg(test)]` modules | 94 `#[test]` attributes (counted, not run in this pass) |
| Java | `android/app/src/test` | 3 files, run by `./gradlew testDebugUnitTest` in CI |
| Python policy | `scripts/test_*.py` | Run by `agent-policy.yml` |
| End to end | `tests/e2e` | Playwright smoke suite, 14 journeys (boot, navigation, rendering, view modes, search, note create/edit/rename/delete, settings/theme) against the built frontend with an in-page stateful bridge mock; a test fails on console errors, off-site requests or unmocked native commands; required CI job `e2e` uploads traces on failure |
| End to end (legacy) | `tests/ui/leotheca_e2e_test.py` | Playwright against Vite with `tests/ui/tauriMock.js`; not in CI |
| Smoke | `ci.yml` | AppImage launch for 15 s under xvfb, APK install on an API 35 emulator |

Vitest uses jsdom. DOMPurify requires it: happy-dom strips all tags. `src/test/setup-jsdom.ts` provides DOM polyfills. Bridge tests use faithful fakes at the boundary (`capacitorMutationContract.test.ts`, `tauriBridge.test.ts`). A bug fix MUST include a regression test shown to fail without the fix.

**Known weakness.** Mocks of `workspace/paths` can hide real path-argument bugs: `customCss.test.ts` mocks both functions and passed with KG-004 present.

## 13. Rebuild order

1. Path math, decoders and scanners (`paths`, `decode`, `headings`, `blocks`, `tasks`, `tables`, `wikiSyntax`).
2. Native gates and commands (7.2), with Rust tests. Then the Android plugins (7.3).
3. Bridge dispatcher with platform no-ops (7.4).
4. Settings, profiles, transitions (6.2 to 6.4, FR-WS, FR-SET).
5. File tree, tabs, save coordinator, editor, preview (FR-FS, FR-TAB, FR-EDIT, FR-VIEW).
6. Link index and everything built on it (FR-LINK, FR-SEARCH, FR-TAG, FR-TASK, FR-DIAG, FR-COLL, FR-GRAPH).
7. Rename, capture, automation (FR-REN, FR-CAP, FR-AUTO).
8. Canvas, ink, PDF, export, optional aids, widgets.
9. Build, packaging, and the CI of section 11.

The acceptance suite for a rebuild is the requirement tables here. A rebuild SHOULD also decide KG items deliberately rather than reproduce them.

## 14. Traceability

Generated from section 8 by `python3 scripts/check_master_spec.py --update-traceability`. Per-requirement links are in the section 8 tables.

<!-- traceability:start -->
| Prefix | Area | Requirements | With a linked test | NONE | Test files |
| --- | --- | --- | --- | --- | --- |
| FR-WS | Workspaces and profiles | 13 | 13 | 0 | `src-tauri/src/commands.rs`, `src-tauri/src/workspace_grants.rs`, `src/settings/WelcomeDialog.test.tsx`, `src/settings/store.test.ts`, `src/settings/workspaceProfiles.test.ts`, `src/settings/workspaceTransition.test.ts`, `src/workspace/tauriBridge.test.ts`, `src/workspace/tauriBridgeImpl.test.ts`, `src/workspace/workspaceTransition.test.ts`, `src/workspace/workspaceTransitionRecovery.test.ts` |
| FR-FS | File tree and file operations | 13 | 13 | 0 | `src-tauri/src/commands.rs`, `src/workspace/FileContextMenu.test.tsx`, `src/workspace/TemplatePicker.test.tsx`, `src/workspace/fileOpenAuthority.test.ts`, `src/workspace/fileTreeStore.test.ts`, `src/workspace/types.test.ts` |
| FR-EDIT | Editor and saving | 17 | 17 | 0 | `src/app/fontSizeControls.test.ts`, `src/editor/attachments.test.ts`, `src/editor/frontmatterEdits.test.ts`, `src/editor/livePreview.test.ts`, `src/editor/slashCommands.test.ts`, `src/editor/snippets.test.ts`, `src/editor/textDiff.test.ts`, `src/editor/textDirection.test.ts`, `src/markdown/highlight.test.ts`, `src/markdown/tableCommands.test.ts`, `src/settings/workspaceSettings.test.ts`, `src/workspace/saveCoordinator.test.ts`, `src/workspace/tauriBridge.test.ts` |
| FR-VIEW | Markdown preview | 10 | 10 | 0 | `src/editor/MarkdownPreview.concurrency.test.tsx`, `src/editor/MarkdownPreview.test.tsx`, `src/markdown/mermaid.test.ts`, `src/markdown/mermaidFigure.test.ts`, `src/markdown/mermaidSanitize.test.ts`, `src/offline.test.ts`, `src/styles/mermaid.test.ts` |
| FR-LINK | Wikilinks, headings and blocks | 13 | 13 | 0 | `src/editor/MarkdownPreview.test.tsx`, `src/editor/blockLinkActions.test.ts`, `src/linking/BacklinksPanel.test.tsx`, `src/linking/frontmatter.test.ts`, `src/linking/store.test.ts`, `src/linking/wikiResolver.test.ts`, `src/linking/wikiSyntax.test.ts`, `src/markdown/blocks.test.ts`, `src/markdown/headings.test.ts` |
| FR-SEARCH | Search | 7 | 7 | 0 | `src/workspace/fileTreeStore.test.ts`, `src/workspace/searchOwnership.test.ts`, `src/workspace/searchQuery.test.ts` |
| FR-TAG | Tags | 3 | 3 | 0 | `src/app/layout/ActivityRail.test.tsx`, `src/tags/tags.test.ts` |
| FR-TASK | Task hub | 4 | 4 | 0 | `src/markdown/tasks.test.ts`, `src/tasks/taskMutation.test.ts`, `src/tasks/taskQuery.test.ts` |
| FR-OUTLINE | Outline and breadcrumbs | 5 | 5 | 0 | `src/outline/HeadingLinkActions.test.tsx`, `src/outline/OutlinePanel.test.tsx`, `src/outline/outlineVirtualization.test.ts`, `src/outline/splitAuthority.test.ts` |
| FR-BOOK | Bookmarks | 3 | 3 | 0 | `src/bookmarks/store.test.ts` |
| FR-COLL | Smart collections | 9 | 9 | 0 | `src/collections/collectionDecode.test.ts`, `src/collections/collectionQuery.test.ts`, `src/collections/collectionTypesInference.test.ts`, `src/collections/filterRows.test.ts`, `src/collections/groupOrder.test.ts`, `src/settings/workspaceSettings.test.ts` |
| FR-CAP | Quick capture | 11 | 8 | 3 | `src/app/CaptureSheet.test.tsx`, `src/capture/PendingCapturesPanel.test.tsx`, `src/capture/androidShareBridge.test.ts`, `src/capture/captureCommit.test.ts`, `src/capture/captureDestinations.test.ts`, `src/capture/captureTemplate.test.ts`, `src/capture/pendingCaptures.test.ts` |
| FR-AUTO | Automation URLs | 6 | 6 | 0 | `src/app/automationCommands.test.ts`, `src/capture/headingInsertCommit.test.ts`, `src/headingInsert.test.ts` |
| FR-REN | Rename and refactor | 7 | 6 | 1 | `src-tauri/src/workspace_mutations.rs`, `src/refactor/metadataMigrator.test.ts`, `src/refactor/renameExecutor.test.ts`, `src/refactor/renamePlan.test.ts` |
| FR-DIAG | Diagnostics and health | 3 | 3 | 0 | `src/diagnostics/DiagnosticsPanel.test.tsx`, `src/diagnostics/diagnostics.test.ts`, `src/diagnostics/healthAudit.test.ts` |
| FR-GRAPH | Graph | 5 | 5 | 0 | `src/graph/layoutBudget.test.ts`, `src/graph/layoutCoordinator.test.ts`, `src/graph/noteTimeline.test.ts`, `src/graph/transform.test.ts`, `src/settings/workspaceSettings.test.ts` |
| FR-CANVAS | Canvas | 3 | 2 | 1 | `src/canvas/canvasDocument.test.ts` |
| FR-INK | Ink drawing | 4 | 4 | 0 | `src/ink/InkView.test.tsx`, `src/ink/inkDocument.test.ts`, `src/ink/inkEditing.test.ts`, `src/ink/strokeProcessing.test.ts` |
| FR-PDF | PDF viewer and annotation | 4 | 4 | 0 | `src/pdf/PdfViewer.test.tsx`, `src/pdf/pdfAnnotations.test.ts` |
| FR-TAB | Tabs and split groups | 7 | 7 | 0 | `src/editorGroups/SecondaryEditorPane.test.tsx`, `src/settings/workspaceSettings.test.ts`, `src/workspace/documentGroups.test.ts`, `src/workspace/store.test.ts` |
| FR-SET | Settings persistence | 10 | 9 | 1 | `src/settings/VaultStatsPanel.test.tsx`, `src/settings/defaultHandler.test.ts`, `src/settings/globalConfig.test.ts`, `src/settings/store.test.ts`, `src/settings/workspaceSettings.test.ts` |
| FR-THEME | Themes and appearance | 4 | 4 | 0 | `src/app/zoomControls.test.ts`, `src/settings/customCss.test.ts`, `src/settings/store.test.ts`, `src/settings/workspaceSettings.test.ts` |
| FR-EXP | Print and export | 3 | 3 | 0 | `src/export/exportNoteHtml.test.ts`, `src/export/printNote.test.ts`, `src/workspace/tauriBridgeImpl.test.ts` |
| FR-EXT | External file open | 3 | 3 | 0 | `src-tauri/src/external_open.rs`, `src/app/ExternalFileView.test.tsx`, `src/settings/globalConfig.test.ts` |
| FR-IMPORT | Markdown vault import | 6 | 6 | 0 | `src-tauri/src/markdown_import.rs`, `src/markdownImport/importStore.test.tsx`, `src/markdownImport/markdownImport.test.ts` |
| FR-SPEECH | Speech to text | 4 | 3 | 1 | `src/settings/workspaceSettings.test.ts`, `src/speech/speechController.test.ts`, `src/workspace/speechBridgeImpl.test.ts` |
| FR-SPELL | Spell check | 1 | 1 | 0 | `src/spellcheck/spellCheck.test.ts` |
| FR-WID | Android widgets | 3 | 3 | 0 | `android/app/src/test/java/com/getcapacitor/myapp/WidgetResourcesUnitTest.java`, `android/app/src/test/java/com/leonardschwier/leotheca/NewNoteColdStartTrackerTest.java`, `src/workspace/fileTreeStore.test.ts` |
| FR-CLIP | Web clipper extension | 3 | 3 | 0 | `extensions/web-clipper/clipperCore.test.js`, `extensions/web-clipper/messaging.test.js` |
| FR-UI | Shell, UI primitives and accessibility | 12 | 10 | 2 | `src/app/App.test.tsx`, `src/app/CommandPalette.test.tsx`, `src/app/EmptyEditorState.test.tsx`, `src/app/layout/DocumentHeader.test.tsx`, `src/app/layout/adaptiveLayout.test.ts`, `src/app/useResizableSidebar.test.ts`, `src/fuzzyMatch.test.ts`, `src/ui/overlayBackButton.sheet.test.tsx`, `src/ui/overlayBackButton.test.ts`, `src/workspace/FileTree.test.tsx` |
| **Total** | | **196** | **187** | **9** | |
<!-- traceability:end -->

## 15. Coverage gaps

Requirements with `NONE` in the Test column, listed so they are not mistaken for tested behavior:

<!-- coverage-gaps:start -->
- FR-CAP-001
- FR-CAP-004
- FR-CAP-007
- FR-REN-006
- FR-CANVAS-003
- FR-SET-008
- FR-SPEECH-004
- FR-UI-010
- FR-UI-011
<!-- coverage-gaps:end -->

Weak coverage that passes today:

- FR-THEME-003 is covered only through mocks of the path functions, which hides KG-004.
- FR-EDIT-016 covers decoding of `defaultViewMode`, not its application on open.
- Rust and Java tests were not run in this pass. CI runs them.
- Physical Android devices, macOS and Windows runtime behavior: not verified here.

## 16. Known gaps and defects

These are current behavior, recorded honestly. None was fixed by the change that wrote this document.

| ID | Finding | Evidence | Severity |
| --- | --- | --- | --- |
| KG-001 | Scoped desktop commands trust the frontend-supplied `workspace_root` and do not compare it with `ActiveWorkspaceRoot`. `init_speech_recognition` and `check_whisper_models` no longer take paths (model name allow-list, fixed directory); only the workspace-root part remains. | Traced in `commands.rs`, `workspace_mutations.rs`, `speech_commands.rs` | Medium |
| KG-002 | `lib.rs` manages `WhisperState`, but speech commands request `State<Arc<Mutex<WhisperState>>>`. Those are different types, so Tauri cannot supply the state. Desktop speech is unavailable regardless, since no whisper backend is compiled by default. | Traced. Runtime invoke result Unverified. | Medium |
| KG-003 | Android native plugin methods accept any URI string with no allow-list. Protection is the OS grant and the JS layer. | Traced | Medium |
| KG-004 | `applyCustomCss` calls `resolvePath(customCssPath, workspacePath)` and `isPathWithinWorkspace(absolutePath, workspacePath)`, reversing both signatures. It tries to read the workspace folder itself, so with a real filesystem custom CSS never applies. | Observed: a probe with real path functions read `/ws`. | High for that feature |
| KG-005 | `decodeWorkspaceSettings` omits `mermaidRenderingEnabled` from its normalized object. A missing key stays `undefined`, so Settings highlights neither option, and a bad value such as `"yes"` stays in memory, though corrupt is set. Preview treats `undefined` as on. | Observed by probe | Low |
| KG-006 | The rename journal is an in-memory array, so `recoverFromIncompleteOperations` cannot recover after a process crash. A crash mid-rename can leave partial edits. Only the same-process rollback path works. | Traced in `renameExecutor.ts` | Medium |
| KG-007 | Android file writes go through provider streams and are not atomic. | Traced | Medium |
| KG-008 | `tauri-plugin-global-shortcut` is a dependency but is not initialized. | Traced in `Cargo.toml`, `lib.rs` | Low |
| KG-009 | There is no restore UI or purge for `.trash/`. | Traced | Low |
| KG-010 | Pending captures are cast from JSON without validating entries in a valid array. | Traced in `pendingCaptures.ts` | Low |
| KG-011 | `tauri.conf.json` CSP and the `index.html` meta CSP differ. The meta tag is stricter (`connect-src 'self'`, `media-src 'self'`, `frame-src 'none'`). Which one governs asset and blob media or frames on each platform is Unverified, because a page subject to both must satisfy both. | Traced | Low |
| KG-012 | `noteTimeline` is a tested model with no UI. | Traced | Informational |
| KG-013 | Rust capabilities grant `fs:default`, `fs:allow-read-text-file` and `fs:allow-write-text-file` although storage goes through custom commands. Whether the app needs them was not determined. | Traced in `capabilities/default.json`; need Unverified | Low |

## 17. Document discrepancies

| ID | Document says | Code does |
| --- | --- | --- |
| DD-01 | `documentation/ARCHITECTURE.md` diagrams Tauri as Linux only. | `workspace_mutations.rs` and `release.yml` target macOS and Windows too. |
| DD-02 | `documentation/TESTING.md`: about 2,933 tests in 152 files. | Observed 3221 tests in 171 files. |
| DD-03 | `packaging/STATUS.md` says `VERSION` is 0.1.0, and it is in German. | `VERSION` is 1.0.0. |
| DD-04 | `src/refactor/renameExecutor.ts` header and F03 spec: durable journal. | In-memory only (KG-006). |
| DD-05 | `src/speech/speechController.ts` header: uses whisper.cpp on desktop. | No backend compiled by default; see `speechBridgeImpl.ts` and KG-002. |
| DD-06 | Code comments cite CONSTITUTION.md's "Offline by design" and "Technology stack" sections. | No such headings in `CONSTITUTION.md`. The rules live in `documentation/PROJECT_RULES.md`. |
| DD-07 | `src/app/shortcuts.ts` omits pin and unpin. | `App.tsx` handles `Ctrl+Shift+P` and `U`. |
| DD-08 | `spec/*.md` documents are design documents with phases. | Parts are narrowed or unimplemented. This document, not `spec/`, describes what shipped. Individual differences were not enumerated. |
| DD-09 | `src/settings/SettingsPanelCurrentTests.tsx` is named as tests. | It is a non-test `.tsx` imported only by `SettingsPanel.test.tsx`. |

## 18. Change log

Newest first. Each entry is `YYYY-MM-DD: what changed in behavior, contracts, formats, build or release`. See `skills/master-spec-maintenance.md`.

<!-- change-log:start -->
- 2026-11-07: Preview: Mermaid diagrams follow the app theme (light or dark, redrawn when it flips), fill the note width, and have zoom, pan and full-screen controls (`src/markdown/mermaidFigure.ts`, `src/styles/mermaid.css`); a diagram that fails to render shows an error notice with the reason above its source instead of a bare code block.
- 2026-11-07: CI: new workflow `.github/workflows/gitleaks.yml` (pinned gitleaks 8.30.1 release binary, SHA-256 verified) scans the tree and the commits of each pull request or push, and the whole history weekly, with rules and narrow allowlists in `.gitleaks.toml`; `.github/workflows/audit.yml` gains a `cargo-audit` job (pinned 0.22.2 binary, checksum verified) for `src-tauri/Cargo.lock` that fails on RustSec vulnerabilities. Neither is a required check. No application behavior changed.
- 2026-11-07: UI: `EmptyState` and the `Icon` set now come from `@leonardschwier/leoforma`; `src/ui/` keeps only the Android back-button wiring and `primitives.css` is gone. The empty states in the Bookmarks and Tags panels pass their icon as an element, and the "Couldn't open ..." error messages use a colon instead of an em dash. A small app-level `.ds-icon` rule keeps the old icon alignment. Inspector, BookmarksPanel and TagsPanel were also formatted with prettier.
- 2026-11-07: UI: `Sheet` and `StatusIndicator` now come from `@leonardschwier/leoforma` (the app copies and their CSS are removed). The "Unsaved" indicator keeps its accessible name "Unsaved changes" through a `role="group"` wrapper, and `CaptureSheet` imports `overlayBackButton` itself so the Android back button still dismisses the topmost overlay. App.tsx and CaptureSheet.tsx were also formatted with prettier (no behavior change).
- 2026-11-07: Removed the never-published `website/` directory and the `gh-pages.yml` workflow; the README is the project's front page. Vitest and ESLint now skip `.claude/` (Claude Code worktrees), so a local run no longer executes copies of the tests. No application behavior changed.
- 2026-11-07: Build: `@leonardschwier/leoforma` is now installed from the 0.2.0 release asset (`leonardschwier-leoforma-0.2.0.tgz`) instead of a GitHub tag archive, so the lockfile integrity no longer depends on archive bytes. The two Flatpak offline-cache entries were replaced, and `scripts/flatpakSources.js` now also checks every cache index entry (path, sha1 prefix, and a matching file entry with the same integrity). No application behavior changed.
- 2026-11-07: Process: `scripts/check-rules.mjs trailers` (pre-push and the Rules workflow) requires `Legal-Check: N verified, M fixed, 0 open` when text, asset, doc or dependency files change, `Database-Review:` for schema or migration files, and `Review:` (reviewer model or `self-review` with a reason) for trust-boundary, workflow, hook or constitution files. No application behavior changed.
- 2026-11-07: Process: `scripts/check_ledger_evidence.py` requires every item newly marked done to carry a hosted workflow run id (or the words `hosted CI unavailable`) in its finish note. It runs in `agent-policy.yml` on every push and pull request, and a weekly `ledger-audit` job checks everything finished on or after 2026-11-08. No application behavior changed.
- 2026-11-07: Release workflow: the macOS DMG is now attached to the release. The `macos-dmg` artifact keeps its `dmg/` subfolder (it uploads the DMG and the `.app` together), so the publish pattern `artifacts/macos-dmg/*.dmg` matched nothing and the DMG was silently omitted; the pattern is now `artifacts/macos-dmg/dmg/*.dmg`. No application behavior changed.
- 2026-11-07: Release workflow: the rolling `dev-build` is now a normal release marked Latest (`make_latest`) instead of a prerelease, so the Releases page and Obtainium show the newest build; the outdated `v1.0.0` release and tag were removed. No application behavior changed.
- 2026-11-07: Security: `list_dir` now checks both `path` and `workspaceRoot` against the native `ActiveWorkspaceRoot` (or the app config dir) like its sibling read commands, so a compromised webview can no longer list an arbitrary directory by passing the same value twice. No change for normal workspace use.
- 2026-11-07: Build and process: the pre-commit and CI secret scan no longer flags the ledger helper's own 32-hex claim token in `ROADMAP.md` `agent-state` lines (`lineSecretProblems` in `scripts/check-rules.mjs`); real secrets on those lines or elsewhere are still flagged. No application behavior changed.
- 2026-11-07: Fixed after the Leoforma move: the Ocean, Forest and Plum accent choices now set Leoforma's `--ds-color-accent*` tokens, so Leoforma's Button and other shared components follow the workspace accent as the app's own controls do. Without it they stayed on the default gold. Added `src/styles/theme.test.ts` (FR-THEME-002 is the setting).
- 2026-11-07: Build: removed the in-repo design system copy `packages/design-system` and its vitest exclusion; Leoforma is the only source. No application behavior changed.
- 2026-11-07: Appearance: the app's tokens, fonts and shared controls now come from Leoforma. The palette is Leoforma's Folio theme (warm paper light, deep teal dark) instead of the earlier neutral one; the interface and reading fonts are bundled Figtree and Literata. Button, IconButton, Dialog, Menu, Tooltip, SegmentedControl, Spinner and the overlay stack are Leoforma components; the Android back button is wired to its overlay stack by `src/ui/overlayBackButton.ts`. No data, setting or command changed.
- 2026-11-07: Build: the app depends on `@leonardschwier/leoforma` (public design system, release tarball of tag v0.1.1 with built `dist/`, integrity pinned by `package-lock.json`, `allow-remote=root` in `.npmrc`; installs without a build step and offline from the npm cache, and `flatpak/node-sources.json` lists it). Not yet imported by any source file. No application behavior changed.
- 2026-11-07: Web clipper now works in Chrome (listeners reply through `sendResponse`, scripts fall back from `browser` to `chrome`, Firefox manifest keys added, FR-CLIP-002/003); install and test notes added. The website uses relative URLs so it works under the project Pages path, its feature list is now a short code-checked list, and unverified claims (store availability, dictation, counts) were narrowed.
- 2026-11-07: Build and process: Playwright end-to-end smoke suite (`tests/e2e`, 14 journeys) and a required `e2e` job in `ci.yml` that uploads traces on failure. No application behavior changed.
- 2026-11-07: Crash hardening (Android): `pickFolder` and `exportHtml` reject instead of throwing when the device has no document picker; share-intent extras are read defensively and styled text is kept; a restored activity no longer replays its share intent; `onNewIntent` is null-safe.
- 2026-11-07: Desktop "Import Markdown vault..." command (`import_markdown_vault`, `cancel_markdown_import`, setting `markdownImportEnabled`, FR-IMPORT) copies a vault folder into `Imported/<name>`, converts three syntaxes and reports every outcome.
- 2026-11-07: Build and process: versioned git hooks (pre-commit, commit-msg, fast pre-push) enabled through `npm run hooks:install`, `scripts/check-rules.mjs` mechanical rule checks, `scripts/guard-command.mjs`, and the `rules.yml` CI workflow. No application behavior changed.
- 2026-11-07: Crash hardening (frontend): Preview falls back to escaped plain text when the Markdown parser throws on pathological nesting; clipboard writes, workspace search and first-level tree expansion no longer reject unhandled. Records the behavior of commit 0e80cd1.
- 2026-11-07: Quick Capture gained an optional per-capture Template select (existing templates folder, placeholders {{content}} {{title}} {{url}} {{date}} {{time}}); None keeps the plain format.
- 2026-11-06: Fixed a temp-file name collision in `write_file_atomically` (native atomic overwrite): two writes to the same target in the same millisecond on one process could silently overwrite each other's in-flight temp file, so the loser's rename failed with a spurious error while the winner's reported success actually held the other call's content. Temp names now carry a per-process monotonic sequence number as well as the existing timestamp/PID, so no two calls can collide. No caller-visible behavior change. Added FR-FS-013.
- 2026-11-06: First version, written from the code on main at application version 1.0.0.
- 2026-11-07: Release workflow: the publish job now runs in a concurrency group per release (tag, or dev-build) with cancel-in-progress false, so overlapping runs no longer race on release assets. No application behavior changed.
- 2026-11-07: Process: `ci.yml`, `rules.yml` and `agent-policy.yml` also run on `merge_group`, and `agent-policy.yml` no longer filters pull requests by path, so a required check is never skipped for the merge queue (`documentation/BRANCH_MODEL.md`). No application behavior changed.
- 2026-11-07: Process: the ownership ledger (claims, renewals, handoffs, finishes) moves to the `agent-ledger` branch; `ROADMAP.md` on main is a lagging snapshot, and the scheduled `ledger-audit` job in `agent-policy.yml` checks out the ledger branch (`documentation/BRANCH_MODEL.md`). No application behavior changed.
- 2026-11-07: Security: desktop `set_active_workspace_root` now accepts only roots in a native workspace grant registry (`workspace-grants.json` in the app data dir), filled by the new native `pick_workspace_folder` command and seeded once from the legacy `config.json` profiles; any other path is refused (FR-WS-013).
- 2026-11-07: Docs: `CHANGELOG.md` no longer lists Android camera capture (no camera code exists) or macOS Quick Look (source only, not built or bundled by any workflow) as shipped; `packaging/STATUS.md` is rewritten in English for `VERSION` 1.0.0 (resolves DD-03); `packaging/f-droid/README.md` states 1.0.0 / 10000 and that the `v1.0.0` tag was deleted; the README Obtainium note says what is unverified.
- 2026-11-07: Security: `init_speech_recognition` takes a model name from the allow-list `tiny|base|small|medium` and loads `<app_data_dir>/whisper-models/ggml-<name>.bin`; `check_whisper_models` takes no argument and probes that directory. A renderer can no longer make the native side open an arbitrary file.
- 2026-11-07: Security: `npm audit fix --omit=dev` cleared all 8 known vulnerabilities in the production dependencies (2 critical: `dompurify` 3.4.17, `@capacitor/android` 7.6.10; `mermaid` 12.3.0 with `chevrotain` 13.2.0 and `lodash-es` 4.18.1; `katex`). `flatpak/node-sources.json` was regenerated. New workflow `audit.yml` fails on high or critical advisories. Mermaid rendering is unchanged by design; the 3282 tests and the build pass.
- 2026-11-07: Packaging: `snap/snapcraft.yaml` and the draft Homebrew cask now declare version 1.0.0 like `VERSION`; the Flatpak README no longer refers to a `v0.1.0` tag that was never cut. No application behavior changed.
- 2026-11-07: Dependencies: 20 minor and patch updates within their declared ranges (CodeMirror, Capacitor core, cli and filesystem, pdfjs-dist, katex, vite, vitest, eslint, prettier and others) and two in `tests/e2e`; the Tauri JavaScript packages stay pinned to their Rust crate versions and all major versions are left alone. No application behavior changed; 3283 tests and the build pass.
<!-- change-log:end -->

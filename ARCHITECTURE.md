# Solution architecture

This document explains how Leotheca is put together and why, for anyone (human or AI agent) making a non-trivial change. It complements [`CONSTITUTION.md`](CONSTITUTION.md) (binding rules and decisions) and [`CONTRIBUTING.md`](CONTRIBUTING.md) (how to get a dev environment running); this file is about structure, not rules or setup steps.

## System overview

Leotheca is a local-first markdown editor with two native shells sharing one frontend:

```
                    +-----------------------------+
                    |   Shared frontend (src/)     |
                    |   Preact + TypeScript +      |
                    |   CodeMirror 6                |
                    +---------------+---------------+
                                    |
                     src/workspace/tauriBridge.ts
                     (platform dispatcher, see below)
                                    |
              +---------------------+---------------------+
              |                                             |
   +----------v----------+                       +----------v-----------+
   |  Tauri (Linux)       |                       |  Capacitor (Android) |
   |  src-tauri/ (Rust)   |                       |  android/ (Java) +   |
   |  real filesystem     |                       |  a custom SAF plugin |
   +-----------------------+                       +-----------------------+
```

There is no backend, no server, no account system. A "workspace" is a folder of `.md` files the user points the app at; everything the app does is read/write operations against that folder plus a small amount of local app configuration. See `PHILOSOPHY.md` for why this is a hard constraint, not just a current implementation detail.

## The platform abstraction layer

Every file operation in the frontend goes through `src/workspace/tauriBridge.ts`, a thin dispatcher:

```typescript
const impl = Capacitor.isNativePlatform() ? android : desktop;
export const listDir = impl.listDir;
export const readTextFile = impl.readTextFile;
// ...
```

`desktop` is `tauriBridgeImpl.ts` (calls into the Rust commands in `src-tauri/src/commands.rs` via Tauri's `invoke`). `android` is `capacitorBridgeImpl.ts` (calls into the custom `FolderAccessPlugin` described below). Every other module in the frontend imports from `tauriBridge.ts` and is written as if there were one platform; the dispatcher is the only place that needs to know two exist. When adding a new file operation, add it to both `*Impl.ts` files and re-export it from `tauriBridge.ts`, not to call sites directly.

This is why a third platform (macOS, Windows, once they exist) is expected to be a third `*Impl.ts` file plus a dispatcher branch, not a rewrite.

## Desktop shell: Tauri

- `src-tauri/src/lib.rs`: registers the Tauri plugins in use (`tauri-plugin-dialog` for the folder picker, `tauri-plugin-fs`) and the `#[tauri::command]` functions from `commands.rs` as the invoke handler.
- `src-tauri/src/commands.rs`: every filesystem operation the desktop frontend needs (`list_dir`, `read_text_file`, `write_text_file`, `create_dir`, `rename_path`, `trash_path`, `delete_path_permanent`, `workspace_stats`), each with unit tests in the same file. This is real filesystem access (`std::fs`), no sandboxing beyond the OS's own permissions, since the desktop OS already lets an app read/write anywhere the user can.
- `src-tauri/tauri.conf.json`: `build.devUrl` (`http://localhost:1420`, only used by `tauri dev`'s hot-reload server) vs. `build.frontendDist` (`../dist`, embedded into a real build). Which one a given binary uses is decided by the Tauri CLI at build time, not by the cargo release/debug profile; **a standalone/distributable build must be produced with `npx tauri build` (add `--no-bundle` to skip the `.deb`/`.rpm`/AppImage packaging steps if only the binary is needed), never a raw `cargo build --release`**, which silently leaves `devUrl` wired in and produces a binary that only works while a dev server happens to be reachable. See `agent-log/CHANGELOG.md`'s session 18 entry for the incident this note exists because of.

## Mobile shell: Capacitor + a custom native plugin

- `android/app/src/main/java/.../MainActivity.java`: registers the custom plugin below.
- `android/app/src/main/java/.../FolderAccessPlugin.java`: the mobile equivalent of `commands.rs`. Android has no direct filesystem access to an arbitrary folder the user picks; the only supported way is the Storage Access Framework (SAF): the user grants access to a folder via the system picker, the app gets an opaque, persistable `content://` tree URI, and every read/write/list/create/rename/move/delete operation goes through `ContentResolver`/`DocumentFile`/`DocumentsContract` against that URI. No mature Capacitor plugin for persistable SAF folder access exists (Capacitor's own Filesystem plugin dropped that support since Android 11), hence a small bespoke plugin rather than a dependency.
- `src/workspace/capacitorBridgeImpl.ts`: SAF URIs are opaque, you cannot construct a child's URI from its parent's the way you can concatenate a path. This file maintains an in-memory `path -> URI` cache, populated as directories get listed, self-healing (walks down from the nearest cached ancestor, re-listing as needed) for paths not yet seen in the current process, e.g. right after an app restart. It also splits a small amount of always-available app-private storage (`Directory.Data`, no permission prompt) for the tiny global config pointer file only, keeping every actual note under the SAF-backed synthetic `/workspace` root, via a path-prefix check (`isWorkspacePath`).
- **A gotcha worth knowing**: a Capacitor `DocumentFile.createFile(mimeType, name)` call lets the OS append a canonical extension for the given mime type if the name doesn't already end in it. Passing `"text/markdown"` for every file (including this app's own non-`.md` files like `.leotheca/settings.json`) silently turned `settings.json` into `settings.json.md` on disk, and broke overwriting on every subsequent save. Fixed by using `"application/octet-stream"` (no canonical extension) whenever the exact requested name matters. See session 18's changelog note above for the analogous desktop-side trap; both are instances of "the platform quietly does something clever with file naming/URLs that breaks an assumption the code made."

## Frontend module map (`src/`)

| Module | Responsibility |
|---|---|
| `app/` | `App.tsx`, the root component and toolbar; the command palette (`CommandPalette.tsx`); the markdown help dialog. Owns cross-cutting UI state (which panel is open, view mode) as module-level Preact signals. |
| `workspace/` | The file tree, tab bar, tab state (`store.ts`), and `fileTreeStore.ts` (create/rename/delete/search operations, workspace-scoped). `tauriBridge.ts` and its two `*Impl.ts` files live here too, see above. |
| `editor/` | `MarkdownEditor.tsx` (CodeMirror 6 source mode, syntax highlighting, `[[` wikilink autocomplete), `MarkdownPreview.tsx` (rendered preview), `ImageViewer.tsx`. |
| `linking/` | `store.ts`: extracts `[[wikilinks]]` from note content, builds an in-memory index (`linkIndex` signal: note name → paths, path → backlinks) by walking the whole workspace. See "The link index" below for why this is the one part of the app doing real background work. `BacklinksPanel.tsx` renders it. |
| `graph/` | `layout.ts`: a self-contained Fruchterman-Reingold force-directed layout (no dependency), computed once per graph open rather than animated. `transform.ts`: the pan/zoom/hit-testing math (screen-to-world conversion, "zoom toward cursor", node hit-testing), pulled out of the component so it's plain numbers in, plain numbers out, no canvas or DOM. `GraphView.tsx`: a full-screen canvas overlay built on top of those two, imperative `draw()` calls (not Preact-render-triggered, canvas doesn't benefit from a virtual DOM diff), Pointer Events for unified mouse/touch pan/zoom. |
| `bookmarks/` | Saved shortcuts to files or searches, persisted per workspace. |
| `settings/` | `store.ts` (workspace path, theme, view mode, tab restoration), `workspaceSettings.ts` (the `WorkspaceSettings` shape persisted to `<workspace>/.leotheca/settings.json`), `globalConfig.ts` (the tiny app-wide pointer file: last workspace path, theme, Android SAF token), `SettingsPanel.tsx`. |
| `styles/` | `theme.css`: CSS custom properties for the light/dark palette, bundled fonts. |

## The link index: the one background-work concern in the app

Everything else in this app is request-response (open a file, read it; save a file, write it). The wikilink/backlink/graph feature is the exception: to answer "what links here" or draw the graph, the app needs to have read every note in the workspace at least once. `rebuildLinkIndex` (`src/linking/store.ts`) does this by walking the whole workspace and reading every `.md` file, run once when a workspace opens and again right before the graph view opens (a note edited mid-session could have new links the initial pass didn't see).

On a small vault this is instant. On a large one (thousands of notes, confirmed against a real ~thousands-of-notes Android vault) it is not, especially over Android's SAF, where each read is a real cross-process round-trip through a single native bridge queue: dispatching every read at once (the original implementation) buried a user-initiated request (opening a note) behind thousands of already-queued background ones. `mapWithConcurrency` (bounded to 8 reads in flight at once) and a `linkIndexBuilding` signal (an "Indexing…" hint in the toolbar) mitigate the symptom; the underlying eager full-vault walk on every open is still there and is tracked as an open item in `ROADMAP.md`. A real fix is background/incremental indexing rather than one eager synchronous-ish pass, not yet built.

## Data and storage model

- A note is a plain `.md` file with YAML frontmatter (`created` timestamp, nothing else stamped automatically). Nothing about the file format is proprietary to this app; any text editor can open it.
- Per-workspace app state (theme-independent settings: sort order, font size, default view mode, delete behavior, the last session's open tabs) lives in `<workspace>/.leotheca/settings.json`, inside the workspace folder itself, so the folder stays self-contained and portable, the same way a project-local config directory works.
- Deleted files move to `<workspace>/.trash` by default (configurable per workspace to permanent deletion instead), never a hard delete unless the user opts in.
- The one piece of state that is *not* inside a workspace folder is the tiny global pointer (`globalConfig.ts`): which workspace to reopen on launch, the app-wide theme preference, and (Android only) the opaque SAF token needed to reconnect to that workspace's URI after a restart. This lives in Tauri's app config directory on desktop and a small app-private storage area on Android, never inside any workspace.

## Build and distribution architecture

| Platform | Build tool | Artifact(s) | Status |
|---|---|---|---|
| Linux desktop | `npx tauri build` | AppImage, `.deb`, `.rpm` (configured in `tauri.conf.json`'s `bundle.targets`) | AppImage building works; Flathub manifest complete with generated dependency source lists, not yet test-built, see `flatpak/README.md` |
| Android | Gradle via Capacitor (`npx cap sync android && ./gradlew assembleDebug`/`assembleRelease`) | APK | Debug builds verified on a real device throughout development; F-Droid packaging blocked on an open question about offline npm builds, see `packaging/f-droid/README.md` |
| macOS | Not yet built | Planned: Homebrew | Confirmed intended platform (see `CONSTITUTION.md`'s Decisions Log), no build target exists yet |
| Windows | Not yet built | Planned: direct download from GitHub Releases only, no package manager/store | Confirmed intended platform, no build target exists yet |

CI (`.github/workflows/`) builds and tests both the Linux and Android targets on every pull request; see `CONSTITUTION.md`'s Engineering practices for the standard this is held to.

## Testing strategy

- **Rust**: unit tests alongside each command in `src-tauri/src/commands.rs` (filesystem operations against real temp directories, not mocked).
- **Frontend, pure logic**: Vitest, on the default Node environment for logic that doesn't need a real DOM/canvas: the wikilink extraction and link-index build (`src/linking/store.test.ts`, including a test that directly asserts the bounded-concurrency fix caps in-flight reads rather than trusting the implementation), the graph layout and pan/zoom/hit-testing math (`src/graph/layout.test.ts`, `src/graph/transform.test.ts`), workspace settings load/save/merge behavior (`src/settings/workspaceSettings.test.ts`), and the `[[` wikilink autocomplete's completion source (`src/editor/MarkdownEditor.test.ts`) — this last one looks like it would need a real DOM/CodeMirror view but doesn't: `CompletionContext` is a plainly-constructible class given just an `EditorState`, no view or DOM required. Most other test files opt into a `jsdom` environment instead via a per-file `/** @vitest-environment jsdom */` docblock — either because the module under test transitively reads `window.matchMedia`/`document` at load time (`src/settings/store.ts` does, for system-theme detection), or because the file renders a component with `@testing-library/preact`, which needs a real DOM. This is a deliberate per-file choice rather than a global config change, so the pure-logic files above stay on the faster default. `settings/store.test.ts` caught a real bug the day it was added: `closeAllTabs` did two separate signal writes instead of one atomic one, see `agent-log/CHANGELOG.md` session 23.
- **Frontend, components**: `@testing-library/preact` (`render`/`fireEvent`/`cleanup`, plus Vitest's fake timers for anything debounced) for component-level interaction bugs that live in the DOM/event layer itself, not in a store module underneath it. Now the majority of interactive components have a test file this way (file tree, tabs, context menus, name/rename prompts, the command palette, the settings panel, the markdown preview's sanitization and wikilink click-through, the image viewer's async-race guard, and the smaller dialogs), each following the same two patterns: (1) when a component reads module-level signals directly rather than props, mock only the store modules that have their own module-load side effects the test doesn't want (typically `../settings/store`, for its `window.matchMedia` call) and let the rest of the real store run, driving the real signals directly from the test rather than re-mocking state that's already simple to set up for real; (2) mock a component's own store dependencies with `vi.mock`, using real `@preact/signals` `signal()` instances in the mock (not just spies) when the component needs to react to changes, so the component's actual reactive read/write behavior is exercised rather than assumed. Let genuinely-nested child components render for real when they only depend on already-mocked modules, rather than mocking every child too. **Always call `cleanup()` in `afterEach`**: `@testing-library/preact` does not auto-cleanup between tests, forgetting it leaves every previous test's render sitting in the DOM and produces confusing "multiple elements found" failures in the *next* test that look like an app bug but aren't (session 31 hit this on the first draft of `CommandPalette.test.tsx`). Several real, previously-unnoticed bugs have been found this way — a debounced search race on workspace switch (`Sidebar.test.tsx`), a stale-state bug in the file tree's expand/selection tracking after rename/delete (`fileTreeStore.test.ts`), a modal backdrop click closing more than it should (`SettingsPanel.test.tsx`), and the file tree's "selected" highlight tracking the wrong signal (`FileTree.test.tsx`) — each fixed following the same revert-confirm-restore discipline: temporarily undo the fix, confirm the new test fails with the expected assertion error (not vacuously), then restore and confirm green again. See `agent-log/CHANGELOG.md` for the specifics of each.
- **Manual, on-device**: UI-heavy code that isn't reasonably unit-testable even with the above (the graph view's actual canvas *pixel* rendering and on-screen appearance, SAF folder picker flows, touch interactions) is verified live against a real device and a real, large vault where possible, not just fixtures; see recent `agent-log/CHANGELOG.md` entries for what's been confirmed this way versus what's still owed. The graph view's *interaction* logic (double-tap-to-open, drag vs. pinch-to-zoom branching, the close button, the empty-vault state) turned out testable despite the canvas involvement: jsdom's `HTMLCanvasElement.getContext("2d")` returns `null` rather than throwing, and `GraphView.tsx`'s own `draw()` already no-ops on a missing context, so `GraphView.test.tsx` stubs `ResizeObserver` and the Pointer Capture methods (neither implemented by jsdom) and mocks `computeLayout` for deterministic node positions, without needing a canvas-mocking library.

## Where to go next

- [`ROADMAP.md`](ROADMAP.md): what's shipped, what's still open, in what order.
- [`CONSTITUTION.md`](CONSTITUTION.md): binding rules, product principles, the Decisions Log (why past architectural choices were made).
- [`CONTRIBUTING.md`](CONTRIBUTING.md): how to get a dev environment running and what checks a change needs to pass.

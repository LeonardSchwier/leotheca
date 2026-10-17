# Roadmap

## About this project

Leotheca was built using agentic AI engineering approaches. The following agents and contributors are listed in the git history:

- Leonard Schwier (maintainer, architect)
- LeoHub Hermes (local agent — most features, bug fixes, CI/CD, packaging)
- Mistral Vibe (cloud agent — specific roadmap items)
- Claude Code (cloud agent — specific roadmap items)
- ChatGPT automation (cloud agent — specific roadmap items)
- Leotheca CI (automated verification and release pipeline)

## P0 — Release blockers

Items that block shipping to end users.

- ⏸ **macOS signing & notarization** — Ship signed, notarized DMGs so Gatekeeper does not warn. Status: blocked on Apple Developer Program credentials from the maintainer.
- ⏸ **Fedora Wayland AppImage** — WebKit/EGL crash leaves a blank window on Fedora. Status: blocked, needs a clean Fedora desktop to diagnose and verify the fix.
- ⏸ **Flathub submission** — Manifest and CI build are green; the actual submission to Flathub has not been made. Status: blocked on external submission access.
- ⏸ **F-Droid submission** — Build pipeline is ready; the actual F-Droid build and submission attempt has not been made. Status: blocked on external submission access.
- ⏸ **Flatpak folder-dialog verification** — Desktop-portal file dialogs need an end-to-end smoke test on a real Wayland and X11 session. Status: blocked, no interactive desktop available in the sandbox.

## P1 — Feature gaps

Significant missing features users expect.

- ⏸ **Android print & HTML export** — Code landed but never registered with the Capacitor bridge; on-device verification still outstanding. Status: blocked on a physical Android device.
- ⏸ **Android speech-to-text** — Plugin was never registered with the Capacitor bridge; on-device confirmation still outstanding. Status: blocked on a physical Android device.
- ⏸ **Android folder-picker display name** — Picker always labels a new workspace "Workspace" instead of the real folder name. Status: claimed, needs on-device verification.
- ⏸ **Android home-screen widgets** — Recent-notes widget has a full-workspace re-walk performance issue and colliding labels; "favorites" hamburger bug under investigation. Status: in progress.
- 🚧 **Quick Capture target picker** — Capture always appends to the inbox note; no way to target a specific note, daily note, or bookmark. Status: open.
  <!-- agent-state: {"schema":1,"id":"rm-dd5994dcac66ebf8","state":"claimed","touch":["ROADMAP.md","src/app/CaptureSheet.test.tsx","src/app/CaptureSheet.tsx","src/capture/captureDestinations.test.ts","src/capture/captureDestinations.ts"],"resources":["capture-target-picker"],"owner":"opencode-20261014T071046Z-e770563c","token":"710ab19f2683187cf66c04b390261f6f","branch":"agent/rm-dd5994dcac66ebf8/710ab19f2683","claimed_at":"2026-10-14T07:12:38Z","heartbeat_at":"2026-10-14T07:12:38Z","lease_until":"2026-10-14T08:42:38Z"} -->
  Agent: opencode-20261014T071046Z-e770563c | item: rm-dd5994dcac66ebf8 | lease until: 2026-10-14T08:42:38Z
- 🚧 **Android camera capture** — Take a photo directly from the "Insert attachment" toolbar. Status: open.
  <!-- agent-state: {"schema":1,"id":"rm-5fc96a0db16f2169","state":"claimed","touch":["ROADMAP.md","src/editor/MarkdownEditor.test.tsx","src/editor/MarkdownEditor.tsx","src/editor/attachments.test.ts","src/editor/attachments.ts","src/editor/cameraCapture.test.ts","src/editor/cameraCapture.ts"],"resources":["android-camera-attachment"],"owner":"hermes-20261016T150447Z-c2c09206","token":"b17c71a8bbc0eca5975b6746ef6f014e","branch":"agent/rm-5fc96a0db16f2169/b17c71a8bbc0","claimed_at":"2026-10-16T15:05:16Z","heartbeat_at":"2026-10-16T15:05:16Z","lease_until":"2026-10-16T16:35:16Z"} -->
  Agent: hermes-20261016T150447Z-c2c09206 | item: rm-5fc96a0db16f2169 | lease until: 2026-10-16T16:35:16Z
- ⏸ **Compatibility layer** — Load community extension manifests; gated on maintainer approval of the third-party-code security model. Status: open.

## P2 — Polish & fixes

Minor bugs, UX improvements, and performance.

- ✅ **Recent-notes widget performance** (done 2026-10-11, `579d804`):
  Fixed two bugs in `syncRecentNotesWidget` (fileTreeStore.ts):
  1. **Burst-coalescing bug**: `pendingRecentNotesSync` held a single `resolve` ref; when
     multiple callers scheduled the sync within the 300 ms debounce window, all but the
     last caller's promise never resolved. Changed to a `resolvers` array so every caller
     is called in the `finally` block.
  2. **Timer-clearing bug**: when a second call adopted a pending sync, it cleared the
     timer without rescheduling it, so the sync never fired. Removed the timer-clearing
     from the adopt path.
  Bumped `RECENT_NOTES_WIDGET_MAX` from 5 to 10 in both TS (`fileTreeStore.ts`) and
  Java (`FolderAccessPlugin.java`) to match the native widget's display capacity.
  Un-skipped 3 tests that cover the burst-coalescing path (burst coalescing,
  bridge-failure resolution, two-calls-both-resolve) and added `mockClear()` calls
  to isolate per-test call counts.
  - **Verified:** 3024 tests (159 files) all green · tsc --noEmit clean · vite build OK ·
    full local CI/CD pipeline passed (13/14 checks, 1 skipped Flatpak build).
- ✅ **Platform detection caching** — `isIOS`/`isMobile` re-evaluate the user agent on every call while `isAndroid` is cached.
  - **Fixed by:** `e7930f6` (fix(platform): cache isIOS/isMobile like isAndroid already does) — module-level `let _ios` / `let _mobile` caches with lazy-init pattern, identical to the pre-existing `isAndroid` pattern.
  - **Verified:** 13 tests in `src/lib/platform.test.ts` (11 value-correctness + 2 caching-invariant) — all green. Caching tests spy on `Capacitor.isNativePlatform` and assert 0 calls after warm-up.
  - **Ledger note:** This item was stuck open as a ledger desync — the code landed in `e7930f6` but the ROADMAP icon was missing (bare `- **title**` instead of `- ⬜ **title**`), making it invisible to `agent_ledger.py`'s ITEM regex. Icon added in `259ca9d`.
- ✅ **Android file reads** — `FolderAccessPlugin` read methods buffer whole files with no size cap; risk of `OutOfMemoryError` on large attachments. [Fixed: `MAX_READ_FILE_BYTES` (8 MiB) enforced in `readBoundedBytes` since e988fe7 (2026-10-07); cross-language contract test added 2026-10-15 to pin Java `MAX_READ_FILE_BYTES` ↔ TS `SEARCH_BATCH_MAX_BYTES` consistency]
- 🚧 **Recent-notes widget metadata** — `size` and `mtime` fields are dropped during widget sync, blocking future relative-time display.
  <!-- agent-state: {"schema":1,"id":"rm-126935e4949ae25d","state":"claimed","touch":["android/app/src/main/java/com/leonardschwier/leotheca/LeothecaRecentNotesWidgetFactory.java","android/app/src/main/res/layout/leotheca_widget_recent_notes_item.xml","android/app/src/test/java/com/getcapacitor/myapp/WidgetResourcesUnitTest.java"],"resources":["recent-notes-widget-metadata"],"owner":"opencode-20261013T070600Z-9f3c21a7","token":"94432b8b00b5af869140c637ed38e86d","branch":"agent/rm-126935e4949ae25d/94432b8b00b5","claimed_at":"2026-10-13T07:07:28Z","heartbeat_at":"2026-10-13T07:12:12Z","lease_until":"2026-10-13T08:42:12Z"} -->
  Agent: opencode-20261013T070600Z-9f3c21a7 | item: rm-126935e4949ae25d | lease until: 2026-10-13T08:42:12Z

- 🚧 **Set the app as the default handler for `.md` files (OS "Open with")**: Market Solution #2's 1.14 Desktop (Oct 5, 2026) added the "Open file from outside the vault" command, OS Open-with registration, and a settable default app for Markdown files. Leotheca already reads individual notes (the 'Open file from outside the vault' command shipped as F04) but cannot register itself as the OS default; completing that last step lets the user open their plain `.md` files in Leotheca from anywhere. (Competitor scan, Market Solution #2 changelog 1.14 Desktop, 2026-10-05)
  <!-- agent-state: {"schema":1,"id":"rm-ae21e6dcf59b26cf","state":"claimed","touch":["ROADMAP.md","src-tauri/src/default_handler.rs","src-tauri/src/lib.rs","src/app/SettingsPanel.tsx","src/workspace/tauriBridgeImpl.ts"],"resources":["markdown-default-handler-contract"],"owner":"hermes-20261009T151025Z-e6d61247","token":"6747ff08a54fbbd7be76996ede95edcf","branch":"agent/rm-ae21e6dcf59b26cf/6747ff08a54f","claimed_at":"2026-10-09T15:12:50Z","heartbeat_at":"2026-10-09T15:12:50Z","lease_until":"2026-10-09T16:42:50Z"} -->
  Agent: hermes-20261009T151025Z-e6d61247 | item: rm-ae21e6dcf59b26cf | lease until: 2026-10-09T16:42:50Z
- ✅ **macOS document icons for `.md`** (done 2026-10-11, rm-7f4450d7782cc96f):
  Added a custom rounded-square document icon (`docs-icon.icns` + 7 PNG sizes,
  generated from the app icon by `scripts/generate-docs-icon.py`) so macOS
  Finder shows a recognisable icon for `.md`/`.markdown`/`.mdown` files
  instead of a generic blank page. The icon is installed into the `.app`
  bundle's `Resources/` and the `Info.plist` is patched with
  `CFBundleDocumentTypes` + `CFBundleDocumentIcons` in the macOS CI job
  (`.github/workflows/release.yml`). Tests: `scripts/test_docs_icon.py`
  (7 tests, all pass).
- 🚧 **Quick Capture: optional note template applied on capture**: Market Solution #2 1.14 Mobile (Oct 5, 2026) lets Quick Capture apply an optional template to the captured note (its iOS 1.14.3 entry, Sept 29, 2026, first shipped templates when the capture target is a daily note or a selected note). Leotheca's Quick Capture always appends plain text to the inbox note (the capture-target picker above is already queued); an opt-in per-capture markdown template snippet (a plain text file in the user's own workspace, no network, switchable off) is pure plain-file functionality that completes the existing capture flows without a new convention. (Competitor scan, Market Solution #2 changelog 1.14 Mobile, 2026-10-05)
  <!-- agent-state: {"schema":1,"id":"rm-7ee9751035fa41ff","state":"claimed","touch":["ROADMAP.md"],"resources":["roadmap-entry-format"],"owner":"opencode-20261013T110142Z-7d84a635","token":"338ea8fee718d896b4bb01e030ab742b","branch":"agent/rm-7ee9751035fa41ff/338ea8fee718","claimed_at":"2026-10-13T11:02:17Z","heartbeat_at":"2026-10-13T11:02:17Z","lease_until":"2026-10-13T12:32:17Z"} -->
  Agent: opencode-20261013T110142Z-7d84a635 | item: rm-7ee9751035fa41ff | lease until: 2026-10-13T12:32:17Z
- ✅ **Kanban-style collection view** (2026-10-15, hermes-20261015T170000Z-kanban-dnd): Property-grouped board cards are now draggable; dropping a card on another column rewrites the note's frontmatter grouping property via `onEditProperty`. The "Unassigned" column is always present as a drop target (clearing the property on drop). Folder-grouped boards remain read-only (folder is not editable via frontmatter). TDD: 6 new tests in `kanbanDragDrop.test.tsx`. 3043/3043 tests pass, `tsc --noEmit` clean, `vite build` OK.

## Weekly Code Review

_2026-10-11 · scope: 79 commits since 2026-10-04 · 159 test files / 3021 tests (3 skipped) · tsc --noEmit clean · vite build OK_

🟢 **Build health**
- `vite build` emits `index-BGht43z5.js` at 3,039 kB (949 kB gzip). Rollup warns on chunks > 500 kB (elk 1.4 MB, cynefin 690 kB, cytoscape 443 kB, katex 261 kB). Pre-existing; no new import added this week. No action required this cycle.

🟡 **fileTreeStore.ts:955-962 — coalescing only replaces one pending caller's resolve**
The `pendingRecentNotesSync` slot holds a single `resolve` ref. When caller A schedules the sync and caller B (within the 300 ms window) calls `syncRecentNotesWidget`, B's promise replaces A's resolve; A never resolves. Callers that `await` the result (e.g. post-mutation UI refresh) can hang if they're not the last caller in a burst.
Suggested fix: change `pendingRecentNotesSync.resolve` to an array of resolvers, push on each coalesced call, and call all of them in the `finally` block.

🟡 **fileTreeStore.test.ts:1721-1755 — three `it.skip` tests cover the coalescing path under test**
The skipped tests are exactly the ones that would exercise the race condition above (burst coalescing, bridge-failure resolution, double-call). They are disabled, so the bug is invisible in CI.
Suggested fix: un-skip after fixing the resolver-array issue; the `afterEach` `_resetRecentNotesSyncForTest` is already wired.

🟡 **HighlightColorPicker.tsx:70-75 — ref-cached handlers capture a stale `onColorSelect` closure**
`colorHandlers.current[choice.color]` is created once (first render) and caches a closure over `onColorSelect` from that render. If the parent re-renders with a new `insert`/`onClose`, the cached handlers still call the old `onColorSelect` (which calls the old `insert`/`onClose`). The `onPlainSelect` `useCallback` is correctly re-created each render, so the Plain swatch is fine; the six colour swatches are not.
Suggested fix: store the current `onColorSelect` in a ref (`onColorSelectRef.current = onColorSelect` on every render) and have the cached handlers read `onColorSelectRef.current(choice.color)`.

🟢 **FolderAccessPlugin.java — `readBoundedBytes` refactor is sound**
The 8 MiB cap (`MAX_READ_FILE_BYTES`) matches `SEARCH_BATCH_MAX_BYTES` in `fileTreeStore.ts:613`. The cap is checked after each 8 KiB chunk write, so the overshoot is bounded to ≤ 8 KiB. `StandardCharsets.UTF_8` is used consistently (import at line 19). `readOneFileOrNull` returns `null` on overflow (catch-all), which is correct for the batch path. No issues found.

🟢 **FolderAccessPlugin.java:852-867 — `updateRecentNotesWidget` now persists mtime/size**
`entry.getLong("mtime")` and `entry.getLong("size")` are guarded by `entry.has()` + `!entry.isNull()`, so optional fields degrade gracefully. The TS side (`selectRecentNotes`) passes `f.mtime` / `f.size` which are optional on `FsEntry`. The `RecentNotesWidgetEntry` interface (`capacitorBridgeImpl.ts`) documents both as optional. No issues found.

🟢 **platform.ts — `resetPlatformCacheForTests` is test-only and correctly named**
The cache-reset function is exported with a `_ForTests` suffix, is only called from test files, and does not affect production. No issues found.

🟢 **App.tsx — `open-favorites` now clears `taskHubOpen`/`collectionsOpen`**
Two additional `.value = false` assignments alongside the existing `bookmarksOpen = true` / `tagsOpen = false`. Correct: without clearing the other panels, the Bookmarks panel would not render (only one panel is visible at a time). Test added in `App.test.tsx`. No issues found.

🟢 **SettingsPanel.tsx — `handleExportSettings`**
Uses `JSON.parse(JSON.stringify(...))` to deep-clone `workspaceSettings` (fine for a plain object), exports via `exportTextFileViaDialog`, and surfaces errors with `window.alert`. No secret data in the payload (no tokens, no credentials). Test added. No issues found.

🟢 **ci-local.sh — Android SDK auto-detect + proxy**
Hard-coded path `/var/lib/leohub/chat/android-sdk` is machine-specific but guarded by `[ -d ... ]` so it's a no-op elsewhere. `GRADLE_OPTS` proxy is set only when `ANDROID_HOME` is non-empty. `QUICK` is now overridable via `CI_LOCAL_QUICK` env var. No issues found.

🟢 **generate-docs-icon.py — pure-stdlib PNG/ICNS generation**
Deterministic, no external deps. 7 test cases in `scripts/test_docs_icon.py` all pass. No issues found.

🟢 **Flatpak manifest — Node 20 → 22 migration**
`node20` → `node22` SDK extension; `npm_config_offline` removed with a well-documented rationale (make-fetch-happen only-if-cached mode). Commit pin updated from `eb98b1a` to `f87bc5a`. `node-sources.json` / `cargo-sources.json` regenerated. No issues found.


## Security Audit (2026-10-16)

_Performed per the Cloudflare security-audit-skill (multi-phase, source-first, boundary-violation evidence). Scope: full codebase on main (commit `2cd2f76`). Profile: standard. 5 confirmed findings, 0 critical/high, 4 medium, 1 informational._

### Confirmed findings

**S-1 (medium) — `assetProtocol` scope is empty: full-filesystem read via webview**
`src-tauri/tauri.conf.json` line 27: `"assetProtocol": { "enable": true, "scope": [] }`. An empty scope array means the `asset:` protocol can serve **any file on disk** to the webview. Combined with the CSP `img-src 'self' asset: data: blob:`, a malicious note (e.g. one received via Android share intent or a compromised workspace) containing `<img src="asset:///etc/passwd">` could exfiltrate arbitrary file contents through image loading, canvas pixel reads, or `fetch("asset:///...")`.

*Fix:* Set `assetProtocol.scope` to `["$APPDATA/**", "$HOME/Documents/**"]` or a narrower allowlist matching the user's actual workspace locations. The Tauri asset protocol supports glob patterns; restrict to the directories the app legitimately reads.

**S-2 (medium) — `script-src 'unsafe-eval'` in CSP**
`src-tauri/tauri.conf.json` line 23: `script-src 'self' 'unsafe-eval'`. While no direct `eval()`/`new Function()` calls exist in the codebase (verified by grep), `unsafe-eval` widens the XSS payload surface: any injection vector (e.g. S-1's asset protocol, or a DOMPurify bypass) can execute arbitrary code via `eval()`/`setTimeout(string)`/`new Function()` without an additional bypass step. The only consumers of dynamic code evaluation are mermaid and monaco, both of which ship as static bundles.

*Fix:* Remove `'unsafe-eval'` from `script-src`. If mermaid or monaco genuinely need `eval()`, wrap that specific evaluation in a CSP nonce or move it to a Web Worker (the CSP `worker-src` directive does not inherit `unsafe-eval`). Add a CI test that asserts the CSP does not contain `unsafe-eval`.

**S-3 (medium) — `read_markdown_file` in `external_open.rs` reads arbitrary paths with no containment check**
`src-tauri/src/external_open.rs` line 47: `fs::read_to_string(&path).ok()` — no workspace, config-dir, or any other containment check. This is called from:
1. `lib.rs` line 84: `external_open::extract_markdown_path(&cold_start_args).and_then(external_open::read_markdown_file)` — reads a path from CLI argv at cold start.
2. `lib.rs` line 54: `external_open::extract_markdown_path(relaunch_args).and_then(external_open::read_markdown_file)` — reads a path from a relaunch intercepted by single-instance.

The `extract_markdown_path` function (line 129) only checks `url.scheme() == "file"` and strips the `file://` prefix — it does **not** validate the resulting path stays within the workspace. An attacker who can control the OS launch arguments (e.g. a crafted `.md` file opened via file association, a malicious terminal alias, or a compromised desktop entry) can read any file the user's process can access. The result is emitted to the frontend via `emit_open_external_file`, which renders it in the editor — enabling exfiltration of arbitrary file contents to any channel the frontend can reach (clipboard via `read-current-note` deep-link, export, etc.).

*Fix:* In `read_markdown_file`, after resolving the path, verify `fs::canonicalize(&path).starts_with(canonical_workspace_root)` before reading. If the path is outside the active workspace, return `None` (matching the existing silent-no-op convention). The doc comment already states the intent ("no workspace/config-dir containment check at all") — the code needs to match that intent by adding the check.

- 🚧 **Deep-link `open-note` path is trusted after frontend validation** (audit S-4): the `open-note` deep-link passes `command.path` to `handleOpenFile`; the frontend `isPathWithinWorkspace` check is a UX convenience, while the Rust-side `check_unscoped_path_allowed` in the Tauri commands is the authoritative containment gate. Add a comment in `automationCommands.ts` making that layering explicit so future maintainers do not treat the JS check as the security boundary.
  <!-- agent-state: {"schema":1,"id":"rm-d7c4926987c506d2","state":"claimed","touch":["src/app/automationCommands.ts"],"resources":["automation-command-security-layering"],"owner":"opencode-20261017T092101Z-ea44c677","token":"cc6b4330702f6bb72b70e6560e70ccac","branch":"agent/rm-d7c4926987c506d2/cc6b4330702f","claimed_at":"2026-10-17T09:25:11Z","heartbeat_at":"2026-10-17T09:25:11Z","lease_until":"2026-10-17T10:55:11Z"} -->
  Agent: opencode-20261017T092101Z-ea44c677 | item: rm-d7c4926987c506d2 | lease until: 2026-10-17T10:55:11Z

*Action:* No code change required. Add a comment in `automationCommands.ts` clarifying that the Rust-side `check_unscoped_path_allowed` is the authoritative containment gate, and the frontend `isPathWithinWorkspace` is a UX convenience, not a security boundary.

- 🚧 **`exportNoteHtml` fetches local image files without a path allowlist** (audit S-5): `inlineLocalImages` calls `fetchImpl(src)` on every non-`data:` `<img src>` from user-authored markdown. For `asset://` URLs, the asset protocol's scope is the only control; for `file://` or other schemes, the CSP `img-src` list is the only defense. Add an explicit prefix allowlist so only `asset://`, `data:`, and relative paths are fetched.
  <!-- agent-state: {"schema":1,"id":"rm-81d8ad863ac6b70c","state":"claimed","touch":["src/export/exportNoteHtml.test.ts","src/export/exportNoteHtml.ts"],"resources":["export-image-allowlist"],"owner":"hermes-20261017T071519Z-047145a3","token":"e44cbe3a596d594a5f8347480df86411","branch":"agent/rm-81d8ad863ac6b70c/e44cbe3a596d","claimed_at":"2026-10-17T07:37:30Z","heartbeat_at":"2026-10-17T07:37:30Z","lease_until":"2026-10-17T09:07:30Z"} -->
  Agent: hermes-20261017T071519Z-047145a3 | item: rm-81d8ad863ac6b70c | lease until: 2026-10-17T09:07:30Z

*Action:* Addressed by fixing S-1 (restrict asset protocol scope). Additionally, validate that `src` starts with an allowed prefix (`asset://`, `data:`, or relative) before calling `fetchImpl`.

### Verified clean (no finding)

- **Path traversal in `resolve_within_workspace`** (`workspace_mutations.rs`): canonicalizes root, checks `starts_with`, handles symlinks, dangling links, and non-existing intermediate paths. Well-implemented, with comprehensive tests.
- **`check_unscoped_path_allowed`** (`commands.rs`): rejects outside-workspace and outside-config-dir targets. Tests cover prefix-collision, symlink-escape, and no-root cases.
- **DOMPurify sanitization** (`MarkdownPreview.tsx`): `DOMPurify.sanitize()` applied to all rendered markdown before `dangerouslySetInnerHTML`. `data-mermaid-source` is the only custom attribute allowed. Search highlighting is applied post-sanitization and only inserts static `<span class="search-highlight">` wrappers.
- **Attachment filename sanitization** (`pendingCaptures.ts`): `sanitizeAttachmentFilename` strips path separators, control characters, Windows reserved names, and special characters. Tested.
- **Deep-link capture payload size limit** (`automationCommands.ts`): 32 KiB UTF-8 byte cap via `TextEncoder().encode()`. Tested.
- **Tauri capabilities** (`capabilities/default.json`): `fs:allow-read-text-file` and `fs:allow-write-text-file` are scoped by the Rust-side commands (which enforce workspace containment). `clipboard-manager:allow-write-text` is intentionally broad (user-initiated copy). No `shell`, `http`, or `net` plugins.
- **Rust `clippy`**: zero warnings (verified in CI).
- **No `innerHTML` without sanitization**: all `innerHTML` assignments in production code go through `DOMPurify.sanitize()` first (verified by grep).

### Summary

| ID | Severity | Component | Issue |
|----|----------|-----------|-------|
| S-1 | medium | `tauri.conf.json` | Empty asset protocol scope → arbitrary file read via webview |
| S-2 | medium | `tauri.conf.json` | `unsafe-eval` in CSP widens XSS surface |
| S-3 | medium | `external_open.rs` | `read_markdown_file` has no path containment check |
| S-4 | info | `automationCommands.ts` | Frontend path check is non-authoritative (Rust is) — add clarifying comment |
| S-5 | info | `exportNoteHtml.ts` | Image `src` fetch relies on CSP only — add prefix validation |

_No prior security audit ledger exists for this repository. This is the first structured audit._

- ⬜ **Quick Capture: launch from the OS without waiting for the app to load** — Market Solution #2 1.14 Mobile (Oct 5, 2026) lets iOS Quick Capture create a note from the Lock Screen, Control Center, Home Screen widget, or a Shortcut before the vault has even loaded. Leotheca's Quick Capture exists as an in-app sheet plus deep links/share intents, but every path requires the app to be running first; capturing straight from a widget/shortcuts entry that appends to the inbox note (opt-in, plain-file, offline, togglable) completes the existing capture feature without a new convention. (Competitor scan, Market Solution #2 changelog 1.14 Mobile, 2026-10-05)

## Implemented

- ✅ **macOS Quick Look preview** — ⌥-click a `.md` file in Finder to preview it. Status: done.
  <!-- agent-state: {"schema":1,"id":"rm-d18513b6a2034e1e","state":"done","touch":["ROADMAP.md","packaging/macos/quicklook/LeothecaMarkdownQLPreviewGenerator.m","scripts/test_ql_converter.py"],"resources":["macos-quicklook-qlgenerator"],"note":"Fixed nil-markdown crash in QLPreviewGenerator (non-UTF-8 files now show a notice instead of crashing). Added 34 unit tests (scripts/test_ql_converter.py) validating the markdown-to-HTML converter logic as a cross-language spec. tsc, vitest (3044 tests), and vite build all pass.","completed_at":"2026-10-16T11:15:25Z","completed_by":"hermes-20261016T110629Z-dc99019d","branch":"agent/rm-d18513b6a2034e1e/c35c75d6e53b"} -->
  Agent: completed by hermes-20261016T110629Z-dc99019d | item: rm-d18513b6a2034e1e
- ✅ **`syncRecentNotesWidget` desktop no-op** — Already covered by the performance item above.
  <!-- agent-state: {"schema":1,"id":"rm-9123b0b3110ba29c","state":"done","touch":["ROADMAP.md","src/workspace/fileTreeStore.test.ts"],"resources":["recent-notes-sync-desktoptop"],"note":"Ledger desync: desktop no-op behavior (isAndroid() guard returning Promise.resolve()) was already implemented in the 'Recent-notes widget performance' item (579d804). Added focused regression test 'desktop no-op: resolves immediately without scheduling any timer' that advances fake timers past the 300ms debounce window and asserts no walk/bridge call. All 3044 tests green, tsc clean, vite build OK.","completed_at":"2026-10-16T07:26:37Z","completed_by":"hermes-20261016T070000Z-synccnoop","branch":"agent/rm-9123b0b3110ba29c/372fa5c1e790"} -->
  Agent: completed by hermes-20261016T070000Z-synccnoop | item: rm-9123b0b3110ba29c


- ✅ **Settings export** — No way to export the current settings bundle. Status: open.
  <!-- agent-state: {"schema":1,"id":"rm-261fc73e9f7e4540","state":"done","touch":["ROADMAP.md","src/settings/SettingsPanel.tsx","src/settings/SettingsPanelCurrentTests.tsx"],"resources":["settings-export"],"note":"test: export-settings payload shape + unknown fallback; 2921 tests green; tsc clean; vite build OK","completed_at":"2026-10-15T07:28:32Z","completed_by":"hermes-20261015T070818Z-28fd4a6a","branch":"agent/rm-261fc73e9f7e4540/e8d96222c5fa"} -->
  Agent: completed by hermes-20261015T070818Z-28fd4a6a | item: rm-261fc73e9f7e4540


- ✅ **Collapsible groups in collection list/table/card views**: Market Solution #2 1.14 Desktop (Oct 5, 2026) made the group sections of its Bases list, table, and card views collapsible. Leotheca's Smart Collections board view already groups notes by an indexed frontmatter property (see ARCHITECTURE.md); extending the same grouping to collapsible sections in the other collection views is a plain-file, offline extension of an existing feature with no new convention. (Competitor scan, Market Solution #2 changelog 1.14 Desktop, 2026-10-05)
  <!-- agent-state: {"schema":1,"id":"rm-b4368a36d7c31e5e","state":"done","touch":["src/collections/CollectionResults.tsx","src/collections/collectionCollapsible.test.tsx","src/collections/collectionDecode.test.ts","src/collections/collectionDecode.ts","src/collections/collectionPhase2.test.tsx","src/collections/collectionTypes.ts","src/collections/collections.css"],"resources":["collection-grouping"],"note":"Implemented collapsible group sections in list/table/card collection views when groupBy is set, sharing the groupResults contract (renamed from groupKanbanColumns) with the existing board view. Added GroupSection with accessible per-group collapse toggle, group-by selector now shown for all modes with Ungrouped option, groupBy preserved across non-board mode switches, decodeCollectionView reads groupBy for list/table/card. TDD: new collectionCollapsible.test.tsx (10 tests covering all three views, collapse/expand, backward-compat flat list, persistence across modes). Landed c1e34b9. Evidence: tsc --noEmit clean; eslint . clean; check-version pass; vitest 3035/3035 (160 files); vite build OK; pre-push CI 8 passed/0 failed (4 native builds skipped - unrelated frontend-only change).","completed_at":"2026-10-14T15:09:36Z","completed_by":"opencode-20261014T150154Z-ea47f993","branch":"agent/rm-b4368a36d7c31e5e/4dc1b0007b27"} -->
  Agent: completed by opencode-20261014T150154Z-ea47f993 | item: rm-b4368a36d7c31e5e


- ✅ **Recent-notes widget labels** — Bare basenames collide for same-named notes in different folders; deep-links open the wrong note.
  <!-- agent-state: {"schema":1,"id":"rm-64b66b68ecc3ab77","state":"done","touch":["src/capacitor/widgets/fileTreeStore.test.ts","src/capacitor/widgets/fileTreeStore.ts"],"resources":["widget-labels"],"note":"Code and tests for widget label disambiguation were already in place. Five dedicated tests verify the behavior. Ledger desync - code landed but ROADMAP icon was missing. Icon added in dd81053, item claimed and verified. tsc clean, 6050 tests green, vite build OK.","completed_at":"2026-10-14T07:35:07Z","completed_by":"hermes-20261014T072707Z-119c13d7","branch":"agent/rm-64b66b68ecc3ab77/cf310385d7b7"} -->
  Agent: completed by hermes-20261014T072707Z-119c13d7 | item: rm-64b66b68ecc3ab77


- ✅ **Highlight color picker re-render** — Menu sub-tree rebuilds on every open/close toggle.
  <!-- agent-state: {"schema":1,"id":"rm-2f358fc7b7479397","state":"done","touch":["src/app/HighlightColorPicker.test.tsx","src/app/HighlightColorPicker.tsx"],"resources":["highlight-picker-render"],"note":"Fixed highlight-picker stale-closure: cached per-color handlers now route via onColorSelectRef.current (current insert/onClose) instead of the first-render closure. TDD regression test added (RED-\u003eGREEN). tsc clean, vitest 3025/3025, vite build OK. Commit 689b26a. CI 13/14 pass.","completed_at":"2026-10-13T15:24:04Z","completed_by":"hermes-20261013T151000Z-hlpicker","branch":"agent/rm-2f358fc7b7479397/373bc7a9a007"} -->
  Agent: completed by hermes-20261013T151000Z-hlpicker | item: rm-2f358fc7b7479397

- ✅ **Highlight color picker** — No "Plain" option to remove a previously typed color emoji from an `==highlight==`.
  <!-- agent-state: {"schema":1,"id":"rm-fcd2a44c75a885de","state":"done","touch":["src/app/HighlightColorPicker.test.tsx","src/app/HighlightColorPicker.tsx"],"resources":["highlight-color-contract"],"note":"Plain option (F01) and stable-handler memoization (F05) were already implemented in commit 0edcc2d (Oct 7, 2026). All 8 tests in HighlightColorPicker.test.tsx pass, including the referential-stability regression test at line 73. Code verified on main: src/app/HighlightColorPicker.tsx lines 50-54 (onPlainSelect), lines 65-75 (colorHandlers ref), lines 91-95 (Plain swatch render). Ledger was stale — item had been claimed in Oct 9 but code landed in Oct 7 commit.","completed_at":"2026-10-12T07:43:48Z","completed_by":"hermes-20261012T112900Z-finish-plain","branch":"agent/rm-fcd2a44c75a885de/5e5978fd890b"} -->
  Agent: completed by hermes-20261012T112900Z-finish-plain | item: rm-fcd2a44c75a885de


- ✅ **Duplicate `MAX_WALK_DEPTH` constant** — Present in Java and Rust; TS copy already removed. Cross-language contract test `maxWalkDepthIsConsistentAcrossRustAndJava` added to `WidgetResourcesUnitTest.java` pins both to 40 and fails the build if they diverge.
  <!-- agent-state: {"schema":1,"id":"rm-697b797ae03af96b","state":"done","touch":["ROADMAP.md","android/app/src/test/java/com/getcapacitor/myapp/WidgetResourcesUnitTest.java","src-tauri/src/commands.rs"],"resources":["max-walk-depth-contract"],"note":"Code already landed on main (commits e1dbf11, cbebe07) with CI green (run 37746072890). Cross-language contract test maxWalkDepthIsConsistentAcrossRustAndJava pins MAX_WALK_DEPTH=40 in both Java and Rust. TS copy was removed in a prior commit. Ledger icon/state mismatch was fixed in commit 853a23d.","completed_at":"2026-10-08T11:04:43Z","completed_by":"opencode-20261008T110211Z-d2bf85bb","branch":"agent/rm-697b797ae03af96b/b498740575f0"} -->
  Agent: completed by opencode-20261008T110211Z-d2bf85bb | item: rm-697b797ae03af96b


Leotheca 1.0.0 shipped a complete local-first note-taking experience across desktop (macOS, Windows, Linux) and Android. Highlights:

- Full Markdown editor and preview with wikilinks, backlinks, heading links, block references, and cross-note navigation
- Smart Collections with list, table, card, and board views
- Task Hub for workspace-wide task management
- PDF viewing and annotation (text and freehand)
- Freehand ink drawing notes and Canvas/whiteboard
- Split panes, tab reordering, pinned tabs, and a searchable workspace switcher
- Android home-screen widgets (New note, Favorites, Recent notes, Quick Capture)
- Local speech-to-text dictation (opt-in)
- Quick Capture from deep links and Android share intents
- RTL text direction support
- Offline spellchecking and Mermaid diagram rendering
- Signed release pipeline for Linux (AppImage, Flatpak, Snap) with CI validation

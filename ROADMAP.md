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

- **macOS signing & notarization** — Ship signed, notarized DMGs so Gatekeeper does not warn. Status: blocked on Apple Developer Program credentials from the maintainer.
- **Fedora Wayland AppImage** — WebKit/EGL crash leaves a blank window on Fedora. Status: blocked, needs a clean Fedora desktop to diagnose and verify the fix.
- **Flathub submission** — Manifest and CI build are green; the actual submission to Flathub has not been made. Status: blocked on external submission access.
- **F-Droid submission** — Build pipeline is ready; the actual F-Droid build and submission attempt has not been made. Status: blocked on external submission access.
- **Flatpak folder-dialog verification** — Desktop-portal file dialogs need an end-to-end smoke test on a real Wayland and X11 session. Status: blocked, no interactive desktop available in the sandbox.

## P1 — Feature gaps

Significant missing features users expect.

- **Android print & HTML export** — Code landed but never registered with the Capacitor bridge; on-device verification still outstanding. Status: blocked on a physical Android device.
- **Android speech-to-text** — Plugin was never registered with the Capacitor bridge; on-device confirmation still outstanding. Status: blocked on a physical Android device.
- **Android folder-picker display name** — Picker always labels a new workspace "Workspace" instead of the real folder name. Status: claimed, needs on-device verification.
- **Android home-screen widgets** — Recent-notes widget has a full-workspace re-walk performance issue and colliding labels; "favorites" hamburger bug under investigation. Status: in progress.
- 🚧 **Quick Capture target picker** — Capture always appends to the inbox note; no way to target a specific note, daily note, or bookmark. Status: open.
  <!-- agent-state: {"schema":1,"id":"rm-dd5994dcac66ebf8","state":"claimed","touch":["ROADMAP.md","src/app/CaptureSheet.test.tsx","src/app/CaptureSheet.tsx","src/capture/captureDestinations.test.ts","src/capture/captureDestinations.ts"],"resources":["capture-target-picker"],"owner":"opencode-20261012T113000Z-a1b2c3d4","token":"ec19104083864565fc506be962d7a6f1","branch":"agent/rm-dd5994dcac66ebf8/ec1910408386","claimed_at":"2026-10-12T15:01:16Z","heartbeat_at":"2026-10-12T15:01:16Z","lease_until":"2026-10-12T16:31:16Z"} -->
  Agent: opencode-20261012T113000Z-a1b2c3d4 | item: rm-dd5994dcac66ebf8 | lease until: 2026-10-12T16:31:16Z
- **Android camera capture** — Take a photo directly from the "Insert attachment" toolbar. Status: open.
- **Settings export** — No way to export the current settings bundle. Status: open.
- **macOS Quick Look preview** — ⌥-click a `.md` file in Finder to preview it. Status: open.
- **Compatibility layer** — Load community extension manifests; gated on maintainer approval of the third-party-code security model. Status: open.

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
- **Recent-notes widget labels** — Bare basenames collide for same-named notes in different folders; deep-links open the wrong note.
- ✅ **Platform detection caching** — `isIOS`/`isMobile` re-evaluate the user agent on every call while `isAndroid` is cached.
  - **Fixed by:** `e7930f6` (fix(platform): cache isIOS/isMobile like isAndroid already does) — module-level `let _ios` / `let _mobile` caches with lazy-init pattern, identical to the pre-existing `isAndroid` pattern.
  - **Verified:** 13 tests in `src/lib/platform.test.ts` (11 value-correctness + 2 caching-invariant) — all green. Caching tests spy on `Capacitor.isNativePlatform` and assert 0 calls after warm-up.
  - **Ledger note:** This item was stuck open as a ledger desync — the code landed in `e7930f6` but the ROADMAP icon was missing (bare `- **title**` instead of `- ⬜ **title**`), making it invisible to `agent_ledger.py`'s ITEM regex. Icon added in `259ca9d`.
- **Android file reads** — `FolderAccessPlugin` read methods buffer whole files with no size cap; risk of `OutOfMemoryError` on large attachments.
- ⬜ **Recent-notes widget metadata** — `size` and `mtime` fields are dropped during widget sync, blocking future relative-time display.
- 🚧 **Highlight color picker re-render** — Menu sub-tree rebuilds on every open/close toggle.
  <!-- agent-state: {"schema":1,"id":"rm-2f358fc7b7479397","state":"claimed","touch":["ROADMAP.md","src/app/HighlightColorPicker.test.tsx","src/app/HighlightColorPicker.tsx"],"resources":["highlight-picker-render"],"owner":"opencode-20261011T072022Z-787b0372","token":"8f3647245e368823840f540ded7696f7","branch":"agent/rm-2f358fc7b7479397/8f3647245e36","claimed_at":"2026-10-11T07:22:56Z","heartbeat_at":"2026-10-11T07:22:56Z","lease_until":"2026-10-11T08:52:56Z"} -->
  Agent: opencode-20261011T072022Z-787b0372 | item: rm-2f358fc7b7479397 | lease until: 2026-10-11T08:52:56Z
- **`syncRecentNotesWidget` desktop no-op** — Already covered by the performance item above.

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

## Implemented

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

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
- 🚧 **Android camera capture** — Take a photo directly from the "Insert attachment" toolbar. Status: open.
  <!-- agent-state: {"schema":1,"id":"rm-5fc96a0db16f2169","state":"claimed","touch":["ROADMAP.md","src/editor/MarkdownEditor.test.tsx","src/editor/MarkdownEditor.tsx","src/editor/attachments.test.ts","src/editor/attachments.ts","src/editor/cameraCapture.test.ts","src/editor/cameraCapture.ts"],"resources":["android-camera-attachment"],"owner":"hermes-20261030T080439Z-0fdb1a0c","token":"22f57f7a6951b757ce94c2b5ab13c6e2","branch":"agent/rm-5fc96a0db16f2169/22f57f7a6951","claimed_at":"2026-10-30T08:05:32Z","heartbeat_at":"2026-10-30T08:05:32Z","lease_until":"2026-10-30T09:35:32Z"} -->
  Agent: hermes-20261030T080439Z-0fdb1a0c | item: rm-5fc96a0db16f2169 | lease until: 2026-10-30T09:35:32Z
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

- ✅ **Set the app as the default handler for `.md` files (OS "Open with")** (done 2026-11-01, rm-ae21e6dcf59b26cf):
  <!-- agent-state: {"schema":1,"id":"rm-ae21e6dcf59b26cf","state":"done","touch":["ROADMAP.md","src-tauri/src/default_handler.rs","src-tauri/src/lib.rs","src/settings/SettingsPanel.tsx","src/settings/defaultHandler.test.ts","src/settings/defaultHandler.ts"],"resources":["markdown-default-handler-contract"],"completed_by":"hermes-20261101T170338Z-c98cda","completed_at":"2026-11-01T17:20:00Z","branch":"agent/rm-ae21e6dcf59b26cf/6747ff08a54f"} -->
  Leotheca already *registers* as a `.md` editor (`tauri.conf.json` bundle.fileAssociations, role "Editor") and reads individual notes (the 'Open file from outside the vault' command, F04). The missing piece — letting the user actually **set Leotheca as the default / show it in "Open with"** per platform — is now complete and unit-tested offline.
  - **What shipped:** a pure, platform-parameterized "how to make Leotheca the default `.md` app" contract with a Settings panel section that renders the per-OS steps (Windows / macOS / Linux / iOS / Android / Other), marks desktop platforms `isSettable` and mobile `false`, and keeps a single-source-of-truth invariant `openWithTarget === steps[0].target`.
  - **Rust (source of truth):** `src-tauri/src/default_handler.rs` — `detect_platform`, `default_handler_for_platform`, `markdown_association()` + two Tauri commands (`detect_platform`, `default_handler_for_platform`), declared in `lib.rs`. 7 tests in `default_handler::tests` (all platforms total, association matches `tauri.conf.json`, `is_settable` split, step invariants, command-surface↔pure-function parity).
  - **Frontend:** `src/settings/defaultHandler.ts` (mirror contract + `detectPlatform` + `currentDefaultHandlerContract`) with `defaultHandler.test.ts` (11 tests). New "Make Leotheca the default app for .md files" section in `src/settings/SettingsPanel.tsx` under General, gated on the existing external-file-open row.
  - **Verified:** `cargo test --lib` 94 passed (7 new), `npx tsc --noEmit` clean, `npx vitest run` 3198 passed (11 new), `npx vite build` ✓.
  - **Recovered:** the original claim `hermes-20261009T151025Z-e6d61247` was a dead session (lease expired 2026-10-09, no code ever landed). Recovered and completed by `hermes-20261101T170338Z-c98cda` per the dead-session recovery rule.
  Recovered + completed by: hermes-20261101T170338Z-c98cda | item: rm-ae21e6dcf59b26cf | 2026-11-01
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
  <!-- agent-state: {"schema":1,"id":"rm-7ee9751035fa41ff","state":"claimed","touch":["src/app/CaptureSheet.test.tsx","src/app/CaptureSheet.tsx","src/capture","src/settings"],"resources":["capture-template"],"owner":"hermes-20261022T110849Z-12bed5fc","token":"f27e0f6046945db762b7c5e31ebfd983","branch":"agent/rm-7ee9751035fa41ff/f27e0f604694","claimed_at":"2026-10-22T11:08:55Z","heartbeat_at":"2026-10-22T11:08:55Z","lease_until":"2026-10-22T12:38:55Z"} -->
  Agent: hermes-20261022T110849Z-12bed5fc | item: rm-7ee9751035fa41ff | lease until: 2026-10-22T12:38:55Z
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

**S-1 (medium) — `assetProtocol` scope is empty: full-filesystem read via webview** ✅ **Resolved 2026-10-17**
> **Audit correction:** The original claim — "an empty scope array means the `asset:` protocol can serve any file on disk" — is **false**. In Tauri, `scope: []` is **deny-by-default**: no files are served at all until the app explicitly allows a directory at runtime. The empty array is the *secure* state, not the vulnerable one. The vulnerable state was `["**"]`, which the 2026-09-23 fix removed.
>
> **Actual behavior (verified):** `set_active_workspace_root` (`src-tauri/src/commands.rs:877`) grants access *dynamically* via `app.asset_protocol_scope().allow_directory(root)` when a workspace is activated, and `forbid_directory(previous_root)` when switched away. The Rust regression test `set_active_workspace_root_scopes_asset_protocol_to_the_active_workspace_only` (`commands.rs:1433`) proves this: the asset protocol serves **only the active workspace**, and nothing else.
>
> **Gap fixed now:** The deny-by-default invariant was *correct* but **untested in the TS suite**. A future edit that reverted `scope` to `["**"]` (the 2026-09-23 bug), `null`, or any match-all pattern would silently reintroduce the arbitrary-file-read vulnerability with no CI alarm.
>
> **Resolution (commit `d0f22a3`):** Added `src/assetProtocolScope.test.ts` — 4 tests that lock the invariant in CI:
> 1. `assetProtocol.enable` is `true` (required for local image/attachment rendering).
> 2. `scope` is an array (not `null` — which in Tauri means "allow everything").
> 3. `scope` contains no match-all pattern (`**`, `**/*`, `*`, `/**`, `/**/*`) — the exact patterns that match any absolute path.
> 4. `scope` grants no `$APPDATA`/`$HOME` unconditionally — the only runtime grant must come from `set_active_workspace_root`.
>
> **TDD verified:** Injecting `scope: ["**"]` (the 2026-09-23 vuln) makes the test **fail** (RED). The current `scope: []` config **passes** (GREEN). Pre-push CI: 13/14 checks passed, 1 skipped, 3m30s. `tsc --noEmit` clean, `vitest run` 3048/3048 (162 files), `vite build` OK.
>
> The `*Fix*` line below (set scope to `["$APPDATA/**", ...]`) is **rejected** — it would *widen* the grant, not narrow it. The correct state is `scope: []` with runtime-only grants, which is already in place.

**S-2 (medium) — `script-src 'unsafe-eval'` in CSP**
`src-tauri/tauri.conf.json` line 23: `script-src 'self' 'unsafe-eval'`. While no direct `eval()`/`new Function()` calls exist in the codebase (verified by grep), `unsafe-eval` widens the XSS payload surface: any injection vector (e.g. S-1's asset protocol, or a DOMPurify bypass) can execute arbitrary code via `eval()`/`setTimeout(string)`/`new Function()` without an additional bypass step. The only consumers of dynamic code evaluation are mermaid and monaco, both of which ship as static bundles.

*Fix:* Remove `'unsafe-eval'` from `script-src`. If mermaid or monaco genuinely need `eval()`, wrap that specific evaluation in a CSP nonce or move it to a Web Worker (the CSP `worker-src` directive does not inherit `unsafe-eval`). Add a CI test that asserts the CSP does not contain `unsafe-eval`.

**S-3 (medium) — `read_markdown_file` in `external_open.rs` reads arbitrary paths with no containment check** ✅ **Resolved 2026-10-21 (audit correction — no code change; finding is a false positive)**

> **Audit correction (2026-10-21, same treatment as S-1):** The finding is **false as stated**, and its *Fix* would **break the feature it is attached to**. `read_markdown_file`'s purpose is precisely to read a Markdown file that is *outside* the active workspace — the OS `.md` file-association launch (`extract_markdown_path`), an already-running instance's relaunch (`RunEvent::Opened`/`markdown_path_from_urls`), and the in-app "Open file from outside the vault…" picker (`pick_and_read_external_markdown_file`). Adding the proposed `canonicalize(&path).starts_with(canonical_workspace_root)` guard and returning `None` for outside paths would therefore reject **every** legitimate use of the feature, and directly contradict the dedicated lock-in test `read_markdown_file_reads_content_from_a_path_outside_every_known_root` (`external_open.rs:272`), which asserts an *outside* path reads successfully.
>
> **What the finding gets right, and the real (already-mitigated) surface:** the *content* of a user-chosen file is shown in the read-only `ExternalFileView` scratch view. That is exactly the behavior of any text editor's "open file" and is the intended, user-initiated outcome of the feature. The exposure that S-3 frames as "arbitrary file read + exfiltration" is in practice bounded by three independent gates:
> 1. **Provenance / extension** — only a `.md` path is ever read: OS launches and live `Opened` events are filtered by `has_markdown_extension` (case-insensitive), the dialog uses a `.md` filter, and the frontend re-checks `/\.md$/i` (`App.tsx` `handleExternalFileOpen`) before rendering.
> 2. **User opt-in / consent** — the in-app picker and OS file-association both require the user to actively select or double-click a file; the feature is additionally switchable off via the `externalFileOpenEnabled` setting.
> 3. **Read-only rendering** — the scratch view shows content with no editor, no save-back, and no write path; `read_markdown_file` is invoked only in the same trusted Rust call that establishes the path's provenance, never as a webview-reachable IPC command that a page could drive with its own path (`ExternalMarkdownFile`'s doc comment states this load-bearing guarantee).
>
> **Why no code change (mirroring S-1):** The *correct* state — a deliberate, user-consented, extension-gated, read-only "open external Markdown file" capability with the path established by the OS/dialog rather than by the webview — is already in place and already unit-tested (`read_markdown_file_reads_content_from_a_path_outside_every_known_root`, `take_pending_open_file_consumes_the_value_once`, and the extraction/URL tests in the same module). The only gap, in keeping with the S-1 lesson, was that this *intended* behavior was not explicitly documented as such in the roadmap; this correction is that documentation. If the maintainer wants the feature to also open non-Markdown types, that is a product change to scope explicitly — it is not a security remediation.
>
> **Verification (2026-10-21, integrated tree):** `npx tsc --noEmit` clean; `npx vitest run` 165 files / 3109 tests pass; `npx vite build` OK (only the pre-existing chunk-size warning). No source changed.

**S-3 (medium) — `read_markdown_file` in `external_open.rs` reads arbitrary paths with no containment check**
`src-tauri/src/external_open.rs` line 47: `fs::read_to_string(&path).ok()` — no workspace, config-dir, or any other containment check. This is called from:
1. `lib.rs` line 84: `external_open::extract_markdown_path(&cold_start_args).and_then(external_open::read_markdown_file)` — reads a path from CLI argv at cold start.
2. `lib.rs` line 54: `external_open::extract_markdown_path(relaunch_args).and_then(external_open::read_markdown_file)` — reads a path from a relaunch intercepted by single-instance.

The `extract_markdown_path` function (line 129) only checks `url.scheme() == "file"` and strips the `file://` prefix — it does **not** validate the resulting path stays within the workspace. An attacker who can control the OS launch arguments (e.g. a crafted `.md` file opened via file association, a malicious terminal alias, or a compromised desktop entry) can read any file the user's process can access. The result is emitted to the frontend via `emit_open_external_file`, which renders it in the editor — enabling exfiltration of arbitrary file contents to any channel the frontend can reach (clipboard via `read-current-note` deep-link, export, etc.).

*Fix:* In `read_markdown_file`, after resolving the path, verify `fs::canonicalize(&path).starts_with(canonical_workspace_root)` before reading. If the path is outside the active workspace, return `None` (matching the existing silent-no-op convention). The doc comment already states the intent ("no workspace/config-dir containment check at all") — the code needs to match that intent by adding the check.



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
| S-1 | medium | `tauri.conf.json` | Empty asset protocol scope → arbitrary file read via webview | ✅ **Resolved 2026-10-17** (audit claim was false: `[]` is deny-by-default; `["**"]` was the bug. Fixed the gap: added TS regression test locking the invariant. Commit `d0f22a3`. See correction above.) |
| S-2 | medium | `tauri.conf.json` | `unsafe-eval` in CSP widens XSS surface |
| S-3 | medium | `external_open.rs` | `read_markdown_file` has no path containment check | ✅ **Resolved 2026-10-21** (audit claim was false: reading a user-selected *outside* `.md` file is the feature's intended purpose and is already extension-gated, user-consented, and read-only; its dedicated regression test locks the outside-read behavior. Corrected in the S-3 block above, mirroring S-1.) |
| S-4 | info | `automationCommands.ts` | Frontend path check is non-authoritative (Rust is) — add clarifying comment |
| S-5 | info | `exportNoteHtml.ts` | Image `src` fetch relies on CSP only — add prefix validation |

_No prior security audit ledger exists for this repository. This is the first structured audit._

- 🚧 **Quick Capture: launch from the OS without waiting for the app to load** — Market Solution #2 1.14 Mobile (Oct 5, 2026) lets iOS Quick Capture create a note from the Lock Screen, Control Center, Home Screen widget, or a Shortcut before the vault has even loaded. Leotheca's Quick Capture exists as an in-app sheet plus deep links/share intents, but every path requires the app to be running first; capturing straight from a widget/shortcuts entry that appends to the inbox note (opt-in, plain-file, offline, togglable) completes the existing capture feature without a new convention. (Competitor scan, Market Solution #2 changelog 1.14 Mobile, 2026-10-05)
  <!-- agent-state: {"schema":1,"id":"rm-9a637eae859ce76e","state":"claimed","touch":["ROADMAP.md","android","src/capacitor/widgets","src/capture"],"resources":["quick-capture-os-launch"],"owner":"hermes-20261017T093000Z-7bad5d6d","token":"5aaea73d1a8ecaf6def1b3e2680efd18","branch":"agent/rm-9a637eae859ce76e/5aaea73d1a8e","claimed_at":"2026-10-17T11:22:02Z","heartbeat_at":"2026-10-17T11:22:02Z","lease_until":"2026-10-17T12:52:02Z"} -->
  Agent: hermes-20261017T093000Z-7bad5d6d | item: rm-9a637eae859ce76e | lease until: 2026-10-17T12:52:02Z

- ✅ **File panel searches: exclude term hides matching folder and everything inside it** (completed 2026-10-18): `-Term` now hides a folder named `Term` and every file inside it at any depth in File Explorer, Bookmarks, and Outline search results. Exact-segment match — `-archive` hides `archive/x.md` but not `archivex/y.md`. Root-level files and files whose own name matches are unaffected (content-filter territory). Checked before content read, so no file I/O for excluded entries. 16 new tests (10 unit + 6 integration); all 3070 tests pass.
  <!-- agent-state: {"schema":1,"id":"rm-4ff673a760b13042","state":"done","touch":["CHANGELOG.md","ROADMAP.md","src/workspace/Sidebar.test.tsx","src/workspace/Sidebar.tsx","src/workspace/fileTreeStore.test.ts","src/workspace/fileTreeStore.ts","src/workspace/searchQuery.test.ts","src/workspace/searchQuery.ts"],"resources":["workspace-search"],"completed_at":"2026-10-18T15:24:00Z","completed_by":"hermes-20261018T150834Z-83e51bc0","branch":"agent/rm-4ff673a760b13042/71900831cd9a"} -->
  <details>
  <summary>Context & rationale</summary>
  Leotheca's advanced full-text search already supports `-exclude` on note bodies (with a known-correct filter now shipped); extending the same exclusion semantics to the folder/panel tree views completes an existing convention rather than inventing a new one. (Competitor scan, Market Solution #2 changelog 1.14 Desktop, 2026-10-05)
  </details>

## Security and privacy review (2026-10-18)

_Weekly review of code committed 2026-10-11..2026-10-18 (commits `3dc26d8..a53d947`). Scope: the 2026-10-16 audit's open findings, plus new attack surface in the window (kanban view, collapsible collection groups, macOS Quick Look converter, Android recent-notes widget, competitor-scan roadmap items). Verified: `npx vitest run` 3052/3052 (162 files), `npx tsc --noEmit` clean, `npx vite build` OK. No new critical/high findings; 1 medium carry-over still open, 2 low new._

**W-2026-10-18-1 (medium, carry-over) — `script-src 'unsafe-eval'` in CSP** ✅
`src-tauri/tauri.conf.json`. **Resolved 2026-10-21.** The fix landed in commit `95f870a` (2026-10-18, "fix(csp): remove unsafe-eval from script-src, add regression test") but the ledger entry was never closed — this is the ledger correction, not a re-implementation. Current config: `script-src 'self'` (no `unsafe-eval` anywhere in the CSP). Acceptance verified: (1) `unsafe-eval` absent from `script-src`; (2) regression test present (see W-2026-10-18-2); (3) mermaid renders without `eval` — both `renderMermaidToSvg` (src/markdown/mermaid.ts) and the MarkdownPreview effect catch failures and fall back to a code block; d3-dsv is the only `new Function` user in the dependency graph and is not bundled into mermaid's esm build; (4) `npx tsc --noEmit` clean, `npx vitest run` 3109/3109 (165 files), `npx vite build` OK (2026-10-21 re-verification).

**W-2026-10-18-2 (low, new) — no CSP regression test; `unsafe-eval` can silently return** ✅
**Resolved 2026-10-21 (ledger correction).** The test already exists: `src/offline.test.ts` "does not include 'unsafe-eval' in script-src (W-2026-10-18-2)" and "script-src contains only 'self' (no eval, no remote scripts)" (added with the fix in `95f870a`). Both tests pass in the 2026-10-21 run; any future edit re-adding `unsafe-eval` to `tauri.conf.json` will now fail CI. The 2026-10-18 review recorded these as open based on the state of the review-window snapshot; the fix commit `95f870a` (2026-10-18 13:09) post-dates the review's window head `a53d947` (2026-10-18 09:20), which is why the finding appeared unresolved at review time.

**W-2026-10-18-3 (very low, new) — Quick Look converter: unescaped regex `$` patterns in substitution** ✅
`packaging/macos/quicklook/LeothecaMarkdownQLPreviewGenerator.m:173-193`: the markdown-to-HTML conversion uses `NSRegularExpression` replacements whose replacement strings are regex patterns, so note content containing `$&`, `$1`, etc. would be substituted as backreferences (e.g. a note titled `a $& b` renders `a <h1> b $& b`). The input is local user-authored note content rendered into a `WKWebView` (`loadHTMLString:baseURL:nil`, all HTML-special characters escaped at 145-147), so there is no XSS and no data-exfiltration path — output fidelity only, in a throwaway preview surface.

*Analysis (2026-10-20):* The audit's concern is a **false positive**. NSRegularExpression's replacement template syntax (`$1`, `$2`) refers to **capture group values**, not to the *content being matched*. The replacement strings in the code are fixed literals like `<h1>$2</h1>` — the `$2` is a backreference to capture group 2 (the matched content), which is correct. The content itself (the capture group value) may contain `$1`/`$&` as literal text; that text is inserted via the backreference, not interpreted as a template. No escaping needed.

*Resolution:* Added 4 regression tests (`TestDollarSignInContent` in `scripts/test_ql_converter.py`) that lock in the correct behavior and prevent a future "fix" that would break it. All 38 QL converter tests pass. Commit `239a1f7`.

### Verified clean (this window)

- **S-3 (2026-10-16 audit) superseded:** `external_open.rs`'s no-containment design for `read_markdown_file` is intentional (the feature exists to open files outside the workspace; the F04 follow-up docs this in `commands.rs`), and the frontend-facing commands that *do* read arbitrary paths (`read_text_file`, `read_binary_file`, `workspace_stats`, `find_all_files`, `list_dir`) all gate through `check_unscoped_path_allowed` / `resolve_within_workspace` (verified in `src-tauri/src/commands.rs`, including the symlink-escape skip `is_symlink_escaping_workspace` applied across every walk, and the `MAX_WALK_DEPTH` cycle guard).
- **S-5 (2026-10-16 audit) resolved 2026-10-18:** `src/export/exportNoteHtml.ts` now restricts `inlineLocalImages` to `asset://` and relative paths only; `file:`, `http(s):`, `javascript:`/`vbscript:` all rejected, with 4 regression tests (commit `a53d947`, under "Implemented" below).
- **Kanban drag-and-drop** (`src/collections/CollectionResults.tsx:422-444`): the dropped value is read from the app's own `dataTransfer` under a custom MIME type and matched against already-loaded in-memory results — no `event.dataTransfer`-sourced untrusted value reaches the DOM or a filesystem path.
- **Collapsible collection groups / `collectionDecode.ts`**: persisted collection JSON is decoded with explicit validation (no `eval`/`Function`, `JSON.parse` only), same discipline as before; no new raw-HTML rendering path.
- **Quick Look WKWebView**: `baseURL:nil`, all dynamic content HTML-escaped before `loadHTMLString`; the only `evaluateJavaScript` calls (92, 104) read `document.readyState` with no string interpolation of external data.
- **Android manifest / recent-notes widget** (commit `d8c7ae7`): the new `leotheca://` deep-link and `SEND`/`SEND_MULTIPLE` intent filters feed the existing `automationCommands.ts` capture path, which already enforces the 32 KiB payload cap (S-4's non-authoritative-path note stands — Rust remains the authoritative gate); no new exported component with a broad intent surface beyond the pre-existing `MainActivity`.
- **No new `innerHTML`/`eval`/`new Function`** in `src/` (grep, window diff); DOMPurify coverage unchanged from the 2026-10-16 verified-clean list.

### Summary

| ID | Severity | Status | Component | Issue |
|----|----------|--------|-----------|-------|
| W-2026-10-18-1 | medium | ✅ resolved 2026-10-21 (fix `95f870a` + ledger correction) | `src-tauri/tauri.conf.json` | `unsafe-eval` in CSP `script-src` |
| W-2026-10-18-2 | low | ✅ resolved 2026-10-21 (tests in `src/offline.test.ts`, added with `95f870a`) | CSP tests | no regression test locking CSP free of `unsafe-eval` |
| W-2026-10-18-3 | very low | ✅ resolved (false positive + regression tests) | `packaging/macos/quicklook/LeothecaMarkdownQLPreviewGenerator.m:173-193` | unescaped `$` in regex replacement patterns |

_Review only — no fixes implemented this pass; see the open items above for the suggested fixes._

## Security and privacy review (2026-11-01)

_Weekly review at `1d46842` (main). Window: commits since 2026-10-25 (`8ceab87`, `1d46842`) plus uncommitted work-in-progress present in the tree (voice-note capture in `CaptureSheet.tsx`, `src/speech/captureVoice.ts`, Android camera capture in `src/editor/cameraCapture.ts` + `CameraCapturePlugin.java`, and the new local MCP server in `src/mcp/`). Verified: `timeout 600 npx vitest run` 170 files / 3176 tests pass; `timeout 600 npx tsc --noEmit` fails only on the uncommitted `cameraCapture.ts` (4 errors, W-1 below); `timeout 900 npx vite build` OK (`✓ built in 17.77s`, only the pre-existing chunk-size warning). No new critical or high findings; 2 medium (1 build-breaking, 1 latent), 1 very low._

**W-2026-11-01-1 (medium, new, build-breaking) — uncommitted `cameraCapture.ts` imports `takeCameraPicture`/`CameraCaptureResult` that no bridge exports**
`src/editor/cameraCapture.ts:16,150-151` (uncommitted WIP): `import type { CameraCaptureResult } from "../workspace/tauriBridge"` and `const { takeCameraPicture } = await import("../workspace/tauriBridge")` — but `src/workspace/tauriBridge.ts` (278 lines, neither impl re-exports it) has no such member, and no production caller invokes `captureAndInsertPhoto`/`requestCameraCaptureInsert`. `timeout 600 npx tsc --noEmit` fails with 4 errors (`cameraCapture.ts:16,150`; `cameraCapture.test.ts:136,144`) while the committed HEAD is clean — this WIP would break the pre-push hook and CI for whoever commits it next. Security posture of the feature itself is otherwise sound: `CameraCapturePlugin.java` uses a `FileProvider` URI (not `file://`), deletes the temp JPEG in `finally`, the webview path reuses the workspace-contained `saveAttachment`, and the manifest adds no new permission (only pre-existing `RECORD_AUDIO` for the voice note). *Fix:* commit as a unit — add `export interface CameraCaptureResult { taken: boolean; dataUrl?: string; mimeType?: string; byteLength?: number }` and `export function takeCameraPicture(): Promise<CameraCaptureResult>` to `tauriBridge.ts` (desktop: no-op `{ taken: false }`; Android: `cameraBridgePlugin("CameraCapture").takePicture()`), wire the `CaptureSheet`/`MarkdownEditor` call sites, then re-run `tsc`.

**W-2026-11-01-2 (medium, new, latent) — Mermaid success-path SVG is injected via `outerHTML` after the main DOMPurify pass**
`src/editor/MarkdownPreview.tsx:1716-1717` (committed, unchanged since the 2026-10-18 window): `renderMermaidToSvg(source).then((svg) => { el.outerHTML = svg; })` inserts the diagram into the preview container after the container's content was already passed through `DOMPurify.sanitize` (line 1388) — the fallback path (lines 1719-1725) HTML-escapes its content correctly, the success path does not. Mermaid's own `securityLevel: 'strict'` + `sanitizeMermaidSvg`'s regex + DOMPurify second pass (`src/markdown/mermaid.ts:94-105`) make this defense-in-depth, and the source comes from local note content, but any future mermaid version that emits raw `<script>`/`on*` in `result.svg` would land unsanitized in the preview DOM. *Fix:* route the success path through the same guard: `el.outerHTML = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true } })` (or reuse `sanitizeMermaidSvg`'s exported config), and add a regression test with a malicious mermaid source.

**W-2026-11-01-3 (very low, new) — MCP `read_note` path argument relies entirely on the injected reader for containment**
`src/mcp/mcpServer.ts:250-252` (new, uncommitted): `const path = String(args.path ?? "")` is passed verbatim to `deps.readNote` — `main()` injects the Tauri-bridge `readTextFile`, which enforces `check_unscoped_path_allowed`, so there is no new escape surface from stdio (the transport is local-only, no socket/HTTP, read-only tools, no telemetry — all confirmed clean). Still, the module's doc comment (lines 28-32) claims "This file adds no new path-escape surface" as if `mcpServer.ts` itself were safe, and a future re-wiring of `McpDeps.readNote` to a less restrictive reader would silently widen the exposure with no local guard. *Fix (optional):* normalize and reject absolute paths / `..` segments in `dispatchTool("read_note")` before calling `deps.readNote`, or add a comment that containment is the *dep's* contract.

### Verified clean (this window)

- **CSP / asset protocol** (`src-tauri/tauri.conf.json:22-27`): `script-src 'self'` (no `unsafe-eval`), `img-src 'self' asset: data: blob:`, `assetProtocol.scope: []` = deny-by-default with runtime-only grant from `set_active_workspace_root` (`commands.rs:877`) — invariant still locked by `src/assetProtocolScope.test.ts` and `src/offline.test.ts`; no regression since the 2026-10-18 review.
- **Window commits**: `8ceab87` (image-viewer error surfacing + unhandled-rejection guards) adds try/catch/`.catch` only; `1d46842` is a ROADMAP ledger reclaim. Neither touches Tauri commands, deep links, or sanitization.
- **DOMPurify coverage** (`src/` grep, non-test): `MarkdownPreview.tsx:1388,1612,1624` all sanitize before `innerHTML`/`dangerouslySetInnerHTML`; `mermaid.ts:105` sanitizes SVG with the SVG profile; the only remaining unguarded DOM write is the W-2 finding above. No `eval(`/`new Function` in production `src/`.
- **Voice note** (`src/speech/captureVoice.ts`, uncommitted): opt-in behind `speechToTextEnabled` (off by default), audio never leaves the device, `transcribeBlobToText` never fabricates a transcript on error — no new attack surface; `CaptureSheet.tsx` diff only wires UI + the pre-existing `getGlobalSpeechController`.
- **MCP server** (`src/mcp/mcpServer.ts`, uncommitted): stdio-only (no listener), read-only tool set (`search_notes`/`read_note`/`list_notes`), JSON-RPC 2.0 parse errors return `-32700`, no telemetry, `limit` caps bound both reads and matches (`mcpTools.ts:221,235`); pure logic is fully tested (`mcpTools.test.ts`, `mcpServer.test.ts`, in the 3176-passing run).
- **Deep links / capabilities** unchanged since 2026-10-18: `automationCommands.ts` 32 KiB payload cap intact, `capabilities/default.json` still has no `shell`/`http`/`net` plugins, Android manifest only `RECORD_AUDIO`/`MODIFY_AUDIO_SETTINGS` plus the pre-existing `leotheca://` intent filters.

### Summary

| ID | Severity | Status | Component | Issue |
|----|----------|--------|-----------|-------|
| W-2026-11-01-1 | medium | ⬜ open (build-breaking WIP) | `src/editor/cameraCapture.ts:16,150` | `takeCameraPicture`/`CameraCaptureResult` imported but unexported → `tsc --noEmit` fails 4 errors |
| W-2026-11-01-2 | medium | ⬜ open (latent) | `src/editor/MarkdownPreview.tsx:1716-1717` | Mermaid success-path SVG injected via `outerHTML` outside the DOMPurify pass |
| W-2026-11-01-3 | very low | ⬜ open (hardening) | `src/mcp/mcpServer.ts:250-252` | `read_note` path containment is dep-contract only; no local guard |

_Review only — no fixes implemented this pass._

## Done

- ✅ **Collections: filters menu (add/remove/reorder filter rows, split "All views" vs "This view")** (done 2026-10-29, hermes-20261029T120416Z-c3570435, rm-7a789af6fd5d8cf6): Pure logic in `src/collections/filterRows.ts` (add/remove/reorder/scope-move of filter clauses, 22 tests), `FilterRowsMenu.tsx` UI panel with up/down reorder, scope toggle, add/remove controls, and clause summaries. Added optional `filters` array to `CollectionViewV1` in `collectionTypes.ts`. Integrated into `CollectionBuilder.tsx` via new `initialView`/`onViewChange` props. All 3176 tests pass, tsc clean, vite build succeeds.
  <!-- agent-state: {"schema":1,"id":"rm-7a789af6fd5d8cf6","state":"done","touch":["src/collections/CollectionBuilder.tsx","src/collections/FilterRowsMenu.tsx","src/collections/collectionTypes.ts","src/collections/collections.css","src/collections/filterRows.test.ts","src/collections/filterRows.ts"],"resources":["collections","filter-rows"],"branch":"agent/rm-7a789af6fd5d8cf6/11a03971663b","completed_by":"hermes-20261029T120416Z-c3570435","completed_at":"2026-10-29T12:21:00Z","note":"implemented+tested+pushed b3e1296"} -->
  Agent: hermes-20261029T120416Z-c3570435 | item: rm-7a789af6fd5d8cf6 | done: 2026-10-29T12:21:00Z

- ✅ **CLI/deep-link: append or prepend content under a specific heading** (done 2026-10-28, hermes-20261028T160951Z-6d781376, rm-6971c43573469510): New `leotheca://insert-heading?path=...&heading=...&content=...&position=prepend|append&exactLevel=N` deep-link command. Pure logic in `src/headingInsert.ts` (12 tests), URL parser in `src/app/automationCommands.ts` (13 tests), commit layer in `src/capture/headingInsertCommit.ts` (5 tests). All 30 gates pass.
  <!-- agent-state: {"schema":1,"id":"rm-6971c43573469510","state":"done","touch":["src/app/automationCommands.test.ts","src/app/automationCommands.ts","src/capture/headingInsertCommit.test.ts","src/capture/headingInsertCommit.ts","src/headingInsert.test.ts","src/headingInsert.ts"],"resources":["automation-command","heading-scoped-insert"],"branch":"agent/rm-6971c43573469510/1307c2adf09e","completed_by":"hermes-20261028T160951Z-6d781376","completed_at":"2026-10-28T17:20:00Z","note":"implemented+tested+pushed"} -->
  Agent: hermes-20261028T160951Z-6d781376 | item: rm-6971c43573469510 | done: 2026-10-28T17:20:00Z
- 🚧 **Mermaid diagrams: theme-aware, responsive, zoomable rendering (Pele-based)**: Market Solution #2 1.15.0 Desktop (Oct 22, 2026) replaced its Mermaid renderer with the Pele library (Mermaid 12.1.0 syntax): diagrams now inherit the app's theme colors and fonts, scale responsively with note width, and support zoom/pan. Leotheca already renders Mermaid fences (offline, per the P2 item); upgrading the existing renderer to a pure offline SVG-drawing library completes that feature — plain-file, no network, no new convention. (Competitor scan, Market Solution #2 changelog 1.15.0 Desktop, 2026-10-22)
  <!-- agent-state: {"schema":1,"id":"rm-e21b17dd07db2ce3","state":"claimed","touch":["ROADMAP.md","src/editor/MarkdownPreview.tsx","src/markdown/mermaid.test.ts","src/markdown/mermaid.ts","src/markdown/mermaidTheme.ts","src/styles/mermaid.css"],"resources":["mermaid-rendering"],"owner":"hermes-20261030T120432Z-022a1fd3","token":"abd4dad00ceccc464ca4ac4ae92b26b3","branch":"agent/rm-e21b17dd07db2ce3/abd4dad00cec","claimed_at":"2026-10-30T12:04:45Z","heartbeat_at":"2026-10-30T12:04:45Z","lease_until":"2026-10-30T13:34:45Z"} -->
  Agent: hermes-20261030T120432Z-022a1fd3 | item: rm-e21b17dd07db2ce3 | lease until: 2026-10-30T13:34:45Z
- 🚧 **Quick Capture: record and transcribe a voice note (local STT)**: Market Solution #2 1.15.0 Mobile (Oct 22, 2026) lets Quick Capture record a voice note and transcribe it while speaking (even from the Lock Screen), saving the result to the vault. Leotheca already has opt-in local speech-to-text (Settings → General, off by default); wiring the existing local STT pipeline into the Quick Capture flow so a capture can be spoken instead of typed is a plain-file, offline extension of two existing features with no new convention. (Competitor scan, Market Solution #2 changelog 1.15.0 Mobile, 2026-10-22)
  <!-- agent-state: {"schema":1,"id":"rm-f6a0135fc66d7dcd","state":"claimed","touch":["ROADMAP.md","src/app/CaptureSheet.test.tsx","src/app/CaptureSheet.tsx","src/speech"],"resources":["capture-voice-stt"],"owner":"hermes-20261031T150000Z-545d57f1","token":"41f0b1be5e266fad4fee6062ff56a255","branch":"agent/rm-f6a0135fc66d7dcd/41f0b1be5e26","claimed_at":"2026-10-31T08:08:33Z","heartbeat_at":"2026-10-31T08:08:33Z","lease_until":"2026-10-31T09:38:33Z"} -->
  Agent: hermes-20261031T150000Z-545d57f1 | item: rm-f6a0135fc66d7dcd | lease until: 2026-10-31T09:38:33Z
- 🚧 **PDF export for notes (mobile and desktop)**: Market Solution #2 1.15.0 Mobile (Oct 22, 2026) added PDF export for notes on mobile (its desktop had it earlier). Leotheca's note export is HTML-based (the Android print/HTML export item is device-blocked); a local, offline PDF export for a single note reuses the existing markdown-to-HTML pipeline and gives the user a portable, plain-file artifact with no proprietary format or network dependency. (Competitor scan, Market Solution #2 changelog 1.15.0 Mobile, 2026-10-22)
  <!-- agent-state: {"schema":1,"id":"rm-fdda583431750499","state":"claimed","touch":["src/app","src/app/App.tsx","src/app/CaptureSheet.tsx","src/export"],"resources":["note-export"],"owner":"hermes-20261031T124454Z-8d84241c","token":"88a6bc5ec3865f83766e1193d5e62478","branch":"agent/rm-fdda583431750499/88a6bc5ec386","claimed_at":"2026-10-31T12:46:55Z","heartbeat_at":"2026-10-31T12:46:55Z","lease_until":"2026-10-31T14:16:55Z"} -->
  Agent: hermes-20261031T124454Z-8d84241c | item: rm-fdda583431750499 | lease until: 2026-10-31T14:16:55Z

## Done

- ✅ **Editor font size: increase/decrease commands (persisted in device-local storage)**: Added "A−" / "A+" buttons to the editor toolbar (visible when a text note is open). Each step is ±1px, clamped to 12–24px range, persisted via the existing local settings store (`updateWorkspaceSettings`). Command palette "Increase font size" / "Decrease font size" and settings-panel number input were already present (commit `fc49fe9`). New 3 tests in `App.test.tsx` cover increase/decrease, min clamp, and max clamp. (2026-10-19)
  <details>
  <summary>Why / source</summary>
  Market Solution #2 1.14.3 Desktop added "Increase font size" and "Decrease font size" editor commands and deliberately moved the base font size out of sync into device-local storage. The same shape fits Leotheca's plain-file, local-only settings store and extends the existing editor UI without a new convention.
  </details>
- ✅ **Bases/collections: toolbar "Group by" menu with manual group management** (completed 2026-10-19): `groupOrder?: string[]` added to all view types; `groupResults()` accepts an optional manual order — pinned columns in user order, remaining alphabetical, Unassigned always last. `GroupOrderMenu` component provides up/down/hide per column, persisted via `onViewChange`. Decoder validates entries (non-string/empty dropped, non-array rejected, no corruption flag). 12 new tests (9 groupOrder unit + 3 decode integration). (rm-2429ee0474b3246f)
  <!-- agent-state: {"schema":1,"id":"rm-2429ee0474b3246f","state":"done","touch":["ROADMAP.md","src/collections"],"resources":["collection-group-by-menu"],"branch":"agent/rm-2429ee0474b3246f/23ede27a304c","completed_by":"hermes-20261019T100000Z-grpby1","completed_at":"2026-10-19T17:20:00Z"} -->
  <details>
  <summary>Why / source</summary>
  Market Solution #2 1.14.3 Desktop added a Group menu to its Bases toolbar for choosing the property to group by, plus manual reorder, hide, and add of groups in any view type. The collapsible-groups item (queued from the same scan) covers section collapsing; this covers the grouping controls.
  </details>
- 🚧 **MCP server: expose the note store to local AI tools**: Joplin Desktop v3.7.22 (Oct 28, 2026) added a read_notes MCP tool with outline/section navigation and search_notes returning the enclosing section. Leotheca's existing note-store APIs already cover this shape; exposing them through a local-only MCP endpoint (no network, plain-file reads, no telemetry) lets the user's local LLM stack read and navigate their notes without a proprietary convention. (Competitor scan, Joplin Desktop changelog v3.7.22, 2026-10-28)
  <!-- agent-state: {"schema":1,"id":"rm-3f2b9c37aebb2268","state":"claimed","touch":["ROADMAP.md","src/mcp","src/mcp/mcpServer.ts","src/mcp/mcpTools.ts"],"resources":["mcp-note-store"],"owner":"hermes-20261031T160443Z-9184d9ac","token":"2b7941ee821f0408dae7602ca8bde073","branch":"agent/rm-3f2b9c37aebb2268/2b7941ee821f","claimed_at":"2026-10-31T16:04:49Z","heartbeat_at":"2026-10-31T16:04:49Z","lease_until":"2026-10-31T17:34:49Z"} -->
  Agent: hermes-20261031T160443Z-9184d9ac | item: rm-3f2b9c37aebb2268 | lease until: 2026-10-31T17:34:49Z
- 🚧 **Import notes from an Obsidian vault**: Joplin Desktop v3.7.13 (Aug 28, 2026) added support for importing notes from Obsidian. Since Leotheca already reads plain Markdown, importing an Obsidian vault is plain-file, offline, and requires no new convention. (Competitor scan, Joplin Desktop changelog v3.7.13, 2026-08-28)
  <!-- agent-state: {"schema":1,"id":"rm-a41aae16d492653c","state":"claimed","touch":["ROADMAP.md","src-tauri/src","src/app","src/obsidianImport","src/settings","src/workspace"],"resources":["obsidian-vault-import"],"owner":"hermes-20261101T081221Z-26bf9716","token":"54e969abd036bbf166ef720cf68c12fc","branch":"agent/rm-a41aae16d492653c/54e969abd036","claimed_at":"2026-11-01T08:12:21Z","heartbeat_at":"2026-11-01T08:12:21Z","lease_until":"2026-11-01T09:42:21Z"} -->
  Agent: hermes-20261101T081221Z-26bf9716 | item: rm-a41aae16d492653c | lease until: 2026-11-01T09:42:21Z

## Implemented

- ✅ **Search and link suggestions ignore diacritics (café matches cafe)**: Market Solution #2 1.15.0 Desktop (Oct 22, 2026) made its suggestions and quick switcher match diacritic-insensitively, and it exposed the same behavior to plugin search APIs. Leotheca's recent fuzzy matcher (queued Oct 19 scan, shipped 2026-10-19) is a plain substring/subsequence match that distinguishes accented forms; folding accents in that one standard matcher is a small offline improvement to existing features with no new convention. (Competitor scan, Market Solution #2 changelog 1.15.0 Desktop, 2026-10-22)
  <!-- agent-state: {"schema":1,"id":"rm-2d2ccbe5746bfaf4","state":"done","touch":["src/fuzzyMatch.test.ts","src/fuzzyMatch.ts"],"resources":["fuzzy-match"],"note":"Completed: fuzzyScore folds diacritics via NFD strip (0cecc11). 3124/3124 tests pass.","completed_at":"2026-10-28T12:12:30Z","completed_by":"20261028T120633Z-c5f6753221431f5a","branch":"agent/rm-2d2ccbe5746bfaf4/d07fb29f4fb2"} -->
  Agent: completed by 20261028T120633Z-c5f6753221431f5a | item: rm-2d2ccbe5746bfaf4


- ✅ **Quick Capture target picker** — Capture now supports targeting inbox (append), daily note, or a specific markdown file. Unified `<select>` picker replaces the three-radio "Destination Mode" fieldset; "Specific note…" reveals a note sub-picker populated from workspace files. Submit handler routes through `resolveCaptureTargetPath()` + `captureDestinations.ts`. 11 new tests, 3118/3118 pass. Commit caf18dd.
  <!-- agent-state: {"schema":1,"id":"rm-dd5994dcac66ebf8","state":"done","touch":["ROADMAP.md","src/app/CaptureSheet.test.tsx","src/app/CaptureSheet.tsx","src/capture/captureDestinations.test.ts","src/capture/captureDestinations.ts"],"resources":["capture-target-picker"],"note":"Completed: target picker in CaptureSheet.tsx, 11 new tests, all gates pass. See commit caf18dd on main.","completed_at":"2026-10-21T15:19:03Z","completed_by":"hermes-20261021T150552Z-d6042f54","branch":"agent/rm-dd5994dcac66ebf8/4b542c7232a7"} -->
  Agent: completed by hermes-20261021T150552Z-d6042f54 | item: rm-dd5994dcac66ebf8


- ✅ **GroupOrderMenu reordering destroys table columns / card fields** — Completed 2026-10-20 by hermes-20261020T130000Z-crashhunt. `viewForMode` in `CollectionResults.tsx` rebuilt the view object from scratch, silently dropping `columns` (table) and `fields` (card) when `GroupOrderMenu.move()` or `.hide()` fired. The first group reorder in a table or card view destroyed the user's column/field layout and persisted it to `collections.json`. Fix: `viewForMode` now accepts an optional `existing` view and carries over `columns`/`fields` when present; `GroupOrderMenu` passes the collection's current view. `viewForMode` exported for testability. 8 new tests in `src/collections/viewForMode.test.ts`. tsc clean, vitest 3109/3109 pass, vite build clean.
  <!-- agent-state: {"schema":1,"id":"rm-929af569e2d85cb9","state":"done","touch":["src/collections/CollectionResults.tsx","src/collections/viewForMode.test.ts"],"resources":["group-order-view-preservation"],"note":"viewForMode now preserves table columns and card fields via optional existing-view parameter. GroupOrderMenu passes collection.view. 8 new regression tests.","branch":"agent/rm-929af569e2d85cb9/crashhunt","completed_by":"hermes-20261020T130000Z-crashhunt","completed_at":"2026-10-20T13:11:00Z"} -->
  Agent: completed by hermes-20261020T130000Z-crashhunt | item: rm-929af569e2d85cb9

- ✅ **Quick switcher/link suggestions: fuzzy word-start matching** — Completed 2026-10-19 by hermes-20261019T090343Z-6b8a63. Subsequence matcher (`src/fuzzyMatch.ts`) with word-start/consecutive-run bonuses, wired into wikilink completions, command palette, and workspace switcher. 15 new tests, tsc+vitest+build all pass.
  <!-- agent-state: {"schema":1,"id":"rm-8738c69adbb82548","state":"done","touch":["src/app/CommandPalette.tsx","src/editor/MarkdownEditor.tsx","src/fuzzyMatch.test.ts","src/fuzzyMatch.ts","src/settings/workspaceProfiles.ts"],"resources":["fuzzy-match"],"note":"Fuzzy subsequence matcher (src/fuzzyMatch.ts) wired into wikilink completions, command palette, and workspace switcher. 15 new tests. tsc+vitest+build all pass.","completed_at":"2026-10-19T07:23:31Z","completed_by":"hermes-20261019T090343Z-6b8a63","branch":"agent/rm-8738c69adbb82548/4d2f03a90a1a"} -->
  Agent: completed by hermes-20261019T090343Z-6b8a63 | item: rm-8738c69adbb82548
  <details>
  <summary>Context & rationale</summary>
  Leotheca's note switcher and link suggestions use plain substring matching (no fuzzy matcher in the codebase yet); adopting a standard offline fuzzy-matching algorithm for those paths is a pure local improvement of existing features — no network, plain files, togglable. (Competitor scan, Market Solution #2 changelog 1.14 Desktop, 2026-10-05)
  </details>


- ✅ **`exportNoteHtml` fetches local image files without a path allowlist** (audit S-5): `inlineLocalImages` calls `fetchImpl(src)` on every non-`data:` `<img src>` from user-authored markdown. For `asset://` URLs, the asset protocol's scope is the only control; for `file://` or other schemes, the CSP `img-src` list is the only defense. Add an explicit prefix allowlist so only `asset://`, `data:`, and relative paths are fetched.
  <!-- agent-state: {"schema":1,"id":"rm-81d8ad863ac6b70c","state":"done","touch":["src/export/exportNoteHtml.test.ts","src/export/exportNoteHtml.ts"],"resources":["export-image-allowlist"],"note":"Added scheme allowlist to inlineLocalImages: only asset:// and relative paths are fetched. file://, http://, https://, javascript:, vbscript:, and all other URI schemes are now rejected. 4 new regression tests covering file://, http(s)://, javascript:/vbscript:, and positive (relative + asset://) cases. All 23 tests pass; tsc clean; vitest 3052/3052 pass; vite build clean. Landed on branch agent/rm-81d8ad863ac6b70c/16bd49394540.","completed_at":"2026-10-18T07:19:58Z","completed_by":"hermes-20261018T070706Z-505310b0","branch":"agent/rm-81d8ad863ac6b70c/16bd49394540"} -->
  Agent: completed by hermes-20261018T070706Z-505310b0 | item: rm-81d8ad863ac6b70c

*Action:* S-1 is resolved (see above: `scope: []` is already deny-by-default with runtime-only grants). For S-5 itself, validate that `src` starts with an allowed prefix (`asset://`, `data:`, or relative) before calling `fetchImpl`.


- ✅ **Deep-link `open-note` path is trusted after frontend validation** (audit S-4): the `open-note` deep-link passes `command.path` to `handleOpenFile`; the frontend `isPathWithinWorkspace` check is a UX convenience, while the Rust-side `check_unscoped_path_allowed` in the Tauri commands is the authoritative containment gate. Add a comment in `automationCommands.ts` making that layering explicit so future maintainers do not treat the JS check as the security boundary.
  <!-- agent-state: {"schema":1,"id":"rm-d7c4926987c506d2","state":"done","touch":["src/app/automationCommands.ts"],"resources":["automation-command-security-layering"],"note":"Implemented per audit S-4: added a security-layering comment in src/app/automationCommands.ts (open-note branch) naming handleOpenFile (App.tsx) and check_unscoped_path_allowed (src-tauri/src/commands.rs) as the authoritative containment gate, and marking the JS isPathWithinWorkspace check as a UX convenience rather than the security boundary. Landed SHA 47be3af4a6897c243b0e3b2d5fe25749e9a5aba1 on main. Verification on the integrated tree: tsc --noEmit clean, eslint clean, checkVersion clean, vitest src/app/automationCommands.test.ts 22/22 pass, vitest full (prior tree) 161 files / 3044 tests pass, npm run build successful (chunk-size warning pre-existing and unrelated). Locally verified per verification-suite 'All applicable local checks pass' row.","completed_at":"2026-10-17T09:49:22Z","completed_by":"opencode-20261017T092101Z-ea44c677","branch":"agent/rm-d7c4926987c506d2/cc6b4330702f"} -->
  Agent: completed by opencode-20261017T092101Z-ea44c677 | item: rm-d7c4926987c506d2

*Action:* No code change required. Add a comment in `automationCommands.ts` clarifying that the Rust-side `check_unscoped_path_allowed` is the authoritative containment gate, and the frontend `isPathWithinWorkspace` is a UX convenience, not a security boundary.


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

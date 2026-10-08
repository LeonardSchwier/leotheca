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
- **Quick Capture target picker** — Capture always appends to the inbox note; no way to target a specific note, daily note, or bookmark. Status: open.
- **Android camera capture** — Take a photo directly from the "Insert attachment" toolbar. Status: open.
- **Settings export** — No way to export the current settings bundle. Status: open.
- **macOS Quick Look preview** — ⌥-click a `.md` file in Finder to preview it. Status: open.
- **Compatibility layer** — Load community extension manifests; gated on maintainer approval of the third-party-code security model. Status: open.

## P2 — Polish & fixes

Minor bugs, UX improvements, and performance.

- **Recent-notes widget performance** — Full workspace re-walk on every note mutation, fires on desktop where it has no handler, and hardcodes a 5-item cap that disagrees with the native 10-item cap.
- **Recent-notes widget labels** — Bare basenames collide for same-named notes in different folders; deep-links open the wrong note.
- 🚧 **Highlight color picker** — No "Plain" option to remove a previously typed color emoji from an `==highlight==`.
  <!-- agent-state: {"schema":1,"id":"rm-fcd2a44c75a885de","state":"claimed","touch":["ROADMAP.md","src/app/HighlightColorPicker.test.tsx","src/app/HighlightColorPicker.tsx","src/editor/highlightColors.test.ts","src/editor/highlightColors.ts"],"resources":["highlight-color-contract"],"owner":"opencode-20261008T110914Z-9ca2ed59","token":"e947ed1d2157be07815b284cd41db485","branch":"agent/rm-fcd2a44c75a885de/e947ed1d2157","claimed_at":"2026-10-08T11:10:41Z","heartbeat_at":"2026-10-08T11:10:41Z","lease_until":"2026-10-08T12:40:41Z"} -->
  Agent: opencode-20261008T110914Z-9ca2ed59 | item: rm-fcd2a44c75a885de | lease until: 2026-10-08T12:40:41Z
- 🚧 **Platform detection caching** — `isIOS`/`isMobile` re-evaluate the user agent on every call while `isAndroid` is cached.
  <!-- agent-state: {"schema":1,"id":"rm-c7dd9ed39a1d6ed8","state":"claimed","touch":[],"resources":["platform-detection-contract"],"owner":"hermes-20261008T111553Z-a3c317be","token":"53d42c09d18186178553ffdcf8a6c334","branch":"agent/rm-c7dd9ed39a1d6ed8/53d42c09d181","claimed_at":"2026-10-08T11:22:13Z","heartbeat_at":"2026-10-08T11:22:13Z","lease_until":"2026-10-08T12:52:13Z"} -->
  Agent: hermes-20261008T111553Z-a3c317be | item: rm-c7dd9ed39a1d6ed8 | lease until: 2026-10-08T12:52:13Z
- **Android file reads** — `FolderAccessPlugin` read methods buffer whole files with no size cap; risk of `OutOfMemoryError` on large attachments.
- **Recent-notes widget metadata** — `size` and `mtime` fields are dropped during widget sync, blocking future relative-time display.
- **Highlight color picker re-render** — Menu sub-tree rebuilds on every open/close toggle.
- **`syncRecentNotesWidget` desktop no-op** — Already covered by the performance item above.

## Implemented

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

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
- **Highlight color picker** — No "Plain" option to remove a previously typed color emoji from an `==highlight==`.
- **Platform detection caching** — `isIOS`/`isMobile` re-evaluate the user agent on every call while `isAndroid` is cached.
- **Android file reads** — `FolderAccessPlugin` read methods buffer whole files with no size cap; risk of `OutOfMemoryError` on large attachments.
- **Recent-notes widget metadata** — `size` and `mtime` fields are dropped during widget sync, blocking future relative-time display.
- **Highlight color picker re-render** — Menu sub-tree rebuilds on every open/close toggle.
- 🚧 **Duplicate `MAX_WALK_DEPTH` constant** — Present in Java and Rust; TS copy already removed. Cross-language contract test `maxWalkDepthIsConsistentAcrossRustAndJava` added to `WidgetResourcesUnitTest.java` pins both to 40 and fails the build if they diverge.
  <!-- agent-state: {"schema":1,"id":"rm-697b797ae03af96b","state":"claimed","touch":["ROADMAP.md","android/app/src/test/java/com/getcapacitor/myapp/WidgetResourcesUnitTest.java","src-tauri/src/commands.rs"],"resources":["max-walk-depth-contract"],"owner":"hermes-20261008T072803Z-a9184252","token":"614932d4df7f13fb3863735bb82c3811","branch":"agent/rm-697b797ae03af96b/614932d4df7f","claimed_at":"2026-10-08T07:33:33Z","heartbeat_at":"2026-10-08T07:33:33Z","lease_until":"2026-10-08T09:03:33Z"} -->
  Agent: hermes-20261008T072803Z-a9184252 | item: rm-697b797ae03af96b | lease until: 2026-10-08T09:03:33Z
- **`syncRecentNotesWidget` desktop no-op** — Already covered by the performance item above.

## Implemented

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

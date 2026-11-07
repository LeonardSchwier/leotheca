<p align="center"><img src="assets/icons/leotheca.svg" alt="Leotheca app icon: a cream page holding a gold notched bookmark ribbon on a dark navy background" width="96" height="96"></p>

# Leotheca

**In short:** Leotheca is a free and open source markdown viewer and editor for a local folder of plain text notes, built for Linux, macOS, Windows and Android. It needs no account, has no telemetry and no sync service of its own, and makes no network requests of its own (see [how that is enforced](#why-this-exists)).
It is also a worked example of delivering software with autonomous coding agents under strict, partly machine-enforced controls: see [`documentation/AGENTIC_PDLC.md`](documentation/AGENTIC_PDLC.md).
Install it from the [rolling release](#-install) or build it from source ([`CONTRIBUTING.md`](CONTRIBUTING.md)).

[![License: MIT](https://img.shields.io/github/license/LeonardSchwier/leotheca)](LICENSE)
[![CI](https://github.com/LeonardSchwier/leotheca/actions/workflows/ci.yml/badge.svg)](https://github.com/LeonardSchwier/leotheca/actions/workflows/ci.yml)
![Platforms](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows%20%7C%20Android-informational)

> [!IMPORTANT]
> **Reference implementation of an agentic PDLC.** Besides being a note app, this repository is a worked example of delivering software with autonomous coding agents under strict, partly machine-enforced controls: an ownership ledger, spec-first delivery, tests-first fixes, hooks, CI and independent review. See [`documentation/AGENTIC_PDLC.md`](documentation/AGENTIC_PDLC.md) for the stage-by-stage description, the agents involved, the enforcing files, and the known gaps.

## Why this exists

Three principles govern every decision here, in order. Full detail in [`PHILOSOPHY.md`](PHILOSOPHY.md).

1. 🔓 **Free and open source, without compromise.** The full source is open under the MIT license, forever. No paid tier, no telemetry, no required account, and the app makes no network requests of its own, so it works fully offline. What backs that up:
   - The webview Content-Security-Policy in [`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json) allows only `'self'`, `asset:`, `data:` and `blob:` sources, and [`src/offline.test.ts`](src/offline.test.ts) asserts that (no `http(s)` source, no wildcard, no `unsafe-eval`). The runtime network spies in that file are only a smoke check, they do not drive the app.
   - The end-to-end fixtures in [`tests/e2e/support/fixtures.ts`](tests/e2e/support/fixtures.ts) abort and fail any request that leaves the origin while the built app runs.
   - The Android manifest, [`android/app/src/main/AndroidManifest.xml`](android/app/src/main/AndroidManifest.xml), declares no `INTERNET` permission.
   - There is no analytics or HTTP-client dependency declared in `package.json` or `src-tauri/Cargo.toml`. The Rust dependency tree of Tauri itself contains an HTTP client crate (`reqwest`) that the application code does not call.
   - Not covered: the optional [web clipper](extensions/) is a separate browser extension, and sync tools you point at your folder do their own networking.
2. 🤝 **Standing on the shoulders of giants.** Where the wider note-taking ecosystem already has a good convention (wikilinks, YAML frontmatter, a folder of plain files), this project adopts it instead of inventing a competing one.
3. 📁 **Your notes belong to you.** Plain markdown files in a folder you control, not a database, not a proprietary format. Nothing about how a note is stored depends on this application continuing to exist.

## ✨ Features

- 📂 Point it at any local folder of markdown files, no import step, no proprietary format.
- 🗂️ File tree with create, rename, delete (to a `.trash` folder, not gone for good), and a right-click context menu.
- 📑 Tabs, autosave, source-mode editing (CodeMirror 6) with a rendered Preview and Split view.
- 🔗 `[[wikilinks]]`, resolved by filename, with autocomplete while typing and a backlinks panel.
- 🕸️ A pannable, zoomable graph view of your whole workspace.
- ⭐ Bookmarks for files and saved searches.
- 🎨 A light and dark theme, following your OS by default.
- 🔍 Full-text search across the files of your vault, with folder exclusion (`-archive`). Hidden files and folders such as `.trash` are skipped.
- 🏷️ Frontmatter properties with a Properties panel, case-insensitive kanban boards, and smart collections.
- 📋 Command palette (Ctrl+K) for quick navigation and actions.
- 📤 Export a note to standalone HTML or print/PDF via the OS dialog.
- ⌨️ `==highlighted text==` with color emoji (🔴🟠🟢🔵🟣), a convention used by other Markdown note apps.
- 📊 Task Hub: read-only view of all GFM task-list items across your vault.
- 🎤 Optional dictation, off by default and not yet working end to end: no whisper backend is compiled into desktop builds (see `master-spec.md` KG-002) and the Android recognizer is unverified on a real device.
- 📁 Open files from outside your vault, or from the OS file manager, into a read-only scratch view.
- 📱 On Android, real folder access via the Storage Access Framework.

This list is a summary, not a full inventory. [`ROADMAP.md`](ROADMAP.md) tracks what is implemented and what is still open, including features that are blocked on device testing.

## 📸 Screenshots

Generated from the current app by [`tests/e2e/screenshots.mjs`](tests/e2e/screenshots.mjs), using original sample notes. Your browser or GitHub picks the light or dark variant to match your theme.

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/screenshots/split-view-dark.png"><img src="assets/screenshots/split-view.png" alt="Leotheca's split view: a note called Welcome with its markdown source on the left and the rendered preview on the right, with resolved wikilinks and highlighted text, next to the file tree" width="100%"></picture></p>

Split view: markdown source and rendered preview side by side, with `[[wikilinks]]` resolved and `==highlights==` rendered.

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/screenshots/graph-view-dark.png"><img src="assets/screenshots/graph-view.png" alt="Leotheca's graph view: six notes drawn as labelled dots, connected by lines for the wikilinks between them" width="100%"></picture></p>

The graph view, showing how notes connect to each other via wikilinks.

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/screenshots/settings-dark.png"><img src="assets/screenshots/settings.png" alt="Leotheca's settings dialog open on the General page, showing the root folder, accent color choices, delete behavior and other options, with Appearance, Shortcuts and Health pages listed on the left" width="100%"></picture></p>

Settings: root folder, accent color, delete behavior, appearance, shortcuts and a health page.

## 📥 Install

There are no versioned releases yet. Every build comes from the single [rolling release](#rolling-release), which is the repository's Latest release and is always the current state of `main`, unreviewed. Pick the file for your platform from its assets on [GitHub Releases](https://github.com/LeonardSchwier/leotheca/releases/tag/dev-build).

### Linux

- **AppImage** or **Flatpak bundle**: both are release assets built from the same source. They are built in CI; only the AppImage is smoke-launched there (see [`documentation/ARCHITECTURE.md`](documentation/ARCHITECTURE.md)), so treat the Flatpak bundle as less tested. If its build job fails for a run, it is left out and the release notes say so.
- **Flathub**: not submitted yet. The manifest and its checks live in [`flatpak/`](flatpak/).

### Android

- **Direct APK**: download `leotheca-dev-build-android-DEBUG-UNSIGNED.apk` from the release and install it manually. It is a debug-signed build for testing, not a release-signed one.
- **Obtainium**: add this repository's URL. The rolling release is marked Latest, is not a prerelease, and carries an Android APK asset (`leotheca-dev-build-android-DEBUG-UNSIGNED.apk`), which is what Obtainium reads. Whether Obtainium detects each rebuild as an update, given that the tag name `dev-build` never changes, is unverified: nothing in this repository's CI or tests exercises Obtainium. Each push replaces the release, so expect frequent updates.
- **F-Droid**: not submitted. A build recipe is kept in [`packaging/f-droid/`](packaging/f-droid/), but it still names a `v1.0.0` tag that was deleted and has not been recreated, so it cannot be built as it stands.

Minimum Android version: API 29 (Android 10), set in [`android/variables.gradle`](android/variables.gradle).

### macOS and Windows

- **macOS**: the universal (Apple Silicon and Intel) DMG from the release. Unsigned and un-notarized unless the release runner had signing credentials (the release notes of each build say which), so macOS shows an "unidentified developer" Gatekeeper warning on first open: right-click the app and choose Open, or run `xattr -cr` on it. A Homebrew Cask is drafted but not submitted, see [`packaging/homebrew/README.md`](packaging/homebrew/README.md).
- **Windows**: the MSI installer from the release. Unsigned, so Windows SmartScreen may warn on first run ("More info" then "Run anyway"). Distribution is by direct download only, no package manager or store, by design, see [`documentation/PROJECT_RULES.md`](documentation/PROJECT_RULES.md).

CI builds the macOS and Windows artifacts but does not launch them, so those two platforms have had less verification than Linux and Android.

### Rolling release

Every push to `main` that passes CI rebuilds the artifacts (AppImage, Flatpak, Android APK, macOS DMG, Windows MSI) and replaces the single [`dev-build` release](https://github.com/LeonardSchwier/leotheca/releases/tag/dev-build) (see [`.github/workflows/release.yml`](.github/workflows/release.yml)). A version-tag path exists in the same workflow, but no tag has been published. File names such as the MSI and DMG contain the app version `1.0.0` from [`VERSION`](VERSION); that is a build label, not a versioned release.

## 🔄 Sync

Leotheca does not ship or bundle a sync service, and never will, see [`PHILOSOPHY.md`](PHILOSOPHY.md). Your notes are plain files in a folder, so point whatever sync tool you already use at that folder: [Syncthing](https://syncthing.net/), a WebDAV client, a generic cloud-synced folder, or anything else that syncs a directory. Leotheca does not need to know it is happening.

## 🛠️ Building from source

```sh
npm ci
npm run tauri dev
```

Full setup instructions (system dependencies per platform, running tests, the Android toolchain) live in [`CONTRIBUTING.md`](CONTRIBUTING.md).

## 📚 More

- [`PHILOSOPHY.md`](PHILOSOPHY.md), the three principles behind this project
- [`documentation/ARCHITECTURE.md`](documentation/ARCHITECTURE.md), the solution architecture: how the two platform shells and the shared frontend fit together
- [`documentation/TESTING.md`](documentation/TESTING.md), the testing strategy: unit tests, E2E tests, CI, and UI verification
- [`src/offline.test.ts`](src/offline.test.ts), the automated offline-isolation test: it asserts that the Content-Security-Policy allows no external origin
- [`ROADMAP.md`](ROADMAP.md), what's built, what's next
- [`CONTRIBUTING.md`](CONTRIBUTING.md), how to set up a dev environment and submit a change
- [`CHANGELOG.md`](CHANGELOG.md), change notes by version heading (no versioned release has been published, see Install)
- [`CONSTITUTION.md`](CONSTITUTION.md), the binding rules and standing decisions for anyone (human or AI) working on this codebase

## 📄 License

MIT, see [`LICENSE`](LICENSE).

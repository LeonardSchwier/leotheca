# Changelog

## Unreleased

### Maintenance

- **Voice dictation and microphone access removed**: Leotheca now uses neither the camera nor the microphone, because that access can invade privacy. The optional speech-to-text dictation (editor button, Quick Capture voice note, desktop whisper commands, Android recognizer) and the Android `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS` permissions are gone, along with the unused native whisper build code. An old "Speech-to-text dictation" setting in a settings file is ignored and dropped. The README and the product rules now state the stance: no camera, no microphone, no network.
- **Capture no longer stalls on long runs of blank lines**: Trailing blank lines are removed in linear time. A note ending in tens of thousands of newlines followed by text used to freeze the capture sheet for seconds. Static security analysis (ESLint security rules, Semgrep, CodeQL) now runs on the sources.
- **Android share hardening**: Sharing into Leotheca now accepts only another app's content URI; file URIs and the app's own provider are rejected, and the unused FileProvider was removed.
- **Dependency security update**: Updated production dependencies to clear all 8 known vulnerabilities reported by `npm audit` (including two critical: DOMPurify and Capacitor Android). A weekly audit workflow now reports new advisories.
- **Documentation corrections**: Removed "Android camera capture" from the new-features list (the repository contains no camera code; the feature is still open on the roadmap). Moved the macOS Quick Look generator out of the shipped features: its source and build scripts are in the repository (`packaging/macos/quicklook/`, `scripts/build-quicklook.sh`), but no release workflow builds or bundles it, so it is not part of the downloadable app. Rewrote `packaging/STATUS.md` in English with the current state, and corrected the version stated in `packaging/f-droid/README.md`.
- **Repository tidy-up** — Removed a tracked 100 MB AppImage, a stray control worktree, session logs, a scan session log and dated session reports from the tree (history is not rewritten). Added ignore rules, moved the speech-to-text research and plan to `documentation/`, moved the mermaid smoke test under `src/markdown/`, removed machine-specific paths from build scripts, and added `src/tidyRepoHygiene.test.ts`, which fails on tracked files over 5 MB or on private IP addresses and machine paths outside `.agents/handoffs`.

### New Features

- **Mermaid diagrams follow the theme and can be zoomed**: Diagrams in Preview are drawn in the app's light or dark theme (and redrawn when you switch), fill the note width, and have zoom in/out/reset, Ctrl/Cmd+wheel zoom, drag to pan and a full-screen view. A diagram with a syntax error now shows what went wrong above its source. Everything stays offline.
- **PDF export (desktop)**: the command "Export note to PDF…" prints the rendered note on A4 pages with sensible page breaks, wrapped code, scaled images and diagrams and rendered math; choose "Save as PDF" in the print dialog. Android is a separate item.
- **Markdown vault import**: Desktop command "Import Markdown vault..." copies a folder of Markdown notes into `Imported/<folder name>` in the open workspace without changing the source or overwriting any file, rewrites only attachment embeds, nested heading links and `%%comments%%`, and shows a report of what was converted, kept, unsupported, renamed, skipped or failed. Can be switched off in Settings.
- **Quick Capture target picker** — Choose the capture destination (specific note, daily note, or bookmark) with an optional template.
- **Settings export** — Export the current settings bundle to a file.
- **Folder exclusion in search** — A negated term (e.g. `-archive`) now hides a folder named `archive` and every file inside it at any depth. Exact-segment match: `-archive` hides `archive/x.md` but not `archivex/y.md`. Root-level files are unaffected. Applies to File Explorer, Bookmarks, and Outline search results. No file I/O for excluded entries.
- **Fuzzy matching in quick switcher, command palette, and link suggestions** — All three search surfaces now use subsequence-based fuzzy matching with word-start and consecutive-run bonuses instead of strict substring matching. Typing "mn" matches "Meeting Notes" and "ml" matches "Macronomics". Case-insensitive, zero new dependencies (`src/fuzzyMatch.ts`).

### Bug Fixes

- **Atomic file writes under concurrent saves** - two writes to the same note landing in the same millisecond on one process (an autosave racing an explicit save, or two capture commits in a row) could silently swap which write's content actually landed while reporting a spurious failure for the other; fixed by giving every atomic write's temp file a unique, monotonically increasing name.
- **Android folder picker** — New workspaces are now named after the real folder instead of the literal "Workspace".
- **Recent-notes widget** — Fixed label collisions for same-named notes in different folders.
- **Recent-notes widget** — Eliminated full-workspace re-walk on every note mutation.
- **Recent-notes widget** — Each row shows a relative-time line ("5 min ago") from the note's modified time; the line is hidden, not blank, for notes without one.

### Security

- **Workspace folder grants**: The desktop app now activates a workspace only if it was chosen in the native folder dialog or already in your workspace list, so script injected into the webview cannot widen file access to an arbitrary folder.
- **Hardened Mermaid SVG sanitization** — DOMPurify pass added after the regex layer to close the async SVG insertion gap.
- **Content Security Policy** — Restrictive CSP enforces the "no network calls" promise at the browser level.

### CI/Infra

- **Flatpak CI fix** — Resolved persistent flatpak CI failure by pinning the correct commit with matching lockfiles.
- **Offline isolation test** — New test suite validates the CSP config and fails CI if any code path makes a network call.

## 1.0.0

### New Features

- **Split panes on desktop** — "Split right" toolbar button opens a second editor group with independent tabs and view modes.
- **PDF viewing and annotation** — Open `.pdf` files with zoom, navigation, text search, and text/freehand annotation.
- **Freehand ink drawing** — New drawing note type with pen strokes, shapes, and sticky notes.
- **Canvas/whiteboard** — Movable cards, file-reference cards, and freeform drawing.
- **Smart Collections** — List, table, card, and board views with frontmatter-based grouping.
- **Task Hub** — Workspace-wide task list with toggle-complete, filter, search, and grouping.
- **Wikilinks and heading links** — `[[Note#Heading]]` links to specific headings, with autocomplete and inline rendering.
- **Block references** — `^id` anchors on paragraphs, headings, and code blocks with Copy/Insert link actions.
- **Backlinks and Link Diagnostics** — See all incoming links and find broken or ambiguous links.
- **Outline and breadcrumbs** — Live hierarchical heading list and breadcrumb trail with copy/insert-link actions.
- **Workspace profiles** — Rename, assign icons, relink folders, and manage multiple workspaces from a searchable switcher.
- **Android home-screen widgets** — New note, Favorites, Recent notes, and Quick Capture widgets.
- **Quick Capture** — Capture from deep links and Android share intents with review before commit.
- **RTL text direction** — Automatic per-note direction detection for Hebrew, Arabic, and other RTL scripts.
- **Offline spellchecking** — Local dictionary-based spellcheck, no network calls.
- **Mermaid diagrams** — Render fenced `mermaid` code blocks as flowcharts and sequence diagrams.
- **Footnotes** — `[^1]` references render as clickable superscripts with a Footnotes section.
- **Colored highlights** — `==highlight==` with color emoji prefix (🔴🟠🟢🔵🟣).
- **Open files from outside the vault** — Desktop "Open with" registration for `.md` files, with read-only scratch view for external files.
- **Keyboard navigation** — Full arrow-key navigation for file tree, command palette, and menus.
- **Keyboard shortcuts** — Comprehensive command palette and keyboard-first interaction.
- **Themes and custom CSS** — Light/dark themes with accent colors, plus user-supplied CSS snippets.
- **Markdown table editing** — Insert/delete rows and columns, auto-align columns.
- **Fullscreen image viewer** — Zoom, pan, and touch gestures for images.
- **Settings search** — Quickly find settings by keyword.
- **Accessibility** — WCAG-compliant focus indicators, screen-reader announcements, and reduced-motion support.

### Bug Fixes

- **Data-loss prevention** — Crash-safe saves, serialized writes for bookmarks/collections, and proper autosave before workspace transitions.
- **Silent error surfacing** — Clicking a note that can no longer be read now shows an inline error instead of failing silently.
- **Rename Preview dialog** — Now appears for Markdown-style link edits, not just wikilinks.
- **Table editing** — Fixed cursor-boundary detection for add/delete row/column commands.
- **Split-pane divider** — Fixed drag getting stuck if interrupted by context switch or multi-touch conflict.
- **Compact layout switcher** — Now follows a note into the secondary pane on narrow windows and Android.
- **PDF annotation data-loss** — Fixed loss of annotations drawn while a previous save was in flight.
- **Speech-to-text opt-in** — Now gated behind a setting, off by default.
- **Quick Capture payload size** — Now measured in UTF-8 bytes, not JavaScript string length.
- **Android widget cold start** — Fixed "New note" widget silently dropping requests during app startup.
- **Ink undo/redo** — Now persists the reverted document instead of only updating the view.
- **Canvas card dragging** — Fixed "stuck" drag if interrupted by context switch.
- **Smart Collections race condition** — Fixed silent loss of changes when mutations overlap.
- **Bookmarks race condition** — Fixed silent loss of bookmarks when mutations overlap.
- **Quick Capture inbox overwrite** — Fixed data loss when append fails but later retry succeeds.
- **Android dictation** — Fixed silent no-op when tapping the microphone button.
- **Graph/Canvas/Backlinks/Diagnostics/Bookmarks** — Fixed silent failures when clicking notes that were renamed, deleted, or moved.
- **Workspace switch race** — Fixed stale workspace overwriting a newer one.
- **Corrupted index cache** — Fixed rare crash when a corrupted wikilink index cache file could abort indexing.
- **Frontmatter preservation** — Edits now preserve comments, ordering, line endings, and unsupported structures.
- **Case-collision build failure** — Fixed Windows/macOS release build failure from `PendingCaptures.tsx`/`pendingCaptures.ts`.
- **Android CI failures** — Fixed missing `FileInputStream` import and `NoSuchFileException` in widget tests.
- **Vitest happy-dom issue** — Fixed DOMPurify sanitization and component test breakage.
- **F05 Android share bridge** — Fixed dropped staged attachments and sensitive URI logging.
- **Mistral-Vibe F05 quality** — Fixed recurring push-without-local-verification pattern breaking main CI.
- **Desktop Tauri concurrency** — Fixed concurrency issues in desktop app.
- **CodeMirror teardown** — Fixed full teardown on file switch.
- **MarkdownPreview image loading** — Fixed sequential image loading.
- **CanvasView edges** — Fixed rendering edges to retained unknown nodes.
- **Android long-press conflict** — Fixed file-tree context menu competing with native text selection.
- **Search match highlighting** — Fixed dropped repeat matches and corrupted HTML entities.
- **RTL direction override** — Fixed `dir="auto"` injection silently overriding explicit `dir` attributes.
- **Search query parser** — Fixed quoted phrases containing " OR " being split on the operator.
- **Legacy editorLayout decode** — Fixed `viewMode: undefined` violating `EditorLayoutState`.
- **Binary attachment corruption** — Fixed Quick Capture/share-intent attachments corrupted by text-decode round trip.
- **Path separator in names** — Fixed note/folder names with "/" diverging by platform instead of erroring.
- **Capture filename sanitization** — Fixed unsanitized attachment filenames used in filesystem paths.
- **Link index rebuild race** — Fixed stale rebuild overwriting a newer workspace's index.
- **`as any` lint errors** — Fixed `renameExecutor.test.ts` and `FileTree.test.tsx` lint errors breaking CI.
- **Playwright E2E harness** — Fixed hardcoded `/usr/bin/chromium` path absent on cloud sandboxes.
- **`tauriMock.js` parse error** — Fixed unescaped backticks in template literal breaking CI.
- **`open-note` automation command** — Fixed silent drop when racing ahead of settings restoration.
- **F-Droid workflow pins** — Fixed stale pre-F015 version/commit pins in submission-verify workflow.
- **`saveCoordinator.flush()` phantom state** — Fixed revision bump before write creating unsaved-work state.
- **`resetForSession` zombie entry** — Fixed permanent zombie entry when in-flight write is in progress.
- **Asset protocol scope** — Fixed `asset://` allowing any local file read via `**` glob.
- **Export HTML img inlining** — Fixed `<img>` un-inlined when attribute value contains `>`.
- **Export HTML src replacement** — Fixed wrong attribute targeted when alt/src share the same value.
- **Deep-link path validation** — Fixed `open-note` deep link not validating path against workspace.
- **Android `WRITE_EXTERNAL_STORAGE`** — Removed broader-than-needed permission.
- **`slashCommandCompletions` crash** — Fixed `RangeError` when `context.pos > doc.length`.
- **Capture attachment filename** — Fixed literal colon and 15-char timestamp in filenames.
- **Platform detection caching** — Fixed `isIOS`/`isMobile` not cached.
- **Android file reads** — Fixed unbounded file buffering risking `OutOfMemoryError`.
- **Recent-notes widget metadata** — Fixed dropped `size`/`mtime` fields.
- **Highlight color picker re-render** — Fixed menu sub-tree rebuild on toggle.
- **Duplicate `MAX_WALK_DEPTH` constant** — Documented for future refactor.
- **Recent-notes widget desktop** — Fixed unnecessary full walk on desktop.
- **Highlight color picker** — Added missing "Plain" option to remove color emoji.

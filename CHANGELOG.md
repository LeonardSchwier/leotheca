# Changelog

## Unreleased

### New Features

- **macOS Quick Look preview** — ⌥-click `.md` files in Finder to preview without opening the app.
- **Quick Capture target picker** — Choose the capture destination (specific note, daily note, or bookmark) with an optional template.
- **Android camera capture** — Take a photo directly from the "Insert attachment" toolbar.
- **Settings export** — Export the current settings bundle to a file.

### Bug Fixes

- **Android folder picker** — New workspaces are now named after the real folder instead of the literal "Workspace".
- **Recent-notes widget** — Fixed label collisions for same-named notes in different folders.
- **Recent-notes widget** — Eliminated full-workspace re-walk on every note mutation.

### Security

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
- **Local speech-to-text** — Opt-in voice dictation (Settings → General, off by default).
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

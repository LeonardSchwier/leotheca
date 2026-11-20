# Changelog

## Unreleased

### Added

- **Interface language: Settings, sidebar and tabs**: With German chosen, the Settings panel (category list, section names, every setting and its explanation, the Workspace profiles and workspace statistics parts), the sidebar (toolbar buttons, search field, sort hints, the new note, new folder, rename and permanent-delete prompts) and the tab bar (close buttons, the pinned label and the tab menu) now speak German. English stays exactly as it was. The settings search finds a setting by its name in either language, so a German reader can still type an English term from the documentation. Still English, and following in later steps: the editor, the other dialogs and menus (including the Cancel button of the name prompts), the command palette, the list of Health findings, the shortcut names, the steps under "Open with", the workspace icon names and the error text that the settings store reports.
- **Interface language (first slice)**: Settings, Appearance has a new Language row with "Follow System", "English" and "Deutsch". The choice is saved in the app configuration, applies at once and also sets the document language. The first-run and workspace-recovery dialog is available in German; the rest of the interface stays in English until it moves over in later steps. Behind it is a small typed translation layer (`src/i18n/`) that falls back to English for any missing text and never expands a workspace name that happens to contain braces.

### Changed

- **Workspace settings and bookmarks that Leotheca cannot read are no longer replaced**: When a workspace's settings file or its bookmarks file exists but cannot be read (a permission or disk error), the next change used to replace it with defaults or an empty list, and your settings or bookmarks were gone. Now the file stays as it is. For settings, the warning in Settings appears and the file is only rewritten when you choose "Rewrite settings file". For bookmarks, the Bookmarks panel says the file could not be read, that bookmarks you add meanwhile are not saved, and offers "Rewrite bookmarks file". A folder without these files (a new workspace, also on Android) works as before. Adding a bookmark from the toolbar or the command palette before you opened the Bookmarks panel no longer replaces your saved bookmarks with the one new entry, and a bookmark change made while the list is being read or just before you switch workspace can no longer write an empty list over the old workspace's file.
- **An app configuration that Leotheca cannot read is no longer replaced**: When the app configuration file exists but cannot be read (a permission or disk error), or was written by a newer version of Leotheca, the next settings change used to replace it with defaults or with one remembered folder, and your list of workspaces was gone. Now the file stays as it is, the warning in Settings appears, and the file is only rewritten when you choose "Rewrite app configuration". A first start without a file works as before.
- **Settings from a newer version are no longer lost**: Leotheca now keeps the settings in its app configuration file that it does not know yet, together with an interface language it has no translation for, and writes them back unchanged whenever it saves a setting, switches or edits a workspace profile, or you rewrite the file after a recovery warning. Before, opening the app with an older version and changing the theme, say, silently removed everything a newer version had stored there. Choosing a language in the older version still replaces the stored one.
- **Minimalistic Nordic look**: Leotheca now uses a calm Scandinavian theme by default. The light mode is frost white with soft greys and one muted fog-blue accent, the dark mode is a polar night companion. The chrome is quieter: no hairlines under the header, tabs and activity rail, flat header buttons, a borderless view switch, lighter icon strokes and lighter headings. Text contrast stays at WCAG AA, checked by a test. The default accent is now named Fog instead of Warm; your saved choice is kept. The README screenshots show the new look.

### Maintenance

- **The keytool signing tests fail on a keytool error instead of passing**: Two cases in `scripts/verifyApkNotDebugSigned.test.js` (the freshly generated key and the committed debug keystore) ended with an early `return` on any error from `keytool`, so a broken JDK, bad arguments or a killed process counted as a pass and the signing check went untested without a sign. Only a `keytool` that cannot be found (no such file, including a dangling link) ends a case early now, and it is reported as skipped instead of passed; every error from a `keytool` that starts fails the case. New tests run the helper against stand-in `keytool` programs that exit with an error, get killed or cannot be executed. Only a test file changes; no application or workflow code.
- **A fresh checkout is clean again**: `android/gradlew.bat` was stored with CRLF line endings while `.gitattributes` asks for LF in the repository and CRLF in the working tree, so git listed it as modified (in a fresh clone, where it re-reads the file when its timestamp matches the index, and after any touch of the file) and the agent ledger helper refused to claim work there until the file was hidden by hand. The stored copy now has LF (the content is unchanged, only the carriage returns went), and a checkout still writes the batch file with CRLF. A new test, `scripts/lineEndings.test.js`, fails when any tracked text file is stored with CRLF.
- **Release workflow caches and retries its tooling downloads**: The `linux`, `windows` and `android` jobs of the release workflow cache the Tauri bundling tools and the Gradle wrapper distribution and run the Tauri bundling and a Gradle wrapper warm-up through `scripts/retry.sh`, like the CI workflow. `documentation/TESTING.md` explains what is cached and that only download failures are retried.
- **Dev-dependency advisories cleared**: A root `overrides` entry moves `minimatch` to 11.0.5, so `npm audit` reports 0 vulnerabilities (it listed 10 moderate findings in the lint stack). ESLint, typescript-eslint and the Capacitor CLI run unchanged on it; no application code changed. The security notes in the skills and the PDLC document are updated to match.
- **CI bundling steps survive tooling download outages**: The Tauri bundling tools and the Gradle wrapper distribution come from release CDNs that answer 502, 503 or 504 now and then, which failed hosted runs and blocked merges for hours. The secret scan and cargo-audit downloads of pinned release binaries are retried the same way (the SHA-256 check stays after the download and a mismatch is not retried). The workflows now cache `~/.cache/tauri` and `~/.gradle/wrapper/dists`, warm up the Gradle wrapper and run the Tauri bundling through `scripts/retry.sh` (three attempts, 20 s and 60 s apart). A real compile or test failure still fails the step, a little later; no check is weakened.
- **Dev-dependency advisories cleared**: A root `overrides` entry moves `minimatch` to 11.0.5, so `npm audit` reports 0 vulnerabilities (it listed 10 moderate findings in the lint stack). ESLint, typescript-eslint and the Capacitor CLI run unchanged on it; no application code changed.
- **glib advisory in the delivery notes**: The PDLC security tooling row names the open `glib` advisory, why it waits on Tauri moving to gtk-rs 0.20, and the roadmap item that repeats the check.
- **glib advisory documented, not fixable yet**: `cargo audit` still warns about RUSTSEC-2024-0429 (`glib` 0.18.5). Every Linux part of Tauri (tauri 2.12.5, wry 0.57.1, tao 0.37.2, muda 0.21.2) still requires gtk-rs 0.18, so no upgrade lifts it; the unsound iterator is not used by our code. The reason and the check to repeat are in the security notes and the roadmap.
- **Android signature check reads the newer apksigner output**: The release check that refuses debug-signed APKs failed on a correctly signed test build because newer Android build-tools print the signer as `V2 Signer: certificate ...`. It now understands both formats and still fails closed.
- **Android test APK without signing secrets**: Until the maintainer adds the release key, the `dev-build` release now carries `leotheca-dev-build-android-TEST-ephemeral-key.apk`, signed with a random throw-away key generated during that build. Android treats every build as a different app: uninstall the previous one before installing the next, there are no in-place updates, and Obtainium and F-Droid cannot track it. It is for trying the app; the release key (four repository secrets) still produces `leotheca-<tag>-android.apk`, and an APK signed with the public debug key is still never published. The hosted build step is untested until its first run.
- **Snap draft: no network plug, pinned Node.js**: `snap/snapcraft.yaml` no longer asks for the `network` plug (the app is offline by design) and installs Node.js 22.23.2 from a SHA-256-verified archive instead of piping the nvm install script into bash. The snap is a draft that no CI job builds, and this change was not built.
- **Quick Look preview escapes quotes in links**: The source of the macOS Quick Look generator (not built or shipped by any workflow yet) now writes a double quote in a link target or label as `&quot;`, so a crafted link can no longer end the `href` attribute.
- **Android builds are no longer signed with the public debug key**: The release workflow used to publish an APK signed with the debug keystore that is committed to this repository, so anyone could build a look-alike that Android accepts as an update. The workflow now signs with a maintainer-held key from repository secrets, or publishes no Android file at all and says why in the log and the release notes. A last check in the publish job fails if any APK carries the debug certificate. Until the maintainer adds the key, the latest release has no Android APK; anyone who installed an earlier dev-build APK should uninstall it once before installing a signed build.
- **Capture templates keep shared titles and links on one line**: A title or link with line breaks, as another app can send through Share, can no longer start a new line (a new property) in a template's frontmatter.
- **Legacy UI test script retired**: The old Python Playwright script in `tests/ui` is gone. Every test in it is covered by a journey in the TypeScript end-to-end suite (`tests/e2e`), which runs in CI, or was dropped because it asserted nothing. A new journey checks nested headings, inline code and block quotes. A failed local end-to-end run no longer makes ESLint report thousands of errors from the HTML report.
- **Editor typing freeze in the end-to-end suite characterised**: The freeze that hangs headless Chromium after an edit is a browser style and layout loop that no application script causes; it also occurs in the newest Chromium and a headed browser. The finding and the measurements are recorded in the archived spec.
- **End-to-end runs no longer share a server port**: The Playwright suite serves the build on a port of its own per run (or the one in `E2E_PORT`), so several checkouts can run the pre-push gate at the same time without testing each other's build.
- **Shared glossary**: `GLOSSARY.md` lists the domain and process terms of Leotheca. Agents read it at startup, the spec grill stage extends it, and the Rules check `glossary` fails an archived spec without a `Glossary:` line.
- **Voice dictation and microphone access removed**: Leotheca now uses neither the camera nor the microphone, because that access can invade privacy. The optional speech-to-text dictation (editor button, Quick Capture voice note, desktop whisper commands, Android recognizer) and the Android `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS` permissions are gone, along with the unused native whisper build code. An old "Speech-to-text dictation" setting in a settings file is ignored and dropped. The README and the product rules now state the stance: no camera, no microphone, no network.
- **Capture no longer stalls on long runs of blank lines**: Trailing blank lines are removed in linear time. A note ending in tens of thousands of newlines followed by text used to freeze the capture sheet for seconds. Static security analysis (ESLint security rules, Semgrep, CodeQL) now runs on the sources.
- **Android share hardening**: Sharing into Leotheca now accepts only another app's content URI; file URIs and the app's own provider are rejected, and the unused FileProvider was removed.
- **Dependency security update**: Updated production dependencies to clear all 8 known vulnerabilities reported by `npm audit` (including two critical: DOMPurify and Capacitor Android). A weekly audit workflow now reports new advisories.
- **Documentation corrections**: Removed "Android camera capture" from the new-features list (the repository contains no camera code; the feature is still open on the roadmap). Moved the macOS Quick Look generator out of the shipped features: its source and build scripts are in the repository (`packaging/macos/quicklook/`, `scripts/build-quicklook.sh`), but no release workflow builds or bundles it, so it is not part of the downloadable app. Rewrote `packaging/STATUS.md` in English with the current state, and corrected the version stated in `packaging/f-droid/README.md`.
- **Repository tidy-up** — Removed a tracked 100 MB AppImage, a stray control worktree, session logs, a scan session log and dated session reports from the tree (history is not rewritten). Added ignore rules, moved the speech-to-text research and plan to `documentation/`, moved the mermaid smoke test under `src/markdown/`, removed machine-specific paths from build scripts, and added `src/tidyRepoHygiene.test.ts`, which fails on tracked files over 5 MB or on private IP addresses and machine paths outside `.agents/handoffs`.
- **Desktop file commands bound to the open workspace**: The commands that create, write, rename, move to trash or delete inside a workspace now check, in the native app, that the folder they are given is the workspace that is open, and refuse any other folder. Before, the check relied on the web layer alone. Nothing changes for normal use.
- **Unused file-system plugin removed**: The desktop app no longer includes Tauri's file-system plugin at all (it was already switched off), so the web layer has no plugin file commands to reach. Nothing changes for normal use.
- **Desktop file access narrowed**: The app window no longer holds any permission of Tauri's file-system plugin (the app never used it; its own commands do all file work), and the list of folders you have granted as workspaces can no longer be read or changed from the web layer on any system. Nothing changes for normal use.

### New Features

- **Quick Capture from the OS**: `leotheca --capture` opens the capture sheet in a fresh or running desktop instance, Android gains a Quick Capture launcher shortcut next to the widget, and a widget tap on a cold start now opens the sheet instead of silently queueing. The sheet still asks you to review before anything is written. Not yet verified on a real Android device; appending before the app has loaded is a separate open item.
- **Mermaid diagrams follow the theme and can be zoomed**: Diagrams in Preview are drawn in the app's light or dark theme (and redrawn when you switch), fill the note width, and have zoom in/out/reset, Ctrl/Cmd+wheel zoom, drag to pan and a full-screen view. A diagram with a syntax error now shows what went wrong above its source. Everything stays offline.
- **PDF export (desktop)**: the command "Export note to PDF…" prints the rendered note on A4 pages with sensible page breaks, wrapped code, scaled images and diagrams and rendered math; choose "Save as PDF" in the print dialog. Android is a separate item.
- **Markdown vault import**: Desktop command "Import Markdown vault..." copies a folder of Markdown notes into `Imported/<folder name>` in the open workspace without changing the source or overwriting any file, rewrites only attachment embeds, nested heading links and `%%comments%%`, and shows a report of what was converted, kept, unsupported, renamed, skipped or failed. Can be switched off in Settings.
- **Quick Capture target picker** — Choose the capture destination (specific note, daily note, or bookmark) with an optional template.
- **Settings export** — Export the current settings bundle to a file.
- **Folder exclusion in search** — A negated term (e.g. `-archive`) now hides a folder named `archive` and every file inside it at any depth. Exact-segment match: `-archive` hides `archive/x.md` but not `archivex/y.md`. Root-level files are unaffected. Applies to File Explorer, Bookmarks, and Outline search results. No file I/O for excluded entries.
- **Fuzzy matching in quick switcher, command palette, and link suggestions** — All three search surfaces now use subsequence-based fuzzy matching with word-start and consecutive-run bonuses instead of strict substring matching. Typing "mn" matches "Meeting Notes" and "ml" matches "Macronomics". Case-insensitive, zero new dependencies (`src/fuzzyMatch.ts`).

### Bug Fixes

- **Quick new note, canvas and drawing report failures** - Ctrl+N and the New note, New canvas and New drawing commands (and a `leotheca://new-note` link) did nothing visible when the folder was read-only, the disk was full or the new file could not be opened, and logged an unhandled promise rejection; a `new-note` link dropped the text it carried without a word. They now show a message, and say when the file was created but could not be opened.
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

# Roadmap

## Implemented

- ✅ **Local Folder Workspace**: Browse, create, rename, delete, and organize local Markdown files with tabs, autosave, workspace restoration, and configurable trash behavior.
- ✅ **Editor and Preview**: Edit with syntax highlighting in Source, Split, or rendered Preview mode, including viewport-scoped inline formatting for headings, emphasis, code, wikilinks, and bullet lists so large notes avoid whole-document decoration work.
- ✅ **Wikilinks and Backlinks**: Resolve `[[wikilinks]]`, autocomplete link targets, navigate links, and inspect backlinks.
- ✅ **Graph View**: Explore a pannable and zoomable workspace or per-note graph with first-tap node opening, isolated-note controls, filtering, and prioritized color groups.
- ✅ **Full-Text Search**: Search file names and note contents with quoted phrases, negation, OR groups, and `tag:` and `path:` filters.
- ✅ **Tags**: Read inline and frontmatter tags, index nested tags, and browse tagged notes from the sidebar.
- ✅ **Frontmatter Properties**: View and edit supported top-level frontmatter fields while preserving unsupported raw content.
- ✅ **Attachments**: Paste or drop local images, choose an attachments folder, write binary files on both platforms, and render relative local images in Preview.
- ✅ **Bookmarks**: Save shortcuts to files and searches without stale state appearing during workspace changes.
- ✅ **Command Palette and Keyboard Shortcuts**: Access core actions with Ctrl+K and documented shortcuts for note, tab, save, settings, and navigation actions.
- ✅ **Settings and Workspace Statistics**: Configure theme, editor font size, interface zoom, default view, feature toggles, sidebar layout, and platform-aware workspace statistics.
- ✅ **Markdown Help**: Open an in-app Markdown formatting reference.
- ✅ **Math Rendering**: Render inline and block math locally with bundled assets and no network access.
- ✅ **Fast Workspace Indexing**: Reuse unchanged note metadata and perform recursive Markdown discovery in one native traversal per platform.
- ✅ **Bounded Directory Traversal**: Stop recursive workspace walks at a safe depth so directory cycles cannot recurse without limit.
- ✅ **Linux Desktop Application**: Run the shared interface through the Rust desktop shell and build AppImage and Flatpak artifacts.
- ✅ **Android Folder Access**: Open user-selected folders through the platform document API on Android 10 and newer.
- ✅ **Continuous Integration and Development Builds**: Test Linux and Android changes and publish rolling development artifacts from `main`.
- ✅ **Flatpak CI Build**: Build the Flatpak bundle with offline package sources and a current supported runtime in CI.
- ✅ **Dependency Security Audit**: Remove the vulnerable nested build dependency chain and verify that the package audit reports no known vulnerabilities.
- ✅ **Workspace Statistics Wording**: Distinguish an empty workspace from platforms that cannot provide file dates.
- ✅ **Direct Interface Zoom**: Change the persisted workspace interface scale with Ctrl+Plus, Ctrl+Minus, Ctrl+0, or a Ctrl-modified wheel gesture while respecting the Settings limits.
- ✅ **Mobile Navigation and Touch Targets**: Use a full-width narrow-screen file browser that closes after note navigation, keep toolbar actions horizontally reachable, and enlarge primary touch targets.
- ✅ **Project Documentation and Screenshots**: Document setup, behavior, packaging, and current interface views.

## Open

### Bugs

- ⬜ **Android Long-Press Conflict**: Confirm or correct the candidate `user-select: none` fix so the file-tree context menu does not compete with native text selection; genuine finger-touch verification on a physical device is still required.
- 🚧 **Search Content-Read Crash** (claim: Claude-Code-interactive-20260828T0945Z, 2026-08-28T09:45Z, direct-to-main, live maintainer-supervised session, no separate branch/PR). Status as of 2026-08-28T~10:50Z, so a follow-up session (out of budget or context) can resume without re-deriving any of this:
  - **Layer 1, directory-walk crash: done, verified on-device.** `find_all_files` (Rust)/`findAllFiles` (Android) batch the whole recursive walk into one native call. Commit `ab4a74b`'s parent chain; confirmed no more crash from this specific layer via repeated real installs on the maintainer's ~500-note vault.
  - **Layer 2, one-native-call-per-file content reads: done, verified on-device.** `read_text_files_batch` (Rust)/`FolderAccessPlugin.readTextFilesBatch` (Android), driven by `runSearch`'s bounded concurrency (`SEARCH_CONTENT_READ_CONCURRENCY = 40`) and a microtask-coalescing batched reader (`createBatchedContentReader` in `fileTreeStore.ts`). Commit `ab4a74b`. Cut native calls on the maintainer's vault from ~1700 to 54, confirmed via on-device logcat call counts.
  - **`android:largeHeap="true"` added** (commit `86ccd7f`): raised the Android heap growth limit from 256MB to 512MB, confirmed in a real crash log's own reported `growth limit` value. Real, working mitigation, but not sufficient alone for this vault.
  - **Layer 3, found but NOT yet fixed: a single batch's serialized JSON payload can itself be huge.** On-device crash confirmed via `adb shell dumpsys dropbox --print` (logcat itself had rotated past the actual crash by the time it was checked, dropbox is more durable for a wrapped-around search of this length): `OutOfMemoryError: Failed to allocate a 301989896 byte allocation` (~288MB) inside `org.json.JSONStringer`/`PluginResult.toString()`, called from `FolderAccessPlugin.readTextFilesBatch`'s `call.resolve(ret)`. Root cause: batching bounds a batch by file *count* (up to 40), not combined *byte size*; the maintainer's vault (migrated from Evernote/Joplin exports) has some individual files large enough that a handful landing in the same batch produces a combined JSON response too large to allocate, regardless of heap ceiling.
  - **Next step (maintainer approved continuing, 2026-08-28T~10:52Z, before this was implemented)**: add a `size` field to `FsEntry`/`findAllFiles` (native, both platforms; cheap, same walk already stats each file for `mtime`), then bound `createBatchedContentReader`'s batches by accumulated byte size (a new `SEARCH_BATCH_MAX_BYTES` constant), not just item count, flushing early once a batch's running size crosses the limit rather than waiting for a full concurrency-sized group. Also worth considering: skip content-reading entirely (like `isImagePath` already does) for a single file above some sane size, the same way an image is already treated as unsearchable-by-content, for the edge case where one file alone exceeds any reasonable batch budget. Not yet implemented as of this entry.

### Features

- ⬜ **F-Droid Submission**: Complete a real build and submission attempt using the existing draft metadata, then resolve any reproducibility or inclusion-policy findings.
- ⬜ **Flathub Submission**: Complete domain verification, final metadata review, and the real submission using the already-green Flatpak CI artifact.
- ⬜ **Expand-All Native Traversal**: Replace the remaining per-directory bridge calls in expand-all with the existing single native traversal pattern to remove avoidable latency on large workspaces.
- ⬜ **Additional Desktop Platforms**: Add macOS and Windows build targets, then complete the prepared macOS package and direct Windows release packaging.
- ⬜ **Themes, Snippets, and Templates**: Add local extensibility for appearance and reusable note content, with a separate opt-out setting for each new capability.
- ⬜ **Web Clipper**: Provide a local browser extension that saves selected web content into ordinary Markdown notes without adding an in-app network dependency.
- ⬜ **Whiteboards and Canvas**: Add an infinite spatial view for notes, images, documents, and connected cards using an open, file-based canvas format.
- ⬜ **Local Automation Commands**: Add operating-system URL commands for reading the current note and creating a note through local inter-application automation.
- ⬜ **Compatibility Layer**: Read community extension manifests and run compatible extensions only after the maintainer approves the third-party-code security model required by `CONSTITUTION.md`.
- ⬜ **Per-Note Lock**: Encrypt and session-unlock individual notes only after the maintainer gives the cryptography design approval required by `CONSTITUTION.md`.

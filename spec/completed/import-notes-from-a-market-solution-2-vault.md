# Import notes from a Market Solution #2 vault

## Item

rm-a41aae16d492653c, "Import notes from a Market Solution #2 vault". Outcome: a desktop command copies a user-chosen vault folder of Markdown notes into a new `Imported/<vault name>` folder of the open workspace, converts only the syntax Leotheca cannot read, and shows a report of everything converted, kept, unsupported, renamed, skipped or failed.

## Acceptance

1. The source folder is never modified (a snapshot of the source is byte-identical after the run).
2. Hidden top-level folders of the vault (its config and trash folders) are skipped and reported; hidden folders deeper in the tree are copied.
3. An existing workspace file is never overwritten; a name clash gets an `(imported)` suffix and is reported.
4. Symlinks are never followed; a symlinked target folder or `..` traversal in the target cannot escape the workspace; a destination inside the source is rejected.
5. Attachment embeds and links, nested heading links and `%%comments%%` are rewritten; code blocks, spans and front matter are left byte-for-byte; CRLF survives.
6. Non-UTF-8 notes are copied unchanged and reported; an unreadable file is a partial failure, not an abort; cancel stops cleanly and keeps what was copied.
7. Report lists are capped but counts are exact.
8. The source path comes from a native dialog inside the command, never from the webview. Android and other non-desktop builds expose the same command names as a clean error/no-op and never show the command.
9. A setting (`markdownImportEnabled`, default on) hides the command; it round-trips through the settings decoder and a malformed value falls back to the default.
10. The dialog shows progress, cancel, and the report; a failed import shows an error dialog; the file tree is refreshed after files were written.

## Context

Read: `src-tauri/src/commands.rs` (`ActiveWorkspaceRoot`, containment pattern), `lib.rs` handler registration, `export_text_file_via_dialog` (native dialog defence), `src/workspace/tauriBridge.ts` (`isNativePlatform`), `workspaceSettings.ts` decode pattern, `App.tsx` command palette. Data flow: palette command -> `startMarkdownImport` -> Tauri command `import_markdown_vault` (dialog, `run_import` on a blocking thread, `markdown-import-progress` events) -> report -> dialog. Path boundary: the only webview-supplied path is `target_folder`, validated segment by segment and canonicalised against the active workspace root (change-quality-gates step 5). Crash-freedom: no unwrap on user data, every IO error becomes a report entry, a single-import guard with a drop-guard resets the running flag, progress is throttled, depth is capped, listener is removed in `finally`.

## Plan

1. Rust `markdown_import.rs` (reused from an earlier unlanded draft after review) plus tests; non-desktop stubs; no edit to `commands.rs`.
2. `src/markdownImport/` bridge, store, dialog, CSS, with unit and component tests.
3. Setting, palette entry, App wiring, settings-panel row, with decoder tests.
4. Docs: ARCHITECTURE.md module row and CHANGELOG.md entry.

## Out of scope

Android import (a second folder grant is not available there). Importing the vault's own settings, plugins, canvases or bookmarks. Resolving links across the vault after import beyond the conversions listed. Re-import / merge of an already imported vault.

## Rulings

- Skip only top-level hidden folders, not a named product folder -> no competitor name in code (product rules) and also skips VCS folders | a vault's own hidden attachment folder deeper down is still copied | low.
- Rename on clash instead of merge or overwrite -> data-loss safety | links by name may bind to the older note, reported as `renamed-note-links` | low.
- Non-desktop gets stub commands -> `blocking_pick_folder` is desktop-only and the handler list is shared | none.
- Not converting `![[note]]`, aliases, heading and block links, highlights, tags -> Leotheca already understands them (counted, byte-preserved) | none.
- Callouts kept as written and reported unsupported -> no callout renderer exists | users see plain quotes.

## Design system

Reuse `ui/Dialog`, `ui/Button`, `ui/Spinner` and existing theme tokens; add `markdownImport.css` for the report layout only. Settings row reuses the existing On/Off `settings-switch`.

## Evidence

Filled at archive.

## Evidence
Landed 5b394ae, 341eb63, 1a672b8. Hosted CI on 1a672b8: CI run 42315044064 success, Release run 42315044185 success, Rules run 42315044043 success; Agent policy success on 341eb63. Local checks by the implementing session: tsc 0, eslint 0 errors, check-version ok, npm test 178 files / 3345 passed, build ok, cargo fmt/clippy -D warnings/check ok, cargo test 118 passed. Not verified: Android build of the non-desktop stub path, real-app GUI run.

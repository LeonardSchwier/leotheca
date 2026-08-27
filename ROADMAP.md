# Roadmap

Leotheca ships in waves: coherent, demoable slices rather than a fixed calendar schedule. A wave ships when its feature list is done and stable. Waves build on each other, a later wave does not start until the previous one is in a usable state.

| Wave | Theme | Target platforms | Status |
|------|-------|-------------------|--------|
| v1 | Core viewer and editor | Linux desktop, Android | In progress |
| v2 | Knowledge navigation (links, search, graph) and inline live-preview editing | Linux desktop, Android | In progress, pulled forward alongside v1; live-preview moved here from v1 |
| v3 | Compatibility layer foundations (community plugin API shim) | Linux desktop | Not started, deferred |
| v4 | Mobile parity and polish | Android | In progress, pulled forward alongside v1 |
| v5 | Extensibility ecosystem (themes, snippets, templates) | Both | Not started |
| v6+ | Additional platforms (macOS, Windows), publishing, import/export ecosystem | TBD | Not started |

Sync is intentionally absent from this table. Leotheca does not build or bundle a hosted sync product, see the README's Sync section.

## v1: Core viewer and editor

Goal: a single window application that opens a local folder of markdown files and lets someone comfortably read and write notes in it, with an editing experience that feels as good as a dedicated writing tool.

**Definition of done:** install the Linux build and the Android build, point each at the same folder of markdown files (shared via whatever folder-sync mechanism the user already uses), and comfortably read and write notes on both, with an editing experience that feels considered and fast.

### Shipped so far

- Local folder workspace: file tree (browse, create, rename, delete, right-click context menu), tabs (rename via right-click too) with autosave, remembers the last opened workspace and reopens the tabs that were open at the end of the last session. Ctrl+N creates a new note instantly in the current folder.
- Full-text search: matches by file name first, falls back to note content.
- A markdown formatting quick-reference popup.
- Editor: CodeMirror 6 source-mode editing with markdown syntax highlighting, a separate rendered Preview mode, and a Split view. True inline live-preview (formatting rendered in place while typing, not a separate mode) is deferred to v2, see "Beyond v1" below — v1 ships with Source/Split/Preview instead.
- The common markdown syntax set, plus `[[wikilink]]` links: resolved by filename, clickable in Preview, autocomplete while typing `[[`.
- Backlinks panel and a pannable, zoomable graph view of the whole workspace. By default the graph only shows notes with at least one incoming or outgoing wikilink — a "Show all notes" checkbox in the graph's header brings isolated notes back, since on a real large vault most notes have no links at all and showing every one of them as an unconnected circle with its full filename buried the actual link structure in noise.
- A Bookmarks panel for saving shortcuts to specific files or searches.
- A Ctrl+K command palette for quick access to core actions.
- Keyboard shortcuts: Ctrl+N (new note), Ctrl+K (command palette), Ctrl+W (close current tab), Ctrl+Tab / Ctrl+Shift+Tab (cycle tabs), Ctrl+S (flush the current tab's autosave immediately), Ctrl+, (open Settings) — all listed in both the Settings panel and the "?" help dialog, not just discoverable by trial.
- Real screenshots in the README (split view, graph view, settings), replacing the "coming soon" placeholder.
- An mtime-based cache (`.leotheca/link-index-cache.json`) so rebuilding the wikilink index skips re-reading a note's content when its mtime hasn't changed — a real win for same-session re-indexing (e.g. reopening the graph view without restarting the app). The directory walk itself isn't cached by this, so it doesn't meaningfully speed up cold app starts; see the v2 backlog below for that larger piece.
- Settings: theme (Follow System / Light / Dark), font size, whole-UI zoom, default view mode, workspace statistics, license viewer, resizable/collapsible sidebar.
- Delete behavior is configurable per workspace: move to a project `.trash` folder (default) or delete permanently.
- Linux: runs via Tauri, packaged as both AppImage and Flatpak.
- Android: real folder access via the Storage Access Framework (point it at any folder, including one synced by an external tool), minimum API 29 (Android 10).
- CI builds and tests both the Linux and Android targets on every pull request. A tag push builds a Linux AppImage, a Flatpak bundle, and an Android APK and attaches all three to a draft GitHub Release (the Flatpak job is unverified until the first real run, the Android APK is debug-signed by design, see "Explicitly out of scope for v1" below).

### Still open for v1

- Flathub submission readiness: the manifest, desktop entry, and both generated dependency source lists (npm and Cargo, offline-buildable) are done. **Local `flatpak-builder` test build attempted (session 55)** and hit a real environment-specific blocker, not a manifest problem: on the maintainer's Fedora desktop, `flatpak-builder` is only installable without root as the `org.flatpak.Builder` Flatpak itself, and that sandboxed build could not see a `--user`-installed `org.gnome.Sdk`/`org.gnome.Platform` (version 46, as the manifest requires) via its own host-command mechanism — confirmed the runtime genuinely was installed and visible to a plain `flatpak info` call, so this is specific to `flatpak-builder`-running-as-a-Flatpak, not a broken install. A real system-wide install would fix it but needs `sudo`, and this machine has no passwordless `sudo` for interactive use. **Addressed instead via CI** (see the Flatpak `release.yml` job below): a GitHub Actions runner has full root and an unfiltered Flathub, so it doesn't hit either blocker. That CI job is the real verification path now; it is unverified until the first tag push actually runs it.
- F-Droid submission readiness: draft manifest exists (`packaging/f-droid/`). The open question about whether F-Droid's build server permits npm-registry access is resolved (it does, per F-Droid's own Inclusion Policy, see the package's README), a real test build/submission attempt is the remaining unknown.
- **Flatpak added to the release workflow (session 55)**: a `flatpak` job in `release.yml` uses the `flatpak/flatpak-github-actions/flatpak-builder` action (a container image with `flatpak-builder` and the GNOME 46 runtime already present as root, sidestepping the local-desktop blocker described above) to build a `.flatpak` bundle and attach it to the draft GitHub Release alongside the AppImage and APK. Unverified until the first real CI run after a push.
- ~~`npm audit` reports 5 findings in dev-only tooling~~ **fixed (session 55)**: the maintainer gave the go-ahead for the breaking bump. `npm audit fix --force` upgraded `vitest` `2.1.8` → `4.1.11` (which brings its own vite 6 support, eliminating the nested vulnerable `vite@5.4.21`/`esbuild<=0.24.2` copy). Full re-verification after: `tsc --noEmit` clean, `vitest run` 250/250, `npx vite build` succeeds, `cargo test` 11/11, `npm audit` now reports 0 vulnerabilities.
- ~~The bookmarks panel can briefly show the previous workspace's bookmarks for a moment after switching workspaces~~ **fixed (session 55)**: `loadBookmarks` now clears the signal synchronously before the read starts, and a superseded load (workspace switched again before the first load resolved) is discarded via a sequence counter rather than allowed to clobber a newer result.
- 🚧 Android: the file tree's long-press context menu (Rename/Delete/Copy Relative Path) can trigger Android's native text-selection mode on the same list item at the same time, and a follow-up tap meant for the menu sometimes lands on the selection handles instead (found during session 53's on-device verification; reliably worked around for Rename, never landed cleanly for Delete during that session). **Candidate fix applied (session 55)**: `user-select: none` (plus the `-webkit-` prefixed variants) added to `.file-tree-item` in `App.css`. Not yet re-verified on a real device — needs another APK build/install cycle to confirm it actually resolves the conflict before this can be closed out.
- ~~Android: Workspace Statistics always shows "No notes yet" for the oldest/newest note dates, even with hundreds of real notes present~~ **fixed (session 55)**: `VaultStatsPanel.tsx` now shows "Not available on this platform" when notes exist but the platform doesn't report per-file dates (Android), reserving "No notes yet" for when `noteCount` is genuinely 0. Desktop is unaffected (it does report real dates).

### Explicitly out of scope for v1

- Any plugin system or compatibility layer (v3).
- Any hosted sync, account system, or telemetry, ever, see the README's principles.
- Templates, snippets, and daily-note style automation (v5).
- Any platform beyond Linux desktop and Android for now, see below for macOS and Windows intent.
- Import from other note applications' proprietary export formats.
- Android release signing (maintainer's explicit call, session 55): `release.yml` builds and attaches a debug-signed (unsigned for real distribution) Android APK to a draft GitHub Release on a tag push, and v1 ships with that. A real signed release needs a signing keystore generated and stored as a repository secret — the maintainer's own action, not gating v1.

## Beyond v1

- **v2, knowledge navigation:** wikilinks, backlinks, and the graph view are already built, pulled forward into this same push rather than waiting for v1 to fully close first. Inline live-preview editing (formatting rendered in place while typing, headings/bold/lists styled in place, not a separate mode) moved here from v1: it's the single hardest remaining editor feature, and v1 ships with Source/Split/Preview instead of waiting on it. Still the next planned editor work, just no longer gating v1.
- **v3, compatibility layer:** reading a community plugin manifest format so existing plugins from the wider note-taking ecosystem can run against Leotheca, without ever naming that ecosystem's original application (see `CONSTITUTION.md`). Not started.
- **v4, mobile polish:** Android already has real folder access and a collapsible sidebar tuned for narrow screens; further polish continues alongside v1 rather than as a separate later pass.
- **v5, extensibility:** themes, snippets, templates. Not started.
- **Moved from v1 (maintainer decision, session 55):**
  - Caching the directory walk itself, not just per-note content reads: `rebuildLinkIndex` and `getWorkspaceStats` still walk every folder on every call (confirmed ~83s alone for 514 `listDir` calls on the maintainer's real 580-note vault) — the mtime-based content cache shipped in v1 doesn't touch this. Would need a persisted directory-listing snapshot or filesystem-watch-based invalidation, a materially larger cross-cutting design (Rust, Android Java, two TypeScript call sites).
  - A symlink cycle inside a workspace folder (a directory symlinked back to one of its own ancestors) would cause infinite recursion in every recursive directory walk (`workspace_stats` in `commands.rs`, `expandAll`/`runSearch` in `fileTreeStore.ts`) — none track visited canonical paths, and `list_dir` follows symlinks. Requires a user to have manually symlinked a directory into their own vault pointing back at an ancestor; no sync tool does this on its own. Fixing it means adding visited-path tracking to three separate recursive walks for a self-inflicted, low-likelihood edge case.
- **v6+, additional platforms:** macOS (distributed via Homebrew) and Windows (direct download from GitHub Releases only) are confirmed intended platforms, not hypothetical, see `CONSTITUTION.md`'s Decisions Log. Neither has a build target yet.

## Backlog: from the Joplin/Obsidian comparison

Added 2026-08-27 after the maintainer reviewed `FEATURE-COMPARISON.md` (the Joplin/Obsidian/Leotheca feature ledger). **v2 scope** (confirmed by the maintainer), not v1 — do not pull items from this list into v1 work. Not yet sequenced against each other or against the rest of v2 — queued here for a future prioritization pass, in the order given. Per `CONSTITUTION.md`'s "Daily competitor feature scan" policy, anything eventually built from this list must ship with its own settings toggle to turn it off, not be imposed unconditionally.

- Frontmatter and attachments, as Obsidian does them: broader YAML frontmatter use (aliases, custom fields, not just the automatic `created` timestamp Leotheca stamps today) and a configurable attachments folder, rather than images always sitting next to the note that embeds them.
- Math rendering (LaTeX/KaTeX-style), as Obsidian has.
- The remaining graph view features Obsidian has that Leotheca doesn't yet: a per-note local graph (not just the whole-workspace global one), filtering, and colour groups. Leotheca's graph already has pan/zoom, double-tap-to-open, and (session 53) hides unconnected notes by default.
- Tags, as Obsidian does them: `#tag` syntax, a tag list/pane, nesting.
- Full-text search with a query syntax, as Obsidian's does: path/tag filters and operators, not just the current plain-substring, filename-first-then-content-fallback search.

Very late in this backlog, lower priority than everything above:

- A web clipper (browser extension), as both Joplin and Obsidian ship. Not on any earlier version of this roadmap at all until now.
- Zoom/font-size controls that more closely match Obsidian's actual interaction model (e.g. Ctrl+scroll or Ctrl+Plus/Minus to zoom on the fly), not just the Settings-panel-only numeric fields Leotheca has today for font size and whole-UI zoom.

## Contributing to the roadmap

Have an idea or found a gap? Open an issue, see `CONTRIBUTING.md`. This file reflects intent and current status, not a promise of dates.

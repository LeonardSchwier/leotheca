# Roadmap

## Implemented

- ✅ **Local Folder Workspace**: Browse, create, rename, delete, and organize local Markdown files with tabs, autosave, workspace restoration, and configurable trash behavior.
- ✅ **Editor and Preview**: Edit with syntax highlighting in Source, Split, or rendered Preview mode, including inline live-preview formatting for headings, emphasis, code, wikilinks, and bullet lists.
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
- ✅ **Project Documentation and Screenshots**: Document setup, behavior, packaging, and current interface views.

## Open

### Bugs

- ⬜ **Android Long-Press Conflict**: Confirm or correct the candidate `user-select: none` fix so the file-tree context menu does not compete with native text selection; genuine finger-touch verification on a physical device is still required.

### Features

- ⬜ **F-Droid Submission**: Complete a real build and submission attempt using the existing draft metadata, then resolve any reproducibility or inclusion-policy findings.
- ⬜ **Flathub Submission**: Complete domain verification, final metadata review, and the real submission using the already-green Flatpak CI artifact.
- ⬜ **Search and Expand-All Native Traversal**: Replace the remaining per-directory bridge calls in search and expand-all with the existing single native traversal pattern to remove avoidable latency on large workspaces.
- ⬜ **Live-Preview Viewport Optimization**: Recompute editor decorations only for the visible region so exceptionally large notes remain responsive.
- ⬜ **Mobile Polish**: Improve narrow-screen navigation and touch interactions beyond the existing Android folder access and collapsible sidebar.
- ⬜ **Scroll-to-Zoom**: Add direct keyboard and pointer zoom controls while retaining the existing settings-based font and interface scaling.
- ⬜ **Additional Desktop Platforms**: Add macOS and Windows build targets, then complete the prepared macOS package and direct Windows release packaging.
- ⬜ **Themes, Snippets, and Templates**: Add local extensibility for appearance and reusable note content, with a separate opt-out setting for each new capability.
- ⬜ **Web Clipper**: Provide a local browser extension that saves selected web content into ordinary Markdown notes without adding an in-app network dependency.
- ⬜ **Whiteboards and Canvas**: Add an infinite spatial view for notes, images, documents, and connected cards using an open, file-based canvas format.
- ⬜ **Local Automation Commands**: Add operating-system URL commands for reading the current note and creating a note through local inter-application automation.
- ⬜ **Compatibility Layer**: Read community extension manifests and run compatible extensions only after the maintainer approves the third-party-code security model required by `CONSTITUTION.md`.
- ⬜ **Per-Note Lock**: Encrypt and session-unlock individual notes only after the maintainer gives the cryptography design approval required by `CONSTITUTION.md`.

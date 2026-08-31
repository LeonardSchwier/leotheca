# Changelog

## Unreleased

- Workspace settings, the app's global config, and bookmarks now validate their persisted file's contents on load instead of trusting them outright: an invalid value falls back to its default without discarding the rest of the file, and a workspace settings file that didn't fully decode shows a notice with an explicit "Rewrite settings file" action rather than being silently overwritten.
- Creating, renaming, deleting, and saving attachments now verify the target stays inside the open workspace before touching disk on desktop, closing a gap where a native command trusted an already-computed path with no server-side check. Note-content autosave itself is not yet covered by this change; that's tracked as follow-up work.
- The project's version number now has one canonical source (the root `VERSION` file), validated across every platform's build metadata in CI; a real release can no longer be tagged if the tag or the changelog has drifted from it.
- CI now uses one same-commit validation gate for frontend, Rust, Android emulator installation, and AppImage launch checks, and release publication requires that gate to pass.
- Android now exposes New note and Favorites as separate home-screen widgets instead of combining both actions in one widget.
- Frontmatter property edits now preserve unrelated comments, ordering, line endings, scalar types, and unsupported structures instead of rebuilding the entire frontmatter block. Complex values that cannot be edited losslessly in the Properties panel are shown read-only and remain editable in Source view.
- Opening a workspace now shows one level of folder structure right away instead of just the root; the existing "Expand all" button still walks the whole tree recursively.

Entries will accumulate here from the first tagged release onward.

use serde::Serialize;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;

#[derive(Serialize)]
pub struct FsEntry {
    pub name: String,
    pub path: String,
    #[serde(rename = "isDir")]
    pub is_dir: bool,
    /// Milliseconds since the Unix epoch, matching Android's
    /// `DocumentFile.lastModified()` convention so neither platform's
    /// cache logic (see `rebuildLinkIndex` in `linking/store.ts`) needs to
    /// know which platform produced a given value. `None` for a directory
    /// or if the OS call fails, never a fabricated/default value.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mtime: Option<u64>,
    /// File size in bytes. Only populated by `find_all_files`, for
    /// `runSearch`'s content-read batching (see its own `SEARCH_BATCH_MAX_BYTES`
    /// in `fileTreeStore.ts`); `None` elsewhere, including for a directory.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceStats {
    pub folder_count: usize,
    pub note_count: usize,
    pub image_count: usize,
    pub average_lines_per_note: f64,
    pub oldest_note_date: Option<u64>,
    pub newest_note_date: Option<u64>,
}

/// Converts a filesystem path to the string form every `FsEntry.path` the
/// frontend receives is expected to be in: forward-slash-separated,
/// regardless of the OS. `workspace/paths.ts`'s own doc comment states the
/// frontend's assumption plainly: "a plain string join is fine here: both
/// target platforms use forward slashes." That was true when only Linux
/// and Android existed; `Path::to_string_lossy()` on Windows returns
/// backslash-separated paths (Windows' native separator), which would
/// silently break every consumer of that assumption (`dirname`,
/// `relativePath`'s prefix matching, wikilink resolution, the workspace
/// path cache, ...) without ever raising an error, now that Windows is a
/// real build target (see `.github/workflows/release.yml`'s `windows`
/// job). Fixed once, here, at the boundary every path crosses on its way
/// to the frontend, rather than teaching every consumer about `\`.
///
/// Non-Windows paths are returned untouched: a backslash is a legal, if
/// unusual, filename character there, not a separator, so rewriting it
/// would corrupt a real path instead of normalizing one. Windows itself
/// does not have this problem in reverse: forward slashes are already a
/// valid alternate path separator for ordinary file I/O there (this is a
/// long-standing OS-level convention, not Rust- or Tauri-specific), so the
/// frontend's own forward-slash-joined paths already round-trip correctly
/// when sent back into `write_text_file`, `rename_path`, and the rest.
fn path_to_string(path: &Path) -> String {
    normalize_separators_for_platform(path.to_string_lossy().into_owned(), cfg!(windows))
}

/// The actual replacement logic behind `path_to_string` above, with "is
/// this Windows" passed in explicitly rather than baked in via
/// `#[cfg(windows)]`, so both branches are directly unit-testable
/// regardless of which OS actually runs the test suite (this project's CI
/// only runs `cargo test` on Linux, see `.github/workflows/ci.yml`'s
/// `backend` job).
fn normalize_separators_for_platform(path: String, is_windows: bool) -> String {
    if is_windows {
        path.replace('\\', "/")
    } else {
        path
    }
}

fn is_image_path(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|extension| extension.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "bmp" | "ico")
    )
}

fn note_timestamp(path: &Path) -> Option<u64> {
    let metadata = fs::metadata(path).ok()?;
    metadata
        .modified()
        .or_else(|_| metadata.created())
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_secs())
}

/// Milliseconds since the Unix epoch, matching Android's
/// `DocumentFile.lastModified()` convention — see `FsEntry::mtime`'s own
/// doc comment for why the unit needs to agree across platforms. Only
/// meaningful for a file; callers only call this for non-directory
/// entries, same as `list_dir` does below.
fn entry_mtime_ms(path: &Path) -> Option<u64> {
    fs::metadata(path)
        .ok()?
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis() as u64)
}

/// Same as `entry_mtime_ms`, but also returns the file's size in bytes,
/// from the same `fs::metadata` call rather than a second stat syscall.
/// Only `find_all_files` needs the size (for `runSearch`'s content-read
/// batching), so this stays separate from `entry_mtime_ms` rather than
/// changing that function's return type for every other caller too.
fn entry_mtime_ms_and_size(path: &Path) -> (Option<u64>, Option<u64>) {
    match fs::metadata(path) {
        Ok(metadata) => {
            let mtime = metadata
                .modified()
                .ok()
                .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
                .map(|duration| duration.as_millis() as u64);
            (mtime, Some(metadata.len()))
        }
        Err(_) => (None, None),
    }
}

/// A shared depth cap for every recursive directory walk over a workspace
/// (this function's own `walk`; the TypeScript side has its own equivalent
/// constant, `MAX_WALK_DEPTH` in `src/workspace/types.ts`, since a Rust
/// constant can't be shared across the IPC boundary). Guards against a
/// symlink inside a workspace pointing back at one of its own ancestors,
/// which would otherwise recurse forever (`Path::is_dir` follows symlinks,
/// and this walk doesn't track visited canonical paths, the only way to
/// detect a true cycle). A plain depth cap isn't cycle detection, it just
/// stops descending once nesting gets unreasonable, but that's a complete
/// fix for the actual failure mode (unbounded recursion, here a real stack
/// overflow since this walk is synchronous) since a workspace legitimately
/// nested 40 folders deep isn't a realistic vault.
const MAX_WALK_DEPTH: usize = 40;

/// Computes workspace-wide counts in one filesystem traversal. Hidden
/// directories are deliberately skipped so internal application data and the
/// workspace trash do not appear in the user's note statistics.
#[tauri::command]
pub fn workspace_stats(path: String) -> Result<WorkspaceStats, String> {
    #[derive(Default)]
    struct Accumulator {
        folder_count: usize,
        note_count: usize,
        image_count: usize,
        total_note_lines: usize,
        oldest_note_date: Option<u64>,
        newest_note_date: Option<u64>,
    }

    fn walk(path: &Path, depth: usize, stats: &mut Accumulator) -> Result<(), String> {
        for entry in fs::read_dir(path).map_err(|error| error.to_string())? {
            let entry = entry.map_err(|error| error.to_string())?;
            let entry_path = entry.path();
            let name = entry.file_name();
            if name.to_string_lossy().starts_with('.') {
                continue;
            }

            if entry_path.is_dir() {
                stats.folder_count += 1;
                if depth < MAX_WALK_DEPTH {
                    walk(&entry_path, depth + 1, stats)?;
                }
            } else if entry_path
                .extension()
                .and_then(|extension| extension.to_str())
                .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
            {
                stats.note_count += 1;
                // A single unreadable note (permission denied, invalid
                // UTF-8, ...) shouldn't take down the whole statistics
                // computation; skip its content, don't abort. It still
                // counts as a note, same principle runSearch already
                // follows on the frontend for the same class of failure.
                if let Ok(contents) = fs::read_to_string(&entry_path) {
                    stats.total_note_lines += contents.lines().count();
                }
                if let Some(timestamp) = note_timestamp(&entry_path) {
                    stats.oldest_note_date = Some(
                        stats
                            .oldest_note_date
                            .map_or(timestamp, |oldest| oldest.min(timestamp)),
                    );
                    stats.newest_note_date = Some(
                        stats
                            .newest_note_date
                            .map_or(timestamp, |newest| newest.max(timestamp)),
                    );
                }
            } else if is_image_path(&entry_path) {
                stats.image_count += 1;
            }
        }
        Ok(())
    }

    let mut stats = Accumulator::default();
    walk(Path::new(&path), 0, &mut stats)?;

    Ok(WorkspaceStats {
        folder_count: stats.folder_count,
        note_count: stats.note_count,
        image_count: stats.image_count,
        average_lines_per_note: if stats.note_count == 0 {
            0.0
        } else {
            stats.total_note_lines as f64 / stats.note_count as f64
        },
        oldest_note_date: stats.oldest_note_date,
        newest_note_date: stats.newest_note_date,
    })
}

/// Recursively finds every markdown (`.md`) file under `path` in one native
/// traversal, instead of one `list_dir` IPC round trip per directory the way
/// `linking/store.ts`'s `findMarkdownFiles` used to walk it from the
/// TypeScript side. That per-directory approach measured at ~83 seconds
/// across ~514 `list_dir` calls on a real 580-note vault (see ROADMAP.md's
/// "Directory Walk Caching"): each call's fixed IPC overhead dominated, not
/// the underlying filesystem read, so batching the whole walk into one
/// native call removes that overhead without introducing any caching or
/// staleness assumption (this always does a full, fresh traversal, it just
/// does it in Rust instead of round-tripping through JavaScript once per
/// directory). Shares `workspace_stats`'s `MAX_WALK_DEPTH` symlink-cycle
/// guard and its hidden-entry skip. Returned in filesystem discovery order,
/// not sorted; the caller (`rebuildLinkIndex`) already sorts by path itself.
#[tauri::command]
pub fn find_markdown_files(path: String) -> Result<Vec<FsEntry>, String> {
    fn walk(path: &Path, depth: usize, files: &mut Vec<FsEntry>) -> Result<(), String> {
        for entry in fs::read_dir(path).map_err(|error| error.to_string())? {
            let entry = entry.map_err(|error| error.to_string())?;
            let entry_path = entry.path();
            let name = entry.file_name();
            let name_str = name.to_string_lossy().to_string();
            if name_str.starts_with('.') {
                continue;
            }

            if entry_path.is_dir() {
                if depth < MAX_WALK_DEPTH {
                    walk(&entry_path, depth + 1, files)?;
                }
            } else if entry_path
                .extension()
                .and_then(|extension| extension.to_str())
                .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
            {
                files.push(FsEntry {
                    name: name_str,
                    path: path_to_string(&entry_path),
                    is_dir: false,
                    mtime: entry_mtime_ms(&entry_path),
                    size: None,
                });
            }
        }
        Ok(())
    }

    let mut files = Vec::new();
    walk(Path::new(&path), 0, &mut files)?;
    Ok(files)
}

/// Same one-native-call traversal as `find_markdown_files` above, but with
/// no `.md` filter: every non-hidden file of any extension, for full-text
/// search (`workspace/fileTreeStore.ts`'s `runSearch`), which needs to
/// match images and other attachments by name, not just notes. Before this
/// existed, `runSearch` did its own recursive walk via repeated `list_dir`
/// IPC calls, one per directory, the exact pattern `find_markdown_files`'s
/// doc comment above already measured at ~83 seconds on a real 580-note
/// vault; on Android specifically this didn't just run slowly, it crashed
/// the app with an `OutOfMemoryError` partway through a real ~500-note
/// vault's search (confirmed on-device, session after 2026-08-28's CI
/// signing fix). Splitting this into its own command rather than reusing
/// `find_markdown_files` for search keeps the "notes only" contract that
/// name promises intact for its other callers (`rebuildLinkIndex`).
#[tauri::command]
pub fn find_all_files(path: String) -> Result<Vec<FsEntry>, String> {
    fn walk(path: &Path, depth: usize, files: &mut Vec<FsEntry>) -> Result<(), String> {
        for entry in fs::read_dir(path).map_err(|error| error.to_string())? {
            let entry = entry.map_err(|error| error.to_string())?;
            let entry_path = entry.path();
            let name = entry.file_name();
            let name_str = name.to_string_lossy().to_string();
            if name_str.starts_with('.') {
                continue;
            }

            if entry_path.is_dir() {
                if depth < MAX_WALK_DEPTH {
                    walk(&entry_path, depth + 1, files)?;
                }
            } else {
                let (mtime, size) = entry_mtime_ms_and_size(&entry_path);
                files.push(FsEntry {
                    name: name_str,
                    path: path_to_string(&entry_path),
                    is_dir: false,
                    mtime,
                    size,
                });
            }
        }
        Ok(())
    }

    let mut files = Vec::new();
    walk(Path::new(&path), 0, &mut files)?;
    Ok(files)
}

/// Same one-native-call recursive walk as `find_all_files` above, but also
/// reports directory entries instead of silently walking through them,
/// for `workspace/fileTreeStore.ts`'s `expandAll` ("Expand All" in the file
/// tree). `find_all_files` cannot back that: it deliberately omits every
/// directory entry (its only caller, `runSearch`, only needs files), so a
/// directory with nothing directly inside it, or nested only under other
/// empty directories, never appears in its output at all, and `expandAll`
/// needs to expand and know about exactly those directories too, not just
/// ones containing a file somewhere in their subtree. Before this existed,
/// `expandAll` walked the workspace itself via repeated `list_dir` IPC
/// calls, one per directory, the same per-directory-round-trip cost
/// `find_markdown_files`'s and `find_all_files`'s own doc comments above
/// already measured and fixed for the link index and search. Kept as its
/// own command rather than adding an "include directories" flag to
/// `find_all_files`, so that command's existing "files only" contract
/// stays exactly what `runSearch` already relies on.
#[tauri::command]
pub fn find_all_entries(path: String) -> Result<Vec<FsEntry>, String> {
    fn walk(path: &Path, depth: usize, entries: &mut Vec<FsEntry>) -> Result<(), String> {
        for entry in fs::read_dir(path).map_err(|error| error.to_string())? {
            let entry = entry.map_err(|error| error.to_string())?;
            let entry_path = entry.path();
            let name = entry.file_name();
            let name_str = name.to_string_lossy().to_string();
            if name_str.starts_with('.') {
                continue;
            }

            let is_dir = entry_path.is_dir();
            let mtime = if is_dir {
                None
            } else {
                entry_mtime_ms(&entry_path)
            };
            entries.push(FsEntry {
                name: name_str,
                path: path_to_string(&entry_path),
                is_dir,
                mtime,
                size: None,
            });

            if is_dir && depth < MAX_WALK_DEPTH {
                walk(&entry_path, depth + 1, entries)?;
            }
        }
        Ok(())
    }

    let mut entries = Vec::new();
    walk(Path::new(&path), 0, &mut entries)?;
    Ok(entries)
}

/// Lists the immediate children of `path`, directories first, both sorted
/// alphabetically. Hidden entries (dotfiles) are skipped.
#[tauri::command]
pub fn list_dir(path: String) -> Result<Vec<FsEntry>, String> {
    let dir = Path::new(&path);
    let read_dir = fs::read_dir(dir).map_err(|e| e.to_string())?;

    let mut dirs = Vec::new();
    let mut files = Vec::new();

    for entry in read_dir {
        let entry = entry.map_err(|e| e.to_string())?;
        let file_name = entry.file_name();
        let name = file_name.to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let entry_path = entry.path();
        let is_dir = entry_path.is_dir();
        let mtime = if is_dir {
            None
        } else {
            entry_mtime_ms(&entry_path)
        };
        let fs_entry = FsEntry {
            name,
            path: path_to_string(&entry_path),
            is_dir,
            mtime,
            size: None,
        };
        if is_dir {
            dirs.push(fs_entry);
        } else {
            files.push(fs_entry);
        }
    }

    dirs.sort_by_key(|entry| entry.name.to_lowercase());
    files.sort_by_key(|entry| entry.name.to_lowercase());
    dirs.extend(files);
    Ok(dirs)
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Reads multiple files' contents in one native call, for full-text
/// search's content-fallback (`workspace/fileTreeStore.ts`'s `runSearch`),
/// which otherwise needs one native call per file whose name doesn't
/// match the query. On a real ~500-note vault this call-per-file pattern
/// still exhausted the Android app's Java heap after ~1700 sequential
/// Capacitor plugin calls even once the separate directory-walk crash
/// (`find_all_files`, added the same day) was fixed, confirmed on-device
/// 2026-08-28: fewer, larger native calls bound the total call count
/// regardless of vault size, the same reasoning as `find_all_files`
/// itself, just applied to content reads instead of the walk. Each file
/// is read independently and an unreadable one yields `None` in that
/// position rather than failing the whole batch, since a batch of many
/// files can't reasonably fail all-or-nothing over one bad one; the same
/// tolerance `read_text_file`'s own callers already apply per-file is
/// just centralized here.
#[tauri::command]
pub fn read_text_files_batch(paths: Vec<String>) -> Vec<Option<String>> {
    paths
        .iter()
        .map(|path| fs::read_to_string(path).ok())
        .collect()
}

/// Walks upward from `path` until it finds a real, existing ancestor,
/// returning that ancestor plus the not-yet-existing remainder as a plain,
/// non-canonicalized suffix. A brand-new nested note or folder has no
/// canonical form of its own (`fs::canonicalize` requires the path to
/// exist), so `resolve_within_workspace` below canonicalizes only the part
/// of the path that can be, then reattaches the rest lexically. The
/// reattached suffix cannot itself hide a symlink escape: nothing exists
/// there yet for a symlink to have been planted at.
fn nearest_existing_ancestor(path: &Path) -> (PathBuf, PathBuf) {
    let mut existing = path.to_path_buf();
    let mut suffix_components: Vec<std::ffi::OsString> = Vec::new();
    while !existing.exists() {
        let name = existing.file_name().map(|name| name.to_os_string());
        match existing.parent() {
            Some(parent) => {
                if let Some(name) = name {
                    suffix_components.push(name);
                }
                existing = parent.to_path_buf();
            }
            None => break,
        }
    }
    suffix_components.reverse();
    let mut suffix = PathBuf::new();
    for component in suffix_components {
        suffix.push(component);
    }
    (existing, suffix)
}

/// Audit follow-up F-004: resolves `relative_path` against `workspace_root`,
/// the one canonical containment boundary every workspace-scoped mutation
/// (create, write, rename, delete) is required to pass through before
/// touching the filesystem. Before this, desktop commands accepted an
/// already-joined absolute path straight from the frontend with no
/// server-side check at all, trusting the caller's own arithmetic as the
/// only thing keeping a write inside the workspace.
///
/// Rejected before any filesystem access, regardless of what exists on
/// disk: an empty path, an absolute `relative_path` (it must be relative
/// to `workspace_root`, not a second full path), and any lexical `..`
/// component (parent-directory traversal). `Path::is_absolute` already
/// covers a Windows drive-letter or UNC prefix on that platform; this adds
/// an explicit check for a bare root/prefix component too, as defense in
/// depth against a future caller constructing `relative_path` in a way
/// `is_absolute` alone wouldn't catch on every platform.
///
/// Symlink policy: once the lexical checks pass, the resolver canonicalizes
/// the nearest existing ancestor of the target (see `nearest_existing_ancestor`)
/// and requires that canonical form to sit inside the canonicalized
/// workspace root, using component-wise comparison (`Path::starts_with`),
/// not a raw string prefix, so a sibling directory whose name merely starts
/// with the workspace root's name (e.g. a workspace at `/vault` and a
/// symlink target of `/vault-evil`) is correctly rejected rather than
/// accepted by accident. A symlink anywhere in that ancestor chain whose
/// real target resolves outside the workspace is therefore rejected; one
/// that stays inside the workspace (a note symlinked to another location in
/// the same vault) is allowed, since canonicalization only cares about
/// where a path actually leads. If the exact target itself is already a
/// symlink (dangling or not), it is resolved and checked directly first,
/// rather than being treated as "doesn't exist yet" by the ancestor walk:
/// a dangling symlink still has no canonical form, so `fs::canonicalize`
/// naturally fails it, and a non-dangling one is checked the same way as
/// any other target.
fn resolve_within_workspace(workspace_root: &str, relative_path: &str) -> Result<PathBuf, String> {
    let relative = Path::new(relative_path);
    if relative.as_os_str().is_empty() {
        return Err("a workspace-relative path may not be empty".to_string());
    }
    if relative.is_absolute()
        || relative
            .components()
            .any(|component| matches!(component, Component::RootDir | Component::Prefix(_)))
    {
        return Err(format!(
            "\"{relative_path}\" must be relative to the workspace, not an absolute path"
        ));
    }
    if relative
        .components()
        .any(|component| matches!(component, Component::ParentDir))
    {
        return Err(format!(
            "\"{relative_path}\" may not contain \"..\" path segments"
        ));
    }

    let root = Path::new(workspace_root);
    let canonical_root = fs::canonicalize(root)
        .map_err(|e| format!("workspace root \"{workspace_root}\" is not accessible: {e}"))?;

    let joined = root.join(relative);

    if let Ok(link_metadata) = fs::symlink_metadata(&joined) {
        if link_metadata.file_type().is_symlink() {
            let canonical_target = fs::canonicalize(&joined).map_err(|_| {
                format!("\"{relative_path}\" is a symlink that does not resolve to a real location")
            })?;
            return if canonical_target.starts_with(&canonical_root) {
                Ok(canonical_target)
            } else {
                Err(format!(
                    "\"{relative_path}\" is a symlink resolving outside the workspace"
                ))
            };
        }
    }

    let (existing_ancestor, remaining_suffix) = nearest_existing_ancestor(&joined);
    let canonical_ancestor = fs::canonicalize(&existing_ancestor)
        .map_err(|e| format!("\"{relative_path}\" is not accessible: {e}"))?;
    if !canonical_ancestor.starts_with(&canonical_root) {
        return Err(format!(
            "\"{relative_path}\" resolves outside the workspace root"
        ));
    }

    // `PathBuf::join` with an empty path still appends a trailing
    // separator (observed directly: joining "/a/b" with "" produced
    // "/a/b/", not "/a/b"), which then makes `fs::rename`/`fs::remove_file`
    // fail with ENOTDIR on a non-directory target since a trailing
    // separator asserts "this must be a directory" at the OS level. An
    // empty suffix means the target already existed and was canonicalized
    // directly, so there is nothing to append at all.
    if remaining_suffix.as_os_str().is_empty() {
        Ok(canonical_ancestor)
    } else {
        Ok(canonical_ancestor.join(remaining_suffix))
    }
}

/// Writes `contents` to a workspace-relative path, after verifying with
/// `resolve_within_workspace` that it cannot escape `workspace_root`. This
/// is the workspace-scoped counterpart to `write_text_file` below, which
/// still exists unchanged for the one caller that genuinely has no
/// workspace to contain against (the global app config file, written
/// before any workspace is ever opened).
#[tauri::command]
pub fn write_workspace_text_file(
    workspace_root: String,
    relative_path: String,
    contents: String,
) -> Result<(), String> {
    let target = resolve_within_workspace(&workspace_root, &relative_path)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&target, contents).map_err(|e| e.to_string())
}

/// Same containment guarantee as `write_workspace_text_file`, for binary
/// attachment content. See `write_binary_file` below for the byte-array
/// IPC encoding note; unchanged here.
#[tauri::command]
pub fn write_workspace_binary_file(
    workspace_root: String,
    relative_path: String,
    data: Vec<u8>,
) -> Result<(), String> {
    let target = resolve_within_workspace(&workspace_root, &relative_path)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&target, data).map_err(|e| e.to_string())
}

/// Creates a workspace-relative directory (and any missing intermediate
/// directories), after verifying containment. Counterpart to `create_dir`
/// below.
#[tauri::command]
pub fn create_workspace_dir(workspace_root: String, relative_path: String) -> Result<(), String> {
    let target = resolve_within_workspace(&workspace_root, &relative_path)?;
    fs::create_dir_all(&target).map_err(|e| e.to_string())
}

/// Renames/moves a workspace-relative path to another workspace-relative
/// path within the same workspace, after verifying both ends independently
/// with `resolve_within_workspace`. Counterpart to `rename_path` below.
#[tauri::command]
pub fn rename_workspace_path(
    workspace_root: String,
    from: String,
    to: String,
) -> Result<(), String> {
    let from_target = resolve_within_workspace(&workspace_root, &from)?;
    let to_target = resolve_within_workspace(&workspace_root, &to)?;
    if let Some(parent) = to_target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(&from_target, &to_target).map_err(|e| e.to_string())
}

/// Permanently deletes a workspace-relative path, after verifying
/// containment. Counterpart to `delete_path_permanent` below.
#[tauri::command]
pub fn delete_workspace_path_permanent(
    workspace_root: String,
    relative_path: String,
) -> Result<(), String> {
    let target = resolve_within_workspace(&workspace_root, &relative_path)?;
    if target.is_dir() {
        fs::remove_dir_all(&target).map_err(|e| e.to_string())
    } else {
        fs::remove_file(&target).map_err(|e| e.to_string())
    }
}

/// Writes `contents` to `path`, creating any missing parent directories
/// first (needed for first-run writes like the settings file, whose config
/// directory may not exist yet).
#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> Result<(), String> {
    let target = Path::new(&path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(target, contents).map_err(|e| e.to_string())
}

/// Writes raw bytes to `path`, creating any missing parent directories
/// first, same as `write_text_file`. Used for saving a pasted or
/// dropped image attachment (see the frontend's paste/drop handling in
/// `editor/MarkdownEditor.tsx`); text notes never go through this
/// command. `data` arrives as a plain array of bytes rather than
/// base64: Tauri's IPC already serializes a `Vec<u8>` from a JS number
/// array for free, so there is no need for either side to encode or
/// decode anything (unlike the Android bridge, whose Capacitor plugin
/// call boundary makes base64 the practical choice instead).
#[tauri::command]
pub fn write_binary_file(path: String, data: Vec<u8>) -> Result<(), String> {
    let target = Path::new(&path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(target, data).map_err(|e| e.to_string())
}

/// Creates `path` and any missing parent directories. Does not error if the
/// directory already exists, matching `write_text_file`'s create-on-demand
/// behavior.
#[tauri::command]
pub fn create_dir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_path(from: String, to: String) -> Result<(), String> {
    fs::rename(&from, &to).map_err(|e| e.to_string())
}

/// Moves `path` into `<workspace_root>/.trash`, preserving its position
/// relative to the workspace root, rather than deleting it outright. If a
/// same-named entry already sits in `.trash`, the incoming one is given a
/// millisecond-timestamp prefix instead of overwriting it.
///
/// `path` arrives as an absolute path (every existing caller already has
/// one), so containment here works the other way round from the other
/// `resolve_within_workspace` callers above: first derive the
/// workspace-relative form via `strip_prefix`, a purely lexical check on
/// its own, then run that relative form back through
/// `resolve_within_workspace` for the real, canonicalize-based containment
/// and symlink check (audit follow-up F-004) before touching the
/// filesystem, rather than trusting the lexical prefix match alone.
#[tauri::command]
pub fn trash_path(workspace_root: String, path: String) -> Result<(), String> {
    let root = Path::new(&workspace_root);
    let target = Path::new(&path);
    let relative = target.strip_prefix(root).map_err(|e| e.to_string())?;
    let resolved = resolve_within_workspace(&workspace_root, &relative.to_string_lossy())?;

    let canonical_root = fs::canonicalize(root).map_err(|e| e.to_string())?;
    let mut dest = canonical_root.join(".trash").join(relative);
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    if dest.exists() {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let file_name = dest
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        dest = dest.with_file_name(format!("{stamp}-{file_name}"));
    }

    fs::rename(&resolved, &dest).map_err(|e| e.to_string())
}

/// Deletes `path` outright, no `.trash` involved. Used when the workspace's
/// delete-behavior setting is "permanent" rather than the default "project
/// trash" (see `trash_path`).
#[tauri::command]
pub fn delete_path_permanent(path: String) -> Result<(), String> {
    let target = Path::new(&path);
    if target.is_dir() {
        fs::remove_dir_all(target).map_err(|e| e.to_string())
    } else {
        fs::remove_file(target).map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;

    #[test]
    fn normalize_separators_for_platform_rewrites_backslashes_only_when_windows() {
        // The whole reason this takes "is Windows" as a parameter instead
        // of an internal #[cfg(windows)] check: this project's CI only
        // runs `cargo test` on Linux (ci.yml's `backend` job), so a
        // #[cfg(windows)]-gated body would never actually compile into,
        // let alone run in, this test suite. Passing it in explicitly lets
        // both branches be exercised here regardless of host OS.
        assert_eq!(
            normalize_separators_for_platform("C:\\Users\\a\\vault\\notes\\b.md".to_string(), true),
            "C:/Users/a/vault/notes/b.md",
        );
        // Not just gated off: a genuine backslash in a real Unix filename
        // (rare, but legal) must survive untouched, not get silently
        // rewritten into a different, likely nonexistent path.
        assert_eq!(
            normalize_separators_for_platform("/home/a/vault/weird\\name.md".to_string(), false),
            "/home/a/vault/weird\\name.md",
        );
    }

    #[test]
    fn list_dir_sorts_directories_before_files_and_skips_dotfiles() {
        let tmp = std::env::temp_dir().join(format!("leotheca-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        create_dir(tmp.to_string_lossy().to_string()).unwrap();
        create_dir(tmp.join("zzz-folder").to_string_lossy().to_string()).unwrap();
        File::create(tmp.join("aaa-file.md")).unwrap();
        File::create(tmp.join(".hidden")).unwrap();

        let entries = list_dir(tmp.to_string_lossy().to_string()).unwrap();

        assert_eq!(entries.len(), 2);
        assert!(entries[0].is_dir);
        assert_eq!(entries[0].name, "zzz-folder");
        assert!(!entries[1].is_dir);
        assert_eq!(entries[1].name, "aaa-file.md");

        fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn list_dir_reports_mtime_for_files_but_not_directories() {
        let tmp = std::env::temp_dir().join(format!("leotheca-test-mtime-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        create_dir(tmp.to_string_lossy().to_string()).unwrap();
        create_dir(tmp.join("a-folder").to_string_lossy().to_string()).unwrap();
        File::create(tmp.join("a-file.md")).unwrap();

        let entries = list_dir(tmp.to_string_lossy().to_string()).unwrap();

        let folder = entries.iter().find(|e| e.name == "a-folder").unwrap();
        let file = entries.iter().find(|e| e.name == "a-file.md").unwrap();
        assert_eq!(folder.mtime, None);
        assert!(file.mtime.is_some());
        // Sanity check it's actually a real, recent millisecond timestamp
        // (not e.g. an accidentally-in-seconds value): anything from the
        // last minute up to a generous future margin for clock skew.
        let now_ms = std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;
        let file_mtime = file.mtime.unwrap();
        assert!(file_mtime > now_ms - 60_000);
        assert!(file_mtime < now_ms + 60_000);

        fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn write_then_read_round_trips_contents() {
        let tmp = std::env::temp_dir().join(format!("leotheca-test-file-{}", std::process::id()));
        let path = tmp.to_string_lossy().to_string();

        write_text_file(path.clone(), "# Hello\n\nBody text.".into()).unwrap();
        let contents = read_text_file(path.clone()).unwrap();

        assert_eq!(contents, "# Hello\n\nBody text.");
        fs::remove_file(&tmp).unwrap();
    }

    #[test]
    fn read_text_files_batch_reads_every_file_and_maps_a_missing_one_to_none() {
        let root =
            std::env::temp_dir().join(format!("leotheca-test-batchread-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        create_dir(root.to_string_lossy().to_string()).unwrap();
        fs::write(root.join("a.md"), "content a").unwrap();
        fs::write(root.join("b.md"), "content b").unwrap();
        let missing = root.join("does-not-exist.md");

        let results = read_text_files_batch(vec![
            root.join("a.md").to_string_lossy().to_string(),
            missing.to_string_lossy().to_string(),
            root.join("b.md").to_string_lossy().to_string(),
        ]);

        assert_eq!(
            results,
            vec![
                Some("content a".to_string()),
                None,
                Some("content b".to_string())
            ],
            "one missing file yields None in its own position, not a failure for the whole batch"
        );
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn write_text_file_creates_missing_parent_directories() {
        let base =
            std::env::temp_dir().join(format!("leotheca-test-mkdirp-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        let nested = base.join("nested").join("dir").join("settings.json");

        write_text_file(nested.to_string_lossy().to_string(), "{}".into()).unwrap();

        assert_eq!(fs::read_to_string(&nested).unwrap(), "{}");
        fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn write_binary_file_round_trips_bytes() {
        let tmp =
            std::env::temp_dir().join(format!("leotheca-test-binfile-{}", std::process::id()));
        let path = tmp.to_string_lossy().to_string();
        let bytes: Vec<u8> = vec![0, 1, 2, 255, 254, 253];

        write_binary_file(path.clone(), bytes.clone()).unwrap();

        assert_eq!(fs::read(&tmp).unwrap(), bytes);
        fs::remove_file(&tmp).unwrap();
    }

    #[test]
    fn write_binary_file_creates_missing_parent_directories() {
        let base = std::env::temp_dir().join(format!(
            "leotheca-test-binfile-mkdirp-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&base);
        let nested = base.join("attachments").join("pasted.png");

        write_binary_file(nested.to_string_lossy().to_string(), vec![1, 2, 3]).unwrap();

        assert_eq!(fs::read(&nested).unwrap(), vec![1, 2, 3]);
        fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn write_binary_file_overwrites_an_existing_file() {
        let tmp = std::env::temp_dir().join(format!(
            "leotheca-test-binfile-overwrite-{}",
            std::process::id()
        ));
        let path = tmp.to_string_lossy().to_string();

        write_binary_file(path.clone(), vec![1, 2, 3, 4, 5]).unwrap();
        write_binary_file(path.clone(), vec![9, 9]).unwrap();

        assert_eq!(fs::read(&tmp).unwrap(), vec![9, 9]);
        fs::remove_file(&tmp).unwrap();
    }

    #[test]
    fn create_dir_creates_nested_directories_and_is_idempotent() {
        let base =
            std::env::temp_dir().join(format!("leotheca-test-createdir-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        let nested = base.join("a").join("b");

        create_dir(nested.to_string_lossy().to_string()).unwrap();
        assert!(nested.is_dir());

        // Calling again on an existing directory must not error.
        create_dir(nested.to_string_lossy().to_string()).unwrap();

        fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn rename_path_moves_a_file() {
        let base =
            std::env::temp_dir().join(format!("leotheca-test-rename-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        create_dir(base.to_string_lossy().to_string()).unwrap();
        let from = base.join("old.md");
        let to = base.join("new.md");
        File::create(&from).unwrap();

        rename_path(
            from.to_string_lossy().to_string(),
            to.to_string_lossy().to_string(),
        )
        .unwrap();

        assert!(!from.exists());
        assert!(to.exists());
        fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn trash_path_moves_entry_under_dot_trash_preserving_relative_position() {
        let root = std::env::temp_dir().join(format!("leotheca-test-trash-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        create_dir(root.join("notes").to_string_lossy().to_string()).unwrap();
        let target = root.join("notes").join("draft.md");
        File::create(&target).unwrap();

        trash_path(
            root.to_string_lossy().to_string(),
            target.to_string_lossy().to_string(),
        )
        .unwrap();

        assert!(!target.exists());
        assert!(root.join(".trash").join("notes").join("draft.md").exists());
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn delete_path_permanent_removes_a_file_and_a_directory_outright() {
        let root = std::env::temp_dir().join(format!(
            "leotheca-test-delete-permanent-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        create_dir(root.join("notes").to_string_lossy().to_string()).unwrap();
        let file = root.join("notes").join("draft.md");
        File::create(&file).unwrap();

        delete_path_permanent(file.to_string_lossy().to_string()).unwrap();
        assert!(!file.exists());
        assert!(!root.join(".trash").exists());

        delete_path_permanent(root.join("notes").to_string_lossy().to_string()).unwrap();
        assert!(!root.join("notes").exists());

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn trash_path_avoids_collision_with_an_existing_trashed_entry() {
        let root = std::env::temp_dir().join(format!(
            "leotheca-test-trash-collide-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        create_dir(root.to_string_lossy().to_string()).unwrap();
        create_dir(root.join(".trash").to_string_lossy().to_string()).unwrap();
        File::create(root.join(".trash").join("dup.md")).unwrap();
        File::create(root.join("dup.md")).unwrap();

        trash_path(
            root.to_string_lossy().to_string(),
            root.join("dup.md").to_string_lossy().to_string(),
        )
        .unwrap();

        assert!(!root.join("dup.md").exists());
        let trashed: Vec<_> = fs::read_dir(root.join(".trash")).unwrap().collect();
        assert_eq!(
            trashed.len(),
            2,
            "original plus the newly trashed, timestamp-prefixed copy"
        );
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn workspace_stats_counts_notes_images_and_visible_folders() {
        let root = std::env::temp_dir().join(format!("leotheca-test-stats-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        create_dir(root.join("notes").to_string_lossy().to_string()).unwrap();
        create_dir(root.join(".leotheca").to_string_lossy().to_string()).unwrap();
        fs::write(root.join("first.md"), "one\ntwo\n").unwrap();
        fs::write(root.join("notes").join("second.MD"), "three").unwrap();
        File::create(root.join("notes").join("image.PNG")).unwrap();
        File::create(root.join(".leotheca").join("ignored.md")).unwrap();

        let stats = workspace_stats(root.to_string_lossy().to_string()).unwrap();

        assert_eq!(stats.folder_count, 1);
        assert_eq!(stats.note_count, 2);
        assert_eq!(stats.image_count, 1);
        assert_eq!(stats.average_lines_per_note, 1.5);
        assert!(stats.oldest_note_date.is_some());
        assert!(stats.newest_note_date.is_some());
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn workspace_stats_skips_unreadable_note_content_without_failing_the_whole_computation() {
        // A stray .md file that isn't valid UTF-8 (e.g. an accidentally
        // renamed binary file) makes fs::read_to_string fail. That should
        // not take down the whole statistics panel over one bad file, the
        // same "skip what we can't read, don't abort" principle the
        // frontend's own full-text search already follows for exactly this
        // reason (see fileTreeStore.ts's runSearch).
        let root = std::env::temp_dir().join(format!(
            "leotheca-test-stats-unreadable-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        create_dir(root.to_string_lossy().to_string()).unwrap();
        fs::write(root.join("good.md"), "one\ntwo\nthree\n").unwrap();
        fs::write(root.join("bad.md"), [0xff, 0xfe, 0xfd]).unwrap();

        let stats = workspace_stats(root.to_string_lossy().to_string()).unwrap();

        assert_eq!(
            stats.note_count, 2,
            "the unreadable file still counts as a note"
        );
        assert_eq!(
            stats.average_lines_per_note, 1.5,
            "3 lines from the readable file, averaged over both notes"
        );
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn find_markdown_files_collects_md_files_recursively_and_skips_others() {
        let root =
            std::env::temp_dir().join(format!("leotheca-test-findmd-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        create_dir(root.join("notes").to_string_lossy().to_string()).unwrap();
        create_dir(root.join(".leotheca").to_string_lossy().to_string()).unwrap();
        fs::write(root.join("a.md"), "a").unwrap();
        fs::write(root.join("notes").join("b.MD"), "b").unwrap();
        fs::write(root.join("notes").join("c.txt"), "not markdown").unwrap();
        File::create(root.join(".leotheca").join("ignored.md")).unwrap();
        File::create(root.join(".hidden.md")).unwrap();

        let files = find_markdown_files(root.to_string_lossy().to_string()).unwrap();
        let mut names: Vec<_> = files.iter().map(|f| f.name.clone()).collect();
        names.sort();

        assert_eq!(
            names,
            vec!["a.md", "b.MD"],
            "only .md files outside hidden directories, case-insensitively"
        );
        assert!(files.iter().all(|f| !f.is_dir));
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn find_all_files_collects_every_extension_but_still_skips_hidden_entries() {
        let root =
            std::env::temp_dir().join(format!("leotheca-test-findall-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        create_dir(root.join("notes").to_string_lossy().to_string()).unwrap();
        create_dir(root.join(".leotheca").to_string_lossy().to_string()).unwrap();
        fs::write(root.join("a.md"), "a").unwrap();
        fs::write(root.join("notes").join("photo.png"), "not really a png").unwrap();
        fs::write(root.join("notes").join("c.txt"), "plain text").unwrap();
        File::create(root.join(".leotheca").join("ignored.md")).unwrap();
        File::create(root.join(".hidden.md")).unwrap();

        let files = find_all_files(root.to_string_lossy().to_string()).unwrap();
        let mut names: Vec<_> = files.iter().map(|f| f.name.clone()).collect();
        names.sort();

        assert_eq!(
            names,
            vec!["a.md", "c.txt", "photo.png"],
            "every extension outside hidden directories, unlike find_markdown_files"
        );
        assert!(files.iter().all(|f| !f.is_dir));
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    #[cfg(unix)]
    fn find_all_files_stops_at_a_bounded_depth_instead_of_recursing_forever_through_a_symlink_cycle(
    ) {
        // Same shape and reasoning as find_markdown_files's own symlink-cycle
        // test just above: this shares that function's walk logic and
        // MAX_WALK_DEPTH cap verbatim, minus the .md filter. The bound below
        // is one looser than that test's own (MAX_WALK_DEPTH + 2, not + 1):
        // on this filesystem, real symlink resolution (Linux's own ELOOP
        // limit, see workspace_stats's own symlink-cycle test comment)
        // fails is_dir() for "loop" at the deepest level reached, so it
        // falls into the non-directory branch and is collected once as a
        // pseudo-file named "loop" alongside every "a.md" rediscovery,
        // confirmed directly while writing this test (41 "a.md" plus one
        // "loop"). find_markdown_files never shows this because "loop" has
        // no ".md" extension to pass its filter; find_all_files has no
        // filter to hide it behind.
        let root = std::env::temp_dir().join(format!(
            "leotheca-test-findall-cycle-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        create_dir(root.to_string_lossy().to_string()).unwrap();
        fs::write(root.join("a.md"), "a").unwrap();
        std::os::unix::fs::symlink(&root, root.join("loop")).unwrap();

        let files = find_all_files(root.to_string_lossy().to_string()).unwrap();

        assert!(
            !files.is_empty(),
            "the walk should have found a.md at least once"
        );
        assert!(
            files.len() <= MAX_WALK_DEPTH + 2,
            "MAX_WALK_DEPTH should cap how many times a.md is rediscovered through the cycle \
             (plus at most one misclassified \"loop\" pseudo-file at the OS's own ELOOP boundary), got {}",
            files.len()
        );

        fs::remove_file(root.join("loop")).unwrap();
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn find_all_entries_includes_directories_even_when_empty() {
        // The exact case find_all_files cannot answer: a directory with
        // nothing directly inside it (here, "empty") must still appear, so
        // fileTreeStore.ts's expandAll can expand it and know it has no
        // children, instead of silently never learning it exists.
        let root = std::env::temp_dir().join(format!(
            "leotheca-test-findallentries-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        create_dir(root.join("notes").to_string_lossy().to_string()).unwrap();
        create_dir(root.join("empty").to_string_lossy().to_string()).unwrap();
        create_dir(root.join(".leotheca").to_string_lossy().to_string()).unwrap();
        fs::write(root.join("a.md"), "a").unwrap();
        fs::write(root.join("notes").join("b.md"), "b").unwrap();
        File::create(root.join(".leotheca").join("ignored.md")).unwrap();
        File::create(root.join(".hidden.md")).unwrap();

        let entries = find_all_entries(root.to_string_lossy().to_string()).unwrap();
        let mut names: Vec<_> = entries.iter().map(|f| f.name.clone()).collect();
        names.sort();

        assert_eq!(
            names,
            vec!["a.md", "b.md", "empty", "notes"],
            "both files and directories, including one with nothing inside it, outside hidden directories"
        );
        let empty_entry = entries.iter().find(|e| e.name == "empty").unwrap();
        assert!(empty_entry.is_dir);
        assert!(
            empty_entry.mtime.is_none(),
            "mtime is only meaningful for files, same as list_dir"
        );
        let notes_entry = entries.iter().find(|e| e.name == "notes").unwrap();
        assert!(notes_entry.is_dir);
        let a_entry = entries.iter().find(|e| e.name == "a.md").unwrap();
        assert!(!a_entry.is_dir);
        assert!(a_entry.mtime.is_some());
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    #[cfg(unix)]
    fn find_all_entries_stops_at_a_bounded_depth_instead_of_recursing_forever_through_a_symlink_cycle(
    ) {
        // Same shape and reasoning as find_all_files's own symlink-cycle
        // test above, adjusted for directory entries themselves now also
        // being collected (not just files found through them).
        let root = std::env::temp_dir().join(format!(
            "leotheca-test-findallentries-cycle-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        create_dir(root.to_string_lossy().to_string()).unwrap();
        fs::write(root.join("a.md"), "a").unwrap();
        std::os::unix::fs::symlink(&root, root.join("loop")).unwrap();

        let entries = find_all_entries(root.to_string_lossy().to_string()).unwrap();

        assert!(
            !entries.is_empty(),
            "the walk should have found a.md and loop at least once"
        );
        assert!(
            entries.len() <= (MAX_WALK_DEPTH + 2) * 2,
            "MAX_WALK_DEPTH should cap how many times a.md and loop are rediscovered through the cycle \
             (same +2 slack as find_all_files's own version of this test, for the OS's own ELOOP boundary), got {}",
            entries.len()
        );

        fs::remove_file(root.join("loop")).unwrap();
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn find_markdown_files_reports_a_real_mtime_for_every_file() {
        let root =
            std::env::temp_dir().join(format!("leotheca-test-findmd-mtime-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        create_dir(root.to_string_lossy().to_string()).unwrap();
        fs::write(root.join("a.md"), "a").unwrap();

        let files = find_markdown_files(root.to_string_lossy().to_string()).unwrap();

        assert_eq!(files.len(), 1);
        assert!(files[0].mtime.is_some());
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn find_all_files_reports_a_real_size_for_every_file() {
        let root =
            std::env::temp_dir().join(format!("leotheca-test-findall-size-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        create_dir(root.to_string_lossy().to_string()).unwrap();
        fs::write(root.join("a.md"), "twelve bytes").unwrap();

        let files = find_all_files(root.to_string_lossy().to_string()).unwrap();

        assert_eq!(files.len(), 1);
        assert_eq!(
            files[0].size,
            Some(12),
            "size should be the real byte length, for runSearch's content-read batching"
        );
        assert!(
            files[0].mtime.is_some(),
            "size shouldn't come at the cost of losing mtime"
        );
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn find_markdown_files_returns_an_empty_list_for_a_workspace_with_no_notes() {
        let root =
            std::env::temp_dir().join(format!("leotheca-test-findmd-empty-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        create_dir(root.to_string_lossy().to_string()).unwrap();
        fs::write(root.join("not-a-note.txt"), "x").unwrap();

        let files = find_markdown_files(root.to_string_lossy().to_string()).unwrap();

        assert!(files.is_empty());
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    #[cfg(unix)]
    fn find_markdown_files_stops_at_a_bounded_depth_instead_of_recursing_forever_through_a_symlink_cycle(
    ) {
        // Same shape as workspace_stats's own symlink-cycle test: a
        // directory symlinked back at itself. The main thing this proves is
        // that the call returns at all, in bounded work, instead of hanging
        // or crashing; see that test's own comment for why an exact count
        // isn't asserted (the OS's own ELOOP protection can independently
        // stop the walk at or below MAX_WALK_DEPTH).
        let root =
            std::env::temp_dir().join(format!("leotheca-test-findmd-cycle-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        create_dir(root.to_string_lossy().to_string()).unwrap();
        fs::write(root.join("a.md"), "a").unwrap();
        std::os::unix::fs::symlink(&root, root.join("loop")).unwrap();

        let files = find_markdown_files(root.to_string_lossy().to_string()).unwrap();

        // "a.md" is rediscovered once per depth level the cycle revisits
        // (root's own content, seen again through each nested "loop"), so a
        // correct depth cap bounds the count instead of it growing forever.
        assert!(
            !files.is_empty(),
            "the walk should have found a.md at least once"
        );
        assert!(
            files.len() <= MAX_WALK_DEPTH + 1,
            "MAX_WALK_DEPTH should cap how many times a.md is rediscovered through the cycle, got {}",
            files.len()
        );

        fs::remove_file(root.join("loop")).unwrap();
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    #[cfg(unix)]
    fn workspace_stats_stops_at_a_bounded_depth_instead_of_recursing_forever_through_a_symlink_cycle(
    ) {
        // A directory symlinked back at itself is the simplest way to
        // reproduce a workspace symlink cycle (a directory symlinked back
        // to one of its own ancestors, see ROADMAP.md's "Symlink Cycle
        // Handling"): every recursive step following the symlink lands
        // back at the same real directory. The main thing this test
        // proves is that the call returns at all, in bounded depth,
        // instead of hanging or crashing.
        //
        // It does NOT assert an exact folder_count: each recursive step
        // passes the whole accumulated path (".../loop/loop/loop") to a
        // fresh `fs::read_dir` call, never a canonicalized one, so the
        // OS's own per-lookup symlink-resolution limit (Linux's ELOOP,
        // commonly 40) can independently stop the walk at a depth at or
        // below MAX_WALK_DEPTH, observed directly while writing this test
        // (folder_count came back as exactly MAX_WALK_DEPTH here, one
        // short of this walk's own theoretical MAX_WALK_DEPTH + 1, because
        // the OS's stat() call on the final entry silently reported "not
        // a directory" once path resolution itself started failing).
        // That's a real, useful backstop, not a reason to remove
        // MAX_WALK_DEPTH: it's Linux-specific behavior this project
        // can't assume on every future target (see CONSTITUTION.md's
        // macOS/Windows plans), while MAX_WALK_DEPTH is an explicit,
        // portable guarantee independent of any OS's symlink-resolution
        // quirks.
        let root =
            std::env::temp_dir().join(format!("leotheca-test-stats-cycle-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        create_dir(root.to_string_lossy().to_string()).unwrap();
        std::os::unix::fs::symlink(&root, root.join("loop")).unwrap();

        let stats = workspace_stats(root.to_string_lossy().to_string()).unwrap();

        assert!(
            stats.folder_count > 0,
            "the walk should have descended at least once"
        );
        assert!(
            stats.folder_count <= MAX_WALK_DEPTH + 1,
            "MAX_WALK_DEPTH should cap this walk even if the OS's own symlink-loop \
             protection doesn't kick in first, got {}",
            stats.folder_count
        );

        fs::remove_file(root.join("loop")).unwrap();
        fs::remove_dir_all(&root).unwrap();
    }

    fn make_workspace(name: &str) -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("leotheca-test-f004-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn resolve_within_workspace_rejects_an_empty_path() {
        let root = make_workspace("empty");
        assert!(resolve_within_workspace(&root.to_string_lossy(), "").is_err());
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn resolve_within_workspace_rejects_an_absolute_relative_path() {
        let root = make_workspace("absolute");
        let err = resolve_within_workspace(&root.to_string_lossy(), "/etc/passwd").unwrap_err();
        assert!(err.contains("absolute"), "unexpected error: {err}");
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn resolve_within_workspace_rejects_lexical_parent_traversal() {
        let root = make_workspace("traversal");
        fs::write(root.join("note.md"), "hi").unwrap();
        let err = resolve_within_workspace(&root.to_string_lossy(), "../outside.md").unwrap_err();
        assert!(err.contains(".."), "unexpected error: {err}");
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn resolve_within_workspace_rejects_traversal_hidden_in_the_middle_of_the_path() {
        // "notes/../../outside.md" contains no leading ".." but still
        // escapes once walked: the component-based rejection must catch a
        // ".." anywhere, not just check whether the whole string starts
        // with one.
        let root = make_workspace("mid-traversal");
        fs::create_dir_all(root.join("notes")).unwrap();
        let err = resolve_within_workspace(&root.to_string_lossy(), "notes/../../outside.md")
            .unwrap_err();
        assert!(err.contains(".."), "unexpected error: {err}");
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn resolve_within_workspace_accepts_a_not_yet_existing_nested_path() {
        let root = make_workspace("new-nested");
        let resolved =
            resolve_within_workspace(&root.to_string_lossy(), "folder/sub/new-note.md").unwrap();
        let canonical_root = fs::canonicalize(&root).unwrap();
        assert_eq!(resolved, canonical_root.join("folder/sub/new-note.md"));
        // Purely a resolution, not a write: nothing should have been created.
        assert!(!root.join("folder").exists());
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn resolve_within_workspace_accepts_an_existing_nested_file() {
        let root = make_workspace("existing-nested");
        fs::create_dir_all(root.join("folder")).unwrap();
        fs::write(root.join("folder/note.md"), "hi").unwrap();
        let resolved = resolve_within_workspace(&root.to_string_lossy(), "folder/note.md").unwrap();
        let canonical_root = fs::canonicalize(&root).unwrap();
        assert_eq!(resolved, canonical_root.join("folder/note.md"));
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn resolve_within_workspace_rejects_a_sibling_directory_that_merely_shares_a_name_prefix() {
        // Regression guard for the classic string-prefix bug: a workspace at
        // ".../vault" must not accept a target that resolves to
        // ".../vault-evil/secret.md" just because the string "vault-evil"
        // starts with the string "vault". `Path::starts_with` is
        // component-aware and should already reject this; this test proves
        // it, rather than assuming the stdlib API is used correctly.
        let parent = std::env::temp_dir().join(format!(
            "leotheca-test-f004-prefix-parent-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&parent);
        let root = parent.join("vault");
        let evil = parent.join("vault-evil");
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&evil).unwrap();
        fs::write(evil.join("secret.md"), "top secret").unwrap();
        // Symlink *inside* the real workspace pointing at the sibling
        // "vault-evil" directory, the only way a resolver operating purely
        // on `workspace_root` + a relative path could otherwise reach it.
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(&evil, root.join("escape")).unwrap();
            let err =
                resolve_within_workspace(&root.to_string_lossy(), "escape/secret.md").unwrap_err();
            assert!(err.contains("outside"), "unexpected error: {err}");
        }
        fs::remove_dir_all(&parent).unwrap();
    }

    #[test]
    #[cfg(unix)]
    fn resolve_within_workspace_rejects_a_symlinked_parent_directory_escaping_the_workspace() {
        let root = make_workspace("symlink-parent");
        let outside = std::env::temp_dir().join(format!(
            "leotheca-test-f004-symlink-parent-outside-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&outside);
        fs::create_dir_all(&outside).unwrap();
        std::os::unix::fs::symlink(&outside, root.join("escape")).unwrap();

        let err = resolve_within_workspace(&root.to_string_lossy(), "escape/note.md").unwrap_err();
        assert!(err.contains("outside"), "unexpected error: {err}");

        fs::remove_dir_all(&root).unwrap();
        fs::remove_dir_all(&outside).unwrap();
    }

    #[test]
    #[cfg(unix)]
    fn resolve_within_workspace_rejects_a_symlink_at_the_exact_target_escaping_the_workspace() {
        let root = make_workspace("symlink-target");
        let outside_file = std::env::temp_dir().join(format!(
            "leotheca-test-f004-symlink-target-outside-{}.md",
            std::process::id()
        ));
        fs::write(&outside_file, "outside content").unwrap();
        std::os::unix::fs::symlink(&outside_file, root.join("note.md")).unwrap();

        let err = resolve_within_workspace(&root.to_string_lossy(), "note.md").unwrap_err();
        assert!(err.contains("outside"), "unexpected error: {err}");

        fs::remove_dir_all(&root).unwrap();
        fs::remove_file(&outside_file).unwrap();
    }

    #[test]
    #[cfg(unix)]
    fn resolve_within_workspace_rejects_a_dangling_symlink_at_the_exact_target() {
        let root = make_workspace("dangling-symlink");
        let nonexistent = root.join("this-does-not-exist.md");
        std::os::unix::fs::symlink(&nonexistent, root.join("note.md")).unwrap();

        assert!(resolve_within_workspace(&root.to_string_lossy(), "note.md").is_err());

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    #[cfg(unix)]
    fn resolve_within_workspace_allows_a_symlink_that_stays_inside_the_workspace() {
        let root = make_workspace("symlink-internal");
        fs::create_dir_all(root.join("real")).unwrap();
        fs::write(root.join("real/note.md"), "hi").unwrap();
        std::os::unix::fs::symlink(root.join("real/note.md"), root.join("linked.md")).unwrap();

        let resolved = resolve_within_workspace(&root.to_string_lossy(), "linked.md").unwrap();
        let canonical_root = fs::canonicalize(&root).unwrap();
        assert_eq!(resolved, canonical_root.join("real/note.md"));

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn write_workspace_text_file_writes_within_the_workspace_and_creates_missing_directories() {
        let root = make_workspace("write-ok");
        write_workspace_text_file(
            root.to_string_lossy().to_string(),
            "notes/new/hello.md".to_string(),
            "# Hello".to_string(),
        )
        .unwrap();
        assert_eq!(
            fs::read_to_string(root.join("notes/new/hello.md")).unwrap(),
            "# Hello"
        );
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn write_workspace_text_file_rejects_traversal_and_writes_nothing() {
        let root = make_workspace("write-traversal");
        let result = write_workspace_text_file(
            root.to_string_lossy().to_string(),
            "../escape.md".to_string(),
            "malicious".to_string(),
        );
        assert!(result.is_err());
        let outside = root.parent().unwrap().join("escape.md");
        assert!(
            !outside.exists(),
            "a rejected write must not touch the filesystem at all"
        );
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn write_workspace_binary_file_rejects_an_absolute_path() {
        let root = make_workspace("write-binary-absolute");
        let result = write_workspace_binary_file(
            root.to_string_lossy().to_string(),
            "/tmp/should-not-be-written.bin".to_string(),
            vec![1, 2, 3],
        );
        assert!(result.is_err());
        assert!(!Path::new("/tmp/should-not-be-written.bin").exists());
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn create_workspace_dir_creates_nested_directories_within_the_workspace() {
        let root = make_workspace("create-dir-ok");
        create_workspace_dir(root.to_string_lossy().to_string(), "a/b/c".to_string()).unwrap();
        assert!(root.join("a/b/c").is_dir());
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn create_workspace_dir_rejects_traversal() {
        let root = make_workspace("create-dir-traversal");
        let result =
            create_workspace_dir(root.to_string_lossy().to_string(), "../evil".to_string());
        assert!(result.is_err());
        assert!(!root.parent().unwrap().join("evil").exists());
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn rename_workspace_path_moves_a_file_within_the_workspace() {
        let root = make_workspace("rename-ok");
        fs::write(root.join("old.md"), "content").unwrap();
        rename_workspace_path(
            root.to_string_lossy().to_string(),
            "old.md".to_string(),
            "renamed/new.md".to_string(),
        )
        .unwrap();
        assert!(!root.join("old.md").exists());
        assert_eq!(
            fs::read_to_string(root.join("renamed/new.md")).unwrap(),
            "content"
        );
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn rename_workspace_path_rejects_a_destination_that_escapes_the_workspace() {
        let root = make_workspace("rename-traversal");
        fs::write(root.join("old.md"), "content").unwrap();
        let result = rename_workspace_path(
            root.to_string_lossy().to_string(),
            "old.md".to_string(),
            "../escaped.md".to_string(),
        );
        assert!(result.is_err());
        assert!(
            root.join("old.md").exists(),
            "the source must be untouched on rejection"
        );
        assert!(!root.parent().unwrap().join("escaped.md").exists());
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn delete_workspace_path_permanent_removes_a_contained_file() {
        let root = make_workspace("delete-ok");
        fs::write(root.join("gone.md"), "bye").unwrap();
        delete_workspace_path_permanent(root.to_string_lossy().to_string(), "gone.md".to_string())
            .unwrap();
        assert!(!root.join("gone.md").exists());
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn delete_workspace_path_permanent_rejects_traversal_and_deletes_nothing() {
        let root = make_workspace("delete-traversal");
        let sibling = root.parent().unwrap().join(format!(
            "leotheca-test-f004-delete-traversal-victim-{}",
            std::process::id()
        ));
        fs::write(&sibling, "do not delete me").unwrap();
        let relative = format!("../{}", sibling.file_name().unwrap().to_string_lossy());
        let result = delete_workspace_path_permanent(root.to_string_lossy().to_string(), relative);
        assert!(result.is_err());
        assert!(
            sibling.exists(),
            "a rejected delete must not touch the filesystem"
        );
        fs::remove_dir_all(&root).unwrap();
        fs::remove_file(&sibling).unwrap();
    }

    #[test]
    #[cfg(unix)]
    fn trash_path_rejects_a_symlinked_target_escaping_the_workspace() {
        let root = make_workspace("trash-symlink-escape");
        let outside_file = std::env::temp_dir().join(format!(
            "leotheca-test-f004-trash-symlink-outside-{}.md",
            std::process::id()
        ));
        fs::write(&outside_file, "outside content").unwrap();
        let link = root.join("note.md");
        std::os::unix::fs::symlink(&outside_file, &link).unwrap();

        let result = trash_path(
            root.to_string_lossy().to_string(),
            link.to_string_lossy().to_string(),
        );

        assert!(result.is_err());
        assert!(
            outside_file.exists(),
            "a rejected trash must not move the real file it points to"
        );
        fs::remove_dir_all(&root).unwrap();
        fs::remove_file(&outside_file).unwrap();
    }

    #[test]
    fn trash_path_still_moves_an_ordinary_contained_file() {
        let root = make_workspace("trash-ok");
        fs::write(root.join("note.md"), "content").unwrap();
        trash_path(
            root.to_string_lossy().to_string(),
            root.join("note.md").to_string_lossy().to_string(),
        )
        .unwrap();
        assert!(!root.join("note.md").exists());
        assert!(root.join(".trash/note.md").exists());
        fs::remove_dir_all(&root).unwrap();
    }
}

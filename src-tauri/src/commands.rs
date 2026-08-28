use serde::Serialize;
use std::fs;
use std::path::Path;
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
    if is_windows { path.replace('\\', "/") } else { path }
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
    let mut folder_count = 0;
    let mut note_count = 0;
    let mut image_count = 0;
    let mut total_note_lines = 0;
    let mut oldest_note_date = None;
    let mut newest_note_date = None;

    fn walk(
        path: &Path,
        depth: usize,
        folder_count: &mut usize,
        note_count: &mut usize,
        image_count: &mut usize,
        total_note_lines: &mut usize,
        oldest_note_date: &mut Option<u64>,
        newest_note_date: &mut Option<u64>,
    ) -> Result<(), String> {
        for entry in fs::read_dir(path).map_err(|error| error.to_string())? {
            let entry = entry.map_err(|error| error.to_string())?;
            let entry_path = entry.path();
            let name = entry.file_name();
            if name.to_string_lossy().starts_with('.') {
                continue;
            }

            if entry_path.is_dir() {
                *folder_count += 1;
                if depth < MAX_WALK_DEPTH {
                    walk(
                        &entry_path,
                        depth + 1,
                        folder_count,
                        note_count,
                        image_count,
                        total_note_lines,
                        oldest_note_date,
                        newest_note_date,
                    )?;
                }
            } else if entry_path
                .extension()
                .and_then(|extension| extension.to_str())
                .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
            {
                *note_count += 1;
                // A single unreadable note (permission denied, invalid
                // UTF-8, ...) shouldn't take down the whole statistics
                // computation; skip its content, don't abort. It still
                // counts as a note, same principle runSearch already
                // follows on the frontend for the same class of failure.
                if let Ok(contents) = fs::read_to_string(&entry_path) {
                    *total_note_lines += contents.lines().count();
                }
                if let Some(timestamp) = note_timestamp(&entry_path) {
                    *oldest_note_date =
                        Some(oldest_note_date.map_or(timestamp, |oldest| oldest.min(timestamp)));
                    *newest_note_date =
                        Some(newest_note_date.map_or(timestamp, |newest| newest.max(timestamp)));
                }
            } else if is_image_path(&entry_path) {
                *image_count += 1;
            }
        }
        Ok(())
    }

    walk(
        Path::new(&path),
        0,
        &mut folder_count,
        &mut note_count,
        &mut image_count,
        &mut total_note_lines,
        &mut oldest_note_date,
        &mut newest_note_date,
    )?;

    Ok(WorkspaceStats {
        folder_count,
        note_count,
        image_count,
        average_lines_per_note: if note_count == 0 {
            0.0
        } else {
            total_note_lines as f64 / note_count as f64
        },
        oldest_note_date,
        newest_note_date,
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
            let mtime = if is_dir { None } else { entry_mtime_ms(&entry_path) };
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
        let mtime = if is_dir { None } else { entry_mtime_ms(&entry_path) };
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

    dirs.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
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
    paths.iter().map(|path| fs::read_to_string(path).ok()).collect()
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
#[tauri::command]
pub fn trash_path(workspace_root: String, path: String) -> Result<(), String> {
    let root = Path::new(&workspace_root);
    let target = Path::new(&path);
    let relative = target.strip_prefix(root).map_err(|e| e.to_string())?;

    let mut dest = root.join(".trash").join(relative);
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

    fs::rename(target, &dest).map_err(|e| e.to_string())
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
        let root = std::env::temp_dir().join(format!("leotheca-test-batchread-{}", std::process::id()));
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
            vec![Some("content a".to_string()), None, Some("content b".to_string())],
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
        let base = std::env::temp_dir()
            .join(format!("leotheca-test-binfile-mkdirp-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        let nested = base.join("attachments").join("pasted.png");

        write_binary_file(nested.to_string_lossy().to_string(), vec![1, 2, 3]).unwrap();

        assert_eq!(fs::read(&nested).unwrap(), vec![1, 2, 3]);
        fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn write_binary_file_overwrites_an_existing_file() {
        let tmp = std::env::temp_dir()
            .join(format!("leotheca-test-binfile-overwrite-{}", std::process::id()));
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

        assert_eq!(stats.note_count, 2, "the unreadable file still counts as a note");
        assert_eq!(
            stats.average_lines_per_note, 1.5,
            "3 lines from the readable file, averaged over both notes"
        );
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn find_markdown_files_collects_md_files_recursively_and_skips_others() {
        let root = std::env::temp_dir().join(format!("leotheca-test-findmd-{}", std::process::id()));
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

        assert_eq!(names, vec!["a.md", "b.MD"], "only .md files outside hidden directories, case-insensitively");
        assert!(files.iter().all(|f| !f.is_dir));
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn find_all_files_collects_every_extension_but_still_skips_hidden_entries() {
        let root = std::env::temp_dir().join(format!("leotheca-test-findall-{}", std::process::id()));
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
    fn find_all_files_stops_at_a_bounded_depth_instead_of_recursing_forever_through_a_symlink_cycle() {
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

        assert!(!files.is_empty(), "the walk should have found a.md at least once");
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
        let root = std::env::temp_dir().join(format!("leotheca-test-findallentries-{}", std::process::id()));
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
        assert!(empty_entry.mtime.is_none(), "mtime is only meaningful for files, same as list_dir");
        let notes_entry = entries.iter().find(|e| e.name == "notes").unwrap();
        assert!(notes_entry.is_dir);
        let a_entry = entries.iter().find(|e| e.name == "a.md").unwrap();
        assert!(!a_entry.is_dir);
        assert!(a_entry.mtime.is_some());
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    #[cfg(unix)]
    fn find_all_entries_stops_at_a_bounded_depth_instead_of_recursing_forever_through_a_symlink_cycle() {
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

        assert!(!entries.is_empty(), "the walk should have found a.md and loop at least once");
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
        assert!(files[0].mtime.is_some(), "size shouldn't come at the cost of losing mtime");
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn find_markdown_files_returns_an_empty_list_for_a_workspace_with_no_notes() {
        let root = std::env::temp_dir().join(format!(
            "leotheca-test-findmd-empty-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        create_dir(root.to_string_lossy().to_string()).unwrap();
        fs::write(root.join("not-a-note.txt"), "x").unwrap();

        let files = find_markdown_files(root.to_string_lossy().to_string()).unwrap();

        assert!(files.is_empty());
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    #[cfg(unix)]
    fn find_markdown_files_stops_at_a_bounded_depth_instead_of_recursing_forever_through_a_symlink_cycle() {
        // Same shape as workspace_stats's own symlink-cycle test: a
        // directory symlinked back at itself. The main thing this proves is
        // that the call returns at all, in bounded work, instead of hanging
        // or crashing; see that test's own comment for why an exact count
        // isn't asserted (the OS's own ELOOP protection can independently
        // stop the walk at or below MAX_WALK_DEPTH).
        let root = std::env::temp_dir().join(format!(
            "leotheca-test-findmd-cycle-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        create_dir(root.to_string_lossy().to_string()).unwrap();
        fs::write(root.join("a.md"), "a").unwrap();
        std::os::unix::fs::symlink(&root, root.join("loop")).unwrap();

        let files = find_markdown_files(root.to_string_lossy().to_string()).unwrap();

        // "a.md" is rediscovered once per depth level the cycle revisits
        // (root's own content, seen again through each nested "loop"), so a
        // correct depth cap bounds the count instead of it growing forever.
        assert!(!files.is_empty(), "the walk should have found a.md at least once");
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
    fn workspace_stats_stops_at_a_bounded_depth_instead_of_recursing_forever_through_a_symlink_cycle() {
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
        let root = std::env::temp_dir().join(format!(
            "leotheca-test-stats-cycle-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        create_dir(root.to_string_lossy().to_string()).unwrap();
        std::os::unix::fs::symlink(&root, root.join("loop")).unwrap();

        let stats = workspace_stats(root.to_string_lossy().to_string()).unwrap();

        assert!(stats.folder_count > 0, "the walk should have descended at least once");
        assert!(
            stats.folder_count <= MAX_WALK_DEPTH + 1,
            "MAX_WALK_DEPTH should cap this walk even if the OS's own symlink-loop \
             protection doesn't kick in first, got {}",
            stats.folder_count
        );

        fs::remove_file(root.join("loop")).unwrap();
        fs::remove_dir_all(&root).unwrap();
    }
}

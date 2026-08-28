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
            path: entry_path.to_string_lossy().to_string(),
            is_dir,
            mtime,
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

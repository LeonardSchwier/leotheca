use std::ffi::CString;
use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Component, Path, PathBuf};

use crate::commands::{
    active_workspace_root_snapshot, require_active_workspace_root, ActiveWorkspaceRoot,
};

const ALREADY_EXISTS: &str = "already_exists";
const INVALID_NAME: &str = "invalid_name";
const OUTSIDE_WORKSPACE: &str = "outside_workspace";
const PERMISSION_DENIED: &str = "permission_denied";
const IO_FAILURE: &str = "io_failure";

fn mutation_error(code: &str, message: impl AsRef<str>) -> String {
    format!("{code}: {}", message.as_ref())
}

fn map_io_error(error: io::Error) -> String {
    let code = match error.kind() {
        io::ErrorKind::AlreadyExists => ALREADY_EXISTS,
        io::ErrorKind::PermissionDenied => PERMISSION_DENIED,
        _ => IO_FAILURE,
    };
    mutation_error(code, error.to_string())
}

/// The audit's F1 binding for these commands (master-spec KG-001): the
/// webview-supplied `workspace_root` must be the native active root.
fn require_active_root(
    workspace_root: &str,
    active: &tauri::State<'_, ActiveWorkspaceRoot>,
) -> Result<(), String> {
    require_active_workspace_root(
        workspace_root,
        active_workspace_root_snapshot(active).as_deref(),
    )
    .map_err(|message| mutation_error(OUTSIDE_WORKSPACE, message))
}

fn validate_relative_path(relative_path: &str) -> Result<&Path, String> {
    let relative = Path::new(relative_path);
    if relative.as_os_str().is_empty() {
        return Err(mutation_error(
            INVALID_NAME,
            "workspace-relative path may not be empty",
        ));
    }
    if relative.is_absolute()
        || relative.components().any(|component| {
            matches!(
                component,
                Component::RootDir | Component::Prefix(_) | Component::ParentDir
            )
        })
    {
        return Err(mutation_error(
            OUTSIDE_WORKSPACE,
            format!("\"{relative_path}\" must stay inside the workspace"),
        ));
    }
    Ok(relative)
}

fn nearest_existing_ancestor(path: &Path) -> (PathBuf, PathBuf) {
    let mut existing = path.to_path_buf();
    let mut suffix_components = Vec::new();
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

/// F-004's create-new/rename-no-replace commands use the same canonical
/// workspace containment policy as the older workspace mutation commands.
/// This module deliberately owns only the no-replace mutation contract; the
/// older overwrite commands remain in commands.rs because saves of an already
/// open note are intentional replacements rather than creates.
fn resolve_within_workspace(workspace_root: &str, relative_path: &str) -> Result<PathBuf, String> {
    let relative = validate_relative_path(relative_path)?;
    let root = Path::new(workspace_root);
    let canonical_root = fs::canonicalize(root).map_err(map_io_error)?;
    let joined = root.join(relative);

    if let Ok(link_metadata) = fs::symlink_metadata(&joined) {
        if link_metadata.file_type().is_symlink() {
            let canonical_target = fs::canonicalize(&joined).map_err(|_| {
                mutation_error(
                    OUTSIDE_WORKSPACE,
                    format!("\"{relative_path}\" is a dangling or inaccessible symlink"),
                )
            })?;
            return if canonical_target.starts_with(&canonical_root) {
                Ok(canonical_target)
            } else {
                Err(mutation_error(
                    OUTSIDE_WORKSPACE,
                    format!("\"{relative_path}\" resolves outside the workspace"),
                ))
            };
        }
    }

    let (existing_ancestor, remaining_suffix) = nearest_existing_ancestor(&joined);
    let canonical_ancestor = fs::canonicalize(existing_ancestor).map_err(map_io_error)?;
    if !canonical_ancestor.starts_with(&canonical_root) {
        return Err(mutation_error(
            OUTSIDE_WORKSPACE,
            format!("\"{relative_path}\" resolves outside the workspace"),
        ));
    }
    if remaining_suffix.as_os_str().is_empty() {
        Ok(canonical_ancestor)
    } else {
        Ok(canonical_ancestor.join(remaining_suffix))
    }
}

fn create_file_new(target: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(map_io_error)?;
    }
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(target)
        .map_err(map_io_error)?;
    if let Err(error) = file.write_all(bytes) {
        drop(file);
        let _ = fs::remove_file(target);
        return Err(map_io_error(error));
    }
    Ok(())
}

#[tauri::command]
pub fn create_workspace_text_file_new(
    workspace_root: String,
    relative_path: String,
    contents: String,
    active_root: tauri::State<'_, ActiveWorkspaceRoot>,
) -> Result<(), String> {
    require_active_root(&workspace_root, &active_root)?;
    create_workspace_text_file_new_core(workspace_root, relative_path, contents)
}

fn create_workspace_text_file_new_core(
    workspace_root: String,
    relative_path: String,
    contents: String,
) -> Result<(), String> {
    let target = resolve_within_workspace(&workspace_root, &relative_path)?;
    create_file_new(&target, contents.as_bytes())
}

#[tauri::command]
pub fn create_workspace_binary_file_new(
    workspace_root: String,
    relative_path: String,
    data: Vec<u8>,
    active_root: tauri::State<'_, ActiveWorkspaceRoot>,
) -> Result<(), String> {
    require_active_root(&workspace_root, &active_root)?;
    create_workspace_binary_file_new_core(workspace_root, relative_path, data)
}

fn create_workspace_binary_file_new_core(
    workspace_root: String,
    relative_path: String,
    data: Vec<u8>,
) -> Result<(), String> {
    let target = resolve_within_workspace(&workspace_root, &relative_path)?;
    create_file_new(&target, &data)
}

#[tauri::command]
pub fn create_workspace_dir_new(
    workspace_root: String,
    relative_path: String,
    active_root: tauri::State<'_, ActiveWorkspaceRoot>,
) -> Result<(), String> {
    require_active_root(&workspace_root, &active_root)?;
    create_workspace_dir_new_core(workspace_root, relative_path)
}

fn create_workspace_dir_new_core(
    workspace_root: String,
    relative_path: String,
) -> Result<(), String> {
    let target = resolve_within_workspace(&workspace_root, &relative_path)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(map_io_error)?;
    }
    fs::create_dir(&target).map_err(map_io_error)
}

#[cfg(target_os = "linux")]
fn rename_no_replace(from: &Path, to: &Path) -> io::Result<()> {
    use std::os::raw::{c_char, c_int, c_uint};
    use std::os::unix::ffi::OsStrExt;

    const AT_FDCWD: c_int = -100;
    const RENAME_NOREPLACE: c_uint = 1;
    unsafe extern "C" {
        fn renameat2(
            olddirfd: c_int,
            oldpath: *const c_char,
            newdirfd: c_int,
            newpath: *const c_char,
            flags: c_uint,
        ) -> c_int;
    }

    let from = CString::new(from.as_os_str().as_bytes())
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "source path contains NUL"))?;
    let to = CString::new(to.as_os_str().as_bytes())
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "target path contains NUL"))?;
    let result = unsafe {
        renameat2(
            AT_FDCWD,
            from.as_ptr(),
            AT_FDCWD,
            to.as_ptr(),
            RENAME_NOREPLACE,
        )
    };
    if result == 0 {
        Ok(())
    } else {
        Err(io::Error::last_os_error())
    }
}

#[cfg(target_os = "macos")]
fn rename_no_replace(from: &Path, to: &Path) -> io::Result<()> {
    use std::os::raw::{c_char, c_int, c_uint};
    use std::os::unix::ffi::OsStrExt;

    const RENAME_EXCL: c_uint = 0x00000004;
    unsafe extern "C" {
        fn renamex_np(old: *const c_char, new: *const c_char, flags: c_uint) -> c_int;
    }

    let from = CString::new(from.as_os_str().as_bytes())
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "source path contains NUL"))?;
    let to = CString::new(to.as_os_str().as_bytes())
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "target path contains NUL"))?;
    let result = unsafe { renamex_np(from.as_ptr(), to.as_ptr(), RENAME_EXCL) };
    if result == 0 {
        Ok(())
    } else {
        Err(io::Error::last_os_error())
    }
}

#[cfg(target_os = "windows")]
fn rename_no_replace(from: &Path, to: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;

    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn MoveFileExW(existing: *const u16, new: *const u16, flags: u32) -> i32;
    }

    let from: Vec<u16> = from.as_os_str().encode_wide().chain(Some(0)).collect();
    let to: Vec<u16> = to.as_os_str().encode_wide().chain(Some(0)).collect();
    let result = unsafe { MoveFileExW(from.as_ptr(), to.as_ptr(), 0) };
    if result != 0 {
        Ok(())
    } else {
        Err(io::Error::last_os_error())
    }
}

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
fn rename_no_replace(from: &Path, to: &Path) -> io::Result<()> {
    if to.try_exists()? {
        return Err(io::Error::new(
            io::ErrorKind::AlreadyExists,
            "target already exists",
        ));
    }
    fs::rename(from, to)
}

#[tauri::command]
pub fn rename_workspace_path_no_replace(
    workspace_root: String,
    from: String,
    to: String,
    active_root: tauri::State<'_, ActiveWorkspaceRoot>,
) -> Result<(), String> {
    require_active_root(&workspace_root, &active_root)?;
    rename_workspace_path_no_replace_core(workspace_root, from, to)
}

fn rename_workspace_path_no_replace_core(
    workspace_root: String,
    from: String,
    to: String,
) -> Result<(), String> {
    let from_target = resolve_within_workspace(&workspace_root, &from)?;
    let to_target = resolve_within_workspace(&workspace_root, &to)?;
    if let Some(parent) = to_target.parent() {
        fs::create_dir_all(parent).map_err(map_io_error)?;
    }
    rename_no_replace(&from_target, &to_target).map_err(map_io_error)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn workspace(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "leotheca-f004-mutation-{name}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn create_new_never_replaces_existing_file() {
        let root = workspace("create-collision");
        fs::write(root.join("note.md"), "original").unwrap();

        let error = create_workspace_text_file_new_core(
            root.to_string_lossy().to_string(),
            "note.md".to_string(),
            "replacement".to_string(),
        )
        .unwrap_err();

        assert!(error.starts_with("already_exists:"), "{error}");
        assert_eq!(
            fs::read_to_string(root.join("note.md")).unwrap(),
            "original"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn binary_create_new_never_replaces_existing_file() {
        let root = workspace("binary-collision");
        fs::write(root.join("image.png"), [1, 2, 3]).unwrap();

        let error = create_workspace_binary_file_new_core(
            root.to_string_lossy().to_string(),
            "image.png".to_string(),
            vec![9, 9],
        )
        .unwrap_err();

        assert!(error.starts_with("already_exists:"), "{error}");
        assert_eq!(fs::read(root.join("image.png")).unwrap(), vec![1, 2, 3]);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn create_directory_new_reports_collision() {
        let root = workspace("dir-collision");
        fs::create_dir(root.join("existing")).unwrap();
        let error = create_workspace_dir_new_core(
            root.to_string_lossy().to_string(),
            "existing".to_string(),
        )
        .unwrap_err();
        assert!(error.starts_with("already_exists:"), "{error}");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rename_no_replace_preserves_both_files_on_collision() {
        let root = workspace("rename-collision");
        fs::write(root.join("from.md"), "source").unwrap();
        fs::write(root.join("to.md"), "destination").unwrap();

        let error = rename_workspace_path_no_replace_core(
            root.to_string_lossy().to_string(),
            "from.md".to_string(),
            "to.md".to_string(),
        )
        .unwrap_err();

        assert!(error.starts_with("already_exists:"), "{error}");
        assert_eq!(fs::read_to_string(root.join("from.md")).unwrap(), "source");
        assert_eq!(
            fs::read_to_string(root.join("to.md")).unwrap(),
            "destination"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn mutation_commands_reject_workspace_escape() {
        let root = workspace("escape");
        let error = create_workspace_text_file_new_core(
            root.to_string_lossy().to_string(),
            "../escape.md".to_string(),
            "no".to_string(),
        )
        .unwrap_err();
        assert!(error.starts_with("outside_workspace:"), "{error}");
        fs::remove_dir_all(root).unwrap();
    }
}

/// Audit 2026-11-08 finding F1 (KG-001) for the no-replace commands: a
/// `workspace_root` that is not the native active root is refused with the
/// `outside_workspace` code before the disk is touched.
#[cfg(test)]
mod active_root_binding_tests {
    use super::*;
    use crate::commands::mock_app_with_active_root;
    use tauri::Manager;

    fn two_roots(name: &str) -> (PathBuf, PathBuf) {
        let make = |side: &str| {
            let root = std::env::temp_dir().join(format!(
                "leotheca-test-f1-mut-{name}-{side}-{}",
                std::process::id()
            ));
            let _ = fs::remove_dir_all(&root);
            fs::create_dir_all(&root).unwrap();
            root
        };
        (make("active"), make("other"))
    }

    fn s(path: &Path) -> String {
        path.to_string_lossy().to_string()
    }

    #[test]
    fn create_workspace_text_file_new_refuses_a_root_that_is_not_active() {
        let (active, other) = two_roots("text");
        let app = mock_app_with_active_root(Some(&active));
        let error = create_workspace_text_file_new(
            s(&other),
            "n.md".to_string(),
            "evil".to_string(),
            app.state::<ActiveWorkspaceRoot>(),
        )
        .unwrap_err();
        assert!(error.starts_with("outside_workspace:"), "{error}");
        assert!(!other.join("n.md").exists());
        let _ = fs::remove_dir_all(active);
        let _ = fs::remove_dir_all(other);
    }

    #[test]
    fn create_workspace_binary_file_new_refuses_a_root_that_is_not_active() {
        let (active, other) = two_roots("bin");
        let app = mock_app_with_active_root(Some(&active));
        let error = create_workspace_binary_file_new(
            s(&other),
            "n.bin".to_string(),
            vec![1],
            app.state::<ActiveWorkspaceRoot>(),
        )
        .unwrap_err();
        assert!(error.starts_with("outside_workspace:"), "{error}");
        assert!(!other.join("n.bin").exists());
        let _ = fs::remove_dir_all(active);
        let _ = fs::remove_dir_all(other);
    }

    #[test]
    fn create_workspace_dir_new_refuses_a_root_that_is_not_active() {
        let (active, other) = two_roots("dir");
        let app = mock_app_with_active_root(Some(&active));
        let error = create_workspace_dir_new(
            s(&other),
            "made".to_string(),
            app.state::<ActiveWorkspaceRoot>(),
        )
        .unwrap_err();
        assert!(error.starts_with("outside_workspace:"), "{error}");
        assert!(!other.join("made").exists());
        let _ = fs::remove_dir_all(active);
        let _ = fs::remove_dir_all(other);
    }

    #[test]
    fn rename_workspace_path_no_replace_refuses_a_root_that_is_not_active() {
        let (active, other) = two_roots("rename");
        fs::write(other.join("a.md"), "keep").unwrap();
        let app = mock_app_with_active_root(Some(&active));
        let error = rename_workspace_path_no_replace(
            s(&other),
            "a.md".to_string(),
            "b.md".to_string(),
            app.state::<ActiveWorkspaceRoot>(),
        )
        .unwrap_err();
        assert!(error.starts_with("outside_workspace:"), "{error}");
        assert!(other.join("a.md").exists());
        assert!(!other.join("b.md").exists());
        let _ = fs::remove_dir_all(active);
        let _ = fs::remove_dir_all(other);
    }

    #[test]
    fn the_active_root_still_creates_a_new_file() {
        let (active, other) = two_roots("accept");
        let app = mock_app_with_active_root(Some(&active));
        create_workspace_text_file_new(
            s(&active),
            "n.md".to_string(),
            "fine".to_string(),
            app.state::<ActiveWorkspaceRoot>(),
        )
        .unwrap();
        assert_eq!(fs::read_to_string(active.join("n.md")).unwrap(), "fine");
        let _ = fs::remove_dir_all(active);
        let _ = fs::remove_dir_all(other);
    }
}

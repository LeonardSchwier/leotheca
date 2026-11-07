//! Native registry of workspace folders the user has granted to the app.
//!
//! `set_active_workspace_root` used to accept any string from the webview
//! and then widen the unscoped-path allow-list and the asset protocol scope
//! to it, so those containment checks only held while the webview was
//! trusted. A root may now become active only when it is in this registry.
//! Roots enter the registry in exactly two ways, neither of which takes a
//! path from the webview: the native folder dialog (`pick_workspace_folder`)
//! and a one-time seed from the legacy `config.json` workspace profiles the
//! first time the registry file is absent.
//!
//! The registry lives in `<app_data_dir>/workspace-grants.json`. That
//! directory is not on the unscoped-path allow-list (which is the active
//! workspace plus the app config directory), so the webview has no command
//! that can edit the file. Granted roots are stored canonicalized, and a
//! lookup canonicalizes the candidate too, so a symlink or `..` spelling
//! cannot alias a different folder onto a granted entry.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub const GRANTS_FILE_NAME: &str = "workspace-grants.json";
const GRANTS_VERSION: u32 = 1;

#[derive(Serialize, Deserialize)]
struct GrantsFile {
    version: u32,
    roots: Vec<String>,
}

#[derive(Default)]
struct Inner {
    /// `None` only for the unit-test default; a real registry always has a file.
    file: Option<PathBuf>,
    roots: Vec<PathBuf>,
}

/// Tauri managed state: the set of granted workspace roots.
#[derive(Default)]
pub struct WorkspaceGrants(Mutex<Inner>);

impl WorkspaceGrants {
    /// Loads the registry at `file`. When the file does not exist yet, seeds
    /// it from the legacy `config.json` at `legacy_config` (every workspace
    /// profile path and `lastWorkspacePath` that is an existing directory)
    /// and writes the result. A corrupt or unreadable existing file loads as
    /// empty (fail closed): the user re-grants by picking the folder again.
    pub fn load(file: PathBuf, legacy_config: Option<&Path>) -> Self {
        let roots = match fs::read_to_string(&file) {
            Ok(text) => parse_roots(&text),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                let seeded = legacy_config.map(read_legacy_roots).unwrap_or_default();
                // Best-effort: failing to persist the seed only means the
                // seed is recomputed next start, never a wider grant.
                let _ = write_roots(&file, &seeded);
                seeded
            }
            Err(_) => Vec::new(),
        };
        WorkspaceGrants(Mutex::new(Inner {
            file: Some(file),
            roots,
        }))
    }

    /// Registers `root` (an existing directory) and persists the registry.
    /// Returns the canonical path that was stored.
    pub fn grant(&self, root: &Path) -> Result<PathBuf, String> {
        let canonical = fs::canonicalize(root).map_err(|e| e.to_string())?;
        if !canonical.is_dir() {
            return Err("a workspace must be a folder".to_string());
        }
        let mut inner = self
            .0
            .lock()
            .map_err(|_| "workspace grants state is poisoned".to_string())?;
        if !inner.roots.contains(&canonical) {
            inner.roots.push(canonical.clone());
            if let Some(file) = &inner.file {
                if let Err(error) = write_roots(file, &inner.roots) {
                    inner.roots.pop();
                    return Err(error);
                }
            }
        }
        Ok(canonical)
    }

    /// True when `root` resolves to a granted folder. A path that cannot be
    /// canonicalized (missing, unreadable) is never granted.
    pub fn is_granted(&self, root: &Path) -> bool {
        let Ok(canonical) = fs::canonicalize(root) else {
            return false;
        };
        self.0
            .lock()
            .map(|inner| inner.roots.contains(&canonical))
            .unwrap_or(false)
    }
}

fn parse_roots(text: &str) -> Vec<PathBuf> {
    match serde_json::from_str::<GrantsFile>(text) {
        Ok(parsed) if parsed.version == GRANTS_VERSION => parsed
            .roots
            .into_iter()
            .map(PathBuf::from)
            .filter(|p| p.is_absolute())
            .collect(),
        _ => Vec::new(),
    }
}

fn write_roots(file: &Path, roots: &[PathBuf]) -> Result<(), String> {
    let body = GrantsFile {
        version: GRANTS_VERSION,
        roots: roots
            .iter()
            .map(|p| p.to_string_lossy().into_owned())
            .collect(),
    };
    let text = serde_json::to_string_pretty(&body).map_err(|e| e.to_string())?;
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = file.with_extension("json.tmp");
    fs::write(&tmp, text).map_err(|e| e.to_string())?;
    fs::rename(&tmp, file).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })
}

/// Workspace folders named by an existing `config.json`, canonicalized and
/// de-duplicated. Anything unreadable, malformed or not an existing
/// directory is skipped.
fn read_legacy_roots(config: &Path) -> Vec<PathBuf> {
    let Ok(text) = fs::read_to_string(config) else {
        return Vec::new();
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) else {
        return Vec::new();
    };
    let mut candidates: Vec<String> = Vec::new();
    if let Some(profiles) = value.get("workspaceProfiles").and_then(|v| v.as_array()) {
        for profile in profiles {
            if let Some(path) = profile.get("path").and_then(|v| v.as_str()) {
                candidates.push(path.to_string());
            }
        }
    }
    if let Some(path) = value.get("lastWorkspacePath").and_then(|v| v.as_str()) {
        candidates.push(path.to_string());
    }
    let mut roots: Vec<PathBuf> = Vec::new();
    for candidate in candidates {
        let path = PathBuf::from(candidate);
        if !path.is_absolute() {
            continue;
        }
        if let Ok(canonical) = fs::canonicalize(&path) {
            if canonical.is_dir() && !roots.contains(&canonical) {
                roots.push(canonical);
            }
        }
    }
    roots
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "leotheca-grants-{label}-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn an_ungranted_folder_is_refused_and_a_granted_one_accepted() {
        let base = temp_dir("basic");
        let ws = base.join("vault");
        fs::create_dir_all(&ws).unwrap();
        let grants = WorkspaceGrants::load(base.join("data").join(GRANTS_FILE_NAME), None);

        assert!(!grants.is_granted(&ws));
        grants.grant(&ws).unwrap();
        assert!(grants.is_granted(&ws));
        // A different folder, a missing one, and a parent are not granted.
        assert!(!grants.is_granted(&base));
        assert!(!grants.is_granted(&base.join("missing")));
        fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn dotdot_spellings_resolve_to_the_same_grant_but_not_to_a_sibling() {
        let base = temp_dir("dotdot");
        let ws = base.join("vault");
        let sibling = base.join("other");
        fs::create_dir_all(&ws).unwrap();
        fs::create_dir_all(&sibling).unwrap();
        let grants = WorkspaceGrants::load(base.join(GRANTS_FILE_NAME), None);
        grants.grant(&ws).unwrap();

        assert!(grants.is_granted(&ws.join("..").join("vault")));
        assert!(!grants.is_granted(&ws.join("..").join("other")));
        fs::remove_dir_all(&base).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn a_symlink_to_an_ungranted_folder_is_not_granted() {
        let base = temp_dir("symlink");
        let ws = base.join("vault");
        let secret = base.join("secret");
        fs::create_dir_all(&ws).unwrap();
        fs::create_dir_all(&secret).unwrap();
        std::os::unix::fs::symlink(&secret, ws.join("link")).unwrap();
        let grants = WorkspaceGrants::load(base.join(GRANTS_FILE_NAME), None);
        grants.grant(&ws).unwrap();

        assert!(!grants.is_granted(&ws.join("link")));
        fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn grants_persist_across_a_reload() {
        let base = temp_dir("persist");
        let ws = base.join("vault");
        fs::create_dir_all(&ws).unwrap();
        let file = base.join(GRANTS_FILE_NAME);
        WorkspaceGrants::load(file.clone(), None)
            .grant(&ws)
            .unwrap();

        let reloaded = WorkspaceGrants::load(file, None);
        assert!(reloaded.is_granted(&ws));
        fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn granting_a_file_or_missing_path_fails() {
        let base = temp_dir("notdir");
        let file = base.join("note.md");
        fs::write(&file, "x").unwrap();
        let grants = WorkspaceGrants::load(base.join(GRANTS_FILE_NAME), None);

        assert!(grants.grant(&file).is_err());
        assert!(grants.grant(&base.join("missing")).is_err());
        assert!(!grants.is_granted(&file));
        fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn a_missing_registry_is_seeded_once_from_legacy_config() {
        let base = temp_dir("seed");
        let a = base.join("a");
        let b = base.join("b");
        fs::create_dir_all(&a).unwrap();
        fs::create_dir_all(&b).unwrap();
        let config = base.join("config.json");
        let json = serde_json::json!({
            "version": 2,
            "workspaceProfiles": [
                { "id": "1", "path": a.to_string_lossy() },
                { "id": "2", "path": base.join("gone").to_string_lossy() },
                { "id": "3", "path": "relative/path" },
                { "id": "4" }
            ],
            "lastWorkspacePath": b.to_string_lossy()
        });
        fs::write(&config, json.to_string()).unwrap();
        let file = base.join("data").join(GRANTS_FILE_NAME);

        let seeded = WorkspaceGrants::load(file.clone(), Some(&config));
        assert!(seeded.is_granted(&a));
        assert!(seeded.is_granted(&b));
        assert!(!seeded.is_granted(&base));
        assert!(file.exists());

        // Once the file exists the config is no longer consulted: a root
        // added to config.json later (for example by a compromised webview
        // writing into the config directory) is not granted.
        let c = base.join("c");
        fs::create_dir_all(&c).unwrap();
        fs::write(
            &config,
            serde_json::json!({ "lastWorkspacePath": c.to_string_lossy() }).to_string(),
        )
        .unwrap();
        let reloaded = WorkspaceGrants::load(file, Some(&config));
        assert!(reloaded.is_granted(&a));
        assert!(!reloaded.is_granted(&c));
        fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn a_corrupt_registry_loads_empty_and_is_not_reseeded() {
        let base = temp_dir("corrupt");
        let ws = base.join("vault");
        fs::create_dir_all(&ws).unwrap();
        let config = base.join("config.json");
        fs::write(
            &config,
            serde_json::json!({ "lastWorkspacePath": ws.to_string_lossy() }).to_string(),
        )
        .unwrap();
        let file = base.join(GRANTS_FILE_NAME);
        fs::write(&file, "{not json").unwrap();

        let grants = WorkspaceGrants::load(file, Some(&config));
        assert!(!grants.is_granted(&ws));
        fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn a_corrupt_or_missing_legacy_config_seeds_nothing() {
        let base = temp_dir("badconfig");
        let config = base.join("config.json");
        fs::write(&config, "][").unwrap();
        let g = WorkspaceGrants::load(base.join("g1.json"), Some(&config));
        assert!(!g.is_granted(&base));
        let g = WorkspaceGrants::load(base.join("g2.json"), Some(&base.join("nope.json")));
        assert!(!g.is_granted(&base));
        fs::remove_dir_all(&base).unwrap();
    }
}

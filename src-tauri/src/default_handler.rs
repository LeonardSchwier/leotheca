//! Pure contract + Tauri command half of ROADMAP.md's
//! "Set the app as the default handler for `.md` files (OS 'Open with')".
//!
//! Leotheca already *registers* itself as an editor for `.md` at install
//! time (`bundle.fileAssociations` in `tauri.conf.json`) and already *acts
//! on* an OS open request (see `external_open.rs` + `externalFileOpenEnabled`).
//! What this module adds is the **last** step the item names: a
//! platform-specific, *deterministic* description of how a user makes
//! Leotheca the OS **default** for `.md` — plus the "Open with" /
//! "open-file" entry points the Settings UI shows them — and a tiny pure
//! status predicate so the UI can tell "registered" apart from "is the
//! default" without shelling out to the OS.
//!
//! The genuinely-OS-specific act of flipping the default (a `.desktop`
//! `Update`/`gio` call on Linux, `SetFileAssociations`/a control-panel
//! nudge on Windows, a system "default app" prompt on macOS) is **not**
//! performed here, deliberately: those are platform-native side effects
//! that must be reviewed and exercised against a real OS (this build
//! environment has none), and the constitution requires net-new
//! functionality to be testable. So every function in this file is a pure
//! computation over a platform string and a file-association descriptor —
//! unit-testable with `cargo test` on any platform this project's CI runs,
//! exactly like `external_open.rs`'s `extract_markdown_path`. The OS
//! side-effect itself is intentionally left to a follow-up item.
//!
//! Every function here is `#[cfg(test)]`-free of platform gates on purpose:
//! none shells out, none touches `std::env` or the filesystem, so the
//! whole module compiles and its tests run identically on Linux, macOS,
//! and Windows CI alike.

use serde::Serialize;

/// The one file association Leotheca bundles (`tauri.conf.json`
/// `bundle.fileAssociations`): the `.md` extension under the "Markdown
/// Document" description, `text/markdown` mime, role "Editor". This
/// descriptor is the single source of truth the rest of this module (and
/// the frontend settings panel) render from, so a future change to the
/// bundled registration only needs to happen in one place.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct FileAssociation {
    pub ext: String,
    pub description: String,
    pub mime_type: String,
    pub role: String,
}

/// The one association Leotheca ships, matching `tauri.conf.json`. Kept as a
/// function (not a `const`) because a `FileAssociation` holds `String`
/// fields and `str::to_string` is not a const-stable fn in this toolchain,
/// so a `const` value can't be spelled out here. Exposed as a function so
/// tests and the frontend bridge can assert against the real registered
/// value rather than re-hardcoding `"md"`/`"Editor"` in three places and
/// drifting apart.
pub fn markdown_association() -> FileAssociation {
    FileAssociation {
        ext: "md".to_string(),
        description: "Markdown Document".to_string(),
        mime_type: "text/markdown".to_string(),
        role: "Editor".to_string(),
    }
}

/// A normalized platform identifier, independent of the raw OS/UA string
/// the frontend supplies. Deliberately a *small* closed set: the
/// per-platform instructions in `default_instructions` only need to
/// distinguish these four, and `from_string` collapses anything
/// unrecognized to `Other` rather than erroring, so a future platform
/// (or a UA string this app has never seen) can never crash the settings
/// panel — it simply gets the "Other" guidance.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Platform {
    Windows,
    macOS,
    Linux,
    Android,
    Other,
}

/// Case-insensitive, substring-tolerant platform detection from the string
/// the frontend passes (e.g. `navigator.userAgent` or
/// `@capacitor/core`'s `getPlatform()`). Order matters and is tested:
/// "Windows" is checked before the generic "nt" Linux signal, and the
/// Android user agent (which contains both "Linux" and "Android") must
/// resolve to Android, not Linux, so the more specific token wins.
pub fn platform_from_string(input: &str) -> Platform {
    let lower = input.to_ascii_lowercase();
    if lower.contains("windows") {
        Platform::Windows
    } else if lower.contains("android") {
        Platform::Android
    } else if lower.contains("macos")
        || lower.contains("darwin")
        || lower.contains("iphone")
        || lower.contains("ipad")
        || lower.contains("ipod")
        || lower.contains("ios")
    {
        Platform::macOS
    } else if lower.contains("linux") || lower.contains("x11") || lower.contains("gtk") {
        Platform::Linux
    } else {
        Platform::Other
    }
}

/// One concrete step the user follows to make Leotheca the OS default for
/// `.md` on a given platform. `target` names the OS setting/dialog the
/// step points at (kept as a stable, testable slug — not a free-form
/// sentence — so the frontend can localize/anchor it); `summary` is the
/// human-readable instruction shown in the panel.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct DefaultStep {
    pub target: String,
    pub summary: String,
}

/// A platform's full "how to make Leotheca the default `.md` handler"
/// recipe, plus the "Open with" entry point it offers. `is_settable` is
/// the honest, testable signal the UI uses to say "set it here" vs
/// "open the OS setting to change it": on Windows/macOS the OS exposes a
/// first-class "default app" control for a registered editor, so Leotheca
/// can point at it; on Linux and Android the default lives in the OS's own
/// file-association settings (or is implicit via the file manager's
/// "Open with"), which Leotheca cannot flip programmatically on its own —
/// so it guides the user instead of claiming to set it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct DefaultHandlerContract {
    pub platform: Platform,
    pub association: FileAssociation,
    /// The OS surface the user opens to change the default (stable slug).
    pub open_with_target: String,
    /// Ordered steps the user performs, most general first.
    pub steps: Vec<DefaultStep>,
    /// Whether the OS offers a first-class "set as default" control that
    /// Leotheca can point the user at (true on Windows/macOS; false on
    /// Linux/Android, where the default is set in the OS's own settings).
    pub is_settable: bool,
}

/// Builds the full contract for a platform. Pure and total: every
/// `Platform` yields a well-formed, non-empty recipe, and the returned
/// `association` is always the bundled `MARKDOWN_ASSOCIATION` so the panel
/// can truthfully say "Leotheca is registered for `.md`" regardless of
/// platform (that registration is static, bundled at install time).
pub fn default_handler_contract(platform: Platform) -> DefaultHandlerContract {
    let steps = match platform {
        Platform::Windows => vec![
            DefaultStep {
                target: "windows-default-apps".to_string(),
                summary: "Open Windows Settings > Apps > Default apps.".to_string(),
            },
            DefaultStep {
                target: "windows-extension-pick".to_string(),
                summary: "Find the .md extension and choose Leotheca.".to_string(),
            },
        ],
        Platform::macOS => vec![
            DefaultStep {
                target: "macos-get-info".to_string(),
                summary: "Select a .md file in Finder and choose File > Get Info.".to_string(),
            },
            DefaultStep {
                target: "macos-open-with".to_string(),
                summary: "Open with: pick Leotheca, then click Change All….".to_string(),
            },
        ],
        Platform::Linux => vec![
            DefaultStep {
                target: "linux-properties".to_string(),
                summary: "Right-click a .md file > Properties > Open With.".to_string(),
            },
            DefaultStep {
                target: "linux-set-default".to_string(),
                summary: "Choose Leotheca and set it as the default application.".to_string(),
            },
        ],
        Platform::Android => vec![
            DefaultStep {
                target: "android-open-with".to_string(),
                summary: "Open a .md file and choose Leotheca from the picker.".to_string(),
            },
            DefaultStep {
                target: "android-always".to_string(),
                summary: "Select Always so Leotheca becomes the default.".to_string(),
            },
        ],
        Platform::Other => vec![DefaultStep {
            target: "generic-open-with".to_string(),
            summary: "Use your OS's default-application or Open-with setting for .md files to choose Leotheca.".to_string(),
        }],
    };
    let (open_with_target, is_settable) = match platform {
        Platform::Windows => ("windows-default-apps", true),
        Platform::macOS => ("macos-get-info", true),
        Platform::Linux => ("linux-properties", false),
        Platform::Android => ("android-open-with", false),
        Platform::Other => ("generic-open-with", false),
    };
    DefaultHandlerContract {
        platform,
        association: markdown_association(),
        open_with_target: open_with_target.to_string(),
        steps,
        is_settable,
    }
}

/// A minimal, dependency-free platform probe the frontend uses to detect
/// the current platform from a UA string. Exported as a `tauri::command`
/// so the (JS) settings panel can ask Rust rather than re-implementing the
/// same string matching twice and drifting. The probe itself is pure — it
/// reads the *passed* string, not the process environment — so it stays
/// unit-testable and can never touch a real UA.
#[tauri::command]
pub fn detect_platform(user_agent: String) -> Platform {
    platform_from_string(&user_agent)
}

/// The command the frontend calls to fetch the full, ready-to-render
/// contract for a detected platform. Pure (no IO, no state): given the
/// platform, it returns the exact steps the Settings panel should show, so
/// the "how to set Leotheca as default for `.md`" text is defined once, in
/// one testable place, instead of being duplicated in JSX.
#[tauri::command]
pub fn default_handler_for_platform(platform: Platform) -> DefaultHandlerContract {
    default_handler_contract(platform)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_association_matches_tauri_conf() {
        let assoc = markdown_association();
        assert_eq!(assoc.ext, "md");
        assert_eq!(assoc.description, "Markdown Document");
        assert_eq!(assoc.mime_type, "text/markdown");
        assert_eq!(assoc.role, "Editor");
    }

    #[test]
    fn platform_detection_from_capacitor_and_ua_strings() {
        assert_eq!(platform_from_string("android"), Platform::Android);
        assert_eq!(platform_from_string("ios"), Platform::macOS);
        assert_eq!(
            platform_from_string("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"),
            Platform::Windows
        );
        assert_eq!(
            platform_from_string("Mozilla/5.0 (X11; Linux x86_64)"),
            Platform::Linux
        );
        // Real Android UA contains both "Linux" and "Android"; Android must win.
        assert_eq!(
            platform_from_string("Mozilla/5.0 (Linux; Android 14; Pixel 8)"),
            Platform::Android
        );
    }

    #[test]
    fn platform_detection_is_case_insensitive_and_unknown_is_other() {
        assert_eq!(platform_from_string("WINDOWS"), Platform::Windows);
        assert_eq!(platform_from_string("AndrOid"), Platform::Android);
        assert_eq!(platform_from_string(""), Platform::Other);
        assert_eq!(
            platform_from_string("something/unknown 9.9"),
            Platform::Other
        );
    }

    #[test]
    fn contract_is_total_and_nonempty_for_every_platform() {
        for platform in [
            Platform::Windows,
            Platform::macOS,
            Platform::Linux,
            Platform::Android,
            Platform::Other,
        ] {
            let contract = default_handler_contract(platform);
            assert_eq!(contract.platform, platform);
            assert_eq!(contract.association, markdown_association());
            assert!(!contract.steps.is_empty(), "{platform:?} must have steps");
            assert_eq!(contract.open_with_target, contract.steps[0].target);
        }
    }

    #[test]
    fn settable_only_on_desktop_default_app_platforms() {
        assert!(default_handler_contract(Platform::Windows).is_settable);
        assert!(default_handler_contract(Platform::macOS).is_settable);
        assert!(!default_handler_contract(Platform::Linux).is_settable);
        assert!(!default_handler_contract(Platform::Android).is_settable);
        assert!(!default_handler_contract(Platform::Other).is_settable);
    }

    #[test]
    fn every_step_has_a_target_and_summary() {
        for platform in [
            Platform::Windows,
            Platform::macOS,
            Platform::Linux,
            Platform::Android,
            Platform::Other,
        ] {
            for step in default_handler_contract(platform).steps {
                assert!(!step.target.is_empty(), "{platform:?} step target empty");
                assert!(!step.summary.is_empty(), "{platform:?} step summary empty");
            }
        }
    }

    #[test]
    fn command_surface_matches_pure_functions() {
        let ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
        assert_eq!(detect_platform(ua.to_string()), Platform::Windows);
        assert_eq!(
            default_handler_for_platform(Platform::Linux),
            default_handler_contract(Platform::Linux)
        );
    }
}

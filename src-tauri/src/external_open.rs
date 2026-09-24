use std::fs;
use std::sync::Mutex;
use tauri_plugin_dialog::DialogExt;

/// A markdown file opened from outside the active workspace -- an OS
/// file-association launch, an already-running instance's relaunch/
/// `RunEvent::Opened`, or the in-app "Open file from outside the vault..."
/// picker (`pick_and_read_external_markdown_file` below) -- together with
/// its already-read content. The read always happens in the same trusted
/// Rust call that establishes `path`'s provenance (a real OS launch
/// argument, or the native file dialog's own result: see
/// `read_markdown_file`/`pick_and_read_external_markdown_file`), never as
/// a second, separately-reachable IPC call a webview could invoke with a
/// path of its own choosing. That mirrors `commands.rs`'s
/// `export_text_file_via_dialog`, whose own doc comment states the same
/// guarantee for the write side. This is deliberate and load-bearing: the
/// path this struct carries is, by this feature's whole purpose, outside
/// both the active workspace root and the app config directory --
/// `read_text_file`/`read_binary_file` (`commands.rs`) are scoped to
/// exactly those two roots (2026-09-22 security review,
/// `check_unscoped_path_allowed`) and reject everything else, so handing
/// only a bare path to the frontend and expecting it to fetch content
/// through either of those commands can never work for a genuinely
/// external file -- see this fix's own roadmap entry for the reproduction.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
pub struct ExternalMarkdownFile {
    pub path: String,
    pub content: String,
}

/// Reads `path`'s content with no workspace/config-dir containment check
/// at all -- see `ExternalMarkdownFile`'s doc comment for why that is
/// correct here. A missing or unreadable file (e.g. deleted, or
/// permission denied, between the OS launch/dialog pick and this read) is
/// `None`, the same silent-no-op convention this feature's every other
/// failure path already follows for a target that doesn't pan out, rather
/// than a hard error with nothing to show it against yet.
pub fn read_markdown_file(path: String) -> Option<ExternalMarkdownFile> {
    fs::read_to_string(&path)
        .ok()
        .map(|content| ExternalMarkdownFile { path, content })
}

/// Buffers a cold-start "open this file" request until the frontend's own
/// mount-time listener is ready to receive it. An already-running instance
/// never touches this: its relaunch is intercepted by the single-instance
/// plugin (Windows/Linux) or delivered as a live `RunEvent::Opened` (macOS),
/// both of which emit the `open-external-file` event directly instead,
/// mirroring the deep-link plugin's own split between `getCurrent()`
/// (buffered) and `onOpenUrl` (live) for the exact same cold-start-vs-
/// already-running distinction.
pub struct PendingOpenFile(pub Mutex<Option<ExternalMarkdownFile>>);

impl PendingOpenFile {
    pub fn new(initial: Option<ExternalMarkdownFile>) -> Self {
        PendingOpenFile(Mutex::new(initial))
    }
}

/// In-app half of ROADMAP.md's "Open files from outside the vault from
/// within an open app": shows a native "Open File" dialog filtered to
/// `.md`, then reads the picked file in this same Rust call (see
/// `ExternalMarkdownFile`'s doc comment for why) rather than returning a
/// bare path for a second, separately gated IPC call to fetch content
/// through. `Ok(None)` is a cancelled dialog, the existing convention
/// `commands.rs`'s `export_text_file_via_dialog` already uses. A real read
/// failure after a genuine pick is `Err`; the frontend wrapper
/// (`pickMarkdownFileToOpen`, `tauriBridgeImpl.ts`) turns that into the
/// same silent no-op every other caller of this feature already follows.
#[tauri::command]
pub fn pick_and_read_external_markdown_file(
    app: tauri::AppHandle,
) -> Result<Option<ExternalMarkdownFile>, String> {
    let picked = app
        .dialog()
        .file()
        .add_filter("Markdown", &["md"])
        .blocking_pick_file();

    let file_path = match picked {
        Some(file_path) => file_path,
        None => return Ok(None),
    };
    let path = file_path.into_path().map_err(|e| e.to_string())?;
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(Some(ExternalMarkdownFile {
        path: path.to_string_lossy().into_owned(),
        content,
    }))
}

fn has_markdown_extension(path: &str) -> bool {
    path.rsplit('.')
        .next()
        .map(|ext| ext.eq_ignore_ascii_case("md"))
        .unwrap_or(false)
}

/// Picks the single external-open target out of a process's own launch
/// arguments (cold start, `std::env::args().skip(1)`) or a relaunch
/// intercepted by the single-instance plugin (`argv[1..]`, its own first
/// element being the relaunched process's own executable path again, same
/// as `args()`'s). Nothing else this app is launched with today passes a
/// bare file path as a CLI argument -- only the OS's own file-association
/// "Open with" launch does -- so a flag-shaped argument (leading `-`) is
/// never mistaken for one, and only a `.md` path (case-insensitive
/// extension, matching this feature's own `tauri.conf.json`
/// `bundle.fileAssociations` registration) is treated as a request at all.
pub fn extract_markdown_path(args: &[String]) -> Option<String> {
    args.iter()
        .find(|arg| !arg.starts_with('-') && has_markdown_extension(arg))
        .cloned()
}

/// macOS/iOS/Android-only counterpart of `extract_markdown_path` for
/// `tauri::RunEvent::Opened { urls }`: on macOS specifically, opening a
/// file registered via `bundle.fileAssociations` while Leotheca is already
/// running delivers the path as a `file://` URL through this event rather
/// than as a CLI argument to a relaunched process (there is no relaunch to
/// intercept), so it needs its own decode step instead of
/// `extract_markdown_path`. Kept unconditionally compiled (not
/// `#[cfg(target_os = "macos")]`) purely so it stays unit-testable from
/// `cargo test` on every platform this project's CI actually runs that on;
/// only its one call site in `lib.rs` is macOS-gated, matching the
/// `RunEvent::Opened` variant's own gate.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub fn markdown_path_from_urls(urls: &[url::Url]) -> Option<String> {
    urls.iter().find_map(|url| {
        if url.scheme() != "file" {
            return None;
        }
        let path = url.to_file_path().ok()?;
        let path_str = path.to_str()?.to_string();
        has_markdown_extension(&path_str).then_some(path_str)
    })
}

#[tauri::command]
pub fn take_pending_open_file(
    state: tauri::State<PendingOpenFile>,
) -> Option<ExternalMarkdownFile> {
    state.0.lock().unwrap().take()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_finds_a_markdown_path_among_args() {
        let args = vec!["/home/user/notes/todo.md".to_string()];
        assert_eq!(
            extract_markdown_path(&args),
            Some("/home/user/notes/todo.md".to_string())
        );
    }

    #[test]
    fn extract_is_case_insensitive_about_the_extension() {
        let args = vec!["/home/user/notes/todo.MD".to_string()];
        assert_eq!(
            extract_markdown_path(&args),
            Some("/home/user/notes/todo.MD".to_string())
        );
    }

    #[test]
    fn extract_ignores_flags_and_non_markdown_arguments() {
        let args = vec!["--flag".to_string(), "/home/user/image.png".to_string()];
        assert_eq!(extract_markdown_path(&args), None);
    }

    #[test]
    fn extract_returns_none_for_an_empty_argument_list() {
        assert_eq!(extract_markdown_path(&[]), None);
    }

    #[test]
    fn extract_returns_none_when_nothing_matches() {
        let args = vec!["--flag".to_string(), "-v".to_string()];
        assert_eq!(extract_markdown_path(&args), None);
    }

    #[test]
    fn extract_picks_the_first_matching_argument_when_several_are_present() {
        let args = vec!["/a/first.md".to_string(), "/a/second.md".to_string()];
        assert_eq!(
            extract_markdown_path(&args),
            Some("/a/first.md".to_string())
        );
    }

    #[test]
    fn extract_skips_a_leading_flag_shaped_argument_with_an_md_suffix() {
        // A defensive edge case, not a realistic launch: nothing legitimate
        // this app is invoked with looks like this, but the leading-'-'
        // guard must still win over the extension match rather than the
        // other way around.
        let args = vec!["-.md".to_string(), "/a/real.md".to_string()];
        assert_eq!(extract_markdown_path(&args), Some("/a/real.md".to_string()));
    }

    #[test]
    fn urls_finds_a_file_url_markdown_path() {
        let urls = vec![url::Url::parse("file:///home/user/notes/todo.md").unwrap()];
        assert_eq!(
            markdown_path_from_urls(&urls),
            Some("/home/user/notes/todo.md".to_string())
        );
    }

    #[test]
    fn urls_ignores_a_non_file_scheme() {
        let urls = vec![url::Url::parse("https://example.com/todo.md").unwrap()];
        assert_eq!(markdown_path_from_urls(&urls), None);
    }

    #[test]
    fn urls_ignores_a_file_url_with_the_wrong_extension() {
        let urls = vec![url::Url::parse("file:///home/user/image.png").unwrap()];
        assert_eq!(markdown_path_from_urls(&urls), None);
    }

    #[test]
    fn urls_returns_none_for_an_empty_list() {
        assert_eq!(markdown_path_from_urls(&[]), None);
    }

    #[test]
    fn urls_skips_a_leading_non_markdown_url_and_finds_a_later_one() {
        let urls = vec![
            url::Url::parse("file:///home/user/image.png").unwrap(),
            url::Url::parse("file:///home/user/notes/todo.md").unwrap(),
        ];
        assert_eq!(
            markdown_path_from_urls(&urls),
            Some("/home/user/notes/todo.md".to_string())
        );
    }

    #[test]
    fn take_pending_open_file_consumes_the_value_once() {
        let state = PendingOpenFile::new(Some(ExternalMarkdownFile {
            path: "/a/note.md".to_string(),
            content: "hello".to_string(),
        }));
        assert_eq!(
            state.0.lock().unwrap().take(),
            Some(ExternalMarkdownFile {
                path: "/a/note.md".to_string(),
                content: "hello".to_string(),
            })
        );
        assert_eq!(*state.0.lock().unwrap(), None);
    }

    /// The regression this whole change fixes: `read_text_file`/
    /// `read_binary_file` (`commands.rs`) reject any path outside the
    /// active workspace root and the app config directory
    /// (`check_unscoped_path_allowed`, 2026-09-22 security review;
    /// `check_unscoped_path_allowed_rejects_a_target_outside_both_roots`
    /// in that module's own tests proves it). Before this fix, the OS
    /// file-association open and the in-app "Open file from outside the
    /// vault..." picker both handed the frontend a bare path and expected
    /// it to fetch content through exactly one of those commands -- which
    /// can never succeed for a file that is, by this feature's whole
    /// purpose, outside both roots. `read_markdown_file` reads directly,
    /// with no such containment check, and this test proves it succeeds
    /// for a real path outside every known root, unlike the commands it
    /// replaces for this feature.
    #[test]
    fn read_markdown_file_reads_content_from_a_path_outside_every_known_root() {
        let dir = std::env::temp_dir().join(format!(
            "leotheca-test-external-open-{}",
            std::process::id()
        ));
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("outside.md");
        fs::write(&file, "# hello from outside every workspace").unwrap();

        let result = read_markdown_file(file.to_string_lossy().into_owned());

        assert_eq!(
            result,
            Some(ExternalMarkdownFile {
                path: file.to_string_lossy().into_owned(),
                content: "# hello from outside every workspace".to_string(),
            })
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn read_markdown_file_returns_none_for_a_path_that_does_not_exist() {
        let missing = std::env::temp_dir().join(format!(
            "leotheca-test-external-open-missing-{}.md",
            std::process::id()
        ));
        let _ = fs::remove_file(&missing);

        assert_eq!(
            read_markdown_file(missing.to_string_lossy().into_owned()),
            None
        );
    }
}

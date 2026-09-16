use std::sync::Mutex;

/// Buffers a cold-start "open this file" request until the frontend's own
/// mount-time listener is ready to receive it. An already-running instance
/// never touches this: its relaunch is intercepted by the single-instance
/// plugin (Windows/Linux) or delivered as a live `RunEvent::Opened` (macOS),
/// both of which emit the `open-external-file` event directly instead,
/// mirroring the deep-link plugin's own split between `getCurrent()`
/// (buffered) and `onOpenUrl` (live) for the exact same cold-start-vs-
/// already-running distinction.
pub struct PendingOpenFile(pub Mutex<Option<String>>);

impl PendingOpenFile {
    pub fn new(initial: Option<String>) -> Self {
        PendingOpenFile(Mutex::new(initial))
    }
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
pub fn take_pending_open_file(state: tauri::State<PendingOpenFile>) -> Option<String> {
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
        let state = PendingOpenFile::new(Some("/a/note.md".to_string()));
        assert_eq!(
            state.0.lock().unwrap().take(),
            Some("/a/note.md".to_string())
        );
        assert_eq!(*state.0.lock().unwrap(), None);
    }
}

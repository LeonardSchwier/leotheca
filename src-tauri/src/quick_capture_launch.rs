//! Desktop entry for Quick Capture from the OS: `leotheca --capture`.
//!
//! A shell alias, a desktop-environment keybinding or a launcher entry can
//! run the flag. A fresh process buffers it here until the frontend's
//! mount-time `take_pending_quick_capture` call; an already-running instance
//! never reaches the buffer, because the single-instance plugin intercepts
//! the relaunch and `lib.rs` emits `QUICK_CAPTURE_EVENT` instead (the same
//! cold-vs-running split `external_open` uses for file opens). The launch
//! only asks the frontend to open the capture sheet: nothing is read or
//! written here, so the user still reviews every capture before it lands
//! in the inbox. `leotheca://capture` links need no code here, the
//! deep-link plugin already delivers them.

use std::sync::Mutex;

/// The one command-line flag that requests Quick Capture.
pub const CAPTURE_FLAG: &str = "--capture";

/// Event the single-instance callback emits on an already-running instance.
pub const QUICK_CAPTURE_EVENT: &str = "quick-capture-launch";

/// True when `args` (already without argv[0]) contain the exact flag.
/// Anything else, including `--capture=1`, a path, or a URL, is ignored.
pub fn requests_quick_capture(args: &[String]) -> bool {
    args.iter().any(|arg| arg == CAPTURE_FLAG)
}

/// Cold-start buffer: set once from this process's own argv, consumed once.
pub struct PendingQuickCapture(Mutex<bool>);

impl PendingQuickCapture {
    pub fn new(requested: bool) -> Self {
        PendingQuickCapture(Mutex::new(requested))
    }

    /// Returns the buffered request and clears it, so it fires at most once.
    /// A poisoned lock reads as "no request" rather than panicking.
    pub fn take(&self) -> bool {
        match self.0.lock() {
            Ok(mut requested) => std::mem::replace(&mut *requested, false),
            Err(_) => false,
        }
    }
}

#[tauri::command]
pub fn take_pending_quick_capture(state: tauri::State<'_, PendingQuickCapture>) -> bool {
    state.take()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn recognizes_only_the_exact_flag() {
        assert!(requests_quick_capture(&args(&["--capture"])));
        assert!(requests_quick_capture(&args(&["note.md", "--capture"])));
        assert!(!requests_quick_capture(&args(&[])));
        assert!(!requests_quick_capture(&args(&["--capture=1"])));
        assert!(!requests_quick_capture(&args(&["--Capture"])));
        assert!(!requests_quick_capture(&args(&["-capture"])));
        assert!(!requests_quick_capture(&args(&["capture"])));
        assert!(!requests_quick_capture(&args(&["leotheca://capture"])));
        assert!(!requests_quick_capture(&args(&["/tmp/--capture"])));
    }

    #[test]
    fn the_flag_does_not_disturb_markdown_file_extraction() {
        assert_eq!(
            crate::external_open::extract_markdown_path(&args(&["--capture"])),
            None
        );
        assert_eq!(
            crate::external_open::extract_markdown_path(&args(&["--capture", "a.md"])),
            Some("a.md".to_string())
        );
    }

    #[test]
    fn the_buffered_request_is_taken_exactly_once() {
        let pending = PendingQuickCapture::new(true);
        assert!(pending.take());
        assert!(!pending.take());
        assert!(!PendingQuickCapture::new(false).take());
    }

    #[test]
    fn a_poisoned_buffer_reads_as_no_request() {
        let pending = std::sync::Arc::new(PendingQuickCapture::new(true));
        let clone = pending.clone();
        let _ = std::thread::spawn(move || {
            let _guard = clone.0.lock().unwrap();
            panic!("poison the lock");
        })
        .join();
        assert!(!pending.take());
    }
}

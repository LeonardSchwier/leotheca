mod commands;
mod external_open;
mod speech_commands;
mod workspace_mutations;

use external_open::PendingOpenFile;
use tauri::Emitter;

/// Both the single-instance relaunch callback below and the macOS
/// `RunEvent::Opened` handler in `run()` forward through this one
/// function so the frontend has exactly one live event to listen for
/// ("open-external-file"), regardless of which platform-specific
/// mechanism actually delivered the path.
fn emit_open_external_file(app: &tauri::AppHandle, path: String) {
    let _ = app.emit("open-external-file", path);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();
    // Deep links (see tauri.conf.json's plugins.deep-link.desktop.schemes)
    // arrive differently per platform: macOS hands them to the already-
    // running app directly, but "on Windows and Linux the OS will spawn a
    // new instance of your app with the URL as a CLI argument" (the deep
    // link plugin's own docs). Without single-instance intercepting that
    // second launch, every leotheca:// link click would open a redundant
    // second window instead of reaching the workspace already open in the
    // first one, which would silently break the "read current note"
    // command entirely (a fresh second instance has no current note).
    // Registering single-instance first, with its "deep-link" feature, is
    // the documented pairing: it forwards an intercepted relaunch's argv
    // to this instance's own deep-link listeners instead of opening a new
    // window. Desktop-only (this crate's Android build goes through
    // Capacitor instead, see CONSTITUTION.md's "Technology stack"), but
    // guarded anyway to match the plugin's own documented setup exactly.
    //
    // The same relaunch-interception also carries a "Open with Leotheca"
    // file-association open on Windows and Linux (ROADMAP.md's "Open a
    // Markdown file from outside the workspace via OS file association"):
    // the OS launches a *second* process with the file's path as its own
    // CLI argument, which single-instance intercepts and hands here as
    // `argv` instead of letting a redundant window open. `argv[0]` is that
    // relaunched process's own executable path again (matching
    // `std::env::args()`'s own convention), not the target file, so the
    // search starts from `argv[1..]`.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let relaunch_args = argv.get(1..).unwrap_or(&[]);
            if let Some(path) = external_open::extract_markdown_path(relaunch_args) {
                emit_open_external_file(app, path);
            }
        }));
    }

    // Initialize whisper model state for speech recognition
    builder = builder.manage(speech_commands::WhisperState::default());

    // Server-side mirror of the frontend's own active workspace root (see
    // `commands::ActiveWorkspaceRoot`), the containment gate every unscoped
    // path-accepting command checks itself against: originally
    // `write_text_file`/`write_binary_file` alone (2026-09-22 security
    // review, rm-dfd60513a2eb352c), now also their read/create/rename/
    // delete siblings (rm-60f748cb1a58be89).
    builder = builder.manage(commands::ActiveWorkspaceRoot::default());

    // Cold start's own counterpart of the single-instance callback above:
    // when the OS launches a *fresh* Leotheca process directly via its
    // "Open with" registration, this process's own argv carries the file
    // path and there is no relaunch for single-instance to intercept. No
    // window or frontend listener exists yet at this point, so the path
    // is buffered here for the frontend's own mount-time
    // `take_pending_open_file` call instead of emitted live, mirroring the
    // deep-link plugin's own `getCurrent()` (buffered) vs `onOpenUrl`
    // (live) split for the identical cold-start-vs-already-running
    // distinction.
    let cold_start_args: Vec<String> = std::env::args().skip(1).collect();
    let initial_pending_open_file = external_open::extract_markdown_path(&cold_start_args);
    builder = builder.manage(PendingOpenFile::new(initial_pending_open_file));

    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            commands::list_dir,
            commands::find_markdown_files,
            commands::find_all_files,
            commands::find_all_entries,
            commands::read_text_file,
            commands::read_binary_file,
            commands::read_text_files_batch,
            commands::write_text_file,
            commands::write_binary_file,
            commands::set_active_workspace_root,
            commands::export_text_file_via_dialog,
            commands::create_dir,
            commands::rename_path,
            commands::trash_path,
            commands::delete_path_permanent,
            commands::write_workspace_text_file,
            commands::write_workspace_binary_file,
            commands::create_workspace_dir,
            commands::rename_workspace_path,
            commands::delete_workspace_path_permanent,
            workspace_mutations::create_workspace_text_file_new,
            workspace_mutations::create_workspace_binary_file_new,
            workspace_mutations::create_workspace_dir_new,
            workspace_mutations::rename_workspace_path_no_replace,
            commands::workspace_stats,
            // Speech recognition commands
            speech_commands::init_speech_recognition,
            speech_commands::transcribe_audio,
            speech_commands::get_speech_status,
            speech_commands::get_whisper_models,
            speech_commands::check_whisper_models,
            external_open::take_pending_open_file,
        ])
        .build(tauri::generate_context!())
        .expect("error while building the Leotheca application")
        .run(|_app_handle, _event| {
            // macOS/iOS/Android-only (see RunEvent::Opened's own gate):
            // opening a file registered via `bundle.fileAssociations`
            // while Leotheca is already running has no relaunch for
            // single-instance to intercept above -- macOS delivers it as
            // this live event on the already-running process instead.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = &_event {
                if let Some(path) = external_open::markdown_path_from_urls(urls) {
                    emit_open_external_file(_app_handle, path);
                }
            }
        });
}

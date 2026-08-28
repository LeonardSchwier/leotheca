mod commands;

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
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {}));
    }
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
            commands::read_text_files_batch,
            commands::write_text_file,
            commands::write_binary_file,
            commands::create_dir,
            commands::rename_path,
            commands::trash_path,
            commands::delete_path_permanent,
            commands::workspace_stats,
        ])
        .run(tauri::generate_context!())
        .expect("error while running the Leotheca application");
}

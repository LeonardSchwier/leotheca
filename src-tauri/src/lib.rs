mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            commands::list_dir,
            commands::find_markdown_files,
            commands::read_text_file,
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

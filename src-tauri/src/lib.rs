mod commands;
mod logger;
mod structs;
mod tools;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_config_manager::init())
        .plugin(tauri_plugin_vicons::init())
        .invoke_handler(tauri::generate_handler![
            commands::system_info::get_system_info,
            commands::system_info::get_cpu_usage_only,
            commands::system_info::get_memory_usage_only,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

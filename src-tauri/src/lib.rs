mod commands;
mod logger;
mod structs;
mod tools;
mod utils;
mod audio;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_config_manager::init())
        .plugin(tauri_plugin_system_fonts::init())
        .plugin(tauri_plugin_vicons::init())
        .plugin(tauri_plugin_bluetooth_manager::init())
        .plugin(tauri_plugin_network_manager::init())
        .invoke_handler(tauri::generate_handler![
            commands::system_info::get_system_info,
            commands::system_info::get_cpu_usage_only,
            commands::system_info::get_memory_usage_only,
            commands::system_config::get_system_config,
            commands::system_config::get_current_system_state,
            commands::system_config::set_system_config,
            commands::system_config::get_gtk_themes,
            commands::system_config::get_cursor_themes,
            commands::system_config::get_icon_packs,
            commands::system_config::get_icon_pack_icons,
            commands::system_config::get_official_wallpapers,
            commands::shortcuts::get_shortcuts,
            commands::shortcuts::save_shortcuts,
            commands::wayfire_ini::read_wayfire_section,
            commands::wayfire_ini::write_wayfire_section,
            commands::wayfire_ini::get_all_wayfire_sections,
            commands::battery::get_battery_info,
            commands::power_profiles::get_power_profiles,
            commands::power_profiles::get_active_power_profile,
            commands::power_profiles::set_power_profile,
            commands::audio::get_audio_volume,
            commands::audio::set_audio_volume,
            commands::audio::toggle_audio_mute,
            commands::audio::get_audio_devices,
            commands::audio::set_audio_device,
            commands::audio::get_audio_input_volume,
            commands::audio::set_audio_input_volume,
            commands::audio::toggle_audio_input_mute,
            commands::audio::get_audio_input_devices,
            commands::audio::set_audio_input_device,
            commands::monitors::get_detected_monitors,
            commands::language::get_available_locales,
            commands::language::get_current_locale,
            commands::language::set_system_locale,
            commands::language::get_available_keyboard_layouts,
            commands::language::get_available_keyboard_variants,
            commands::language::set_keyboard_layouts,
            commands::language::get_keyboard_layouts_from_wayfire,
            commands::online_accounts::register_new_account,
            commands::online_accounts::list_accounts,
            commands::online_accounts::remove_account,
            commands::online_accounts::start_google_oauth,
            commands::online_accounts::account_manager_ping,
            commands::online_accounts::get_account_data,
            commands::online_accounts::get_access_token,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

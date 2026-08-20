mod commands;
mod logger;
mod structs;
mod tools;
mod utils;
mod audio;

use std::path::PathBuf;

/// Where the translations live.
///
/// The i18n plugin only probes paths relative to the executable and the working
/// directory, and none of those exist once the binary is installed in /usr/bin —
/// which would leave a packaged build showing raw translation keys. Resolving it
/// here and passing it explicitly covers both the dev tree and the installed
/// location.
fn locales_dir() -> Option<String> {
    let candidates = [
        PathBuf::from("locales"),
        PathBuf::from("src-tauri/locales"),
        PathBuf::from("/usr/share/vasak-settings/locales"),
    ];

    candidates
        .into_iter()
        .find(|path| path.is_dir())
        .map(|path| path.to_string_lossy().into_owned())
}

/// Picks the startup language from the session locale, falling back to Spanish,
/// which is what the UI shipped with before it was translatable.
fn default_locale() -> String {
    let raw = std::env::var("LC_ALL")
        .or_else(|_| std::env::var("LC_MESSAGES"))
        .or_else(|_| std::env::var("LANG"))
        .unwrap_or_default();

    match raw.split(['_', '.', '@']).next().unwrap_or("") {
        "en" => "en".to_string(),
        _ => "es".to_string(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_config_manager::init())
        .plugin(tauri_plugin_system_fonts::init())
        .plugin(tauri_plugin_i18n_vsk::init_with_path(
            Some(default_locale()),
            locales_dir(),
        ))
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
            commands::wayfire_ini::replace_wayfire_section,
            commands::wayfire_plugins::get_wayfire_plugins,
            commands::wayfire_plugins::set_wayfire_plugin_enabled,
            commands::datetime::get_datetime_info,
            commands::datetime::list_timezones,
            commands::datetime::set_timezone,
            commands::datetime::set_ntp,
            commands::datetime::set_system_time,
            commands::datetime::set_local_rtc,
            commands::display_power::get_backlights,
            commands::display_power::set_backlight_percent,
            commands::display_power::get_night_light,
            commands::display_power::set_night_light,
            commands::idle::get_idle_config,
            commands::idle::set_idle_config,
            commands::users::list_users,
            commands::users::create_user,
            commands::users::delete_user,
            commands::users::set_user_password,
            commands::users::set_user_real_name,
            commands::users::set_user_admin,
            commands::users::set_user_locked,
            commands::users::set_user_icon,
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
            commands::wallpaper_video::prepare_wallpaper_video,
            commands::monitors::apply_monitor_layout,
            commands::brightness::get_monitor_brightness,
            commands::brightness::set_monitor_brightness,
            commands::language::get_available_locales,
            commands::language::get_current_locale,
            commands::language::set_system_locale,
            commands::language::get_available_keyboard_layouts,
            commands::language::get_available_keyboard_variants,
            commands::language::get_available_keyboard_switch_options,
            commands::language::set_keyboard_layouts,
            commands::language::get_keyboard_layouts_from_wayfire,
            commands::online_accounts::register_new_account,
            commands::online_accounts::list_accounts,
            commands::online_accounts::remove_account,
            commands::online_accounts::start_google_oauth,
            commands::online_accounts::account_manager_ping,
            commands::permissions::list_permissions,
            commands::permissions::set_permission,
            commands::permissions::forget_permission,
            commands::connect::connect_list_known_devices,
            commands::connect::connect_set_alias,
            commands::connect::connect_forget_device,
            commands::online_accounts::get_account_data,
            commands::online_accounts::get_access_token,
        ])
        // One setup hook, not two: `Builder::setup` replaces whatever was
        // registered before it, so a second call silently threw the first away.
        .setup(|app| {
            // So a wayfire.ini edited by hand, or by another tool, reaches the
            // pages instead of being overwritten by what they still show.
            commands::wayfire_config::watch(app.handle().clone());

            // The phone service publishes signals when a device appears or
            // changes; without listening the Phones screen would only ever show
            // what was true when it was opened.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                commands::connect::watch_signals(handle).await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

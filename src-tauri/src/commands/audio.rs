use tauri::AppHandle;

use crate::audio::{
    get_input_volume, get_volume, list_audio_devices, list_audio_input_devices,
    list_audio_output_profiles, set_audio_output_profile, set_default_audio_device,
    set_default_audio_input_device, set_input_volume, set_volume, toggle_input_mute, toggle_mute,
};
use crate::logger::{log_debug, log_error, log_info};
use crate::structs::{AudioDevice, AudioOutputProfile, VolumeInfo};

#[tauri::command]
pub fn get_audio_volume() -> Result<VolumeInfo, String> {
    log_debug("Comando: get_audio_volume");
    get_volume().map_err(|e| {
        log_error(&format!("Error al obtener volumen: {}", e));
        e.to_string()
    })
}

#[tauri::command]
pub fn set_audio_volume(volume: i64, app: AppHandle) -> Result<(), String> {
    log_info(&format!("Estableciendo volumen a: {}%", volume));
    set_volume(volume, app).map_err(|e| {
        log_error(&format!("Error al establecer volumen: {}", e));
        e.to_string()
    })
}

#[tauri::command]
pub fn toggle_audio_mute(app: AppHandle) -> Result<bool, String> {
    log_info("Alternando estado de mute");
    toggle_mute(app).map_err(|e| {
        log_error(&format!("Error al alternar mute: {}", e));
        e.to_string()
    })
}

#[tauri::command]
pub fn get_audio_devices() -> Result<Vec<AudioDevice>, String> {
    list_audio_devices().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_audio_device(device_id: String, app: AppHandle) -> Result<bool, String> {
    log_info(&format!("Cambiando dispositivo de audio a: {}", device_id));
    set_default_audio_device(&device_id, app)
        .map(|_| {
            log_info("Dispositivo de audio cambiado correctamente");
            true
        })
        .map_err(|e| {
            log_error(&format!("Error al cambiar dispositivo de audio: {}", e));
            e.to_string()
        })
}

#[tauri::command]
pub fn get_audio_output_profiles() -> Result<Vec<AudioOutputProfile>, String> {
    list_audio_output_profiles().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_audio_output_profile_cmd(
    card_name: String,
    profile_name: String,
    app: AppHandle,
) -> Result<bool, String> {
    log_info(&format!(
        "Conmutando a la salida {} de la tarjeta {}",
        profile_name, card_name
    ));
    set_audio_output_profile(&card_name, &profile_name, app)
        .map(|_| {
            log_info("Perfil de salida conmutado correctamente");
            true
        })
        .map_err(|e| {
            log_error(&format!("Error al conmutar el perfil de salida: {}", e));
            e.to_string()
        })
}

#[tauri::command]
pub fn get_audio_input_volume() -> Result<VolumeInfo, String> {
    log_debug("Comando: get_audio_input_volume");
    get_input_volume().map_err(|e| {
        log_error(&format!("Error al obtener volumen de entrada: {}", e));
        e.to_string()
    })
}

#[tauri::command]
pub fn set_audio_input_volume(volume: i64, app: AppHandle) -> Result<(), String> {
    log_info(&format!("Estableciendo volumen de entrada a: {}%", volume));
    set_input_volume(volume, app).map_err(|e| {
        log_error(&format!("Error al establecer volumen de entrada: {}", e));
        e.to_string()
    })
}

#[tauri::command]
pub fn toggle_audio_input_mute(app: AppHandle) -> Result<bool, String> {
    log_info("Alternando mute de entrada");
    toggle_input_mute(app).map_err(|e| {
        log_error(&format!("Error al alternar mute de entrada: {}", e));
        e.to_string()
    })
}

#[tauri::command]
pub fn get_audio_input_devices() -> Result<Vec<AudioDevice>, String> {
    list_audio_input_devices().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_audio_input_device(device_id: String, app: AppHandle) -> Result<bool, String> {
    log_info(&format!(
        "Cambiando dispositivo de entrada de audio a: {}",
        device_id
    ));
    set_default_audio_input_device(&device_id, app)
        .map(|_| {
            log_info("Dispositivo de entrada cambiado correctamente");
            true
        })
        .map_err(|e| {
            log_error(&format!("Error al cambiar dispositivo de entrada: {}", e));
            e.to_string()
        })
}

use tauri::AppHandle;

use crate::audio::{
    get_input_volume,
    get_volume,
    list_audio_devices,
    list_audio_input_devices,
    set_default_audio_device,
    set_default_audio_input_device,
    set_input_volume,
    set_volume,
    toggle_input_mute,
    toggle_mute,
};
use crate::logger::{log_info, log_error, log_debug};
use crate::structs::{VolumeInfo, AudioDevice};

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

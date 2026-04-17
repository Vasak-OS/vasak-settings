use std::process::Command;
use tauri::{AppHandle, Emitter};

use crate::logger::{log_debug, log_error, log_info};
use crate::structs::{AudioDevice, VolumeInfo};

const CMD_WPCTL: &str = "wpctl";

fn is_section_header(line: &str) -> bool {
    let trimmed = line.trim();
    trimmed.ends_with(':') && !trimmed.starts_with('│')
}

fn get_default_node_id(section_name: &str) -> Result<String, String> {
    log_debug(&format!("Obteniendo ID por defecto de la sección: {}", section_name));

    let output = Command::new(CMD_WPCTL)
        .arg("status")
        .output()
        .map_err(|e| format!("Error ejecutando wpctl: {}", e))?;

    let status_output = String::from_utf8_lossy(&output.stdout);

    let mut in_section = false;
    let default_id = status_output
        .lines()
        .find_map(|line| {
            if line.contains(section_name) {
                in_section = true;
                return None;
            }

            if in_section && is_section_header(line) {
                in_section = false;
                return None;
            }

            if in_section && line.contains('*') {
                if let Some(asterisk_pos) = line.find('*') {
                    let after_asterisk = &line[asterisk_pos + 1..];
                    return after_asterisk.split_whitespace().find_map(|part| {
                        if let Some(num_part) = part.strip_suffix('.') {
                            if num_part.chars().all(|c| c.is_ascii_digit()) {
                                Some(num_part.to_string())
                            } else {
                                None
                            }
                        } else {
                            None
                        }
                    });
                }
            }

            None
        })
        .ok_or_else(|| {
            let msg = format!("No se encontró dispositivo por defecto en {}", section_name);
            log_error(&msg);
            msg
        })?;

    log_debug(&format!("Dispositivo por defecto en {}: {}", section_name, default_id));
    Ok(default_id)
}

/// Obtiene el ID del sink de audio por defecto
fn get_default_sink_id() -> Result<String, String> {
    get_default_node_id("Sinks:")
}

/// Obtiene el ID de la fuente (micrófono) por defecto
fn get_default_source_id() -> Result<String, String> {
    get_default_node_id("Sources:")
}

fn parse_volume_info(volume_output: &str) -> Result<VolumeInfo, String> {
    let parts: Vec<&str> = volume_output.split_whitespace().collect();
    if parts.len() < 2 {
        return Err("Formato de volumen inválido".to_string());
    }

    let volume_float: f64 = parts[1]
        .parse()
        .map_err(|_| "No se pudo parsear el volumen".to_string())?;

    let current = (volume_float * 100.0) as i64;
    let is_muted = volume_output.contains("[MUTED]");

    Ok(VolumeInfo {
        current,
        min: 0,
        max: 100,
        is_muted,
    })
}

fn list_devices_by_section(section_name: &str, default_id: Option<String>) -> Result<Vec<AudioDevice>, String> {
    let output = Command::new(CMD_WPCTL)
        .arg("status")
        .output()
        .map_err(|e| format!("Failed to list audio devices: {}", e))?;

    let status_output = String::from_utf8_lossy(&output.stdout);

    let mut devices = Vec::new();
    let mut in_section = false;

    for line in status_output.lines() {
        if line.contains(section_name) {
            in_section = true;
            continue;
        }

        if in_section && is_section_header(line) {
            break;
        }

        if in_section && (line.contains('*') || line.contains('│')) {
            if let Some(dot_pos) = line.find('.') {
                let before_dot = &line[..dot_pos];
                if let Some(id_str) = before_dot.split_whitespace().last() {
                    let id = id_str.to_string();
                    let after_dot = &line[dot_pos + 1..];
                    let name = if let Some(bracket_pos) = after_dot.find('[') {
                        after_dot[..bracket_pos].trim().to_string()
                    } else {
                        after_dot.trim().to_string()
                    };

                    let volume = if let Some(vol_start) = after_dot.find("vol: ") {
                        let vol_str = &after_dot[vol_start + 5..];
                        vol_str
                            .split([']', ' '])
                            .next()
                            .and_then(|s| s.parse::<f64>().ok())
                            .unwrap_or(0.5)
                    } else {
                        0.5
                    };

                    let is_default = default_id.as_ref().map(|d| d == &id).unwrap_or(false);

                    devices.push(AudioDevice {
                        id: id.clone(),
                        name: name.clone(),
                        description: name,
                        is_default,
                        volume,
                    });
                }
            }
        }
    }

    Ok(devices)
}

/// Obtiene la información actual del volumen del sistema usando wpctl
pub fn get_volume() -> Result<VolumeInfo, String> {
    log_debug("Obteniendo información del volumen");
    let default_sink_id = get_default_sink_id()?;

    // Obtener información del volumen
    let output = Command::new(CMD_WPCTL)
        .args(["get-volume", &default_sink_id])
        .output()
        .map_err(|e| format!("Error ejecutando wpctl get-volume: {}", e))?;
        
    let volume_output = String::from_utf8_lossy(&output.stdout);

    parse_volume_info(&volume_output)
}

/// Obtiene la información actual del volumen de entrada (micrófono)
pub fn get_input_volume() -> Result<VolumeInfo, String> {
    log_debug("Obteniendo información del volumen de entrada");
    let default_source_id = get_default_source_id()?;

    let output = Command::new(CMD_WPCTL)
        .args(["get-volume", &default_source_id])
        .output()
        .map_err(|e| format!("Error ejecutando wpctl get-volume: {}", e))?;

    let volume_output = String::from_utf8_lossy(&output.stdout);
    parse_volume_info(&volume_output)
}

/// Establece el volumen del sistema
pub fn set_volume(volume: i64, app: AppHandle) -> Result<(), String> {
    log_info(&format!("Estableciendo volumen a: {}%", volume));
    let default_sink_id = get_default_sink_id()?;

    let volume_percent = format!("{}%", volume);
    Command::new(CMD_WPCTL)
        .args(["set-volume", &default_sink_id, &volume_percent])
        .output()
        .map_err(|e| format!("Failed to set volume: {}", e))?;

    // Si se aplicó correctamente, leer estado y notificar al frontend
    if let Ok(info) = get_volume() {
        log_debug(&format!("Volumen actualizado: {}%", info.current));
        let _ = app.emit("volume-changed", info.clone());
    }
    Ok(())
}

/// Establece el volumen de entrada (micrófono)
pub fn set_input_volume(volume: i64, app: AppHandle) -> Result<(), String> {
    log_info(&format!("Estableciendo volumen de entrada a: {}%", volume));
    let default_source_id = get_default_source_id()?;

    let volume_percent = format!("{}%", volume);
    Command::new(CMD_WPCTL)
        .args(["set-volume", &default_source_id, &volume_percent])
        .output()
        .map_err(|e| format!("Failed to set input volume: {}", e))?;

    if let Ok(info) = get_input_volume() {
        let _ = app.emit("audio-input-volume-changed", info.clone());
    }

    Ok(())
}

/// Alterna el estado de silencio del audio
pub fn toggle_mute(app: AppHandle) -> Result<bool, String> {
    log_info("Alternando estado de mute");
    let default_sink_id = get_default_sink_id()?;

    // Obtener estado actual
    let current_info = get_volume()?;

    // Toggle mute
    Command::new(CMD_WPCTL)
        .args(["set-mute", &default_sink_id, "toggle"])
        .output()
        .map_err(|e| format!("Failed to toggle mute: {}", e))?;
    
    // Después del toggle, obtener estado actualizado y notificar al frontend
    if let Ok(info) = get_volume() {
        log_debug(&format!("Mute actualizado: {}", info.is_muted));
        let _ = app.emit("volume-changed", info.clone());
    }
    
    // Retornar el nuevo estado (opuesto al actual)
    Ok(!current_info.is_muted)
}

/// Alterna el estado de silencio del micrófono
pub fn toggle_input_mute(app: AppHandle) -> Result<bool, String> {
    log_info("Alternando estado de mute de entrada");
    let default_source_id = get_default_source_id()?;

    let current_info = get_input_volume()?;

    Command::new(CMD_WPCTL)
        .args(["set-mute", &default_source_id, "toggle"])
        .output()
        .map_err(|e| format!("Failed to toggle input mute: {}", e))?;

    if let Ok(info) = get_input_volume() {
        let _ = app.emit("audio-input-volume-changed", info.clone());
    }

    Ok(!current_info.is_muted)
}

/// Lista todos los dispositivos de salida de audio (sinks)
pub fn list_audio_devices() -> Result<Vec<AudioDevice>, String> {
    log_debug("Listando dispositivos de audio");
    let default_sink_id = get_default_sink_id().ok();
    let devices = list_devices_by_section("Sinks:", default_sink_id)?;
    
    log_debug(&format!("Encontrados {} dispositivos de audio", devices.len()));
    Ok(devices)
}

/// Lista todos los dispositivos de entrada de audio (sources)
pub fn list_audio_input_devices() -> Result<Vec<AudioDevice>, String> {
    log_debug("Listando dispositivos de entrada de audio");
    let default_source_id = get_default_source_id().ok();
    let devices = list_devices_by_section("Sources:", default_source_id)?;
    log_debug(&format!("Encontrados {} dispositivos de entrada", devices.len()));
    Ok(devices)
}

/// Establece el dispositivo de salida de audio por defecto
pub fn set_default_audio_device(device_id: &str, app: AppHandle) -> Result<(), String> {
    log_info(&format!("Estableciendo dispositivo de audio por defecto: {}", device_id));
    Command::new(CMD_WPCTL)
        .args(["set-default", device_id])
        .output()
        .map_err(|e| format!("Failed to set default device: {}", e))?;
    
    // Notify frontend of change
    if let Ok(devices) = list_audio_devices() {
        log_debug("Notificando cambio de dispositivos de audio al frontend");
        let _ = app.emit("audio-devices-changed", devices);
    }
    
    log_info("Dispositivo de audio por defecto establecido correctamente");
    Ok(())
}

/// Establece el dispositivo de entrada por defecto
pub fn set_default_audio_input_device(device_id: &str, app: AppHandle) -> Result<(), String> {
    log_info(&format!(
        "Estableciendo dispositivo de entrada por defecto: {}",
        device_id
    ));

    Command::new(CMD_WPCTL)
        .args(["set-default", device_id])
        .output()
        .map_err(|e| format!("Failed to set default input device: {}", e))?;

    if let Ok(devices) = list_audio_input_devices() {
        let _ = app.emit("audio-input-devices-changed", devices);
    }

    log_info("Dispositivo de entrada por defecto establecido correctamente");
    Ok(())
}

use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;
use tauri::{AppHandle, Emitter};

use crate::logger::{log_debug, log_error, log_info};
use crate::structs::{AudioDevice, VolumeInfo};

const CMD_PACTL: &str = "pactl";

fn name_cache() -> &'static Mutex<Option<(String, String, Instant)>> {
    static CACHE: OnceLock<Mutex<Option<(String, String, Instant)>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
}

fn clear_cache() {
    if let Ok(mut cache) = name_cache().lock() {
        cache.take();
    }
}

fn run_pactl(args: &[&str]) -> Result<String, String> {
    let output = Command::new(CMD_PACTL)
        .args(args)
        .output()
        .map_err(|e| format!("Error ejecutando pactl: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Comando pactl falló: {}", stderr));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn get_default_name(marker: &str) -> Result<String, String> {
    if let Ok(cache) = name_cache().lock() {
        if let Some((ref sink, ref source, time)) = *cache {
            if time.elapsed() < std::time::Duration::from_secs(2) {
                if marker == "Sink" {
                    return Ok(sink.clone());
                } else {
                    return Ok(source.clone());
                }
            }
        }
    }

    let info_output = run_pactl(&["info"])?;

    let sink_name = info_output
        .lines()
        .find_map(|line| {
            let t = line.trim();
            t.strip_prefix("Default Sink:").or_else(|| t.strip_prefix("default sink:")).map(|s| s.trim().to_string())
        })
        .ok_or_else(|| {
            log_error("No se encontró Default Sink en pactl info");
            "Default Sink not found".to_string()
        })?;

    let source_name = info_output
        .lines()
        .find_map(|line| {
            let t = line.trim();
            t.strip_prefix("Default Source:").or_else(|| t.strip_prefix("default source:")).map(|s| s.trim().to_string())
        })
        .ok_or_else(|| {
            log_error("No se encontró Default Source en pactl info");
            "Default Source not found".to_string()
        })?;

    if let Ok(mut cache) = name_cache().lock() {
        let _ = cache.insert((sink_name.clone(), source_name.clone(), Instant::now()));
    }

    if marker == "Sink" {
        Ok(sink_name)
    } else {
        Ok(source_name)
    }
}

fn get_default_sink_name() -> Result<String, String> {
    get_default_name("Sink")
}

fn get_default_source_name() -> Result<String, String> {
    get_default_name("Source")
}

fn parse_first_percent(output: &str) -> Result<i64, String> {
    output
        .lines()
        .find_map(|line| {
            let trimmed = line.trim();
            if trimmed.starts_with("Volume:") || trimmed.starts_with("volume:") {
                trimmed.split_whitespace().find_map(|part| {
                    part.strip_suffix('%').and_then(|s| s.parse::<i64>().ok())
                })
            } else {
                None
            }
        })
        .ok_or_else(|| "No se pudo parsear el porcentaje de volumen".to_string())
}

fn parse_volume_and_mute(output: &str, default_name: &str) -> Result<(i64, bool), String> {
    let mut in_target = false;
    let mut volume_pct = None;
    let mut is_muted = false;

    for line in output.lines() {
        let trimmed = line.trim();

        if trimmed.starts_with("Sink #") || trimmed.starts_with("Source #") {
            in_target = true;
            continue;
        }

        if !in_target {
            continue;
        }

        if trimmed.starts_with("Sink #") || trimmed.starts_with("Source #") || trimmed.is_empty() {
            break;
        }

        if trimmed.starts_with("Name:") {
            let name = trimmed.strip_prefix("Name:").unwrap_or("").trim();
            if name != default_name {
                in_target = false;
            }
            continue;
        }

        if trimmed.starts_with("Mute:") {
            is_muted = trimmed.contains("yes");
            continue;
        }

        if trimmed.starts_with("Volume:") || trimmed.starts_with("volume:") {
            if let Some(pct) = trimmed.split_whitespace().find_map(|part| {
                part.strip_suffix('%').and_then(|s| s.parse::<i64>().ok())
            }) {
                volume_pct = Some(pct);
            }
        }
    }

    let current = volume_pct.or_else(|| parse_first_percent(output).ok()).unwrap_or(0);
    Ok((current, is_muted))
}

fn parse_devices(output: &str, default_name: Option<&str>, prefix: &str) -> Vec<AudioDevice> {
    let mut devices = Vec::new();
    let mut current_id = String::new();
    let mut current_name = String::new();
    let mut current_description = String::new();
    let mut current_volume = 0.5;
    let mut in_device = false;

    for line in output.lines() {
        let trimmed = line.trim();

        if let Some(rest) = trimmed.strip_prefix(&format!("{} #", prefix)) {
            if in_device && !current_id.is_empty() {
                let desc = if current_description.is_empty() {
                    current_name.clone()
                } else {
                    current_description.clone()
                };
                devices.push(AudioDevice {
                    id: current_id.clone(),
                    name: desc,
                    description: current_name.clone(),
                    is_default: default_name.map(|d| d == &current_name).unwrap_or(false),
                    volume: current_volume,
                });
            }
            current_id = rest.split_whitespace().next().unwrap_or("").to_string();
            current_name.clear();
            current_description.clear();
            current_volume = 0.5;
            in_device = true;
            continue;
        }

        if !in_device {
            continue;
        }

        if let Some(rest) = trimmed.strip_prefix("Name:") {
            current_name = rest.trim().to_string();
            continue;
        }

        if let Some(rest) = trimmed.strip_prefix("Description:") {
            current_description = rest.trim().to_string();
            continue;
        }

        if trimmed.starts_with("Volume:") || trimmed.starts_with("volume:") {
            if let Some(pct) = trimmed.split_whitespace().find_map(|part| {
                part.strip_suffix('%').and_then(|s| s.parse::<f64>().ok())
            }) {
                current_volume = pct / 100.0;
            }
            continue;
        }

        if trimmed.is_empty() && in_device && !current_name.is_empty() {
            let desc = if current_description.is_empty() {
                current_name.clone()
            } else {
                current_description.clone()
            };
            devices.push(AudioDevice {
                id: current_id.clone(),
                name: desc,
                description: current_name.clone(),
                is_default: default_name.map(|d| d == &current_name).unwrap_or(false),
                volume: current_volume,
            });
            current_id.clear();
            current_name.clear();
            current_description.clear();
            current_volume = 0.5;
            in_device = false;
        }
    }

    if in_device && !current_id.is_empty() {
        let desc = if current_description.is_empty() {
            current_name.clone()
        } else {
            current_description.clone()
        };
        devices.push(AudioDevice {
            id: current_id,
            name: desc,
            description: current_name.clone(),
            is_default: default_name.map(|d| d == &current_name).unwrap_or(false),
            volume: current_volume,
        });
    }

    devices
}

/// Obtiene la información actual del volumen del sistema
pub fn get_volume() -> Result<VolumeInfo, String> {
    log_debug("Obteniendo información del volumen");
    let default_sink = get_default_sink_name()?;
    let output = run_pactl(&["list", "sinks"])?;
    let (current, is_muted) = parse_volume_and_mute(&output, &default_sink)?;

    Ok(VolumeInfo {
        current,
        min: 0,
        max: 100,
        is_muted,
    })
}

/// Obtiene la información actual del volumen de entrada (micrófono)
pub fn get_input_volume() -> Result<VolumeInfo, String> {
    log_debug("Obteniendo información del volumen de entrada");
    let default_source = get_default_source_name()?;
    let output = run_pactl(&["list", "sources"])?;
    let (current, is_muted) = parse_volume_and_mute(&output, &default_source)?;

    Ok(VolumeInfo {
        current,
        min: 0,
        max: 100,
        is_muted,
    })
}

/// Establece el volumen del sistema
pub fn set_volume(volume: i64, app: AppHandle) -> Result<(), String> {
    log_info(&format!("Estableciendo volumen a: {}%", volume));
    let sink = get_default_sink_name()?;
    let volume_str = format!("{}%", volume);
    run_pactl(&["set-sink-volume", &sink, &volume_str])?;

    if let Ok(info) = get_volume() {
        log_debug(&format!("Volumen actualizado: {}%", info.current));
        let _ = app.emit("volume-changed", info.clone());
    }
    Ok(())
}

/// Establece el volumen de entrada (micrófono)
pub fn set_input_volume(volume: i64, app: AppHandle) -> Result<(), String> {
    log_info(&format!("Estableciendo volumen de entrada a: {}%", volume));
    let source = get_default_source_name()?;
    let volume_str = format!("{}%", volume);
    run_pactl(&["set-source-volume", &source, &volume_str])?;

    if let Ok(info) = get_input_volume() {
        let _ = app.emit("audio-input-volume-changed", info.clone());
    }
    Ok(())
}

/// Alterna el estado de silencio del audio
pub fn toggle_mute(app: AppHandle) -> Result<bool, String> {
    log_info("Alternando estado de mute");
    let sink = get_default_sink_name()?;
    let current_info = get_volume()?;

    run_pactl(&["set-sink-mute", &sink, "toggle"])?;

    if let Ok(info) = get_volume() {
        log_debug(&format!("Mute actualizado: {}", info.is_muted));
        let _ = app.emit("volume-changed", info.clone());
    }

    Ok(!current_info.is_muted)
}

/// Alterna el estado de silencio del micrófono
pub fn toggle_input_mute(app: AppHandle) -> Result<bool, String> {
    log_info("Alternando estado de mute de entrada");
    let source = get_default_source_name()?;
    let current_info = get_input_volume()?;

    run_pactl(&["set-source-mute", &source, "toggle"])?;

    if let Ok(info) = get_input_volume() {
        let _ = app.emit("audio-input-volume-changed", info.clone());
    }

    Ok(!current_info.is_muted)
}

/// Lista todos los dispositivos de salida de audio (sinks)
pub fn list_audio_devices() -> Result<Vec<AudioDevice>, String> {
    log_debug("Listando dispositivos de audio");
    let default_sink = get_default_sink_name().ok();
    let output = run_pactl(&["list", "sinks"])?;
    let devices = parse_devices(&output, default_sink.as_deref(), "Sink");
    log_debug(&format!("Encontrados {} dispositivos de audio", devices.len()));
    Ok(devices)
}

/// Lista todos los dispositivos de entrada de audio (sources)
pub fn list_audio_input_devices() -> Result<Vec<AudioDevice>, String> {
    log_debug("Listando dispositivos de entrada de audio");
    let default_source = get_default_source_name().ok();
    let output = run_pactl(&["list", "sources"])?;
    let devices = parse_devices(&output, default_source.as_deref(), "Source");
    log_debug(&format!("Encontrados {} dispositivos de entrada", devices.len()));
    Ok(devices)
}

/// Establece el dispositivo de salida de audio por defecto
pub fn set_default_audio_device(device_id: &str, app: AppHandle) -> Result<(), String> {
    log_info(&format!("Estableciendo dispositivo de audio por defecto: {}", device_id));
    run_pactl(&["set-default-sink", device_id])?;
    clear_cache();

    if let Ok(devices) = list_audio_devices() {
        let _ = app.emit("audio-devices-changed", devices);
    }

    log_info("Dispositivo de audio por defecto establecido correctamente");
    Ok(())
}

/// Establece el dispositivo de entrada por defecto
pub fn set_default_audio_input_device(device_id: &str, app: AppHandle) -> Result<(), String> {
    log_info(&format!("Estableciendo dispositivo de entrada por defecto: {}", device_id));
    run_pactl(&["set-default-source", device_id])?;
    clear_cache();

    if let Ok(devices) = list_audio_input_devices() {
        let _ = app.emit("audio-input-devices-changed", devices);
    }

    log_info("Dispositivo de entrada por defecto establecido correctamente");
    Ok(())
}

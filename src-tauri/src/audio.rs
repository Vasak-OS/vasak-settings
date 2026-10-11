use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;
use tauri::{AppHandle, Emitter};

use crate::logger::{log_debug, log_error, log_info};
use crate::structs::{AudioDevice, AudioOutputProfile, VolumeInfo};

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
            t.strip_prefix("Default Sink:")
                .or_else(|| t.strip_prefix("default sink:"))
                .map(|s| s.trim().to_string())
        })
        .ok_or_else(|| {
            log_error("No se encontró Default Sink en pactl info");
            "Default Sink not found".to_string()
        })?;

    let source_name = info_output
        .lines()
        .find_map(|line| {
            let t = line.trim();
            t.strip_prefix("Default Source:")
                .or_else(|| t.strip_prefix("default source:"))
                .map(|s| s.trim().to_string())
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
                trimmed
                    .split_whitespace()
                    .find_map(|part| part.strip_suffix('%').and_then(|s| s.parse::<i64>().ok()))
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
            if let Some(pct) = trimmed
                .split_whitespace()
                .find_map(|part| part.strip_suffix('%').and_then(|s| s.parse::<i64>().ok()))
            {
                volume_pct = Some(pct);
            }
        }
    }

    let current = volume_pct
        .or_else(|| parse_first_percent(output).ok())
        .unwrap_or(0);
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
                    is_default: default_name.map(|d| d == current_name).unwrap_or(false),
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
            if let Some(pct) = trimmed
                .split_whitespace()
                .find_map(|part| part.strip_suffix('%').and_then(|s| s.parse::<f64>().ok()))
            {
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
                is_default: default_name.map(|d| d == current_name).unwrap_or(false),
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
            is_default: default_name.map(|d| d == current_name).unwrap_or(false),
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
    log_debug(&format!(
        "Encontrados {} dispositivos de audio",
        devices.len()
    ));
    Ok(devices)
}

/// Lista todos los dispositivos de entrada de audio (sources)
pub fn list_audio_input_devices() -> Result<Vec<AudioDevice>, String> {
    log_debug("Listando dispositivos de entrada de audio");
    let default_source = get_default_source_name().ok();
    let output = run_pactl(&["list", "sources"])?;
    let devices = parse_devices(&output, default_source.as_deref(), "Source");
    log_debug(&format!(
        "Encontrados {} dispositivos de entrada",
        devices.len()
    ));
    Ok(devices)
}

/// Establece el dispositivo de salida de audio por defecto
pub fn set_default_audio_device(device_id: &str, app: AppHandle) -> Result<(), String> {
    log_info(&format!(
        "Estableciendo dispositivo de audio por defecto: {}",
        device_id
    ));
    run_pactl(&["set-default-sink", device_id])?;
    clear_cache();

    if let Ok(devices) = list_audio_devices() {
        let _ = app.emit("audio-devices-changed", devices);
    }

    log_info("Dispositivo de audio por defecto establecido correctamente");
    Ok(())
}

// --- Salidas detrás de perfiles de tarjeta (HDMI, S/PDIF, ...) ---

/// Un perfil leído de `pactl list cards`, con lo que hace falta para decidir si
/// su puerto está disponible y es el activo.
#[derive(Debug, Clone)]
struct ParsedProfile {
    name: String,
    sinks: i64,
    priority: i64,
    available: bool,
}

/// Un puerto de tarjeta leído de `pactl list cards`.
#[derive(Debug, Clone, Default)]
struct ParsedPort {
    description: String,
    priority: i64,
    available: bool,
    part_of: Vec<String>,
}

#[derive(Debug, Clone, Default)]
struct ParsedCard {
    name: String,
    active_profile: String,
    profiles: Vec<ParsedProfile>,
    ports: Vec<ParsedPort>,
}

/// Parsea el porcentaje tipo `priority: 5900` dentro de un paréntesis.
fn parse_kv_i64(text: &str, key: &str) -> Option<i64> {
    let idx = text.find(key)?;
    text[idx + key.len()..]
        .trim_start()
        .split(|c: char| c == ',' || c == ')' || c.is_whitespace())
        .find(|s| !s.is_empty())
        .and_then(|s| s.parse::<i64>().ok())
}

/// Parsea una línea de perfil:
/// `output:hdmi-stereo: Salida (HDMI) (sinks: 1, sources: 0, priority: 5900, available: no)`
fn parse_profile_line(line: &str) -> Option<ParsedProfile> {
    let stats_idx = line.rfind("(sinks:")?;
    let (name, _desc) = line[..stats_idx].trim_end().split_once(": ")?;
    let stats = &line[stats_idx..];
    Some(ParsedProfile {
        name: name.trim().to_string(),
        sinks: parse_kv_i64(stats, "sinks:").unwrap_or(0),
        priority: parse_kv_i64(stats, "priority:").unwrap_or(0),
        available: !stats.contains("available: no"),
    })
}

/// Parsea la cabecera de un puerto:
/// `hdmi-output-0: HDMI / DisplayPort (type: HDMI, priority: 5900, ..., not available)`
fn parse_port_header(line: &str) -> Option<ParsedPort> {
    let type_idx = line.find("(type:")?;
    let (_id, desc) = line[..type_idx].trim_end().split_once(": ")?;
    let meta = &line[type_idx..];
    Some(ParsedPort {
        description: desc.trim().to_string(),
        priority: parse_kv_i64(meta, "priority:").unwrap_or(0),
        // «not available» es el único estado que marca un puerto como no usable;
        // «availability unknown» (analógico) se trata como disponible.
        available: !meta.contains("not available"),
        part_of: Vec::new(),
    })
}

/// Parsea `pactl list cards` en los perfiles de salida conmutables de cada
/// tarjeta: un puerto de salida por entrada, con el perfil de mayor prioridad
/// que lo activa. Función pura para poder probarla sin `pactl`.
fn parse_card_output_profiles(output: &str) -> Vec<AudioOutputProfile> {
    #[derive(PartialEq)]
    enum Section {
        None,
        Profiles,
        Ports,
    }

    let mut cards: Vec<ParsedCard> = Vec::new();
    let mut current: Option<ParsedCard> = None;
    let mut section = Section::None;
    let mut name_set = false;

    for line in output.lines() {
        let trimmed = line.trim();

        if trimmed.starts_with("Card #") {
            if let Some(card) = current.take() {
                cards.push(card);
            }
            current = Some(ParsedCard::default());
            section = Section::None;
            name_set = false;
            continue;
        }

        let Some(card) = current.as_mut() else {
            continue;
        };

        if trimmed == "Profiles:" {
            section = Section::Profiles;
            continue;
        }
        if trimmed == "Ports:" {
            section = Section::Ports;
            continue;
        }
        if let Some(rest) = trimmed.strip_prefix("Active Profile:") {
            card.active_profile = rest.trim().to_string();
            section = Section::None;
            continue;
        }
        if !name_set {
            if let Some(rest) = trimmed.strip_prefix("Name:") {
                card.name = rest.trim().to_string();
                name_set = true;
                continue;
            }
        }

        match section {
            Section::Profiles => {
                if trimmed.contains("(sinks:") {
                    if let Some(profile) = parse_profile_line(trimmed) {
                        card.profiles.push(profile);
                    }
                }
            }
            Section::Ports => {
                if trimmed.contains("(type:") {
                    if let Some(port) = parse_port_header(trimmed) {
                        card.ports.push(port);
                    }
                } else if let Some(rest) = trimmed.strip_prefix("Part of profile(s):") {
                    if let Some(port) = card.ports.last_mut() {
                        port.part_of = rest
                            .split(',')
                            .map(|s| s.trim().to_string())
                            .filter(|s| !s.is_empty())
                            .collect();
                    }
                }
            }
            Section::None => {}
        }
    }
    if let Some(card) = current.take() {
        cards.push(card);
    }

    let mut outputs = Vec::new();
    for card in &cards {
        for port in &card.ports {
            // Un puerto de entrada aparece en algún perfil puro `input:`; los de
            // salida sólo están en perfiles `output:` (solos o combinados).
            let is_input = port.part_of.iter().any(|p| p.starts_with("input:"));
            if is_input {
                continue;
            }

            // Perfiles del puerto que crean un sink.
            let candidates: Vec<&ParsedProfile> = port
                .part_of
                .iter()
                .filter_map(|name| card.profiles.iter().find(|p| &p.name == name))
                .filter(|p| p.sinks > 0)
                .collect();
            if candidates.is_empty() {
                continue;
            }

            // El perfil a activar: el disponible de mayor prioridad; si ninguno
            // está disponible, el de mayor prioridad para tener un nombre válido.
            let chosen = candidates
                .iter()
                .filter(|p| p.available)
                .max_by_key(|p| p.priority)
                .or_else(|| candidates.iter().max_by_key(|p| p.priority));
            let Some(chosen) = chosen else {
                continue;
            };

            let is_active = !card.active_profile.is_empty()
                && card.active_profile != "off"
                && port.part_of.iter().any(|p| p == &card.active_profile);

            outputs.push(AudioOutputProfile {
                card_name: card.name.clone(),
                profile_name: chosen.name.clone(),
                description: port.description.clone(),
                is_active,
                is_available: port.available,
                priority: port.priority,
            });
        }
    }

    outputs.sort_by(|a, b| b.priority.cmp(&a.priority));
    outputs
}

/// El prefijo del sink que crea una tarjeta: `alsa_card.X` → `alsa_output.X`.
fn sink_prefix_for_card(card_name: &str) -> String {
    card_name.replacen("alsa_card.", "alsa_output.", 1)
}

/// El sufijo que el nombre del sink toma del perfil:
/// `output:hdmi-stereo` → `hdmi-stereo`; `output:analog-stereo+input:mono` →
/// `analog-stereo`.
fn profile_to_sink_suffix(profile_name: &str) -> &str {
    profile_name
        .strip_prefix("output:")
        .unwrap_or(profile_name)
        .split('+')
        .next()
        .unwrap_or(profile_name)
}

/// Encuentra, en la salida de `pactl list sinks short`, el sink que acaba de
/// crear el perfil elegido para una tarjeta. Función pura para probarla sin
/// `pactl`.
fn pick_sink_for_card(short_output: &str, card_name: &str, profile_name: &str) -> Option<String> {
    let prefix = sink_prefix_for_card(card_name);
    let candidate = format!("{}.{}", prefix, profile_to_sink_suffix(profile_name));
    let dotted_prefix = format!("{}.", prefix);

    let names = short_output.lines().filter_map(|line| {
        line.split(|c: char| c == '\t' || c == ' ')
            .filter(|s| !s.is_empty())
            .nth(1)
    });

    let mut fallback = None;
    for name in names {
        if name == candidate {
            return Some(candidate);
        }
        if fallback.is_none() && name.starts_with(&dotted_prefix) {
            fallback = Some(name.to_string());
        }
    }
    fallback
}

/// Lista las salidas que viven detrás de un perfil de tarjeta (HDMI, S/PDIF),
/// incluidas las que todavía no tienen sink porque su perfil no está activo.
pub fn list_audio_output_profiles() -> Result<Vec<AudioOutputProfile>, String> {
    log_debug("Listando perfiles de salida de las tarjetas");
    let output = run_pactl(&["list", "cards"])?;
    let profiles = parse_card_output_profiles(&output);
    log_debug(&format!(
        "Encontrados {} perfiles de salida",
        profiles.len()
    ));
    Ok(profiles)
}

/// Activa un perfil de tarjeta y fija como salida por defecto el sink que crea.
///
/// Es lo que hace falta para elegir una salida HDMI cuyo sink todavía no existe:
/// primero se conmuta el perfil de la tarjeta, y recién después aparece el sink
/// que se puede fijar por defecto.
pub fn set_audio_output_profile(
    card_name: &str,
    profile_name: &str,
    app: AppHandle,
) -> Result<(), String> {
    log_info(&format!(
        "Activando perfil {} en la tarjeta {}",
        profile_name, card_name
    ));
    run_pactl(&["set-card-profile", card_name, profile_name])?;
    clear_cache();

    let short = run_pactl(&["list", "sinks", "short"])?;
    match pick_sink_for_card(&short, card_name, profile_name) {
        Some(sink) => {
            run_pactl(&["set-default-sink", &sink])?;
            log_info(&format!("Salida por defecto fijada en {}", sink));
        }
        None => {
            log_error(&format!(
                "No se encontró el sink para la tarjeta {} tras activar {}",
                card_name, profile_name
            ));
        }
    }

    if let Ok(devices) = list_audio_devices() {
        let _ = app.emit("audio-devices-changed", devices);
    }
    if let Ok(profiles) = list_audio_output_profiles() {
        let _ = app.emit("audio-output-profiles-changed", profiles);
    }

    Ok(())
}

/// Establece el dispositivo de entrada por defecto
pub fn set_default_audio_input_device(device_id: &str, app: AppHandle) -> Result<(), String> {
    log_info(&format!(
        "Estableciendo dispositivo de entrada por defecto: {}",
        device_id
    ));
    run_pactl(&["set-default-source", device_id])?;
    clear_cache();

    if let Ok(devices) = list_audio_input_devices() {
        let _ = app.emit("audio-input-devices-changed", devices);
    }

    log_info("Dispositivo de entrada por defecto establecido correctamente");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Salida de `pactl list cards` con dos tarjetas: la analógica integrada
    /// (con su perfil activo) y la HDMI de la GPU apagada aunque el monitor
    /// está enchufado (su puerto figura disponible, pero `Active Profile: off`
    /// hace que su sink no exista en `pactl list sinks`).
    const CARDS_FIXTURE: &str = "\
Card #0
\tName: alsa_card.pci-0000_00_1f.3
\tDriver: alsa
\tProperties:
\t\talsa.card = \"0\"
\t\tdevice.description = \"Audio interno\"
\tProfiles:
\t\toutput:analog-stereo: Analógico estéreo salida (sinks: 1, sources: 0, priority: 6500, available: yes)
\t\toutput:analog-stereo+input:analog-stereo: Dúplex analógico estéreo (sinks: 1, sources: 1, priority: 6565, available: yes)
\t\tinput:analog-stereo: Analógico estéreo entrada (sinks: 0, sources: 1, priority: 65, available: yes)
\t\toff: Apagado (sinks: 0, sources: 0, priority: 0, available: yes)
\tActive Profile: output:analog-stereo+input:analog-stereo
\tPorts:
\t\tanalog-output-speaker: Altavoces (type: Speaker, priority: 10000, availability unknown)
\t\t\tPart of profile(s): output:analog-stereo, output:analog-stereo+input:analog-stereo
\t\tanalog-input-internal-mic: Micrófono interno (type: Mic, priority: 8900, availability unknown)
\t\t\tPart of profile(s): input:analog-stereo, output:analog-stereo+input:analog-stereo
Card #1
\tName: alsa_card.pci-0000_01_00.1
\tDriver: alsa
\tProperties:
\t\talsa.card = \"1\"
\t\tdevice.description = \"Audio HDMI de la GPU\"
\tProfiles:
\t\toutput:hdmi-stereo: Estéreo digital (HDMI) salida (sinks: 1, sources: 0, priority: 5900, available: yes)
\t\toutput:hdmi-surround-71: Envolvente 7.1 digital (HDMI) salida (sinks: 1, sources: 0, priority: 100, available: no)
\t\toff: Apagado (sinks: 0, sources: 0, priority: 0, available: yes)
\tActive Profile: off
\tPorts:
\t\thdmi-output-0: HDMI / DisplayPort (type: HDMI, priority: 5900, availability group: Legacy 1, available: yes)
\t\t\tPart of profile(s): output:hdmi-stereo, output:hdmi-surround-71
";

    fn hdmi(output: &[AudioOutputProfile]) -> &AudioOutputProfile {
        output
            .iter()
            .find(|o| o.card_name == "alsa_card.pci-0000_01_00.1")
            .expect("la salida HDMI tiene que estar en la lista")
    }

    #[test]
    fn la_salida_hdmi_apagada_se_lista_como_disponible_e_inactiva() {
        // El corazón del arreglo: con el perfil de la tarjeta en `off`, la vieja
        // enumeración por `pactl list sinks` no veía esta salida. Acá tiene que
        // aparecer, marcada como disponible (el monitor está) y no activa.
        let outputs = parse_card_output_profiles(CARDS_FIXTURE);
        let hdmi = hdmi(&outputs);

        assert_eq!(hdmi.card_name, "alsa_card.pci-0000_01_00.1");
        assert_eq!(hdmi.profile_name, "output:hdmi-stereo");
        assert!(
            hdmi.is_available,
            "el puerto HDMI está presente, tiene que ser available"
        );
        assert!(
            !hdmi.is_active,
            "la tarjeta está en `off`, la salida no puede figurar activa"
        );
        assert!(hdmi.description.contains("HDMI"));
    }

    #[test]
    fn el_perfil_activo_de_la_tarjeta_marca_la_salida_como_activa() {
        let outputs = parse_card_output_profiles(CARDS_FIXTURE);
        let speaker = outputs
            .iter()
            .find(|o| o.card_name == "alsa_card.pci-0000_00_1f.3")
            .expect("la salida analógica tiene que estar en la lista");

        assert!(
            speaker.is_active,
            "su perfil dúplex es el Active Profile de la tarjeta"
        );
        assert!(speaker.is_available);
    }

    #[test]
    fn el_puerto_de_entrada_no_se_ofrece_como_salida() {
        let outputs = parse_card_output_profiles(CARDS_FIXTURE);
        assert!(
            outputs.iter().all(|o| !o.description.contains("Micrófono")),
            "un puerto que sólo pertenece a perfiles `input:` no es una salida"
        );
    }

    #[test]
    fn la_salida_de_mayor_prioridad_queda_primera() {
        let outputs = parse_card_output_profiles(CARDS_FIXTURE);
        assert!(outputs.len() >= 2);
        assert!(
            outputs.windows(2).all(|w| w[0].priority >= w[1].priority),
            "la lista tiene que venir ordenada de mayor a menor prioridad"
        );
    }

    #[test]
    fn parse_profile_line_lee_sinks_prioridad_y_disponibilidad() {
        let profile = parse_profile_line(
            "output:hdmi-stereo: Estéreo digital (HDMI) salida (sinks: 1, sources: 0, priority: 5900, available: no)",
        )
        .expect("una línea de perfil se parsea");

        assert_eq!(profile.name, "output:hdmi-stereo");
        assert_eq!(profile.sinks, 1);
        assert_eq!(profile.priority, 5900);
        assert!(
            !profile.available,
            "`available: no` tiene que leerse como no disponible"
        );
    }

    #[test]
    fn parse_profile_line_conserva_el_prefijo_input() {
        // El discriminador entrada/salida se apoya en que el nombre conserva su
        // prefijo `input:` / `output:`.
        let input = parse_profile_line(
            "input:analog-stereo: Analógico estéreo entrada (sinks: 0, sources: 1, priority: 65, available: yes)",
        )
        .expect("perfil de entrada parseado");
        assert!(input.name.starts_with("input:"));
        assert_eq!(input.sinks, 0);

        let output = parse_profile_line(
            "output:analog-stereo: Analógico estéreo salida (sinks: 1, sources: 0, priority: 6500, available: yes)",
        )
        .expect("perfil de salida parseado");
        assert!(output.name.starts_with("output:"));
        assert!(output.available);
    }

    #[test]
    fn parse_port_header_distingue_el_puerto_no_disponible() {
        let presente = parse_port_header(
            "hdmi-output-0: HDMI / DisplayPort (type: HDMI, priority: 5900, availability group: Legacy 1, available: yes)",
        )
        .expect("cabecera de puerto parseada");
        assert_eq!(presente.description, "HDMI / DisplayPort");
        assert_eq!(presente.priority, 5900);
        assert!(presente.available);

        let ausente = parse_port_header(
            "hdmi-output-1: HDMI / DisplayPort 2 (type: HDMI, priority: 5800, not available)",
        )
        .expect("cabecera de puerto parseada");
        assert!(
            !ausente.available,
            "`not available` tiene que leerse como puerto ausente"
        );
    }

    #[test]
    fn pick_sink_for_card_arma_el_nombre_del_sink_hdmi() {
        // `alsa_card.X` → `alsa_output.X`, y el sufijo sale del perfil sin el
        // prefijo `output:`.
        let short = "\
0\talsa_output.pci-0000_00_1f.3.analog-stereo\tPipeWire\ts16le 2ch 48000Hz\tRUNNING
1\talsa_output.pci-0000_01_00.1.hdmi-stereo\tPipeWire\ts16le 2ch 48000Hz\tIDLE
";
        let sink = pick_sink_for_card(short, "alsa_card.pci-0000_01_00.1", "output:hdmi-stereo");
        assert_eq!(
            sink.as_deref(),
            Some("alsa_output.pci-0000_01_00.1.hdmi-stereo")
        );
    }

    #[test]
    fn pick_sink_for_card_descarta_el_sufijo_de_entrada_del_perfil() {
        let short = "0\talsa_output.pci-0000_00_1f.3.analog-stereo\tPipeWire\ts16le\tRUNNING\n";
        let sink = pick_sink_for_card(
            short,
            "alsa_card.pci-0000_00_1f.3",
            "output:analog-stereo+input:analog-stereo",
        );
        assert_eq!(
            sink.as_deref(),
            Some("alsa_output.pci-0000_00_1f.3.analog-stereo"),
            "el `+input:...` del perfil no entra en el nombre del sink"
        );
    }

    #[test]
    fn pick_sink_for_card_cae_al_prefijo_cuando_el_nombre_exacto_no_aparece() {
        // El sink existe con otro sufijo del esperado; igual se encuentra por el
        // prefijo de la tarjeta.
        let short = "7\talsa_output.pci-0000_01_00.1.hdmi-stereo-extra1\tPipeWire\ts16le\tIDLE\n";
        let sink = pick_sink_for_card(short, "alsa_card.pci-0000_01_00.1", "output:hdmi-stereo");
        assert_eq!(
            sink.as_deref(),
            Some("alsa_output.pci-0000_01_00.1.hdmi-stereo-extra1")
        );
    }

    #[test]
    fn pick_sink_for_card_no_inventa_sink_de_otra_tarjeta() {
        let short = "0\talsa_output.pci-0000_00_1f.3.analog-stereo\tPipeWire\ts16le\tRUNNING\n";
        let sink = pick_sink_for_card(short, "alsa_card.pci-0000_01_00.1", "output:hdmi-stereo");
        assert!(
            sink.is_none(),
            "ningún sink pertenece a la tarjeta HDMI, no hay que devolver el de otra"
        );
    }
}

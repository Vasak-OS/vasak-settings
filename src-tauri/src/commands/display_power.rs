use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use zbus::Connection;

use crate::logger::{log_debug, log_error};

const LOGIND_DEST: &str = "org.freedesktop.login1";
/// Resolves to the caller's own session, so no session id lookup is needed.
const SESSION_PATH: &str = "/org/freedesktop/login1/session/auto";
const SESSION_IFACE: &str = "org.freedesktop.login1.Session";

const BACKLIGHT_ROOT: &str = "/sys/class/backlight";
const NIGHT_LIGHT_UNIT: &str = "vasak-nightlight.service";

// ── Brightness ───────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct BacklightDevice {
    pub name: String,
    pub brightness: u32,
    pub max_brightness: u32,
    /// Convenience for the UI so it doesn't repeat the division.
    pub percent: u8,
}

fn read_number(path: &PathBuf) -> Option<u32> {
    fs::read_to_string(path).ok()?.trim().parse().ok()
}

/// Backlights are exposed read-only through sysfs to every user, so listing
/// needs no privileges; only writing goes through logind.
#[tauri::command]
pub fn get_backlights() -> Result<Vec<BacklightDevice>, String> {
    let root = PathBuf::from(BACKLIGHT_ROOT);

    if !root.is_dir() {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(&root).map_err(|e| {
        let msg = format!("No se pudo listar los backlights: {}", e);
        log_error(&msg);
        msg
    })?;

    let mut devices = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = entry.file_name().to_str().map(str::to_string) else {
            continue;
        };

        let Some(max_brightness) = read_number(&path.join("max_brightness")) else {
            continue;
        };
        let Some(brightness) = read_number(&path.join("brightness")) else {
            continue;
        };

        if max_brightness == 0 {
            continue;
        }

        devices.push(BacklightDevice {
            name,
            brightness,
            max_brightness,
            percent: ((brightness as u64 * 100) / max_brightness as u64).min(100) as u8,
        });
    }

    devices.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(devices)
}

/// Sets brightness through logind, which grants the active seat user access
/// without root and without a polkit prompt.
#[tauri::command]
pub async fn set_backlight_percent(device: String, percent: u8) -> Result<(), String> {
    let devices = get_backlights()?;
    let target = devices
        .iter()
        .find(|item| item.name == device)
        .ok_or_else(|| format!("No existe el backlight «{}»", device))?;

    let percent = percent.clamp(1, 100) as u64;
    let raw = ((target.max_brightness as u64 * percent) / 100).max(1) as u32;

    let connection = Connection::system()
        .await
        .map_err(|e| format!("No se pudo conectar al bus del sistema: {}", e))?;

    let proxy = zbus::Proxy::new(&connection, LOGIND_DEST, SESSION_PATH, SESSION_IFACE)
        .await
        .map_err(|e| format!("No se pudo acceder a la sesión de logind: {}", e))?;

    proxy
        .call::<_, _, ()>("SetBrightness", &("backlight", device.as_str(), raw))
        .await
        .map_err(|e| {
            let msg = format!("No se pudo ajustar el brillo: {}", e);
            log_error(&msg);
            msg
        })?;

    Ok(())
}

// ── Night light ──────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
pub struct NightLight {
    pub enabled: bool,
    /// False when wlsunset isn't installed; the UI explains instead of failing.
    pub available: bool,
    /// "location" follows sunrise/sunset, "manual" uses fixed times.
    pub mode: String,
    pub day_temp: u32,
    pub night_temp: u32,
    pub start: String,
    pub stop: String,
    pub latitude: String,
    pub longitude: String,
}

impl Default for NightLight {
    fn default() -> Self {
        Self {
            enabled: false,
            available: false,
            mode: "manual".to_string(),
            day_temp: 6500,
            night_temp: 4000,
            start: "07:00".to_string(),
            stop: "20:00".to_string(),
            latitude: String::new(),
            longitude: String::new(),
        }
    }
}

fn wlsunset_available() -> bool {
    Command::new("sh")
        .arg("-c")
        .arg("command -v wlsunset")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn unit_path() -> Result<PathBuf, String> {
    let home = std::env::var("HOME")
        .map(PathBuf::from)
        .ok()
        .or_else(dirs::home_dir)
        .ok_or_else(|| "No se pudo obtener el directorio home".to_string())?;

    Ok(home.join(".config/systemd/user").join(NIGHT_LIGHT_UNIT))
}

fn systemctl(args: &[&str]) -> Result<(), String> {
    let output = Command::new("systemctl")
        .arg("--user")
        .args(args)
        .output()
        .map_err(|e| format!("No se pudo ejecutar systemctl: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let msg = format!("systemctl {:?} falló: {}", args, stderr.trim());
        log_error(&msg);
        return Err(msg);
    }

    Ok(())
}

/// The generated unit is the single source of truth: the settings are read back
/// out of its ExecStart line rather than duplicated into another config file.
fn parse_unit(content: &str) -> NightLight {
    let mut config = NightLight::default();

    let Some(exec) = content
        .lines()
        .find(|line| line.trim_start().starts_with("ExecStart="))
        .map(|line| line.trim_start().trim_start_matches("ExecStart=").trim())
    else {
        return config;
    };

    let tokens: Vec<&str> = exec.split_whitespace().collect();
    let mut index = 0;

    while index < tokens.len() {
        let value = tokens.get(index + 1).copied().unwrap_or_default();

        match tokens[index] {
            "-t" => {
                if let Ok(parsed) = value.parse() {
                    config.night_temp = parsed;
                }
                index += 2;
            }
            "-T" => {
                if let Ok(parsed) = value.parse() {
                    config.day_temp = parsed;
                }
                index += 2;
            }
            "-S" => {
                config.start = value.to_string();
                config.mode = "manual".to_string();
                index += 2;
            }
            "-s" => {
                config.stop = value.to_string();
                config.mode = "manual".to_string();
                index += 2;
            }
            "-l" => {
                config.latitude = value.to_string();
                config.mode = "location".to_string();
                index += 2;
            }
            "-L" => {
                config.longitude = value.to_string();
                config.mode = "location".to_string();
                index += 2;
            }
            _ => index += 1,
        }
    }

    config
}

fn render_unit(config: &NightLight) -> String {
    let mut exec = format!(
        "wlsunset -t {} -T {}",
        config.night_temp.clamp(1000, 10000),
        config.day_temp.clamp(1000, 10000)
    );

    if config.mode == "location" && !config.latitude.is_empty() && !config.longitude.is_empty() {
        exec.push_str(&format!(" -l {} -L {}", config.latitude, config.longitude));
    } else {
        exec.push_str(&format!(" -S {} -s {}", config.start, config.stop));
    }

    format!(
        "# Generado por vasak-settings. Los cambios manuales se sobrescriben.\n\
         [Unit]\n\
         Description=Luz nocturna de VasakOS (wlsunset)\n\
         PartOf=graphical-session.target\n\
         After=graphical-session.target\n\
         \n\
         [Service]\n\
         Type=simple\n\
         ExecStart={}\n\
         Restart=on-failure\n\
         \n\
         [Install]\n\
         WantedBy=graphical-session.target\n",
        exec
    )
}

#[tauri::command]
pub fn get_night_light() -> Result<NightLight, String> {
    let path = unit_path()?;

    let mut config = match fs::read_to_string(&path) {
        Ok(content) => parse_unit(&content),
        Err(_) => NightLight::default(),
    };

    config.available = wlsunset_available();
    config.enabled = Command::new("systemctl")
        .arg("--user")
        .arg("is-active")
        .arg("--quiet")
        .arg(NIGHT_LIGHT_UNIT)
        .status()
        .map(|status| status.success())
        .unwrap_or(false);

    Ok(config)
}

#[tauri::command]
pub fn set_night_light(config: NightLight) -> Result<NightLight, String> {
    if config.enabled && !wlsunset_available() {
        return Err(
            "wlsunset no está instalado. Instalalo para usar la luz nocturna.".to_string(),
        );
    }

    let path = unit_path()?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("No se pudo crear el directorio de unidades: {}", e))?;
    }

    fs::write(&path, render_unit(&config))
        .map_err(|e| format!("No se pudo escribir la unidad: {}", e))?;

    systemctl(&["daemon-reload"])?;

    if config.enabled {
        systemctl(&["enable", "--now", NIGHT_LIGHT_UNIT])?;
        log_debug("Luz nocturna activada");
    } else {
        // Ignore failures here: disabling something already inactive is fine.
        let _ = systemctl(&["disable", "--now", NIGHT_LIGHT_UNIT]);
        log_debug("Luz nocturna desactivada");
    }

    get_night_light()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_manual_schedule() {
        let config = NightLight {
            mode: "manual".to_string(),
            day_temp: 6500,
            night_temp: 3500,
            start: "07:30".to_string(),
            stop: "19:45".to_string(),
            ..NightLight::default()
        };

        let unit = render_unit(&config);
        assert!(unit.contains("ExecStart=wlsunset -t 3500 -T 6500 -S 07:30 -s 19:45"));
        assert!(unit.contains("WantedBy=graphical-session.target"));
    }

    #[test]
    fn renders_location_schedule_when_coordinates_are_set() {
        let config = NightLight {
            mode: "location".to_string(),
            latitude: "-34.6".to_string(),
            longitude: "-58.4".to_string(),
            ..NightLight::default()
        };

        let unit = render_unit(&config);
        assert!(unit.contains("-l -34.6 -L -58.4"));
        assert!(!unit.contains(" -S "), "location mode must not emit fixed times");
    }

    #[test]
    fn falls_back_to_times_when_location_is_incomplete() {
        let config = NightLight {
            mode: "location".to_string(),
            latitude: "-34.6".to_string(),
            longitude: String::new(),
            ..NightLight::default()
        };

        assert!(
            render_unit(&config).contains(" -S "),
            "an incomplete location must not produce an invalid wlsunset command"
        );
    }

    #[test]
    fn round_trips_through_the_generated_unit() {
        let config = NightLight {
            mode: "manual".to_string(),
            day_temp: 6000,
            night_temp: 3000,
            start: "08:00".to_string(),
            stop: "21:00".to_string(),
            ..NightLight::default()
        };

        let parsed = parse_unit(&render_unit(&config));

        assert_eq!(parsed.day_temp, 6000);
        assert_eq!(parsed.night_temp, 3000);
        assert_eq!(parsed.start, "08:00");
        assert_eq!(parsed.stop, "21:00");
        assert_eq!(parsed.mode, "manual");
    }

    #[test]
    fn round_trips_location_mode() {
        let config = NightLight {
            mode: "location".to_string(),
            latitude: "40.4".to_string(),
            longitude: "-3.7".to_string(),
            ..NightLight::default()
        };

        let parsed = parse_unit(&render_unit(&config));

        assert_eq!(parsed.mode, "location");
        assert_eq!(parsed.latitude, "40.4");
        assert_eq!(parsed.longitude, "-3.7");
    }

    #[test]
    fn temperatures_are_clamped_to_a_sane_range() {
        let config = NightLight {
            day_temp: 99999,
            night_temp: 10,
            ..NightLight::default()
        };

        let unit = render_unit(&config);
        assert!(unit.contains("-t 1000"), "night temp floor: {}", unit);
        assert!(unit.contains("-T 10000"), "day temp ceiling: {}", unit);
    }
}

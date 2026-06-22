use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::process::Command;

use crate::logger::{log_debug, log_error};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MonitorMode {
    pub width: u32,
    pub height: u32,
    pub refresh: f64,
    pub is_preferred: bool,
    pub is_current: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DetectedMonitor {
    pub name: String,
    pub connected: bool,
    pub available_modes: Vec<MonitorMode>,
    pub wayfire_config: Option<HashMap<String, String>>,
}

/// ── DRM connector detection ──────────────────────────────────────────
fn get_drm_connectors() -> Vec<(String, String)> {
    let mut connectors = Vec::new();
    let drm_path = Path::new("/sys/class/drm");
    if !drm_path.exists() {
        return connectors;
    }
    for entry in fs::read_dir(drm_path).into_iter().flatten() {
        let entry = match entry {
            Ok(e) => e,
            _ => continue,
        };
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.contains('-') || name.starts_with("renderD") {
            continue;
        }
        let connector_name = name
            .strip_prefix("card1-")
            .or_else(|| name.strip_prefix("card0-"))
            .map(|s| s.to_string())
            .unwrap_or(name.clone());

        let status = fs::read_to_string(entry.path().join("status"))
            .unwrap_or_default()
            .trim()
            .to_string();

        connectors.push((connector_name, status));
    }
    connectors
}

/// ── EDID-based mode detection (fallback when wlr-randr is unavailable) ─
fn get_edid_path(connector: &str) -> Option<String> {
    let drm_path = Path::new("/sys/class/drm");
    for entry in fs::read_dir(drm_path).into_iter().flatten() {
        let entry = match entry {
            Ok(e) => e,
            _ => continue,
        };
        let name = entry.file_name().to_string_lossy().to_string();
        let cn = name
            .strip_prefix("card1-")
            .or_else(|| name.strip_prefix("card0-"))
            .map(|s| s.to_string())
            .unwrap_or(name.clone());
        if cn == connector {
            let edid = entry.path().join("edid");
            if edid.exists() {
                return Some(edid.to_string_lossy().to_string());
            }
        }
    }
    None
}

fn parse_edid_modes(connector: &str) -> Vec<MonitorMode> {
    let edid_path = match get_edid_path(connector) {
        Some(p) => p,
        None => return Vec::new(),
    };

    let output = match Command::new("edid-decode").arg(&edid_path).output() {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).to_string(),
        _ => return Vec::new(),
    };

    let mut modes: Vec<MonitorMode> = Vec::new();
    let mut native_resolution: Option<(u32, u32)> = None;

    for line in output.lines() {
        let trimmed = line.trim();

        // Skip non-mode lines
        if !trimmed.contains("Hz") {
            continue;
        }

        let tokens: Vec<&str> = trimmed.split_whitespace().collect();

        // Find resolution token (pattern: digits 'x' digits)
        let res_raw = tokens.iter().find(|t| {
            let cleaned = t.trim_end_matches(',');
            if !cleaned.contains('x') {
                return false;
            }
            let parts: Vec<&str> = cleaned.split('x').collect();
            parts.len() == 2 && parts.iter().all(|p| p.parse::<u32>().is_ok())
        });

        let res_raw = match res_raw {
            Some(t) => t.trim_end_matches(',').to_string(),
            None => continue,
        };

        // Skip interlaced modes (resolution contains 'i' like 1920x1080i)
        if res_raw.contains('i') {
            continue;
        }

        let res_parts: Vec<&str> = res_raw.split('x').collect();
        let width = match res_parts[0].parse::<u32>() {
            Ok(w) => w,
            _ => continue,
        };
        let height = match res_parts[1].parse::<u32>() {
            Ok(h) => h,
            _ => continue,
        };

        // Find refresh rate: look for a float token followed by "Hz"
        let refresh = tokens
            .windows(2)
            .find(|pair| pair[1] == "Hz" && pair[0].contains('.'))
            .and_then(|pair| pair[0].parse::<f64>().ok())
            .unwrap_or(60.0);

        // Mark native/preferred
        let is_preferred = trimmed.contains("(native)")
            || trimmed.contains("native pixel format");

        // Track native resolution
        if trimmed.contains("(native)") {
            native_resolution = Some((width, height));
        }

        modes.push(MonitorMode {
            width,
            height,
            refresh,
            is_preferred: is_preferred || native_resolution.map_or(false, |(nw, nh)| width == nw && height == nh),
            is_current: false,
        });
    }

    // Deduplicate and sort
    modes.sort_by(|a, b| {
        b.width
            .cmp(&a.width)
            .then_with(|| b.height.cmp(&a.height))
            .then_with(|| b.refresh.partial_cmp(&a.refresh).unwrap_or(std::cmp::Ordering::Equal))
    });
    modes.dedup_by(|a, b| a.width == b.width && a.height == b.height && (a.refresh - b.refresh).abs() < 0.001);

    modes
}

/// ── wlr-randr parsing (primary, gives position/scale/transform/current mode) ─
fn try_wlr_randr() -> Option<Vec<DetectedMonitor>> {
    let output = Command::new("wlr-randr").output().ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_wlr_randr_output(&stdout)
}

fn parse_wlr_randr_output(output: &str) -> Option<Vec<DetectedMonitor>> {
    let mut monitors = Vec::new();
    let mut current_monitor: Option<DetectedMonitor> = None;

    for line in output.lines() {
        let trimmed = line.trim();

        // Detect new monitor: line starts with connector name and contains "connected"/"disconnected"
        if !line.starts_with(' ') && !line.starts_with('\t') && trimmed.contains('(') {
            if let Some(m) = current_monitor.take() {
                monitors.push(m);
            }

            let name = trimmed.split_whitespace().next()?.to_string();
            let connected = trimmed.contains("connected");

            current_monitor = Some(DetectedMonitor {
                name,
                connected,
                available_modes: Vec::new(),
                wayfire_config: None,
            });
            continue;
        }

        let monitor = match &mut current_monitor {
            Some(m) => m,
            None => continue,
        };

        if !monitor.connected {
            continue;
        }

        // Parse mode: "    1920x1080 px, 60.000 Hz (preferred, current)"
        if trimmed.contains("px,") && trimmed.contains("Hz") {
            let res_part = trimmed.split(',').next()?.trim();
            let mode_parts: Vec<&str> = res_part.split_whitespace().collect();
            let resolution = *mode_parts.first()?;
            let res_split: Vec<&str> = resolution.split('x').collect();
            if res_split.len() != 2 {
                continue;
            }
            let width = res_split[0].parse::<u32>().ok()?;
            let height = res_split[1].parse::<u32>().ok()?;

            let freq_str = trimmed.split(',').nth(1)?.trim();
            let freq_val: f64 = freq_str.split_whitespace().next()?.parse().ok()?;

            monitor.available_modes.push(MonitorMode {
                width,
                height,
                refresh: freq_val,
                is_preferred: trimmed.contains("preferred"),
                is_current: trimmed.contains("current"),
            });
        }

        if trimmed.starts_with("Position:") {
            let pos = trimmed.trim_start_matches("Position:").trim();
            monitor
                .wayfire_config
                .get_or_insert_with(HashMap::new)
                .insert("position".to_string(), pos.to_string());
        }
        if trimmed.starts_with("Scale:") {
            let scale = trimmed.trim_start_matches("Scale:").trim();
            monitor
                .wayfire_config
                .get_or_insert_with(HashMap::new)
                .insert("scale".to_string(), scale.to_string());
        }
        if trimmed.starts_with("Transform:") {
            let transform = trimmed.trim_start_matches("Transform:").trim();
            monitor
                .wayfire_config
                .get_or_insert_with(HashMap::new)
                .insert("transform".to_string(), transform.to_string());
        }
        if trimmed.starts_with("Enabled:") {
            let val = if trimmed.contains("yes") { "true" } else { "false" };
            monitor
                .wayfire_config
                .get_or_insert_with(HashMap::new)
                .insert("enable".to_string(), val.to_string());
        }
    }

    if let Some(m) = current_monitor {
        monitors.push(m);
    }

    Some(monitors)
}

/// ── Wayfire INI reader ───────────────────────────────────────────────
fn get_wayfire_output_configs() -> HashMap<String, HashMap<String, String>> {
    let mut outputs = HashMap::new();
    let home = std::env::var("HOME")
        .ok()
        .or_else(|| dirs::home_dir().map(|p| p.to_string_lossy().to_string()));

    let wayfire_path = match home {
        Some(h) => Path::new(&h).join(".config/wayfire.ini"),
        None => return outputs,
    };

    if !wayfire_path.exists() {
        return outputs;
    }

    let content = match fs::read_to_string(&wayfire_path) {
        Ok(c) => c,
        Err(_) => return outputs,
    };

    let mut current_output: Option<String> = None;
    let mut current_values: HashMap<String, String> = HashMap::new();

    for line in content.lines() {
        let trimmed = line.trim();

        if trimmed.starts_with('[') {
            if let Some(ref name) = current_output {
                if !current_values.is_empty() {
                    outputs.insert(name.clone(), current_values.clone());
                }
            }
            current_values.clear();

            let section = &trimmed[1..trimmed.len() - 1];
            if section.starts_with("output:") {
                let output_name = section.strip_prefix("output:").unwrap_or("").to_string();
                current_output = if output_name.is_empty() { None } else { Some(output_name) };
            } else {
                current_output = None;
            }
            continue;
        }

        if current_output.is_some() && trimmed.contains('=') && !trimmed.starts_with('#') {
            if let Some(eq_pos) = trimmed.find('=') {
                let key = trimmed[..eq_pos].trim().to_string();
                let value = trimmed[eq_pos + 1..].trim().to_string();
                current_values.insert(key, value);
            }
        }
    }

    if let Some(ref name) = current_output {
        if !current_values.is_empty() {
            outputs.insert(name.clone(), current_values);
        }
    }

    outputs
}

/// ── Main detection logic ─────────────────────────────────────────────
fn detect_via_edid() -> Vec<DetectedMonitor> {
    let wayfire_configs = get_wayfire_output_configs();
    let connectors = get_drm_connectors();

    connectors
        .into_iter()
        .map(|(name, status)| {
            let connected = status == "connected";
            let modes = if connected {
                parse_edid_modes(&name)
            } else {
                Vec::new()
            };

            let config = wayfire_configs.get(&name).cloned();

            DetectedMonitor {
                name,
                connected,
                available_modes: modes,
                wayfire_config: config,
            }
        })
        .collect()
}

#[tauri::command]
pub async fn get_detected_monitors() -> Result<Vec<DetectedMonitor>, String> {
    log_debug("Detectando monitores...");

    // Primary: wlr-randr gives position/scale/transform + current mode
    if let Some(monitors) = try_wlr_randr() {
        let wayfire_configs = get_wayfire_output_configs();
        let mut result = Vec::new();

        for mut monitor in monitors {
            // Merge with wayfire.ini for any missing config
            if monitor.wayfire_config.is_none() {
                if let Some(cfg) = wayfire_configs.get(&monitor.name) {
                    monitor.wayfire_config = Some(cfg.clone());
                }
            }
            // Also enrich with EDID modes if wlr-randr didn't return many
            if monitor.available_modes.len() < 3 {
                let edid_modes = parse_edid_modes(&monitor.name);
                if !edid_modes.is_empty() {
                    monitor.available_modes = edid_modes;
                }
            }
            result.push(monitor);
        }

        return Ok(result);
    }

    log_debug("wlr-randr no disponible, usando EDID + DRM");
    Ok(detect_via_edid())
}

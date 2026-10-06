use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::ffi::OsStr;
use std::fs;
use std::path::Path;
use std::process::Command;

use crate::commands::wayfire_config::WayfireConfig;
use crate::commands::wayfire_ini::{parse_section, section_names, update_section};
use crate::logger::log_debug;

/// Refresh rates live in millihertz all the way through, because that is what
/// the hardware and wayfire both speak. A panel advertising "60 Hz" usually runs
/// at 59.997, and rounding that to 60 asks wayfire for a mode the output does
/// not have — which is how choosing a resolution ended up doing nothing.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct MonitorMode {
    pub width: u32,
    pub height: u32,
    pub refresh_mhz: u32,
    pub is_preferred: bool,
    pub is_current: bool,
}

impl MonitorMode {
    /// The `WIDTHxHEIGHT@REFRESH` wayfire expects. It reads the refresh as
    /// millihertz when it is four digits or more, which is the only way to name
    /// 59.997 Hz exactly.
    ///
    /// A refresh of 0 means "unknown" — the kernel fallback does not carry one.
    /// There we name the resolution alone and let wayfire pick the rate, instead
    /// of asking for a fabricated 60 Hz the panel may not actually have.
    pub fn to_wayfire(&self) -> String {
        if self.refresh_mhz == 0 {
            format!("{}x{}", self.width, self.height)
        } else {
            format!("{}x{}@{}", self.width, self.height, self.refresh_mhz)
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DetectedMonitor {
    pub name: String,
    /// Human name from the EDID ("DELL U2720Q"), for telling two identical
    /// connectors apart in the UI.
    pub description: String,
    pub connected: bool,
    pub enabled: bool,
    pub modes: Vec<MonitorMode>,
    pub position: Position,
    pub scale: f64,
    pub transform: String,
    /// The space the output takes up in the layout, which is what positions are
    /// measured in — not the pixel count of the mode.
    pub logical_width: u32,
    pub logical_height: u32,
    pub has_config: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
pub struct Position {
    pub x: i32,
    pub y: i32,
}

/// Where the state came from, so the UI can say "install wlr-randr" instead of
/// quietly showing a worse answer.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum MonitorSource {
    WlrRandr,
    Kernel,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MonitorReport {
    pub monitors: Vec<DetectedMonitor>,
    pub source: MonitorSource,
}

/// One output as the UI wants it left.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MonitorSetting {
    pub name: String,
    pub enabled: bool,
    pub mode: MonitorMode,
    pub position: Position,
    pub scale: f64,
    pub transform: String,
}

// ── Logical geometry ─────────────────────────────────────────────────────────

/// The size an output occupies in the layout: the mode divided by the scale,
/// with the axes swapped when it is turned on its side.
///
/// This is the arithmetic the page was missing. A 4K panel at scale 2 takes up
/// 1920x1080 of layout space, not 3840x2160 — so placing a second screen at
/// x=3840 left a 1920-wide hole between them, and a pointer cannot cross a
/// hole. That is the "mouse trapped on one monitor" symptom.
pub fn logical_size(width: u32, height: u32, scale: f64, transform: &str) -> (u32, u32) {
    let scale = if scale > 0.0 { scale } else { 1.0 };

    let (width, height) = if is_sideways(transform) {
        (height, width)
    } else {
        (width, height)
    };

    (
        ((width as f64) / scale).round().max(1.0) as u32,
        ((height as f64) / scale).round().max(1.0) as u32,
    )
}

fn is_sideways(transform: &str) -> bool {
    matches!(
        transform.trim(),
        "90" | "270" | "flipped-90" | "flipped-270"
    )
}

// ── Layout ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Rect {
    x: i32,
    y: i32,
    width: i32,
    height: i32,
}

impl Rect {
    fn right(&self) -> i32 {
        self.x + self.width
    }

    fn bottom(&self) -> i32 {
        self.y + self.height
    }

    /// Sharing an edge, with some overlap along it — which is what lets a
    /// pointer move from one output to the other.
    fn touches(&self, other: &Rect) -> bool {
        let vertical_overlap = self.y < other.bottom() && other.y < self.bottom();
        let horizontal_overlap = self.x < other.right() && other.x < self.right();

        (vertical_overlap && (self.right() == other.x || other.right() == self.x))
            || (horizontal_overlap && (self.bottom() == other.y || other.bottom() == self.y))
    }

    fn overlaps(&self, other: &Rect) -> bool {
        self.x < other.right()
            && other.x < self.right()
            && self.y < other.bottom()
            && other.y < self.bottom()
    }
}

fn rect_of(setting: &MonitorSetting) -> Rect {
    let (width, height) = logical_size(
        setting.mode.width,
        setting.mode.height,
        setting.scale,
        &setting.transform,
    );

    Rect {
        x: setting.position.x,
        y: setting.position.y,
        width: width as i32,
        height: height as i32,
    }
}

/// Slides the whole layout so its top-left corner sits at 0,0.
///
/// This is what lets the 4K screen go on the left. Asking for it means the other
/// screen has to start at a positive x and the 4K at zero — dragging it left
/// used to produce negative coordinates that were either refused or applied as
/// an odd offset. Moving everything together changes nothing about how the
/// screens sit relative to each other, which is all the user asked for.
pub fn normalize(settings: &mut [MonitorSetting]) {
    let rects: Vec<Rect> = settings
        .iter()
        .filter(|setting| setting.enabled)
        .map(rect_of)
        .collect();

    let (Some(min_x), Some(min_y)) = (
        rects.iter().map(|rect| rect.x).min(),
        rects.iter().map(|rect| rect.y).min(),
    ) else {
        return;
    };

    for setting in settings.iter_mut().filter(|setting| setting.enabled) {
        setting.position.x -= min_x;
        setting.position.y -= min_y;
    }
}

/// The names of outputs that are not reachable from the first one by stepping
/// between screens that share an edge, plus any that sit on top of each other.
///
/// An unreachable output is one the pointer cannot get to.
pub fn disconnected_outputs(settings: &[MonitorSetting]) -> Vec<String> {
    let enabled: Vec<&MonitorSetting> = settings.iter().filter(|s| s.enabled).collect();
    if enabled.len() < 2 {
        return Vec::new();
    }

    let rects: Vec<Rect> = enabled.iter().map(|setting| rect_of(setting)).collect();

    let mut reached = vec![false; enabled.len()];
    let mut queue = vec![0usize];
    reached[0] = true;

    while let Some(index) = queue.pop() {
        for (other, rect) in rects.iter().enumerate() {
            if reached[other] {
                continue;
            }
            // Overlapping counts as reachable: it is a mistake of its own, but
            // not one that strands the pointer.
            if rects[index].touches(rect) || rects[index].overlaps(rect) {
                reached[other] = true;
                queue.push(other);
            }
        }
    }

    enabled
        .iter()
        .zip(reached)
        .filter(|(_, reached)| !reached)
        .map(|(setting, _)| setting.name.clone())
        .collect()
}

pub fn overlapping_outputs(settings: &[MonitorSetting]) -> Vec<String> {
    let enabled: Vec<&MonitorSetting> = settings.iter().filter(|s| s.enabled).collect();
    let rects: Vec<Rect> = enabled.iter().map(|setting| rect_of(setting)).collect();
    let mut names = Vec::new();

    for (index, rect) in rects.iter().enumerate() {
        if rects
            .iter()
            .enumerate()
            .any(|(other, candidate)| other != index && rect.overlaps(candidate))
        {
            names.push(enabled[index].name.clone());
        }
    }

    names
}

// ── wlr-randr ────────────────────────────────────────────────────────────────

/// Hay wlr-randr si existe un ejecutable `wlr-randr` en el PATH.
///
/// No se comprueba corriéndolo: wlr-randr 0.5 no reconoce `--version` —nunca fue
/// un flag válido— y sale con código 1, así que `--version` daba siempre false
/// aunque wlr-randr estuviera instalado y funcionara. El síntoma era la UI
/// pidiendo instalar wlr-randr y mostrando la frecuencia como «—» —porque la
/// detección se caía al respaldo del kernel— con wlr-randr presente. Alcanza con
/// mirar el PATH; si está, `get_detected_monitors` lo corre a secas y parsea sus
/// modos reales.
fn wlr_randr_available() -> bool {
    std::env::var_os("PATH")
        .map(|path| binary_in_path("wlr-randr", &path))
        .unwrap_or(false)
}

/// ¿Hay un ejecutable `name` en alguna de las carpetas del `path` dado?
///
/// Recibe el valor de PATH como argumento, en vez de leerlo del entorno, para
/// poder probarlo con un directorio temporal.
fn binary_in_path(name: &str, path: &OsStr) -> bool {
    std::env::split_paths(path).any(|dir| dir.join(name).is_file())
}

/// Parses `wlr-randr`'s report.
///
/// Note what is *not* here: a check for the word "connected". wlr-randr only
/// ever lists outputs that are connected, and looking for a word it never
/// prints marked every screen as absent — which then skipped every mode,
/// position, scale and transform that followed, and left the page inventing
/// 1920x1080 at 0,0 for all of them.
pub fn parse_wlr_randr(output: &str) -> Vec<DetectedMonitor> {
    let mut monitors: Vec<DetectedMonitor> = Vec::new();

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        // An output header is the only thing written hard against the margin.
        if !line.starts_with(char::is_whitespace) {
            let Some(name) = trimmed.split_whitespace().next() else {
                continue;
            };
            let description = trimmed
                .split_once('"')
                .and_then(|(_, rest)| rest.rsplit_once('"').map(|(inside, _)| inside))
                .unwrap_or("")
                .to_string();

            monitors.push(DetectedMonitor {
                name: name.to_string(),
                description,
                connected: true,
                enabled: true,
                modes: Vec::new(),
                position: Position { x: 0, y: 0 },
                scale: 1.0,
                transform: "normal".to_string(),
                logical_width: 0,
                logical_height: 0,
                has_config: false,
            });
            continue;
        }

        let Some(monitor) = monitors.last_mut() else {
            continue;
        };

        if let Some(mode) = parse_wlr_randr_mode(trimmed) {
            monitor.modes.push(mode);
        } else if let Some(value) = trimmed.strip_prefix("Position:") {
            if let Some(position) = parse_position(value.trim()) {
                monitor.position = position;
            }
        } else if let Some(value) = trimmed.strip_prefix("Scale:") {
            if let Ok(scale) = value.trim().parse::<f64>() {
                if scale > 0.0 {
                    monitor.scale = scale;
                }
            }
        } else if let Some(value) = trimmed.strip_prefix("Transform:") {
            monitor.transform = value.trim().to_string();
        } else if let Some(value) = trimmed.strip_prefix("Enabled:") {
            monitor.enabled = value.trim().eq_ignore_ascii_case("yes");
        }
    }

    for monitor in &mut monitors {
        fill_logical_size(monitor);
    }

    monitors
}

/// "  1920x1080 px, 59.997002 Hz (preferred, current)"
fn parse_wlr_randr_mode(line: &str) -> Option<MonitorMode> {
    let (resolution, rest) = line.split_once("px,")?;
    let (width, height) = parse_resolution(resolution.trim())?;

    let hertz = rest.split_whitespace().next()?.parse::<f64>().ok()?;

    Some(MonitorMode {
        width,
        height,
        refresh_mhz: (hertz * 1000.0).round() as u32,
        is_preferred: line.contains("preferred"),
        is_current: line.contains("current"),
    })
}

fn parse_resolution(text: &str) -> Option<(u32, u32)> {
    let (width, height) = text.trim().split_once('x')?;
    Some((width.trim().parse().ok()?, height.trim().parse().ok()?))
}

fn parse_position(text: &str) -> Option<Position> {
    let (x, y) = text.trim().split_once(',')?;
    Some(Position {
        x: x.trim().parse().ok()?,
        y: y.trim().parse().ok()?,
    })
}

fn fill_logical_size(monitor: &mut DetectedMonitor) {
    let current = monitor
        .modes
        .iter()
        .find(|mode| mode.is_current)
        .or_else(|| monitor.modes.iter().find(|mode| mode.is_preferred))
        .or_else(|| monitor.modes.first());

    if let Some(mode) = current {
        let (width, height) =
            logical_size(mode.width, mode.height, monitor.scale, &monitor.transform);
        monitor.logical_width = width;
        monitor.logical_height = height;
    }
}

// ── Kernel fallback ──────────────────────────────────────────────────────────

/// The connectors the kernel knows about, as `(name, connected)`.
///
/// The directory is `cardN-CONNECTOR`, and N is whichever number the GPU landed
/// on — so the prefix is cut at the first dash rather than matched against a
/// hardcoded card0/card1, which missed every machine with a second GPU.
fn drm_connectors() -> Vec<(String, bool)> {
    let root = Path::new("/sys/class/drm");
    let mut connectors = Vec::new();

    for entry in fs::read_dir(root).into_iter().flatten().flatten() {
        let directory = entry.file_name().to_string_lossy().to_string();
        let Some((card, connector)) = directory.split_once('-') else {
            continue;
        };
        if !card.starts_with("card") {
            continue;
        }

        let status = fs::read_to_string(entry.path().join("status")).unwrap_or_default();
        connectors.push((connector.to_string(), status.trim() == "connected"));
    }

    connectors.sort();
    connectors
}

fn connector_path(connector: &str) -> Option<std::path::PathBuf> {
    fs::read_dir("/sys/class/drm")
        .into_iter()
        .flatten()
        .flatten()
        .map(|entry| entry.path())
        .find(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .and_then(|name| name.split_once('-'))
                .map(|(_, name)| name == connector)
                .unwrap_or(false)
        })
}

/// The kernel's own mode list for a connector.
///
/// `/sys/class/drm/*/modes` is the list the driver will actually accept, which
/// is a longer and more truthful list than the timings written in the EDID —
/// the previous fallback read the EDID and offered a single resolution on
/// panels that support several.
fn kernel_modes(connector: &str) -> Vec<MonitorMode> {
    let Some(path) = connector_path(connector) else {
        return Vec::new();
    };

    let Ok(content) = fs::read_to_string(path.join("modes")) else {
        return Vec::new();
    };

    parse_kernel_modes(&content)
}

/// Parses `/sys/class/drm/*/modes`: one `WIDTHxHEIGHT` per line, in the driver's
/// preference order, with the first line the preferred mode.
///
/// sysfs does not carry the refresh, so each mode is left with an unknown rate
/// (0) rather than a fabricated 60 Hz: inventing 60 was exactly what made every
/// panel read as 60 Hz when wlr-randr was missing. `to_wayfire` then names the
/// resolution alone so wayfire picks a rate the output actually has, and the UI
/// shows "—" and asks the user to install wlr-randr.
fn parse_kernel_modes(content: &str) -> Vec<MonitorMode> {
    let mut modes: Vec<MonitorMode> = Vec::new();

    for (index, line) in content.lines().enumerate() {
        let Some((width, height)) = parse_resolution(line.trim()) else {
            continue;
        };
        if modes
            .iter()
            .any(|mode| mode.width == width && mode.height == height)
        {
            continue;
        }

        modes.push(MonitorMode {
            width,
            height,
            refresh_mhz: 0,
            is_preferred: index == 0,
            is_current: false,
        });
    }

    modes
}

// ── Detection ────────────────────────────────────────────────────────────────

fn wayfire_output_configs() -> HashMap<String, HashMap<String, String>> {
    let Ok(content) = WayfireConfig::global().content() else {
        return HashMap::new();
    };

    section_names(&content)
        .into_iter()
        .filter_map(|section| {
            let name = section.strip_prefix("output:")?.to_string();
            Some((name, parse_section(&content, &section)))
        })
        .collect()
}

/// Fills in what the compositor did not tell us from what the file says, so a
/// screen that is configured but currently unplugged still shows its settings.
fn apply_saved_config(monitor: &mut DetectedMonitor, saved: &HashMap<String, String>) {
    monitor.has_config = true;

    if let Some(enabled) = saved.get("enable") {
        monitor.enabled = enabled != "false" && enabled != "0";
    }
    if let Some(position) = saved
        .get("position")
        .and_then(|value| parse_position(value))
    {
        monitor.position = position;
    }
    if let Some(scale) = saved
        .get("scale")
        .and_then(|value| value.parse::<f64>().ok())
    {
        if scale > 0.0 {
            monitor.scale = scale;
        }
    }
    if let Some(transform) = saved.get("transform") {
        monitor.transform = transform.clone();
    }
    if let Some(mode) = saved.get("mode").and_then(|value| parse_saved_mode(value)) {
        if !monitor
            .modes
            .iter()
            .any(|known| known.width == mode.width && known.height == mode.height)
        {
            monitor.modes.push(mode.clone());
        }
        for known in &mut monitor.modes {
            known.is_current = known.width == mode.width
                && known.height == mode.height
                && known.refresh_mhz == mode.refresh_mhz;
        }
    }

    fill_logical_size(monitor);
}

/// `1920x1080@60`, `1920x1080@60000` and `1920x1080` all appear in files people
/// already have; anything under four digits is hertz.
fn parse_saved_mode(value: &str) -> Option<MonitorMode> {
    let value = value.trim();
    let (resolution, refresh) = match value.split_once('@') {
        Some((resolution, refresh)) => (resolution, refresh.trim()),
        None => (value, ""),
    };

    let (width, height) = parse_resolution(resolution)?;
    let refresh_mhz = match refresh.parse::<f64>() {
        Ok(value) if value >= 1000.0 => value.round() as u32,
        Ok(value) if value > 0.0 => (value * 1000.0).round() as u32,
        _ => 60_000,
    };

    Some(MonitorMode {
        width,
        height,
        refresh_mhz,
        is_preferred: false,
        is_current: true,
    })
}

#[tauri::command]
pub async fn get_detected_monitors() -> Result<MonitorReport, String> {
    let saved = wayfire_output_configs();

    let (mut monitors, source) = if wlr_randr_available() {
        let output = Command::new("wlr-randr")
            .output()
            .map_err(|e| format!("No se pudo ejecutar wlr-randr: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("wlr-randr falló: {}", stderr.trim()));
        }

        (
            parse_wlr_randr(&String::from_utf8_lossy(&output.stdout)),
            MonitorSource::WlrRandr,
        )
    } else {
        log_debug("wlr-randr no está instalado; usando la lista de modos del kernel");

        let monitors = drm_connectors()
            .into_iter()
            .map(|(name, connected)| {
                let modes = if connected {
                    kernel_modes(&name)
                } else {
                    Vec::new()
                };

                DetectedMonitor {
                    name,
                    description: String::new(),
                    connected,
                    enabled: connected,
                    modes,
                    position: Position { x: 0, y: 0 },
                    scale: 1.0,
                    transform: "normal".to_string(),
                    logical_width: 0,
                    logical_height: 0,
                    has_config: false,
                }
            })
            .collect();

        (monitors, MonitorSource::Kernel)
    };

    // Anything configured but unplugged is still worth showing.
    for name in saved.keys() {
        if !monitors.iter().any(|monitor| &monitor.name == name) {
            monitors.push(DetectedMonitor {
                name: name.clone(),
                description: String::new(),
                connected: false,
                enabled: false,
                modes: Vec::new(),
                position: Position { x: 0, y: 0 },
                scale: 1.0,
                transform: "normal".to_string(),
                logical_width: 0,
                logical_height: 0,
                has_config: true,
            });
        }
    }

    for monitor in &mut monitors {
        if let Some(values) = saved.get(&monitor.name) {
            apply_saved_config(monitor, values);
        } else {
            fill_logical_size(monitor);
        }
    }

    monitors.sort_by(|a, b| b.connected.cmp(&a.connected).then(a.name.cmp(&b.name)));

    log_debug(&format!("{} salidas detectadas", monitors.len()));
    Ok(MonitorReport { monitors, source })
}

// ── Applying ─────────────────────────────────────────────────────────────────

/// Writes every output in one go.
///
/// One write for the whole layout, not one per screen: the positions only make
/// sense together, and saving them one at a time leaves the file describing a
/// layout that never existed if any of them fails.
#[tauri::command]
pub async fn apply_monitor_layout(
    monitors: Vec<MonitorSetting>,
) -> Result<Vec<MonitorSetting>, String> {
    let mut settings = monitors;

    if !settings.iter().any(|setting| setting.enabled) {
        return Err("Al menos un monitor tiene que quedar encendido.".to_string());
    }

    normalize(&mut settings);

    let stranded = disconnected_outputs(&settings);
    if !stranded.is_empty() {
        return Err(format!(
            "{} quedaría separado del resto: el puntero no podría llegar. Acomodalos pegados.",
            stranded.join(", ")
        ));
    }

    // Esta comprobación estaba escrita y no la llamaba nadie, así que dos
    // monitores apilados se aplicaban igual: uno queda tapando al otro, con el
    // escritorio dibujado en un área que no se ve.
    let apilados = overlapping_outputs(&settings);
    if !apilados.is_empty() {
        return Err(format!(
            "{} queda encima de otro monitor. Acomodalos pegados, sin superponerse.",
            apilados.join(", ")
        ));
    }

    WayfireConfig::global().edit(|content| {
        let mut updated = content.to_string();

        for setting in &settings {
            let mut values = HashMap::new();
            values.insert("enable".to_string(), setting.enabled.to_string());
            values.insert("mode".to_string(), setting.mode.to_wayfire());
            values.insert(
                "position".to_string(),
                format!("{},{}", setting.position.x, setting.position.y),
            );
            values.insert("scale".to_string(), format_scale(setting.scale));
            values.insert("transform".to_string(), setting.transform.clone());

            updated = update_section(
                &updated,
                &format!("output:{}", setting.name),
                &values,
                false,
            );
        }

        updated
    })?;

    log_debug(&format!("Layout de {} salidas aplicado", settings.len()));
    Ok(settings)
}

/// `1` rather than `1.0`: wayfire accepts both, but the file is read by people.
fn format_scale(scale: f64) -> String {
    if (scale - scale.round()).abs() < f64::EPSILON {
        format!("{}", scale.round() as i64)
    } else {
        format!("{}", scale)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Real wlr-randr output. Note there is no such word as "connected"
    /// anywhere in it — the old parser looked for exactly that.
    const WLR_RANDR: &str = r#"eDP-1 "Samsung Display Corp. 0x4141 (eDP-1)"
  Make: Samsung Display Corp.
  Model: 0x4141
  Serial: (null)
  Physical size: 344x194 mm
  Enabled: yes
  Modes:
    1920x1080 px, 59.996768 Hz (preferred, current)
    1920x1080 px, 48.000000 Hz
  Position: 1920,0
  Transform: normal
  Scale: 1.000000
DP-2 "Dell Inc. DELL U2720Q H7MTP83 (DP-2)"
  Make: Dell Inc.
  Model: DELL U2720Q
  Serial: H7MTP83
  Physical size: 600x340 mm
  Enabled: yes
  Modes:
    3840x2160 px, 59.996800 Hz (preferred, current)
    2560x1440 px, 59.950001 Hz
    1920x1080 px, 60.000000 Hz
  Position: 0,0
  Transform: normal
  Scale: 2.000000
"#;

    fn setting(name: &str, width: u32, height: u32, scale: f64, x: i32, y: i32) -> MonitorSetting {
        MonitorSetting {
            name: name.to_string(),
            enabled: true,
            mode: MonitorMode {
                width,
                height,
                refresh_mhz: 60_000,
                is_preferred: true,
                is_current: true,
            },
            position: Position { x, y },
            scale,
            transform: "normal".to_string(),
        }
    }

    #[test]
    fn reads_every_output_wlr_randr_reports() {
        let monitors = parse_wlr_randr(WLR_RANDR);

        assert_eq!(monitors.len(), 2, "{:?}", monitors);
        assert!(
            monitors.iter().all(|monitor| monitor.connected),
            "wlr-randr only lists connected outputs, so every one of them counts"
        );
        assert_eq!(monitors[0].name, "eDP-1");
        assert_eq!(monitors[1].name, "DP-2");
        assert_eq!(
            monitors[1].description,
            "Dell Inc. DELL U2720Q H7MTP83 (DP-2)"
        );
    }

    #[test]
    fn reads_the_settings_that_used_to_be_skipped() {
        let monitors = parse_wlr_randr(WLR_RANDR);

        assert_eq!(monitors[0].position, Position { x: 1920, y: 0 });
        assert_eq!(monitors[1].position, Position { x: 0, y: 0 });
        assert_eq!(monitors[1].scale, 2.0);
        assert_eq!(monitors[0].transform, "normal");
        assert!(monitors[0].enabled);
        assert_eq!(monitors[0].modes.len(), 2);
        assert_eq!(monitors[1].modes.len(), 3);
    }

    /// 59.996768 Hz is not 60 Hz, and asking wayfire for 60 asks for a mode the
    /// panel does not have.
    #[test]
    fn keeps_the_refresh_rate_the_hardware_actually_runs_at() {
        let monitors = parse_wlr_randr(WLR_RANDR);
        let current = monitors[0].modes.iter().find(|m| m.is_current).unwrap();

        assert_eq!(current.refresh_mhz, 59_997);
        assert_eq!(current.to_wayfire(), "1920x1080@59997");
        assert!(current.is_preferred);
    }

    /// Un panel de alta frecuencia como el del bug #147: cada modo tiene que
    /// quedar con su Hz real —144, 120, 60— y no todos aplastados a 60.
    const WLR_RANDR_HIGH_REFRESH: &str = r#"DP-1 "Acme Gaming 0x1234 (DP-1)"
  Make: Acme
  Model: Gaming
  Enabled: yes
  Modes:
    2560x1440 px, 164.835999 Hz (preferred)
    2560x1440 px, 143.998001 Hz
    2560x1440 px, 59.950001 Hz (current)
    1920x1080 px, 120.000000 Hz
  Position: 0,0
  Transform: normal
  Scale: 1.000000
  Adaptive Sync: enabled
"#;

    #[test]
    fn parse_wlr_randr_mode_reads_the_rate_and_the_flags() {
        let high =
            parse_wlr_randr_mode("2560x1440 px, 143.998001 Hz (preferred, current)").unwrap();
        assert_eq!((high.width, high.height), (2560, 1440));
        assert_eq!(high.refresh_mhz, 143_998);
        assert!(high.is_preferred);
        assert!(high.is_current);

        let plain = parse_wlr_randr_mode("1920x1080 px, 119.982002 Hz").unwrap();
        assert_eq!(plain.refresh_mhz, 119_982);
        assert!(!plain.is_preferred);
        assert!(!plain.is_current);

        let only_current = parse_wlr_randr_mode("3840x2160 px, 60.000000 Hz (current)").unwrap();
        assert_eq!(only_current.refresh_mhz, 60_000);
        assert!(!only_current.is_preferred);
        assert!(only_current.is_current);
    }

    /// Las líneas que no son un modo —entre ellas `Adaptive Sync`, que agrega
    /// wlr-randr 0.5— no pueden colarse como un modo inventado.
    #[test]
    fn parse_wlr_randr_mode_ignores_lines_that_are_not_modes() {
        assert!(parse_wlr_randr_mode("Adaptive Sync: disabled").is_none());
        assert!(parse_wlr_randr_mode("Modes:").is_none());
        assert!(parse_wlr_randr_mode("Position: 0,0").is_none());
        assert!(parse_wlr_randr_mode("Make: Acme").is_none());
    }

    #[test]
    fn offers_every_refresh_rate_a_high_refresh_panel_reports() {
        let monitors = parse_wlr_randr(WLR_RANDR_HIGH_REFRESH);
        assert_eq!(monitors.len(), 1);

        // Los tres modos de 1440p conservan su frecuencia; ninguno quedó en 60.
        let rates: Vec<u32> = monitors[0]
            .modes
            .iter()
            .filter(|m| m.width == 2560 && m.height == 1440)
            .map(|m| m.refresh_mhz)
            .collect();
        assert_eq!(rates, vec![164_836, 143_998, 59_950]);

        let preferred = monitors[0].modes.iter().find(|m| m.is_preferred).unwrap();
        assert_eq!(preferred.refresh_mhz, 164_836);
        let current = monitors[0].modes.iter().find(|m| m.is_current).unwrap();
        assert_eq!(current.refresh_mhz, 59_950);

        // La línea `Adaptive Sync` no se contó como un modo de más.
        assert_eq!(monitors[0].modes.len(), 4);
    }

    /// El síntoma del bug: cuando no hay wlr-randr se cae al respaldo del kernel,
    /// que leía sólo la resolución y le ponía 60 Hz a todo. Ahora la frecuencia
    /// queda desconocida (0), no inventada.
    #[test]
    fn kernel_modes_do_not_invent_a_refresh_rate() {
        let content = "2560x1440\n1920x1080\n1920x1080\n1280x720\n";
        let modes = parse_kernel_modes(content);

        assert_eq!(modes.len(), 3, "el 1920x1080 repetido se descarta");
        assert!(
            modes.iter().all(|mode| mode.refresh_mhz == 0),
            "ninguna frecuencia de 60 inventada"
        );
        assert_eq!(modes[0].width, 2560);
        assert!(
            modes[0].is_preferred,
            "la primera línea es el modo preferido"
        );
        assert!(!modes[1].is_preferred);
    }

    /// Un modo sin frecuencia conocida nombra la resolución sola, para que
    /// wayfire elija una que el monitor tenga de verdad en vez de que le pidamos
    /// un 60 Hz que puede no existir.
    #[test]
    fn an_unknown_refresh_names_the_resolution_alone() {
        let unknown = MonitorMode {
            width: 1920,
            height: 1080,
            refresh_mhz: 0,
            is_preferred: true,
            is_current: false,
        };
        assert_eq!(unknown.to_wayfire(), "1920x1080");

        let known = MonitorMode {
            width: 2560,
            height: 1440,
            refresh_mhz: 143_998,
            is_preferred: false,
            is_current: true,
        };
        assert_eq!(known.to_wayfire(), "2560x1440@143998");
    }

    #[test]
    fn a_scaled_screen_takes_up_what_it_takes_up() {
        // The 4K at scale 2 is 1920x1080 of layout, not 3840x2160.
        assert_eq!(logical_size(3840, 2160, 2.0, "normal"), (1920, 1080));
        assert_eq!(logical_size(1920, 1080, 1.0, "normal"), (1920, 1080));
        assert_eq!(logical_size(2560, 1440, 1.25, "normal"), (2048, 1152));
    }

    #[test]
    fn turning_a_screen_sideways_swaps_its_footprint() {
        assert_eq!(logical_size(1920, 1080, 1.0, "90"), (1080, 1920));
        assert_eq!(logical_size(1920, 1080, 1.0, "flipped-270"), (1080, 1920));
        assert_eq!(logical_size(1920, 1080, 1.0, "180"), (1920, 1080));
    }

    /// The 4K goes on the left: the layout slides so it starts at zero instead
    /// of the other screen keeping 0,0 and the 4K needing a negative x.
    #[test]
    fn the_layout_slides_so_the_leftmost_screen_starts_at_zero() {
        let mut settings = vec![
            setting("DP-2", 3840, 2160, 2.0, -1920, 0),
            setting("eDP-1", 1920, 1080, 1.0, 0, 0),
        ];

        normalize(&mut settings);

        assert_eq!(
            settings[0].position,
            Position { x: 0, y: 0 },
            "the 4K is now the origin"
        );
        assert_eq!(
            settings[1].position,
            Position { x: 1920, y: 0 },
            "and the laptop sits immediately to its right"
        );
        assert!(disconnected_outputs(&settings).is_empty());
    }

    /// The bug that trapped the pointer: placing the second screen at the 4K's
    /// *pixel* width instead of its logical width leaves a gap.
    #[test]
    fn a_gap_left_by_ignoring_the_scale_is_reported() {
        let settings = vec![
            setting("DP-2", 3840, 2160, 2.0, 0, 0),
            setting("eDP-1", 1920, 1080, 1.0, 3840, 0),
        ];

        assert_eq!(
            disconnected_outputs(&settings),
            vec!["eDP-1".to_string()],
            "1920 logical wide, so anything at x=3840 is stranded"
        );
    }

    #[test]
    fn screens_that_share_an_edge_are_reachable() {
        let settings = vec![
            setting("DP-2", 3840, 2160, 2.0, 0, 0),
            setting("eDP-1", 1920, 1080, 1.0, 1920, 0),
        ];

        assert!(disconnected_outputs(&settings).is_empty());
        assert!(overlapping_outputs(&settings).is_empty());
    }

    #[test]
    fn stacking_screens_vertically_is_fine_too() {
        let settings = vec![
            setting("DP-2", 1920, 1080, 1.0, 0, 0),
            setting("eDP-1", 1920, 1080, 1.0, 0, 1080),
        ];

        assert!(disconnected_outputs(&settings).is_empty());
    }

    /// Touching only at the corner is not a crossing a pointer can make.
    #[test]
    fn a_corner_is_not_a_shared_edge() {
        let settings = vec![
            setting("A", 1920, 1080, 1.0, 0, 0),
            setting("B", 1920, 1080, 1.0, 1920, 1080),
        ];

        assert_eq!(disconnected_outputs(&settings), vec!["B".to_string()]);
    }

    #[test]
    fn screens_on_top_of_each_other_are_reported() {
        let settings = vec![
            setting("A", 1920, 1080, 1.0, 0, 0),
            setting("B", 1920, 1080, 1.0, 960, 0),
        ];

        assert_eq!(overlapping_outputs(&settings).len(), 2);
    }

    #[test]
    fn a_disabled_screen_does_not_strand_anything() {
        let mut settings = vec![
            setting("A", 1920, 1080, 1.0, 0, 0),
            setting("B", 1920, 1080, 1.0, 9999, 9999),
        ];
        settings[1].enabled = false;

        assert!(disconnected_outputs(&settings).is_empty());
    }

    #[test]
    fn reads_back_the_mode_formats_that_exist_in_the_wild() {
        assert_eq!(
            parse_saved_mode("1920x1080@60").unwrap().refresh_mhz,
            60_000
        );
        assert_eq!(
            parse_saved_mode("1920x1080@59997").unwrap().refresh_mhz,
            59_997
        );
        assert_eq!(parse_saved_mode("3840x2160").unwrap().width, 3840);
        assert_eq!(
            parse_saved_mode("1920x1080@60").unwrap().to_wayfire(),
            "1920x1080@60000"
        );
        assert!(parse_saved_mode("garbage").is_none());
    }

    #[test]
    fn the_saved_file_wins_over_a_guess() {
        let mut monitor = parse_wlr_randr(WLR_RANDR).remove(1);
        let saved: HashMap<String, String> = [
            ("position".to_string(), "0,0".to_string()),
            ("scale".to_string(), "1".to_string()),
            ("mode".to_string(), "2560x1440@59950".to_string()),
        ]
        .into_iter()
        .collect();

        apply_saved_config(&mut monitor, &saved);

        assert_eq!(monitor.scale, 1.0);
        assert_eq!(monitor.logical_width, 2560, "scale 1 now, so no halving");
        assert!(monitor.has_config);
        let current = monitor.modes.iter().find(|mode| mode.is_current).unwrap();
        assert_eq!(current.width, 2560);
    }

    #[test]
    fn scale_is_written_the_way_a_person_would() {
        assert_eq!(format_scale(1.0), "1");
        assert_eq!(format_scale(2.0), "2");
        assert_eq!(format_scale(1.25), "1.25");
    }

    // ── Detección de wlr-randr en el PATH ──────────────────────────────────

    use std::env;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU32, Ordering};

    /// Un directorio temporal propio que se borra solo al salir del test, para no
    /// sumar una dependencia (`tempfile`) sólo para estas pruebas.
    struct TempDir(PathBuf);

    impl TempDir {
        fn new() -> Self {
            static COUNTER: AtomicU32 = AtomicU32::new(0);
            let unique = COUNTER.fetch_add(1, Ordering::Relaxed);
            let mut path = env::temp_dir();
            path.push(format!(
                "vasak-settings-path-test-{}-{}",
                std::process::id(),
                unique
            ));
            fs::create_dir_all(&path).unwrap();
            TempDir(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }

        /// Crea un archivo (vacío) con ese nombre dentro del directorio.
        fn touch(&self, name: &str) -> PathBuf {
            let file = self.0.join(name);
            fs::write(&file, b"").unwrap();
            file
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn binary_in_path_lo_encuentra_cuando_esta() {
        let dir = TempDir::new();
        dir.touch("wlr-randr");

        let path = env::join_paths([dir.path()]).unwrap();
        assert!(binary_in_path("wlr-randr", &path));
    }

    #[test]
    fn binary_in_path_da_false_cuando_no_esta() {
        // Un directorio que existe pero no tiene el binario.
        let dir = TempDir::new();

        let path = env::join_paths([dir.path()]).unwrap();
        assert!(!binary_in_path("wlr-randr", &path));
    }

    #[test]
    fn binary_in_path_recorre_todas_las_entradas_del_path() {
        // El binario está en la segunda de varias carpetas: igual tiene que
        // encontrarse, no sólo si está en la primera.
        let empty = TempDir::new();
        let with_binary = TempDir::new();
        with_binary.touch("wlr-randr");
        let other = TempDir::new();

        let path = env::join_paths([empty.path(), with_binary.path(), other.path()]).unwrap();
        assert!(binary_in_path("wlr-randr", &path));
    }

    #[test]
    fn binary_in_path_ignora_un_directorio_con_ese_nombre() {
        // `wlr-randr` como carpeta no es un ejecutable: `is_file()` lo descarta.
        let dir = TempDir::new();
        fs::create_dir(dir.path().join("wlr-randr")).unwrap();

        let path = env::join_paths([dir.path()]).unwrap();
        assert!(!binary_in_path("wlr-randr", &path));
    }

    #[test]
    fn binary_in_path_con_un_path_vacio_da_false() {
        assert!(!binary_in_path("wlr-randr", OsStr::new("")));
    }

    #[test]
    fn binary_in_path_ignora_una_carpeta_inexistente() {
        // Una entrada del PATH que no existe no puede traer el binario ni romper
        // la búsqueda.
        let dir = TempDir::new();
        let missing = dir.path().join("no-existe");

        let path = env::join_paths([missing.as_path()]).unwrap();
        assert!(!binary_in_path("wlr-randr", &path));
    }
}

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use zbus::Connection;

use crate::logger::{log_debug, log_error};

const LOGIND_DEST: &str = "org.freedesktop.login1";
const SESSION_PATH: &str = "/org/freedesktop/login1/session/auto";
const SESSION_IFACE: &str = "org.freedesktop.login1.Session";

const BACKLIGHT_ROOT: &str = "/sys/class/backlight";
/// VCP feature 0x10 is "Brightness" in the DDC/CI standard.
const VCP_BRIGHTNESS: &str = "10";

/// How a screen's brightness can be reached.
///
/// A laptop panel has a backlight the kernel drives. An external monitor has no
/// backlight device at all: the only way to its brightness is DDC/CI, a control
/// channel that rides on the video cable and answers over i2c. They are
/// different mechanisms, which is why one slider for "the brightness" could
/// never work on a desk with two screens.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum BrightnessKind {
	/// /sys/class/backlight, written through logind.
	Backlight,
	/// DDC/CI over i2c, through ddcutil.
	Ddc,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MonitorBrightness {
	/// The DRM connector, so the UI can line this up with the monitor list.
	pub output: String,
	pub kind: BrightnessKind,
	/// The backlight device name, or the ddcutil display number.
	pub handle: String,
	pub percent: u8,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BrightnessReport {
	pub monitors: Vec<MonitorBrightness>,
	/// Why an external screen is missing from the list, when one is.
	pub ddc_hint: Option<String>,
}

// ── Internal panels ──────────────────────────────────────────────────────────

fn read_number(path: &PathBuf) -> Option<u32> {
	fs::read_to_string(path).ok()?.trim().parse().ok()
}

/// The connector a backlight belongs to.
///
/// Nothing in sysfs links the two directly, but a machine has one internal
/// panel and it is always the eDP/LVDS/DSI connector — external screens never
/// have a backlight device.
fn internal_connector(connectors: &[String]) -> Option<String> {
	connectors
		.iter()
		.find(|name| {
			let name = name.to_ascii_lowercase();
			name.starts_with("edp") || name.starts_with("lvds") || name.starts_with("dsi")
		})
		.cloned()
}

fn backlight_devices() -> Vec<(String, u32, u32)> {
	let mut devices = Vec::new();

	for entry in fs::read_dir(BACKLIGHT_ROOT).into_iter().flatten().flatten() {
		let path = entry.path();
		let Some(name) = entry.file_name().to_str().map(str::to_string) else {
			continue;
		};
		let (Some(brightness), Some(max)) = (
			read_number(&path.join("brightness")),
			read_number(&path.join("max_brightness")),
		) else {
			continue;
		};
		if max == 0 {
			continue;
		}

		devices.push((name, brightness, max));
	}

	devices.sort();
	devices
}

// ── External screens, over DDC/CI ────────────────────────────────────────────

fn ddcutil_available() -> bool {
	Command::new("ddcutil")
		.arg("--version")
		.output()
		.map(|output| output.status.success())
		.unwrap_or(false)
}

/// Maps DRM connectors to ddcutil display numbers, from `ddcutil detect`.
///
/// The connector is what ties a ddcutil display to the monitor the rest of the
/// page is talking about; matching on the model name instead would put the
/// slider on the wrong screen the moment someone owns two of the same monitor.
pub fn parse_ddcutil_detect(output: &str) -> Vec<(String, String)> {
	let mut pairs = Vec::new();
	let mut display: Option<String> = None;

	for line in output.lines() {
		let trimmed = line.trim();

		if let Some(number) = trimmed.strip_prefix("Display ") {
			let number = number.trim();
			display = number.chars().all(|c| c.is_ascii_digit()).then(|| number.to_string());
			continue;
		}

		if let Some(connector) = trimmed.strip_prefix("DRM connector:") {
			// "card1-DP-2" — the card number is the GPU's, not the screen's.
			let connector = connector.trim();
			let connector = connector
				.split_once('-')
				.filter(|(card, _)| card.starts_with("card"))
				.map(|(_, name)| name)
				.unwrap_or(connector);

			if let Some(number) = display.take() {
				pairs.push((connector.to_string(), number));
			}
		}
	}

	pairs
}

/// `ddcutil getvcp 10 --brief` answers "VCP 10 C 45 100": current then maximum.
pub fn parse_vcp_brightness(output: &str) -> Option<u8> {
	let line = output.lines().find(|line| line.trim_start().starts_with("VCP"))?;
	let fields: Vec<&str> = line.split_whitespace().collect();

	let current: u32 = fields.get(3)?.parse().ok()?;
	let max: u32 = fields.get(4)?.parse().ok()?;
	if max == 0 {
		return None;
	}

	Some(((current * 100) / max).min(100) as u8)
}

fn ddcutil(args: &[&str]) -> Result<String, String> {
	let output = Command::new("ddcutil")
		.args(args)
		.output()
		.map_err(|e| format!("No se pudo ejecutar ddcutil: {}", e))?;

	if !output.status.success() {
		let stderr = String::from_utf8_lossy(&output.stderr);
		return Err(format!("ddcutil {:?} falló: {}", args, stderr.trim()));
	}

	Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Whether the user can talk to i2c at all.
///
/// DDC/CI needs read/write on /dev/i2c-*, which on Arch means the i2c group and
/// the module loaded. Saying so is worth more than an empty list.
fn ddc_hint() -> Option<String> {
	if !ddcutil_available() {
		return Some(
			"Instalá ddcutil para controlar el brillo de los monitores externos.".to_string(),
		);
	}

	let readable = fs::read_dir("/dev")
		.into_iter()
		.flatten()
		.flatten()
		.any(|entry| {
			entry
				.file_name()
				.to_string_lossy()
				.starts_with("i2c-")
		});

	if !readable {
		return Some(
			"Falta el módulo i2c-dev: sin él no se puede ajustar el brillo por DDC/CI."
				.to_string(),
		);
	}

	None
}

// ── Commands ─────────────────────────────────────────────────────────────────

/// The brightness of every screen that has a way to be dimmed, one entry each.
#[tauri::command]
pub async fn get_monitor_brightness(outputs: Vec<String>) -> Result<BrightnessReport, String> {
	let mut monitors = Vec::new();

	if let (Some(connector), Some((name, brightness, max))) = (
		internal_connector(&outputs),
		backlight_devices().into_iter().next(),
	) {
		monitors.push(MonitorBrightness {
			output: connector,
			kind: BrightnessKind::Backlight,
			handle: name,
			percent: ((brightness as u64 * 100) / max as u64).min(100) as u8,
		});
	}

	let mut hint = ddc_hint();

	if hint.is_none() {
		match ddcutil(&["detect", "--brief"]) {
			Ok(detected) => {
				for (connector, display) in parse_ddcutil_detect(&detected) {
					if !outputs.iter().any(|output| output == &connector) {
						continue;
					}

					let percent = ddcutil(&["--display", &display, "getvcp", VCP_BRIGHTNESS, "--brief"])
						.ok()
						.and_then(|value| parse_vcp_brightness(&value));

					if let Some(percent) = percent {
						monitors.push(MonitorBrightness {
							output: connector,
							kind: BrightnessKind::Ddc,
							handle: display,
							percent,
						});
					}
				}
			}
			Err(error) => {
				log_error(&error);
				hint = Some(
					"No se pudo consultar los monitores por DDC/CI. Revisá que tu usuario esté en el grupo i2c."
						.to_string(),
				);
			}
		}
	}

	Ok(BrightnessReport {
		monitors,
		ddc_hint: hint,
	})
}

#[tauri::command]
pub async fn set_monitor_brightness(
	kind: BrightnessKind,
	handle: String,
	percent: u8,
) -> Result<(), String> {
	let percent = percent.clamp(1, 100);

	match kind {
		BrightnessKind::Backlight => set_backlight(&handle, percent).await,
		BrightnessKind::Ddc => {
			ddcutil(&[
				"--display",
				&handle,
				"setvcp",
				VCP_BRIGHTNESS,
				&percent.to_string(),
			])?;
			log_debug(&format!("Brillo DDC/CI de la pantalla {} → {}%", handle, percent));
			Ok(())
		}
	}
}

/// logind grants the user on the active seat write access to their own
/// backlight, so this needs neither root nor a polkit prompt.
async fn set_backlight(device: &str, percent: u8) -> Result<(), String> {
	let max = backlight_devices()
		.into_iter()
		.find(|(name, _, _)| name == device)
		.map(|(_, _, max)| max)
		.ok_or_else(|| format!("No existe el backlight «{}»", device))?;

	let raw = ((max as u64 * percent as u64) / 100).max(1) as u32;

	let connection = Connection::system()
		.await
		.map_err(|e| format!("No se pudo conectar al bus del sistema: {}", e))?;

	zbus::Proxy::new(&connection, LOGIND_DEST, SESSION_PATH, SESSION_IFACE)
		.await
		.map_err(|e| format!("No se pudo acceder a la sesión de logind: {}", e))?
		.call::<_, _, ()>("SetBrightness", &("backlight", device, raw))
		.await
		.map_err(|e| {
			let msg = format!("No se pudo ajustar el brillo: {}", e);
			log_error(&msg);
			msg
		})?;

	log_debug(&format!("Brillo de {} → {}%", device, percent));
	Ok(())
}

#[cfg(test)]
mod tests {
	use super::*;

	/// Real `ddcutil detect --brief` output for two screens.
	const DETECT: &str = r#"Display 1
   I2C bus:             /dev/i2c-4
   DRM connector:       card1-DP-2
   Monitor:             DEL:DELL U2720Q:H7MTP83

Display 2
   I2C bus:             /dev/i2c-5
   DRM connector:       card1-HDMI-A-1
   Monitor:             ACI:ASUS VS239:F8LMQS027497

Invalid display
   I2C bus:             /dev/i2c-8
   Monitor:             :
"#;

	#[test]
	fn maps_each_screen_to_its_connector() {
		let pairs = parse_ddcutil_detect(DETECT);

		assert_eq!(
			pairs,
			vec![
				("DP-2".to_string(), "1".to_string()),
				("HDMI-A-1".to_string(), "2".to_string()),
			],
			"the card prefix is the GPU's and has to go"
		);
	}

	/// Two of the same monitor is exactly when matching on the model breaks.
	#[test]
	fn two_identical_monitors_stay_apart() {
		let output = "Display 1\n   DRM connector: card0-DP-1\n   Monitor: DEL:U2720Q:ABC\n\
		              Display 2\n   DRM connector: card0-DP-2\n   Monitor: DEL:U2720Q:ABC\n";

		assert_eq!(
			parse_ddcutil_detect(output),
			vec![
				("DP-1".to_string(), "1".to_string()),
				("DP-2".to_string(), "2".to_string()),
			]
		);
	}

	#[test]
	fn a_screen_without_a_connector_is_skipped() {
		assert_eq!(parse_ddcutil_detect("Display 3\n   Monitor: X\n"), vec![]);
	}

	#[test]
	fn reads_the_brightness_out_of_a_vcp_answer() {
		assert_eq!(parse_vcp_brightness("VCP 10 C 45 100"), Some(45));
		assert_eq!(parse_vcp_brightness("VCP 10 C 50 200"), Some(25));
		assert_eq!(parse_vcp_brightness("VCP 10 C 0 100"), Some(0));
	}

	#[test]
	fn refuses_to_invent_a_brightness() {
		assert_eq!(parse_vcp_brightness("DDC communication failed"), None);
		assert_eq!(parse_vcp_brightness("VCP 10 C 45"), None);
		assert_eq!(parse_vcp_brightness("VCP 10 C 45 0"), None, "no dividing by zero");
	}

	#[test]
	fn the_internal_panel_is_the_one_the_backlight_belongs_to() {
		let outputs = vec![
			"DP-2".to_string(),
			"eDP-1".to_string(),
			"HDMI-A-1".to_string(),
		];

		assert_eq!(internal_connector(&outputs), Some("eDP-1".to_string()));
		assert_eq!(
			internal_connector(&["DP-1".to_string(), "HDMI-A-1".to_string()]),
			None,
			"a desktop has no internal panel"
		);
	}
}

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::logger::{log_debug, log_error};

#[derive(Debug, Serialize, Deserialize)]
pub struct KeyboardLayout {
	pub code: String,
	pub description: String,
}

#[tauri::command]
pub async fn get_available_locales() -> Result<Vec<String>, String> {
	let output = std::process::Command::new("localectl")
		.arg("list-locales")
		.output()
		.map_err(|e| format!("Error ejecutando localectl: {}", e))?;

	if !output.status.success() {
		let stderr = String::from_utf8_lossy(&output.stderr);
		return Err(format!("localectl falló: {}", stderr));
	}

	let locales: Vec<String> = String::from_utf8_lossy(&output.stdout)
		.lines()
		.map(|l| l.trim().to_string())
		.filter(|l| !l.is_empty())
		.collect();

	log_debug(&format!("{} locales disponibles", locales.len()));
	Ok(locales)
}

#[tauri::command]
pub async fn get_current_locale() -> Result<HashMap<String, String>, String> {
	let output = std::process::Command::new("localectl")
		.arg("status")
		.output()
		.map_err(|e| format!("Error ejecutando localectl: {}", e))?;

	if !output.status.success() {
		let stderr = String::from_utf8_lossy(&output.stderr);
		return Err(format!("localectl falló: {}", stderr));
	}

	let mut locale_map = HashMap::new();
	for line in String::from_utf8_lossy(&output.stdout).lines() {
		let trimmed = line.trim();
		if let Some(eq_pos) = trimmed.find('=') {
			let key = trimmed[..eq_pos].trim().to_string();
			let value = trimmed[eq_pos + 1..].trim().to_string();
			if !key.is_empty() {
				locale_map.insert(key, value);
			}
		}
	}

	Ok(locale_map)
}

#[tauri::command]
pub async fn set_system_locale(locale: String) -> Result<(), String> {
	if locale.is_empty() {
		return Err("Locale vacío".to_string());
	}

	let output = std::process::Command::new("localectl")
		.args(["set-locale", &format!("LANG={}", locale)])
		.output()
		.map_err(|e| format!("Error ejecutando localectl: {}", e))?;

	if !output.status.success() {
		let stderr = String::from_utf8_lossy(&output.stderr);
		return Err(format!("Error al establecer locale: {}", stderr));
	}

	log_debug(&format!("Locale establecido a LANG={}", locale));
	Ok(())
}

#[tauri::command]
pub async fn get_available_keyboard_layouts() -> Result<Vec<KeyboardLayout>, String> {
	let output = std::process::Command::new("localectl")
		.args(["list-x11-keymap-layouts"])
		.output()
		.map_err(|e| format!("Error ejecutando localectl: {}", e))?;

	if !output.status.success() {
		let stderr = String::from_utf8_lossy(&output.stderr);
		return Err(format!("localectl falló: {}", stderr));
	}

	let raw = String::from_utf8_lossy(&output.stdout).to_string();

	// Build descriptions from the XKB rules file for better UX
	let descriptions = load_xkb_layout_descriptions();

	let layouts: Vec<KeyboardLayout> = raw
		.lines()
		.map(|l| {
			let code = l.trim().to_string();
			let description = descriptions
				.get(&code)
				.cloned()
				.unwrap_or_else(|| code.to_uppercase());
			KeyboardLayout { code, description }
		})
		.filter(|l| !l.code.is_empty())
		.collect();

	log_debug(&format!("{} layouts de teclado disponibles", layouts.len()));
	Ok(layouts)
}

fn load_xkb_layout_descriptions() -> HashMap<String, String> {
	let mut descriptions = HashMap::new();

	let paths = [
		"/usr/share/X11/xkb/rules/base.lst",
		"/usr/share/X11/xkb/rules/evdev.lst",
	];

	for path in &paths {
		if let Ok(content) = std::fs::read_to_string(path) {
			let mut in_layout = false;
			for line in content.lines() {
				let trimmed = line.trim();
				if trimmed.starts_with("! layout") {
					in_layout = true;
					continue;
				}
				if in_layout {
					if trimmed.starts_with('!') || trimmed.starts_with('#') {
						continue;
					}
					if trimmed.is_empty() {
						in_layout = false;
						continue;
					}
					// Format: "  code      description"
					let parts: Vec<&str> = trimmed.splitn(2, |c: char| c.is_whitespace()).collect();
					if parts.len() == 2 {
						let code = parts[0].trim().to_string();
						let desc = parts[1].trim().to_string();
						if !code.is_empty() && !desc.is_empty() {
							descriptions.insert(code, desc);
						}
					}
				}
			}
			if !descriptions.is_empty() {
				break;
			}
		}
	}

	descriptions
}

#[tauri::command]
pub async fn get_available_keyboard_variants() -> Result<Vec<KeyboardLayout>, String> {
	let output = std::process::Command::new("localectl")
		.args(["list-x11-keymap-variants"])
		.output()
		.map_err(|e| format!("Error ejecutando localectl: {}", e))?;

	if !output.status.success() {
		let stderr = String::from_utf8_lossy(&output.stderr);
		return Err(format!("localectl falló: {}", stderr));
	}

	let raw = String::from_utf8_lossy(&output.stdout).to_string();
	let variants: Vec<KeyboardLayout> = raw
		.lines()
		.map(|l| {
			let code = l.trim().to_string();
			KeyboardLayout {
				description: code.to_uppercase(),
				code: code.clone(),
			}
		})
		.filter(|l| !l.code.is_empty())
		.collect();

	log_debug(&format!("{} variantes de teclado disponibles", variants.len()));
	Ok(variants)
}

#[tauri::command]
pub async fn set_keyboard_layouts(layouts: String, variant: String) -> Result<(), String> {
	let mut values =
		crate::commands::wayfire_ini::read_wayfire_section("input".to_string()).await?;
	values.insert("xkb_layout".to_string(), layouts);
	if !variant.is_empty() {
		values.insert("xkb_variant".to_string(), variant);
	} else {
		values.remove("xkb_variant");
	}

	crate::commands::wayfire_ini::write_wayfire_section("input".to_string(), values).await
}

#[tauri::command]
pub async fn get_keyboard_layouts_from_wayfire() -> Result<(String, String), String> {
	let section =
		crate::commands::wayfire_ini::read_wayfire_section("input".to_string()).await?;
	let layouts = section.get("xkb_layout").cloned().unwrap_or_default();
	let variant = section.get("xkb_variant").cloned().unwrap_or_default();
	Ok((layouts, variant))
}

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use crate::logger::{log_debug, log_error, log_info};

const CUSTOM_PREFIX: &str = "custom_";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShortcutRule {
	pub keys: String,
	pub action: String,
	pub target: String,
}

#[tauri::command]
pub async fn get_shortcuts() -> Result<Vec<ShortcutRule>, String> {
	let path = get_wayfire_path()?;

	if !path.exists() {
		log_info("wayfire.ini no encontrado, devolviendo lista vacía");
		return Ok(Vec::new());
	}

	let content = fs::read_to_string(&path).map_err(|error| {
		log_error(&format!("Error leyendo wayfire.ini: {}", error));
		format!("Error leyendo wayfire.ini: {}", error)
	})?;

	Ok(parse_shortcuts(&content))
}

#[tauri::command]
pub async fn save_shortcuts(shortcuts: Vec<ShortcutRule>) -> Result<Vec<ShortcutRule>, String> {
	let path = get_wayfire_path()?;

	let normalized: Vec<ShortcutRule> = shortcuts
		.into_iter()
		.map(|s| ShortcutRule {
			keys: normalize_keys(&s.keys),
			action: "launch".to_string(),
			target: s.target.trim().to_string(),
		})
		.collect();

	let new_content = if path.exists() {
		let content = fs::read_to_string(&path).map_err(|error| {
			log_error(&format!("Error leyendo wayfire.ini: {}", error));
			format!("Error leyendo wayfire.ini: {}", error)
		})?;
		update_command_section(&content, &normalized)
	} else {
		build_new_ini(&normalized)
	};

	if let Some(parent) = path.parent() {
		fs::create_dir_all(parent).map_err(|error| {
			log_error(&format!("Error creando directorio: {}", error));
			format!("Error creando directorio: {}", error)
		})?;
	}

	fs::write(&path, &new_content).map_err(|error| {
		log_error(&format!("Error escribiendo wayfire.ini: {}", error));
		format!("Error escribiendo wayfire.ini: {}", error)
	})?;

	log_debug(&format!("Shortcuts guardados en wayfire.ini ({})", path.display()));
	Ok(normalized)
}

fn get_wayfire_path() -> Result<PathBuf, String> {
	let home = std::env::var("HOME")
		.map(PathBuf::from)
		.ok()
		.or_else(dirs::home_dir)
		.ok_or_else(|| {
			let msg = "No se pudo obtener el directorio home".to_string();
			log_error(&msg);
			msg
		})?;
	Ok(home.join(".config/wayfire.ini"))
}

fn parse_shortcuts(content: &str) -> Vec<ShortcutRule> {
	let mut bindings: HashMap<String, String> = HashMap::new();
	let mut commands: HashMap<String, String> = HashMap::new();
	let mut in_command = false;

	for line in content.lines() {
		let trimmed = line.trim();

		if trimmed.starts_with('[') {
			in_command = trimmed.eq_ignore_ascii_case("[command]");
			continue;
		}

		if !in_command || trimmed.starts_with('#') || trimmed.is_empty() {
			continue;
		}

		if let Some(rest) = trimmed.strip_prefix("binding_") {
			if let Some(eq_pos) = rest.find('=') {
				let name = rest[..eq_pos].trim().to_string();
				let keys = rest[eq_pos + 1..].trim().to_string();
				bindings.insert(name, keys);
			}
		}

		if let Some(rest) = trimmed.strip_prefix("command_") {
			if let Some(eq_pos) = rest.find('=') {
				let name = rest[..eq_pos].trim().to_string();
				let command = rest[eq_pos + 1..].trim().to_string();
				commands.insert(name, command);
			}
		}
	}

	let mut shortcuts = Vec::new();
	for (name, keys) in &bindings {
		if let Some(target) = commands.get(name) {
			shortcuts.push(ShortcutRule {
				keys: wayfire_to_internal_keys(keys),
				action: "launch".to_string(),
				target: target.clone(),
			});
		}
	}

	shortcuts
}

fn update_command_section(content: &str, shortcuts: &[ShortcutRule]) -> String {
	let mut output = String::new();
	let mut in_command = false;
	let mut custom_inserted = false;
	let has_custom = !shortcuts.is_empty();

	for line in content.lines() {
		let trimmed = line.trim();

		if trimmed.starts_with('[') {
			if in_command && has_custom && !custom_inserted {
				append_custom_shortcuts(&mut output, shortcuts);
				custom_inserted = true;
			}
			in_command = trimmed.eq_ignore_ascii_case("[command]");
			output.push_str(line);
			output.push('\n');
			continue;
		}

		if !in_command {
			output.push_str(line);
			output.push('\n');
			continue;
		}

		let skip = trimmed.starts_with(&format!("binding_{}", CUSTOM_PREFIX))
			|| trimmed.starts_with(&format!("command_{}", CUSTOM_PREFIX));

		if !skip {
			output.push_str(line);
			output.push('\n');
		}
	}

	if in_command && has_custom && !custom_inserted {
		if !output.ends_with('\n') {
			output.push('\n');
		}
		append_custom_shortcuts(&mut output, shortcuts);
	}

	output
}

fn build_new_ini(shortcuts: &[ShortcutRule]) -> String {
	let mut output = String::from("[command]\n");
	append_custom_shortcuts(&mut output, shortcuts);
	output
}

fn append_custom_shortcuts(output: &mut String, shortcuts: &[ShortcutRule]) {
	for (i, shortcut) in shortcuts.iter().enumerate() {
		let wf_keys = internal_to_wayfire_keys(&shortcut.keys);
		if !output.ends_with('\n') {
			output.push('\n');
		}
		output.push_str(&format!("binding_{}{} = {}\n", CUSTOM_PREFIX, i, wf_keys));
		output.push_str(&format!("command_{}{} = {}\n", CUSTOM_PREFIX, i, shortcut.target));
	}
}

fn wayfire_to_internal_keys(wayfire: &str) -> String {
	let mut parts: Vec<String> = wayfire
		.split_whitespace()
		.map(|token| {
			if token.starts_with('<') && token.ends_with('>') {
				let inner = &token[1..token.len() - 1];
				match inner.to_uppercase().as_str() {
					"CTRL" => "CTRL".to_string(),
					"SHIFT" => "SHIFT".to_string(),
					"ALT" => "ALT".to_string(),
					"SUPER" => "SUPER".to_string(),
					_ => inner.to_uppercase(),
				}
			} else {
				token.to_string()
			}
		})
		.collect();

	parts.sort();
	parts.dedup();
	parts.join("+")
}

fn internal_to_wayfire_keys(internal: &str) -> String {
	internal
		.split('+')
		.map(|key| match key {
			"CTRL" => "<ctrl>",
			"SHIFT" => "<shift>",
			"ALT" => "<alt>",
			"SUPER" => "<super>",
			other => other,
		})
		.collect::<Vec<_>>()
		.join(" ")
}

fn normalize_keys(raw: &str) -> String {
	let mut parts = raw
		.split('+')
		.map(|part| canonical_key_name(part.trim()))
		.filter(|part| !part.is_empty())
		.collect::<Vec<_>>();

	parts.sort();
	parts.dedup();
	parts.join("+")
}

fn canonical_key_name(raw: &str) -> String {
	match raw.to_uppercase().as_str() {
		"CTRL" | "CONTROL" | "KEY_LEFTCTRL" | "KEY_RIGHTCTRL" => String::from("CTRL"),
		"SHIFT" | "KEY_LEFTSHIFT" | "KEY_RIGHTSHIFT" => String::from("SHIFT"),
		"ALT" | "KEY_LEFTALT" | "KEY_RIGHTALT" => String::from("ALT"),
		"SUPER" | "META" | "WIN" | "KEY_LEFTMETA" | "KEY_RIGHTMETA" => String::from("SUPER"),
		other => other.to_string(),
	}
}

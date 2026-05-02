use serde::{Deserialize, Serialize};
use std::fs;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;

use crate::logger::{log_debug, log_error, log_info};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShortcutRule {
	pub keys: String,
	pub action: String,
	pub target: String,
}

#[tauri::command]
pub async fn get_shortcuts() -> Result<Vec<ShortcutRule>, String> {
	let path = get_shortcuts_path()?;

	if !path.exists() {
		log_info(&format!("Archivo de shortcuts inexistente, creando: {}", path.display()));
		ensure_shortcuts_file(&path)?;
		return Ok(Vec::new());
	}

	let content = fs::read_to_string(&path).map_err(|error| {
		log_error(&format!("Error leyendo shortcuts: {}", error));
		format!("Error leyendo shortcuts: {}", error)
	})?;

	if content.trim().is_empty() {
		return Ok(Vec::new());
	}

	serde_json::from_str::<Vec<ShortcutRule>>(&content).map_err(|error| {
		log_error(&format!("Error parseando shortcuts: {}", error));
		format!("Error parseando shortcuts: {}", error)
	})
}

#[tauri::command]
pub async fn save_shortcuts(shortcuts: Vec<ShortcutRule>) -> Result<Vec<ShortcutRule>, String> {
	let path = get_shortcuts_path()?;
	ensure_shortcuts_file(&path)?;

	let normalized = shortcuts
		.into_iter()
		.map(|shortcut| ShortcutRule {
			keys: normalize_keys(&shortcut.keys),
			action: shortcut.action.trim().to_string(),
			target: shortcut.target.trim().to_string(),
		})
		.collect::<Vec<_>>();

	let json = serde_json::to_string_pretty(&normalized).map_err(|error| {
		log_error(&format!("Error serializando shortcuts: {}", error));
		format!("Error serializando shortcuts: {}", error)
	})?;

	write_shortcuts_file(&path, &json)?;

	log_debug(&format!("Shortcuts guardados en {}", path.display()));
	Ok(normalized)
}

fn get_shortcuts_path() -> Result<PathBuf, String> {
	let home = std::env::var("HOME")
		.map(PathBuf::from)
		.ok()
		.or_else(dirs::home_dir)
		.ok_or_else(|| {
		let message = String::from("No se pudo obtener el directorio home");
		log_error(&message);
		message
		})?;

	Ok(home.join(".config/vasak/shortcut.json"))
}

fn write_shortcuts_file(path: &PathBuf, json: &str) -> Result<(), String> {
	if let Err(error) = fs::write(path, json) {
		if error.kind() != std::io::ErrorKind::PermissionDenied {
			log_error(&format!("Error guardando shortcuts: {}", error));
			return Err(format!("Error guardando shortcuts: {}", error));
		}

		// Si el archivo quedó con dueño root, intentamos recrearlo para recuperar permisos.
		if path.exists() {
			if let Err(remove_error) = fs::remove_file(path) {
				let message = format!(
					"Permiso denegado al guardar shortcuts en {}. Si el archivo fue creado con sudo, ejecuta: sudo chown -R $USER:$USER ~/.config/vasak (detalle: {})",
					path.display(),
					remove_error
				);
				log_error(&message);
				return Err(message);
			}
		}

		let mut file = OpenOptions::new()
			.write(true)
			.create(true)
			.truncate(true)
			.open(path)
			.map_err(|open_error| {
				let message = format!(
					"Permiso denegado al guardar shortcuts en {}. Si el directorio pertenece a root, ejecuta: sudo chown -R $USER:$USER ~/.config/vasak (detalle: {})",
					path.display(),
					open_error
				);
				log_error(&message);
				message
			})?;

		file.write_all(json.as_bytes()).map_err(|write_error| {
			let message = format!("Error guardando shortcuts en {}: {}", path.display(), write_error);
			log_error(&message);
			message
		})?;
	}

	Ok(())
}

fn ensure_shortcuts_file(path: &PathBuf) -> Result<(), String> {
	if let Some(parent) = path.parent() {
		fs::create_dir_all(parent).map_err(|error| {
			log_error(&format!("Error creando directorio de shortcuts: {}", error));
			format!("Error creando directorio de shortcuts: {}", error)
		})?;
	}

	if !path.exists() {
		fs::write(path, "[]").map_err(|error| {
			log_error(&format!("Error creando archivo de shortcuts: {}", error));
			format!("Error creando archivo de shortcuts: {}", error)
		})?;
	}

	Ok(())
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
		"SUPER" | "META" | "WIN" | "KEY_LEFTMETA" | "KEY_RIGHTMETA" => {
			String::from("SUPER")
		}
		other => other.to_string(),
	}
}

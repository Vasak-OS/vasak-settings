use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;

use crate::logger::{log_debug, log_error, log_info};

#[derive(Debug, Serialize, Deserialize)]
pub struct SectionData {
	pub values: HashMap<String, String>,
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

fn read_file() -> Result<String, String> {
	let path = get_wayfire_path()?;
	if !path.exists() {
		return Ok(String::new());
	}
	fs::read_to_string(&path).map_err(|e| {
		let msg = format!("Error leyendo wayfire.ini: {}", e);
		log_error(&msg);
		msg
	})
}

fn write_file(content: &str) -> Result<(), String> {
	let path = get_wayfire_path()?;
	if let Some(parent) = path.parent() {
		fs::create_dir_all(parent).map_err(|e| {
			let msg = format!("Error creando directorio: {}", e);
			log_error(&msg);
			msg
		})?;
	}
	fs::write(&path, content).map_err(|e| {
		let msg = format!("Error escribiendo wayfire.ini: {}", e);
		log_error(&msg);
		msg
	})?;
	log_debug(&format!("wayfire.ini actualizado ({})", path.display()));
	Ok(())
}

fn parse_section(content: &str, section: &str) -> HashMap<String, String> {
	let mut values = HashMap::new();
	let mut in_target = false;
	let section_header = format!("[{}]", section);

	for line in content.lines() {
		let trimmed = line.trim();

		if trimmed.starts_with('[') {
			in_target = trimmed.eq_ignore_ascii_case(&section_header);
			continue;
		}

		if !in_target || trimmed.starts_with('#') || trimmed.is_empty() {
			continue;
		}

		if let Some(eq_pos) = trimmed.find('=') {
			let key = trimmed[..eq_pos].trim().to_string();
			let value = trimmed[eq_pos + 1..].trim().to_string();
			values.insert(key, value);
		}
	}

	values
}

/// Reemplaza completamente una sección de wayfire.ini con los valores dados,
/// preservando comentarios, otras secciones, y su formato.
fn replace_section(content: &str, section: &str, values: &HashMap<String, String>) -> String {
	let mut output = String::new();
	let mut in_target = false;
	let mut section_found = false;
	let section_header = format!("[{}]", section);

	for line in content.lines() {
		let trimmed = line.trim();

		if trimmed.starts_with('[') {
			if in_target {
				// write new section values
				write_section_values(&mut output, values);
				in_target = false;
			}
			in_target = trimmed.eq_ignore_ascii_case(&section_header);
			if in_target {
				section_found = true;
			}
			// always write section header
			output.push_str(line);
			output.push('\n');
			continue;
		}

		if !in_target {
			output.push_str(line);
			output.push('\n');
			continue;
		}

		// skip all lines in the target section (we'll replace them)
		// We only skip key=value lines, keep comments and blanks
		if trimmed.starts_with('#') || trimmed.is_empty() {
			output.push_str(line);
			output.push('\n');
		}
		// key=value lines are dropped
	}

	// If we were in the section at EOF, write values
	if in_target {
		write_section_values(&mut output, values);
	}

	// If the section didn't exist, append it at the end
	if !section_found && !values.is_empty() {
		if !output.is_empty() && !output.ends_with('\n') {
			output.push('\n');
		}
		output.push_str(&format!("[{}]\n", section));
		write_section_values(&mut output, values);
	}

	output
}

fn write_section_values(output: &mut String, values: &HashMap<String, String>) {
	let mut keys: Vec<&String> = values.keys().collect();
	keys.sort();
	for key in keys {
		if let Some(value) = values.get(key) {
			if !output.ends_with('\n') {
				output.push('\n');
			}
			output.push_str(&format!("{} = {}\n", key, value));
		}
	}
}

#[tauri::command]
pub async fn read_wayfire_section(section: String) -> Result<HashMap<String, String>, String> {
	log_debug(&format!("Leyendo sección [{}] de wayfire.ini", section));
	let content = read_file()?;
	Ok(parse_section(&content, &section))
}

#[tauri::command]
pub async fn write_wayfire_section(
	section: String,
	values: HashMap<String, String>,
) -> Result<(), String> {
	log_debug(&format!("Escribiendo sección [{}] en wayfire.ini", section));
	let content = read_file()?;
	let new_content = replace_section(&content, &section, &values);
	write_file(&new_content)
}

#[tauri::command]
pub async fn get_all_wayfire_sections() -> Result<Vec<String>, String> {
	let content = read_file()?;
	let mut seen = HashSet::new();
	let mut sections = Vec::new();
	for line in content.lines() {
		let trimmed = line.trim();
		if trimmed.starts_with('[') && trimmed.ends_with(']') {
			let name = trimmed[1..trimmed.len() - 1].trim().to_string();
			if !name.is_empty() && seen.insert(name.clone()) {
				sections.push(name);
			}
		}
	}
	Ok(sections)
}

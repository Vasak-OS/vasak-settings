use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;

use crate::logger::{log_debug, log_error};

#[derive(Debug, Serialize, Deserialize)]
pub struct SectionData {
	pub values: HashMap<String, String>,
}

pub fn get_wayfire_path() -> Result<PathBuf, String> {
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

/// Reads wayfire.ini, tolerating bytes that are not valid UTF-8.
///
/// `read_to_string` refuses the whole file over a single bad byte, and that is
/// not a theoretical risk: a file whose head had been overwritten by something
/// else left a comment cut in the middle of a multi-byte character, and with it
/// every page in this application that touches wayfire.ini stopped loading *and*
/// saving — the keyboard layout among them. Wayfire itself reads the file byte
/// by byte and does not care, so refusing to is a way of being stricter than the
/// compositor for no gain. The broken bytes become replacement characters,
/// which only ever appear inside comments in practice.
pub fn read_file() -> Result<String, String> {
	let path = get_wayfire_path()?;
	if !path.exists() {
		return Ok(String::new());
	}

	let bytes = fs::read(&path).map_err(|e| {
		let msg = format!("Error leyendo wayfire.ini: {}", e);
		log_error(&msg);
		msg
	})?;

	match String::from_utf8(bytes) {
		Ok(content) => Ok(content),
		Err(error) => {
			log_error(&format!(
				"wayfire.ini tiene bytes inválidos en la posición {}; se leyó igual reemplazándolos",
				error.utf8_error().valid_up_to()
			));
			Ok(String::from_utf8_lossy(error.as_bytes()).into_owned())
		}
	}
}

pub fn write_file(content: &str) -> Result<(), String> {
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

fn is_header(trimmed: &str) -> bool {
	trimmed.starts_with('[') && trimmed.ends_with(']')
}

fn header_name(trimmed: &str) -> &str {
	trimmed[1..trimmed.len() - 1].trim()
}

/// A `key = value` entry, which may span several physical lines when the value
/// uses backslash continuations (wayfire writes its plugin list that way).
struct Entry {
	key: String,
	value: String,
	/// Inclusive range of physical line indices the entry occupies.
	start: usize,
	end: usize,
}

/// Where a section lives inside the file, and the entries it contains.
struct SectionSpan {
	header: usize,
	/// Exclusive: index of the next header, or the number of lines.
	end: usize,
	entries: Vec<Entry>,
}

/// Joins a continued value, dropping the trailing backslashes and collapsing the
/// physical lines into the single logical value wayfire sees.
fn join_continuation(lines: &[&str], start: usize) -> (String, usize) {
	let mut parts: Vec<String> = Vec::new();
	let mut index = start;

	loop {
		let raw = lines[index].trim_end();
		let continues = raw.ends_with('\\');
		let piece = if continues {
			raw[..raw.len() - 1].trim_end()
		} else {
			raw
		};

		parts.push(piece.trim().to_string());

		if !continues || index + 1 >= lines.len() {
			break;
		}

		index += 1;
	}

	let joined = parts
		.into_iter()
		.filter(|part| !part.is_empty())
		.collect::<Vec<String>>()
		.join(" ");

	(joined, index)
}

fn find_section(lines: &[&str], section: &str) -> Option<SectionSpan> {
	let mut header_index: Option<usize> = None;
	let mut end = lines.len();

	for (index, line) in lines.iter().enumerate() {
		let trimmed = line.trim();
		if !is_header(trimmed) {
			continue;
		}

		if header_index.is_some() {
			end = index;
			break;
		}

		if header_name(trimmed).eq_ignore_ascii_case(section) {
			header_index = Some(index);
		}
	}

	let header = header_index?;
	let mut entries = Vec::new();
	let mut index = header + 1;

	while index < end {
		let trimmed = lines[index].trim();

		if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with(';') {
			index += 1;
			continue;
		}

		let Some(eq_pos) = trimmed.find('=') else {
			index += 1;
			continue;
		};

		let key = trimmed[..eq_pos].trim().to_string();
		let first_value = trimmed[eq_pos + 1..].trim();

		// Re-run the continuation join over the value part only.
		let (value, last_line) = if first_value.ends_with('\\') {
			let mut parts = vec![first_value[..first_value.len() - 1].trim().to_string()];
			let (rest, last) = join_continuation(lines, index + 1);
			parts.push(rest);
			(
				parts
					.into_iter()
					.filter(|part| !part.is_empty())
					.collect::<Vec<String>>()
					.join(" "),
				last,
			)
		} else {
			(first_value.to_string(), index)
		};

		entries.push(Entry {
			key,
			value,
			start: index,
			end: last_line,
		});

		index = last_line + 1;
	}

	Some(SectionSpan {
		header,
		end,
		entries,
	})
}

pub fn parse_section(content: &str, section: &str) -> HashMap<String, String> {
	let lines: Vec<&str> = content.lines().collect();
	let mut values = HashMap::new();

	if let Some(span) = find_section(&lines, section) {
		for entry in span.entries {
			values.insert(entry.key, entry.value);
		}
	}

	values
}

/// Applies `values` onto a section **without touching anything else**: existing
/// keys are rewritten in place (preserving their position), new keys are
/// appended after the last entry, and keys the caller doesn't know about are
/// left alone — as are comments, blank lines and every other section.
///
/// When `prune` is set, keys present in the file but absent from `values` are
/// removed instead; that is only for sections the UI owns entirely (autostart).
pub fn update_section(
	content: &str,
	section: &str,
	values: &HashMap<String, String>,
	prune: bool,
) -> String {
	let lines: Vec<&str> = content.lines().collect();

	let Some(span) = find_section(&lines, section) else {
		return append_section(content, section, values);
	};

	// Line index -> replacement (None means "drop this line").
	let mut rewritten: HashMap<usize, Option<String>> = HashMap::new();
	let mut handled: HashSet<&str> = HashSet::new();
	let mut insert_after = span.header;

	for entry in &span.entries {
		insert_after = insert_after.max(entry.end);

		match values.get(&entry.key) {
			Some(value) => {
				handled.insert(entry.key.as_str());
				rewritten.insert(entry.start, Some(render_entry(&entry.key, value)));

				for line in (entry.start + 1)..=entry.end {
					rewritten.insert(line, None);
				}
			}
			None if prune => {
				for line in entry.start..=entry.end {
					rewritten.insert(line, None);
				}
			}
			None => {}
		}
	}

	let mut additions: Vec<String> = values
		.iter()
		.filter(|(key, _)| !handled.contains(key.as_str()))
		.map(|(key, value)| render_entry(key, value))
		.collect();
	additions.sort();

	let mut output = String::new();

	for (index, line) in lines.iter().enumerate() {
		match rewritten.get(&index) {
			Some(None) => {}
			Some(Some(replacement)) => {
				output.push_str(replacement);
				output.push('\n');
			}
			None => {
				output.push_str(line);
				output.push('\n');
			}
		}

		if index == insert_after && !additions.is_empty() {
			for addition in &additions {
				output.push_str(addition);
				output.push('\n');
			}
			additions.clear();
		}
	}

	if !additions.is_empty() {
		for addition in &additions {
			output.push_str(addition);
			output.push('\n');
		}
	}

	output
}

fn render_entry(key: &str, value: &str) -> String {
	format!("{} = {}", key, value)
}

/// Replaces `key` with pre-rendered text that may span several physical lines,
/// so callers can keep wayfire's readable backslash-continued style for long
/// values instead of collapsing them onto one line.
pub fn set_key_raw(content: &str, section: &str, key: &str, rendered: &str) -> String {
	let lines: Vec<&str> = content.lines().collect();

	let Some(span) = find_section(&lines, section) else {
		let mut output = content.to_string();

		if !output.is_empty() && !output.ends_with('\n') {
			output.push('\n');
		}
		if !output.is_empty() {
			output.push('\n');
		}

		output.push_str(&format!("[{}]\n{}\n", section, rendered));
		return output;
	};

	let target = span.entries.iter().find(|entry| entry.key == key);
	let mut output = String::new();
	let mut placed = false;

	for (index, line) in lines.iter().enumerate() {
		if let Some(entry) = target {
			if index == entry.start {
				output.push_str(rendered);
				output.push('\n');
				placed = true;
				continue;
			}

			if index > entry.start && index <= entry.end {
				continue;
			}
		}

		output.push_str(line);
		output.push('\n');

		if !placed && target.is_none() && index == span.header {
			output.push_str(rendered);
			output.push('\n');
			placed = true;
		}
	}

	output
}

fn append_section(content: &str, section: &str, values: &HashMap<String, String>) -> String {
	if values.is_empty() {
		return content.to_string();
	}

	let mut output = content.to_string();

	if !output.is_empty() && !output.ends_with('\n') {
		output.push('\n');
	}
	if !output.is_empty() {
		output.push('\n');
	}

	output.push_str(&format!("[{}]\n", section));

	let mut keys: Vec<&String> = values.keys().collect();
	keys.sort();

	for key in keys {
		if let Some(value) = values.get(key) {
			output.push_str(&render_entry(key, value));
			output.push('\n');
		}
	}

	output
}

#[tauri::command]
pub async fn read_wayfire_section(section: String) -> Result<HashMap<String, String>, String> {
	log_debug(&format!("Leyendo sección [{}] de wayfire.ini", section));
	let content = read_file()?;
	Ok(parse_section(&content, &section))
}

/// Merges `values` into the section, preserving keys the UI doesn't manage.
#[tauri::command]
pub async fn write_wayfire_section(
	section: String,
	values: HashMap<String, String>,
) -> Result<(), String> {
	log_debug(&format!("Escribiendo sección [{}] en wayfire.ini", section));
	let content = read_file()?;
	let new_content = update_section(&content, &section, &values, false);
	write_file(&new_content)
}

/// Replaces the section outright: any key not in `values` is removed. Only for
/// sections the UI owns completely, where removing an entry must actually stick.
#[tauri::command]
pub async fn replace_wayfire_section(
	section: String,
	values: HashMap<String, String>,
) -> Result<(), String> {
	log_debug(&format!("Reemplazando sección [{}] en wayfire.ini", section));
	let content = read_file()?;
	let new_content = update_section(&content, &section, &values, true);
	write_file(&new_content)
}

#[tauri::command]
pub async fn get_all_wayfire_sections() -> Result<Vec<String>, String> {
	let content = read_file()?;
	let mut seen = HashSet::new();
	let mut sections = Vec::new();
	for line in content.lines() {
		let trimmed = line.trim();
		if is_header(trimmed) {
			let name = header_name(trimmed).to_string();
			if !name.is_empty() && seen.insert(name.clone()) {
				sections.push(name);
			}
		}
	}
	Ok(sections)
}

#[cfg(test)]
mod tests {
	use super::*;

	const SAMPLE: &str = r#"# Core options
[core]

# Enabled plugins.
plugins = \
  animate \
  autostart \
  blur \
  ipc

close_top_view = <super> KEY_Q | <alt> KEY_F4
vwidth = 3

[grid]
duration = 150
type = regular
slot_c = <super> KEY_UP
"#;

	fn values(pairs: &[(&str, &str)]) -> HashMap<String, String> {
		pairs
			.iter()
			.map(|(k, v)| (k.to_string(), v.to_string()))
			.collect()
	}

	#[test]
	fn parses_a_continued_value_as_one_logical_value() {
		let core = parse_section(SAMPLE, "core");

		assert_eq!(
			core.get("plugins").map(String::as_str),
			Some("animate autostart blur ipc"),
			"the backslash continuation must collapse into a single value"
		);
		assert_eq!(core.get("vwidth").map(String::as_str), Some("3"));
		assert_eq!(
			core.get("close_top_view").map(String::as_str),
			Some("<super> KEY_Q | <alt> KEY_F4")
		);
	}

	#[test]
	fn writing_another_section_leaves_the_plugin_list_intact() {
		let updated = update_section(SAMPLE, "grid", &values(&[("duration", "300")]), false);

		let core = parse_section(&updated, "core");
		assert_eq!(
			core.get("plugins").map(String::as_str),
			Some("animate autostart blur ipc"),
			"editing [grid] must not corrupt [core]"
		);
		assert!(updated.contains("  animate \\"), "continuation lines survive");
	}

	#[test]
	fn merging_preserves_keys_the_ui_does_not_know() {
		let updated = update_section(SAMPLE, "grid", &values(&[("duration", "300")]), false);
		let grid = parse_section(&updated, "grid");

		assert_eq!(grid.get("duration").map(String::as_str), Some("300"));
		assert_eq!(
			grid.get("type").map(String::as_str),
			Some("regular"),
			"a key no view exposes must not be dropped on save"
		);
		assert_eq!(
			grid.get("slot_c").map(String::as_str),
			Some("<super> KEY_UP")
		);
	}

	#[test]
	fn comments_and_ordering_survive_a_write() {
		let updated = update_section(SAMPLE, "core", &values(&[("vwidth", "4")]), false);

		assert!(updated.contains("# Core options"));
		assert!(updated.contains("# Enabled plugins."));
		assert!(updated.contains("vwidth = 4"));
		assert!(
			updated.find("close_top_view").unwrap() < updated.find("vwidth = 4").unwrap(),
			"existing keys keep their position instead of being re-sorted"
		);
	}

	/// The workspaces and windows pages both edit [core] now, which is the very
	/// section holding the continued plugin list.
	#[test]
	fn editing_core_itself_preserves_the_continued_plugin_list() {
		let updated = update_section(
			SAMPLE,
			"core",
			&values(&[("vwidth", "4"), ("vheight", "3")]),
			false,
		);

		let core = parse_section(&updated, "core");
		assert_eq!(
			core.get("plugins").map(String::as_str),
			Some("animate autostart blur ipc")
		);
		assert_eq!(core.get("vwidth").map(String::as_str), Some("4"));
		assert_eq!(core.get("vheight").map(String::as_str), Some("3"));
		assert_eq!(
			core.get("close_top_view").map(String::as_str),
			Some("<super> KEY_Q | <alt> KEY_F4"),
			"unmanaged core keys stay"
		);
		assert!(updated.contains("  animate \\"), "continuation lines intact");
	}

	#[test]
	fn new_keys_are_appended_inside_the_section() {
		let updated = update_section(SAMPLE, "grid", &values(&[("restore", "<super> KEY_DOWN")]), false);
		let grid = parse_section(&updated, "grid");

		assert_eq!(
			grid.get("restore").map(String::as_str),
			Some("<super> KEY_DOWN")
		);
		assert_eq!(grid.get("type").map(String::as_str), Some("regular"));
	}

	#[test]
	fn prune_removes_keys_absent_from_the_payload() {
		let updated = update_section(SAMPLE, "grid", &values(&[("duration", "150")]), true);
		let grid = parse_section(&updated, "grid");

		assert_eq!(grid.len(), 1, "pruning drops unmanaged keys: {:?}", grid);
		assert_eq!(grid.get("duration").map(String::as_str), Some("150"));
	}

	#[test]
	fn a_missing_section_is_appended() {
		let updated = update_section(SAMPLE, "wobbly", &values(&[("friction", "3")]), false);

		assert!(updated.contains("[wobbly]"));
		assert_eq!(
			parse_section(&updated, "wobbly")
				.get("friction")
				.map(String::as_str),
			Some("3")
		);
		assert_eq!(
			parse_section(&updated, "core")
				.get("plugins")
				.map(String::as_str),
			Some("animate autostart blur ipc")
		);
	}

	#[test]
	fn repeated_writes_are_stable() {
		let once = update_section(SAMPLE, "grid", &values(&[("duration", "300")]), false);
		let twice = update_section(&once, "grid", &values(&[("duration", "300")]), false);

		assert_eq!(once, twice, "saving twice must not keep growing the file");
	}
}

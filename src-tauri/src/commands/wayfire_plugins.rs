use serde::Serialize;

use crate::commands::wayfire_ini::{parse_section, read_file, set_key_raw, write_file};
use crate::logger::log_debug;

const CORE_SECTION: &str = "core";
const PLUGINS_KEY: &str = "plugins";

/// Identity of every plugin the settings app knows about.
///
/// Only what the backend is authoritative about lives here: the wayfire plugin
/// name, the group it belongs to, and whether VasakOS depends on it. All the
/// display text is in the locale files, keyed by `id`.
///
/// `required` marks the plugins the desktop shell, the keybindings or the lock
/// screen need, so the UI must not offer a switch for them at all.
struct PluginSpec {
	id: &'static str,
	/// Locale key under `wayfire.plugins.categories`.
	category: &'static str,
	required: bool,
}

const PLUGINS: &[PluginSpec] = &[
	PluginSpec { id: "autostart", category: "system", required: true },
	PluginSpec { id: "command", category: "system", required: true },
	PluginSpec { id: "ipc", category: "system", required: true },
	PluginSpec { id: "ipc-rules", category: "system", required: true },
	PluginSpec { id: "stipc", category: "system", required: true },
	PluginSpec { id: "foreign-toplevel", category: "system", required: true },
	PluginSpec { id: "wayfire-shell", category: "system", required: true },
	PluginSpec { id: "gtk-shell", category: "system", required: true },
	PluginSpec { id: "session-lock", category: "system", required: true },
	PluginSpec { id: "idle", category: "system", required: true },
	PluginSpec { id: "shortcuts-inhibit", category: "system", required: false },
	PluginSpec { id: "move", category: "windows", required: false },
	PluginSpec { id: "resize", category: "windows", required: false },
	PluginSpec { id: "grid", category: "windows", required: false },
	PluginSpec { id: "place", category: "windows", required: false },
	PluginSpec { id: "decoration", category: "windows", required: false },
	PluginSpec { id: "wm-actions", category: "windows", required: false },
	PluginSpec { id: "window-rules", category: "windows", required: false },
	PluginSpec { id: "switcher", category: "windows", required: false },
	PluginSpec { id: "fast-switcher", category: "windows", required: false },
	PluginSpec { id: "vswitch", category: "workspaces", required: false },
	PluginSpec { id: "expo", category: "workspaces", required: false },
	PluginSpec { id: "oswitch", category: "workspaces", required: false },
	PluginSpec { id: "animate", category: "effects", required: false },
	PluginSpec { id: "blur", category: "effects", required: false },
	PluginSpec { id: "zoom", category: "effects", required: false },
	PluginSpec { id: "wobbly", category: "effects", required: false },
	PluginSpec { id: "cube", category: "effects", required: false },
	PluginSpec { id: "alpha", category: "effects", required: false },
	PluginSpec { id: "invert", category: "effects", required: false },
	PluginSpec { id: "fisheye", category: "effects", required: false },
	PluginSpec { id: "wrot", category: "effects", required: false },
];

#[derive(Serialize)]
pub struct WayfirePlugin {
	pub id: String,
	/// Locale key suffix; the frontend resolves the label and description.
	pub category: String,
	pub required: bool,
	pub enabled: bool,
	/// True when the plugin is active but the settings app has no metadata for
	/// it (hand-edited wayfire.ini) — shown so toggling never silently drops it.
	pub unknown: bool,
}

fn spec_for(id: &str) -> Option<&'static PluginSpec> {
	PLUGINS.iter().find(|spec| spec.id == id)
}

pub fn is_required(id: &str) -> bool {
	spec_for(id).is_some_and(|spec| spec.required)
}

/// Reads `[core] plugins`, which wayfire writes as a whitespace-separated list.
pub fn enabled_plugins(content: &str) -> Vec<String> {
	parse_section(content, CORE_SECTION)
		.get(PLUGINS_KEY)
		.map(|value| {
			value
				.split_whitespace()
				.map(str::to_string)
				.collect::<Vec<String>>()
		})
		.unwrap_or_default()
}

/// Renders the list back in wayfire's readable one-plugin-per-line style.
fn render_plugin_list(plugins: &[String]) -> String {
	if plugins.is_empty() {
		return format!("{} = ", PLUGINS_KEY);
	}

	let mut output = format!("{} = \\\n", PLUGINS_KEY);

	for (index, plugin) in plugins.iter().enumerate() {
		let is_last = index + 1 == plugins.len();
		output.push_str(&format!("  {}{}\n", plugin, if is_last { "" } else { " \\" }));
	}

	output.pop();
	output
}

pub fn write_plugin_list(content: &str, plugins: &[String]) -> String {
	set_key_raw(
		content,
		CORE_SECTION,
		PLUGINS_KEY,
		&render_plugin_list(plugins),
	)
}

/// Every known plugin plus anything enabled that we don't have metadata for,
/// so a hand-edited config is shown rather than quietly discarded.
#[tauri::command]
pub async fn get_wayfire_plugins() -> Result<Vec<WayfirePlugin>, String> {
	let content = read_file()?;
	let enabled = enabled_plugins(&content);

	let mut plugins: Vec<WayfirePlugin> = PLUGINS
		.iter()
		.map(|spec| WayfirePlugin {
			id: spec.id.to_string(),
			category: spec.category.to_string(),
			required: spec.required,
			enabled: enabled.iter().any(|item| item == spec.id),
			unknown: false,
		})
		.collect();

	for id in enabled {
		if spec_for(&id).is_none() {
			plugins.push(WayfirePlugin {
				id: id.clone(),
				category: "other".to_string(),
				required: false,
				enabled: true,
				unknown: true,
			});
		}
	}

	Ok(plugins)
}

/// Enables or disables a plugin in `[core] plugins`, keeping the order of the
/// existing list and refusing to remove anything VasakOS depends on.
#[tauri::command]
pub async fn set_wayfire_plugin_enabled(
	plugin: String,
	enabled: bool,
) -> Result<Vec<String>, String> {
	if !enabled && is_required(&plugin) {
		return Err(format!(
			"El plugin «{}» es necesario para que VasakOS funcione y no puede desactivarse.",
			plugin
		));
	}

	let content = read_file()?;
	let mut current = enabled_plugins(&content);
	let already = current.iter().any(|item| item == &plugin);

	if enabled == already {
		return Ok(current);
	}

	if enabled {
		current.push(plugin.clone());
	} else {
		current.retain(|item| item != &plugin);
	}

	let updated = write_plugin_list(&content, &current);
	write_file(&updated)?;

	log_debug(&format!(
		"Plugin wayfire «{}» {}",
		plugin,
		if enabled { "activado" } else { "desactivado" }
	));

	Ok(current)
}

#[cfg(test)]
mod tests {
	use super::*;

	const SAMPLE: &str = r#"[core]
# Enabled plugins.
plugins = \
  animate \
  autostart \
  blur \
  ipc

vwidth = 3

[grid]
duration = 150
"#;

	#[test]
	fn reads_the_continued_plugin_list() {
		assert_eq!(
			enabled_plugins(SAMPLE),
			vec!["animate", "autostart", "blur", "ipc"]
		);
	}

	#[test]
	fn round_trips_without_losing_plugins_or_neighbouring_keys() {
		let plugins = enabled_plugins(SAMPLE);
		let updated = write_plugin_list(SAMPLE, &plugins);

		assert_eq!(enabled_plugins(&updated), plugins);
		assert_eq!(
			parse_section(&updated, "core")
				.get("vwidth")
				.map(String::as_str),
			Some("3"),
			"keys after the continued list must survive"
		);
		assert!(updated.contains("# Enabled plugins."));
		assert_eq!(
			parse_section(&updated, "grid")
				.get("duration")
				.map(String::as_str),
			Some("150")
		);
	}

	#[test]
	fn keeps_the_readable_multi_line_style() {
		let updated = write_plugin_list(SAMPLE, &enabled_plugins(SAMPLE));

		assert!(updated.contains("plugins = \\\n"));
		assert!(updated.contains("  animate \\\n"));
		assert!(
			updated.contains("  ipc\n"),
			"the last entry carries no trailing backslash"
		);
	}

	#[test]
	fn adding_and_removing_updates_the_list() {
		let mut plugins = enabled_plugins(SAMPLE);
		plugins.push("wobbly".to_string());
		let added = write_plugin_list(SAMPLE, &plugins);
		assert!(enabled_plugins(&added).contains(&"wobbly".to_string()));

		plugins.retain(|item| item != "blur");
		let removed = write_plugin_list(&added, &plugins);
		assert!(!enabled_plugins(&removed).contains(&"blur".to_string()));
		assert!(enabled_plugins(&removed).contains(&"animate".to_string()));
	}

	#[test]
	fn desktop_critical_plugins_are_marked_required() {
		for id in [
			"autostart",
			"command",
			"ipc",
			"ipc-rules",
			"stipc",
			"foreign-toplevel",
			"wayfire-shell",
			"gtk-shell",
			"session-lock",
			"idle",
		] {
			assert!(is_required(id), "{} should be required", id);
		}

		for id in ["blur", "animate", "wobbly", "cube", "expo", "grid"] {
			assert!(!is_required(id), "{} should be optional", id);
		}
	}

	#[test]
	fn every_spec_id_is_unique() {
		let mut ids: Vec<&str> = PLUGINS.iter().map(|spec| spec.id).collect();
		let count = ids.len();
		ids.sort_unstable();
		ids.dedup();
		assert_eq!(ids.len(), count, "duplicated plugin id in the registry");
	}
}

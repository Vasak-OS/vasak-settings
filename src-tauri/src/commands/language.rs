use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::logger::{log_debug, log_error};

#[derive(Debug, Serialize, Deserialize)]
pub struct KeyboardLayout {
	pub code: String,
	pub description: String,
}

/// What the `[input]` section of wayfire.ini says about the keyboard.
#[derive(Debug, Serialize, Deserialize)]
pub struct KeyboardSettings {
	/// `xkb_layout`, verbatim: one code, or two separated by a comma.
	pub layouts: String,
	pub variant: String,
	/// The `grp:` entry of `xkb_options`, if any: the shortcut that switches
	/// between the layouts.
	pub switch_option: String,
}

/// XKB options that switch between layouts all live under `grp:`. The rest of
/// the catalogue (`caps:escape`, `compose:menu`…) has nothing to do with this
/// page and must survive whatever it writes.
const SWITCH_OPTION_PREFIX: &str = "grp:";

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

/// Names of the variants, from the XKB rules: "nodeadkeys" on its own says much
/// less than "Spanish (no dead keys)". Entries there read `code  layout: name`,
/// and the same code means different things under different layouts, so the
/// layout is part of the key.
fn load_xkb_variant_descriptions() -> HashMap<(String, String), String> {
	let mut descriptions = HashMap::new();

	let paths = [
		"/usr/share/X11/xkb/rules/base.lst",
		"/usr/share/X11/xkb/rules/evdev.lst",
	];

	for path in &paths {
		let Ok(content) = std::fs::read_to_string(path) else {
			continue;
		};

		let mut in_variant = false;
		for line in content.lines() {
			let trimmed = line.trim();

			if trimmed.starts_with("! variant") {
				in_variant = true;
				continue;
			}
			if !in_variant {
				continue;
			}
			if trimmed.starts_with('!') || trimmed.is_empty() {
				in_variant = false;
				continue;
			}
			if trimmed.starts_with('#') {
				continue;
			}

			let Some((code, rest)) = trimmed.split_once(char::is_whitespace) else {
				continue;
			};
			let Some((layout, name)) = rest.trim().split_once(':') else {
				continue;
			};

			let name = name.trim();
			if !name.is_empty() {
				descriptions.insert(
					(layout.trim().to_string(), code.trim().to_string()),
					name.to_string(),
				);
			}
		}

		if !descriptions.is_empty() {
			break;
		}
	}

	descriptions
}

/// Variants of `layout`, or of every layout at once when it is empty.
///
/// Asking without a layout returns the 347 variants of all 99 layouts together,
/// and picking one that belongs to another layout builds a combination XKB
/// rejects: the keymap fails to load and the keyboard silently stays as it was,
/// which looks exactly like the setting not being applied.
#[tauri::command]
pub async fn get_available_keyboard_variants(
	layout: Option<String>,
) -> Result<Vec<KeyboardLayout>, String> {
	let layout = layout
		.as_deref()
		.map(str::trim)
		.filter(|l| !l.is_empty())
		.unwrap_or_default()
		.to_string();

	let mut command = std::process::Command::new("localectl");
	command.arg("list-x11-keymap-variants");

	if !layout.is_empty() {
		command.arg(&layout);
	}

	let output = command
		.output()
		.map_err(|e| format!("Error ejecutando localectl: {}", e))?;

	// A layout with no variants of its own is not an error, but localectl
	// reports it as one ("Couldn't find any entries…", exit 1). The honest
	// answer for the list is that it is empty.
	if !output.status.success() {
		let stderr = String::from_utf8_lossy(&output.stderr);
		if stderr.contains("Couldn't find any entries") {
			return Ok(Vec::new());
		}
		return Err(format!("localectl falló: {}", stderr));
	}

	let raw = String::from_utf8_lossy(&output.stdout).to_string();
	let descriptions = load_xkb_variant_descriptions();

	let variants: Vec<KeyboardLayout> = raw
		.lines()
		.map(str::trim)
		.filter(|code| !code.is_empty())
		.map(|code| {
			let description = descriptions
				.get(&(layout.clone(), code.to_string()))
				.cloned()
				.unwrap_or_else(|| code.to_string());
			KeyboardLayout {
				code: code.to_string(),
				description,
			}
		})
		.collect();

	log_debug(&format!(
		"{} variantes de teclado disponibles para '{}'",
		variants.len(),
		layout
	));
	Ok(variants)
}

/// Descriptions of the XKB options, from the same rules file the layouts and
/// variants take theirs from. `grp:alt_shift_toggle` is a name; "Alt+Shift" is
/// the thing the user is actually choosing.
fn load_xkb_option_descriptions() -> HashMap<String, String> {
	let mut descriptions = HashMap::new();

	let paths = [
		"/usr/share/X11/xkb/rules/base.lst",
		"/usr/share/X11/xkb/rules/evdev.lst",
	];

	for path in &paths {
		let Ok(content) = std::fs::read_to_string(path) else {
			continue;
		};

		let mut in_option = false;
		for line in content.lines() {
			let trimmed = line.trim();

			if trimmed.starts_with("! option") {
				in_option = true;
				continue;
			}
			if !in_option {
				continue;
			}
			if trimmed.starts_with('!') || trimmed.is_empty() {
				in_option = false;
				continue;
			}
			if trimmed.starts_with('#') {
				continue;
			}

			let Some((code, description)) = trimmed.split_once(char::is_whitespace) else {
				continue;
			};

			let description = description.trim();
			if !description.is_empty() {
				descriptions.insert(code.trim().to_string(), description.to_string());
			}
		}

		if !descriptions.is_empty() {
			break;
		}
	}

	descriptions
}

/// The shortcuts that switch between layouts, in the order they should be read:
/// by what they say ("Alt+Shift"), not by the option name behind them.
#[tauri::command]
pub async fn get_available_keyboard_switch_options() -> Result<Vec<KeyboardLayout>, String> {
	let output = std::process::Command::new("localectl")
		.args(["list-x11-keymap-options"])
		.output()
		.map_err(|e| format!("Error ejecutando localectl: {}", e))?;

	if !output.status.success() {
		let stderr = String::from_utf8_lossy(&output.stderr);
		return Err(format!("localectl falló: {}", stderr));
	}

	let raw = String::from_utf8_lossy(&output.stdout).to_string();
	let descriptions = load_xkb_option_descriptions();

	let mut options: Vec<KeyboardLayout> = raw
		.lines()
		.map(str::trim)
		.filter(|code| code.starts_with(SWITCH_OPTION_PREFIX))
		.map(|code| {
			let description = descriptions
				.get(code)
				.cloned()
				.unwrap_or_else(|| code.to_string());
			KeyboardLayout {
				code: code.to_string(),
				description,
			}
		})
		.collect();

	options.sort_by(|a, b| {
		a.description
			.to_lowercase()
			.cmp(&b.description.to_lowercase())
	});

	log_debug(&format!(
		"{} atajos de cambio de distribución disponibles",
		options.len()
	));
	Ok(options)
}

/// Writes `switch_option` into an `xkb_options` list, replacing the `grp:`
/// entry that was there and keeping every unrelated option exactly as it was:
/// the list is shared with settings this page never shows.
fn merge_switch_option(existing: &str, switch_option: &str) -> String {
	let mut options: Vec<&str> = existing
		.split(',')
		.map(str::trim)
		.filter(|option| !option.is_empty() && !option.starts_with(SWITCH_OPTION_PREFIX))
		.collect();

	let switch_option = switch_option.trim();
	if !switch_option.is_empty() {
		options.push(switch_option);
	}

	options.join(",")
}

fn find_switch_option(options: &str) -> String {
	options
		.split(',')
		.map(str::trim)
		.find(|option| option.starts_with(SWITCH_OPTION_PREFIX))
		.unwrap_or_default()
		.to_string()
}

/// Puts the three keys this page owns into `[input]`, leaving the rest of
/// wayfire.ini exactly as it was.
fn apply_keyboard_settings(
	content: &str,
	layouts: &str,
	variant: &str,
	switch_option: &str,
) -> String {
	let existing = crate::commands::wayfire_ini::parse_section(content, "input");

	// Only the managed keys go into the write; everything else in [input]
	// (mouse settings, repeat rate…) stays on the line it is already on.
	let mut values = HashMap::new();
	let mut removals: Vec<&str> = Vec::new();

	values.insert("xkb_layout".to_string(), layouts.to_string());

	if variant.is_empty() {
		removals.push("xkb_variant");
	} else {
		values.insert("xkb_variant".to_string(), variant.to_string());
	}

	// A switching shortcut with a single layout switches to nothing, and the
	// control that sets it is only shown next to a second layout — so keeping
	// it would leave the file holding something the UI can no longer clear.
	let has_secondary = layouts
		.split(',')
		.filter(|layout| !layout.trim().is_empty())
		.count()
		> 1;
	let switch_option = if has_secondary { switch_option } else { "" };

	let options = merge_switch_option(
		existing
			.get("xkb_options")
			.map(String::as_str)
			.unwrap_or_default(),
		switch_option,
	);
	if options.is_empty() {
		removals.push("xkb_options");
	} else {
		values.insert("xkb_options".to_string(), options);
	}

	let content = crate::commands::wayfire_ini::update_section(content, "input", &values, false);
	crate::commands::wayfire_ini::remove_keys(&content, "input", &removals)
}

#[tauri::command]
pub async fn set_keyboard_layouts(
	layouts: String,
	variant: String,
	switch_option: String,
) -> Result<(), String> {
	let content = crate::commands::wayfire_ini::read_file()?;
	let updated = apply_keyboard_settings(&content, &layouts, &variant, &switch_option);
	crate::commands::wayfire_ini::write_file(&updated)
}

#[tauri::command]
pub async fn get_keyboard_layouts_from_wayfire() -> Result<KeyboardSettings, String> {
	let section =
		crate::commands::wayfire_ini::read_wayfire_section("input".to_string()).await?;

	Ok(KeyboardSettings {
		layouts: section.get("xkb_layout").cloned().unwrap_or_default(),
		variant: section.get("xkb_variant").cloned().unwrap_or_default(),
		switch_option: find_switch_option(
			section
				.get("xkb_options")
				.map(String::as_str)
				.unwrap_or_default(),
		),
	})
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn merging_keeps_options_this_page_knows_nothing_about() {
		assert_eq!(
			merge_switch_option("caps:escape,grp:alt_shift_toggle", "grp:win_space_toggle"),
			"caps:escape,grp:win_space_toggle"
		);
		assert_eq!(
			merge_switch_option("compose:menu, caps:escape", "grp:caps_toggle"),
			"compose:menu,caps:escape,grp:caps_toggle"
		);
	}

	#[test]
	fn clearing_the_shortcut_leaves_the_other_options_alone() {
		assert_eq!(
			merge_switch_option("grp:alt_shift_toggle,caps:escape", ""),
			"caps:escape"
		);
		assert_eq!(merge_switch_option("grp:alt_shift_toggle", ""), "");
		assert_eq!(merge_switch_option("", ""), "");
	}

	#[test]
	fn the_shortcut_is_read_back_out_of_the_list() {
		assert_eq!(
			find_switch_option("caps:escape,grp:ctrl_shift_toggle"),
			"grp:ctrl_shift_toggle"
		);
		assert_eq!(find_switch_option("caps:escape"), "");
		assert_eq!(find_switch_option(""), "");
	}

	const INPUT_SECTION: &str = r#"[input]
# Keyboard
xkb_layout = es,us
xkb_options = caps:escape
mouse_accel_profile = flat

[core]
vwidth = 3
"#;

	fn input(content: &str) -> HashMap<String, String> {
		crate::commands::wayfire_ini::parse_section(content, "input")
	}

	#[test]
	fn the_shortcut_lands_next_to_the_options_already_there() {
		let updated =
			apply_keyboard_settings(INPUT_SECTION, "es,us", "", "grp:alt_shift_toggle");
		let section = input(&updated);

		assert_eq!(section.get("xkb_layout").map(String::as_str), Some("es,us"));
		assert_eq!(
			section.get("xkb_options").map(String::as_str),
			Some("caps:escape,grp:alt_shift_toggle")
		);
		assert_eq!(
			section.get("mouse_accel_profile").map(String::as_str),
			Some("flat"),
			"keys this page does not manage stay"
		);
		assert!(updated.contains("# Keyboard"), "comments survive");
		assert_eq!(
			crate::commands::wayfire_ini::parse_section(&updated, "core")
				.get("vwidth")
				.map(String::as_str),
			Some("3")
		);
	}

	#[test]
	fn dropping_the_second_layout_drops_the_shortcut_with_it() {
		let with_shortcut =
			apply_keyboard_settings(INPUT_SECTION, "es,us", "", "grp:alt_shift_toggle");
		let updated = apply_keyboard_settings(&with_shortcut, "es", "", "grp:alt_shift_toggle");
		let section = input(&updated);

		assert_eq!(section.get("xkb_layout").map(String::as_str), Some("es"));
		assert_eq!(
			section.get("xkb_options").map(String::as_str),
			Some("caps:escape"),
			"the unrelated option must not go down with it"
		);
	}

	/// Removing a key means removing the line: leaving it out of the payload
	/// only leaves the old value in place.
	#[test]
	fn clearing_everything_optional_leaves_no_stale_line() {
		let full = apply_keyboard_settings(
			"[input]\nxkb_variant = nodeadkeys\nxkb_options = grp:caps_toggle\n",
			"es,us",
			"nodeadkeys",
			"grp:caps_toggle",
		);
		assert_eq!(
			input(&full).get("xkb_variant").map(String::as_str),
			Some("nodeadkeys")
		);

		let cleared = apply_keyboard_settings(&full, "es", "", "");
		let section = input(&cleared);

		assert!(!section.contains_key("xkb_variant"), "{:?}", section);
		assert!(!section.contains_key("xkb_options"), "{:?}", section);
		assert_eq!(section.get("xkb_layout").map(String::as_str), Some("es"));
	}

	#[test]
	fn saving_the_same_settings_twice_is_stable() {
		let once = apply_keyboard_settings(INPUT_SECTION, "es,us", "", "grp:win_space_toggle");
		let twice = apply_keyboard_settings(&once, "es,us", "", "grp:win_space_toggle");

		assert_eq!(once, twice, "the option list must not keep growing");
	}
}

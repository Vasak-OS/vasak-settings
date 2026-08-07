use serde::Serialize;

use crate::commands::wayfire_ini::{parse_section, read_file, set_key_raw, write_file};
use crate::logger::log_debug;

const CORE_SECTION: &str = "core";
const PLUGINS_KEY: &str = "plugins";

/// Static metadata for every plugin the settings app knows about.
///
/// `required` marks the plugins VasakOS itself depends on: without them the
/// desktop shell, the keybindings or the lock screen stop working, so the UI
/// must not offer a switch for them at all.
struct PluginSpec {
	id: &'static str,
	label: &'static str,
	description: &'static str,
	category: &'static str,
	required: bool,
	/// Shown instead of the switch, so the user understands why it is fixed.
	required_reason: Option<&'static str>,
}

const PLUGINS: &[PluginSpec] = &[
	// ── Sistema (los que sostienen el escritorio) ────────────────────────────
	PluginSpec {
		id: "autostart",
		label: "Autoinicio",
		description: "Ejecuta la sesión al arrancar el compositor.",
		category: "Sistema",
		required: true,
		required_reason: Some("Lanza vasak-desktop y publica el entorno de la sesión (uwsm finalize)."),
	},
	PluginSpec {
		id: "command",
		label: "Atajos de teclado",
		description: "Ejecuta comandos con combinaciones de teclas.",
		category: "Sistema",
		required: true,
		required_reason: Some("Wayfire gestiona todos los atajos de VasakOS: terminal, archivos, menú, volumen y brillo."),
	},
	PluginSpec {
		id: "ipc",
		label: "IPC",
		description: "Canal de control externo del compositor.",
		category: "Sistema",
		required: true,
		required_reason: Some("vasak-desktop se comunica con Wayfire por IPC."),
	},
	PluginSpec {
		id: "ipc-rules",
		label: "Reglas IPC",
		description: "Permite consultar y modificar ventanas por IPC.",
		category: "Sistema",
		required: true,
		required_reason: Some("Necesario para que vasak-desktop lea y ajuste propiedades de las ventanas."),
	},
	PluginSpec {
		id: "stipc",
		label: "IPC de pruebas",
		description: "Extensión del canal IPC.",
		category: "Sistema",
		required: true,
		required_reason: Some("Complementa a ipc para la integración del escritorio."),
	},
	PluginSpec {
		id: "foreign-toplevel",
		label: "Lista de ventanas",
		description: "Publica las ventanas abiertas al escritorio.",
		category: "Sistema",
		required: true,
		required_reason: Some("Sin esto la barra de tareas de vasak-desktop queda vacía."),
	},
	PluginSpec {
		id: "wayfire-shell",
		label: "Integración del panel",
		description: "Protocolo del panel y el menú.",
		category: "Sistema",
		required: true,
		required_reason: Some("Da soporte al panel de vasak-desktop."),
	},
	PluginSpec {
		id: "gtk-shell",
		label: "Integración GTK",
		description: "Soporte del protocolo gtk-shell.",
		category: "Sistema",
		required: true,
		required_reason: Some("Necesario para que las aplicaciones GTK se integren con el escritorio."),
	},
	PluginSpec {
		id: "session-lock",
		label: "Bloqueo de sesión",
		description: "Permite bloquear la pantalla.",
		category: "Sistema",
		required: true,
		required_reason: Some("Es el lado del compositor del bloqueo de pantalla."),
	},
	PluginSpec {
		id: "idle",
		label: "Inactividad",
		description: "Detecta cuándo el equipo está inactivo.",
		category: "Sistema",
		required: true,
		required_reason: Some("Sin esto el bloqueo automático por inactividad no se dispara."),
	},
	PluginSpec {
		id: "shortcuts-inhibit",
		label: "Inhibir atajos",
		description: "Deja que aplicaciones como escritorios remotos capturen todas las teclas.",
		category: "Sistema",
		required: false,
		required_reason: None,
	},
	// ── Ventanas ─────────────────────────────────────────────────────────────
	PluginSpec {
		id: "move",
		label: "Mover ventanas",
		description: "Arrastrar ventanas con el ratón.",
		category: "Ventanas",
		required: false,
		required_reason: None,
	},
	PluginSpec {
		id: "resize",
		label: "Redimensionar ventanas",
		description: "Cambiar el tamaño con el ratón.",
		category: "Ventanas",
		required: false,
		required_reason: None,
	},
	PluginSpec {
		id: "grid",
		label: "Anclado en cuadrícula",
		description: "Colocar ventanas en mitades y esquinas.",
		category: "Ventanas",
		required: false,
		required_reason: None,
	},
	PluginSpec {
		id: "place",
		label: "Colocación automática",
		description: "Decide dónde aparecen las ventanas nuevas.",
		category: "Ventanas",
		required: false,
		required_reason: None,
	},
	PluginSpec {
		id: "decoration",
		label: "Decoración de ventanas",
		description: "Barra de título y bordes dibujados por el compositor.",
		category: "Ventanas",
		required: false,
		required_reason: None,
	},
	PluginSpec {
		id: "wm-actions",
		label: "Acciones de ventana",
		description: "Pantalla completa, siempre encima, fijar y minimizar.",
		category: "Ventanas",
		required: false,
		required_reason: None,
	},
	PluginSpec {
		id: "window-rules",
		label: "Reglas de ventana",
		description: "Aplica reglas automáticas según la aplicación.",
		category: "Ventanas",
		required: false,
		required_reason: None,
	},
	PluginSpec {
		id: "switcher",
		label: "Cambiador de ventanas",
		description: "Alt+Tab con animación.",
		category: "Ventanas",
		required: false,
		required_reason: None,
	},
	PluginSpec {
		id: "fast-switcher",
		label: "Cambiador rápido",
		description: "Alterna entre ventanas sin animación.",
		category: "Ventanas",
		required: false,
		required_reason: None,
	},
	// ── Espacios de trabajo ──────────────────────────────────────────────────
	PluginSpec {
		id: "vswitch",
		label: "Cambiar de escritorio",
		description: "Moverse entre espacios de trabajo.",
		category: "Espacios de trabajo",
		required: false,
		required_reason: None,
	},
	PluginSpec {
		id: "expo",
		label: "Vista general",
		description: "Muestra todos los espacios de trabajo a la vez.",
		category: "Espacios de trabajo",
		required: false,
		required_reason: None,
	},
	PluginSpec {
		id: "oswitch",
		label: "Cambiar de pantalla",
		description: "Saltar entre monitores.",
		category: "Espacios de trabajo",
		required: false,
		required_reason: None,
	},
	// ── Efectos ──────────────────────────────────────────────────────────────
	PluginSpec {
		id: "animate",
		label: "Animaciones",
		description: "Anima la apertura y el cierre de ventanas.",
		category: "Efectos",
		required: false,
		required_reason: None,
	},
	PluginSpec {
		id: "blur",
		label: "Desenfoque",
		description: "Desenfoca lo que hay detrás de las ventanas.",
		category: "Efectos",
		required: false,
		required_reason: None,
	},
	PluginSpec {
		id: "zoom",
		label: "Lupa",
		description: "Amplía la pantalla con la rueda del ratón.",
		category: "Efectos",
		required: false,
		required_reason: None,
	},
	PluginSpec {
		id: "wobbly",
		label: "Ventanas gelatinosas",
		description: "Las ventanas se deforman al moverlas.",
		category: "Efectos",
		required: false,
		required_reason: None,
	},
	PluginSpec {
		id: "cube",
		label: "Cubo de escritorios",
		description: "Muestra los escritorios sobre un cubo 3D.",
		category: "Efectos",
		required: false,
		required_reason: None,
	},
	PluginSpec {
		id: "alpha",
		label: "Transparencia",
		description: "Ajusta la opacidad de una ventana.",
		category: "Efectos",
		required: false,
		required_reason: None,
	},
	PluginSpec {
		id: "invert",
		label: "Invertir colores",
		description: "Invierte los colores de la pantalla.",
		category: "Efectos",
		required: false,
		required_reason: None,
	},
	PluginSpec {
		id: "fisheye",
		label: "Ojo de pez",
		description: "Lente de aumento circular.",
		category: "Efectos",
		required: false,
		required_reason: None,
	},
	PluginSpec {
		id: "wrot",
		label: "Rotar ventanas",
		description: "Gira una ventana con el ratón.",
		category: "Efectos",
		required: false,
		required_reason: None,
	},
];

#[derive(Serialize)]
pub struct WayfirePlugin {
	pub id: String,
	pub label: String,
	pub description: String,
	pub category: String,
	pub required: bool,
	pub required_reason: Option<String>,
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
			label: spec.label.to_string(),
			description: spec.description.to_string(),
			category: spec.category.to_string(),
			required: spec.required,
			required_reason: spec.required_reason.map(str::to_string),
			enabled: enabled.iter().any(|item| item == spec.id),
			unknown: false,
		})
		.collect();

	for id in enabled {
		if spec_for(&id).is_none() {
			plugins.push(WayfirePlugin {
				id: id.clone(),
				label: id.clone(),
				description: "Plugin activado manualmente en wayfire.ini.".to_string(),
				category: "Otros".to_string(),
				required: false,
				required_reason: None,
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

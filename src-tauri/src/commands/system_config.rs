use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;
use crate::logger::{log_info, log_error, log_debug, log_warning};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemConfig {
    pub dark_mode: bool,
    pub icon_pack: String,
    pub cursor_theme: String,
    pub gtk_theme: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IconPackPreview {
    pub name: String,
    pub path: String,
    pub icons: Vec<String>,
}

impl Default for SystemConfig {
    fn default() -> Self {
        Self {
            dark_mode: false,
            icon_pack: "Adwaita".to_string(),
            cursor_theme: "Adwaita".to_string(),
            gtk_theme: "Adwaita".to_string(),
        }
    }
}

/// Obtiene la configuración actual del sistema desde archivo
#[tauri::command]
pub async fn get_current_system_state() -> Result<SystemConfig, String> {
    log_debug("Obteniendo estado actual del sistema desde gsettings");
    let gtk_theme = get_current_gtk_theme()
        .await
        .unwrap_or_else(|_| "Adwaita".to_string());
    let cursor_theme = get_current_cursor_theme()
        .await
        .unwrap_or_else(|_| "Adwaita".to_string());
    let icon_pack = get_current_icon_pack()
        .await
        .unwrap_or_else(|_| "Adwaita".to_string());
    let dark_mode = get_current_dark_mode().await.unwrap_or(false);

    log_debug(&format!("Estado actual: GTK={}, Icons={}, Cursor={}, Dark={}", 
        gtk_theme, icon_pack, cursor_theme, dark_mode));
    
    Ok(SystemConfig {
        dark_mode,
        icon_pack,
        cursor_theme,
        gtk_theme,
    })
}

async fn get_current_gtk_theme() -> Result<String, String> {
    let output = Command::new("gsettings")
        .args(["get", "org.gnome.desktop.interface", "gtk-theme"])
        .output()
        .map_err(|e| format!("Error obteniendo tema GTK: {}", e))?;

    let theme = String::from_utf8_lossy(&output.stdout)
        .trim()
        .trim_matches('\'')
        .to_string();

    Ok(theme)
}

async fn get_current_cursor_theme() -> Result<String, String> {
    let output = Command::new("gsettings")
        .args(["get", "org.gnome.desktop.interface", "cursor-theme"])
        .output()
        .map_err(|e| format!("Error obteniendo cursor: {}", e))?;

    let cursor = String::from_utf8_lossy(&output.stdout)
        .trim()
        .trim_matches('\'')
        .to_string();

    Ok(cursor)
}

/// Obtiene el pack de iconos actual desde gsettings
async fn get_current_icon_pack() -> Result<String, String> {
    let output = Command::new("gsettings")
        .args(["get", "org.gnome.desktop.interface", "icon-theme"])
        .output()
        .map_err(|e| format!("Error obteniendo pack de iconos: {}", e))?;

    let icons = String::from_utf8_lossy(&output.stdout)
        .trim()
        .trim_matches('\'')
        .to_string();

    Ok(icons)
}

/// Obtiene el estado de dark mode actual desde gsettings
async fn get_current_dark_mode() -> Result<bool, String> {
    let output = Command::new("gsettings")
        .args(["get", "org.gnome.desktop.interface", "color-scheme"])
        .output()
        .map_err(|e| format!("Error obteniendo color scheme: {}", e))?;

    let scheme = String::from_utf8_lossy(&output.stdout).trim().to_string();

    Ok(scheme.contains("dark"))
}

/// Establece la configuración del sistema y persiste los cambios
#[tauri::command]
pub async fn set_system_config(config: SystemConfig) -> Result<SystemConfig, String> {
    apply_system_config(&config).await?;

    let config_path = get_config_path()?;

    if let Some(parent) = config_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Error creando directorio de configuración: {}", e))?;
    }

    let config_json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Error serializando configuración: {}", e))?;

    std::fs::write(&config_path, config_json)
        .map_err(|e| format!("Error guardando configuración: {}", e))?;

    Ok(config)
}

/// Obtiene la ruta del archivo de configuración
fn get_config_path() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|e| format!("Error obteniendo HOME: {}", e))?;

    Ok(PathBuf::from(home).join(".config/vasak/system_config.json"))
}

async fn apply_system_config(config: &SystemConfig) -> Result<(), String> {
    log_info("Aplicando configuración del sistema");
    log_info(&format!("  GTK Theme: {}", config.gtk_theme));
    log_info(&format!("  Icon Pack: {}", config.icon_pack));
    log_info(&format!("  Cursor: {}", config.cursor_theme));
    log_info(&format!("  Dark Mode: {}", config.dark_mode));
    
    if let Err(e) = set_gtk_theme(&config.gtk_theme, config.dark_mode).await {
        log_warning(&format!("Error GTK (no crítico): {}", e));
    }

    if let Err(e) = set_cursor_theme(&config.cursor_theme).await {
        log_warning(&format!("Error Cursor (no crítico): {}", e));
    }

    set_icon_pack(&config.icon_pack).await?;
    set_dark_mode(config.dark_mode).await?;

    log_info("Configuración del sistema aplicada correctamente");
    Ok(())
}

pub async fn set_gtk_theme(theme: &str, _dark_mode: bool) -> Result<(), String> {
    log_debug(&format!("Estableciendo tema GTK: {}", theme));
    let output = Command::new("gsettings")
        .args([
            "set",
            "org.gnome.desktop.interface",
            "gtk-theme",
            theme,
        ])
        .output()
        .map_err(|e| {
            log_error(&format!("Error ejecutando gsettings para GTK theme: {}", e));
            format!("Error setting GTK theme: {}", e)
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        log_error(&format!("Error al aplicar tema GTK '{}': {}", theme, stderr));
        return Err(format!("Error al aplicar tema GTK: {}", stderr));
    }

    log_info(&format!("Tema GTK aplicado: {}", theme));
    Ok(())
}

pub async fn set_cursor_theme(cursor: &str) -> Result<(), String> {
    log_debug(&format!("Estableciendo tema de cursor: {}", cursor));
    let output = Command::new("gsettings")
        .args(["set", "org.gnome.desktop.interface", "cursor-theme", cursor])
        .output()
        .map_err(|e| {
            log_error(&format!("Error ejecutando gsettings para cursor: {}", e));
            format!("Error setting cursor theme: {}", e)
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        log_error(&format!("Error al aplicar cursor '{}': {}", cursor, stderr));
        return Err(format!("Error al aplicar cursor: {}", stderr));
    }

    log_info(&format!("Tema de cursor aplicado: {}", cursor));
    Ok(())
}

pub async fn set_icon_pack(icon_pack: &str) -> Result<(), String> {
    log_debug(&format!("Estableciendo pack de iconos: {}", icon_pack));
    let available_packs = get_icon_packs().await?;
    if !available_packs.contains(&icon_pack.to_string()) {
        let msg = format!(
            "Icon pack '{}' no encontrado. Disponibles: {:?}",
            icon_pack, available_packs
        );
        log_error(&msg);
        return Err(msg);
    }

    let output = Command::new("gsettings")
        .args([
            "set",
            "org.gnome.desktop.interface",
            "icon-theme",
            icon_pack,
        ])
        .output()
        .map_err(|e| {
            let err_msg = format!("Error ejecutando gsettings: {}", e);
            eprintln!("{}", err_msg);
            err_msg
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let err_msg = format!(
            "[set_icon_pack] Error: exit_code={}, stderr={}, stdout={}",
            output.status.code().unwrap_or(-1),
            stderr,
            stdout
        );
        eprintln!("{}", err_msg);
        log_error(&format!("Error al aplicar pack de iconos '{}': {}", icon_pack, stderr));
        return Err(format!("Error al aplicar pack de iconos: {}", stderr));
    }
    log_info(&format!("Pack de iconos aplicado: {}", icon_pack));
    Ok(())
}

pub async fn set_dark_mode(dark_mode: bool) -> Result<(), String> {
    let scheme = if dark_mode {
        "prefer-dark"
    } else {
        "prefer-light"
    };
    
    log_debug(&format!("Estableciendo modo oscuro: {} (scheme: {})", dark_mode, scheme));

    let output = Command::new("gsettings")
        .args(["set", "org.gnome.desktop.interface", "color-scheme", scheme])
        .output()
        .map_err(|e| {
            log_error(&format!("Error ejecutando gsettings para color scheme: {}", e));
            format!("Error setting color scheme: {}", e)
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        log_error(&format!("Error al aplicar esquema de color '{}': {}", scheme, stderr));
        return Err(format!("Error al aplicar esquema de color: {}", stderr));
    }
    log_info(&format!("Modo oscuro establecido: {}", dark_mode));
    Ok(())
}

#[tauri::command]
pub async fn get_gtk_themes() -> Result<Vec<String>, String> {
    let themes_path = PathBuf::from("/usr/share/themes");

    if !themes_path.exists() {
        return Ok(vec!["Adwaita".to_string()]);
    }

    let entries =
        std::fs::read_dir(&themes_path).map_err(|e| format!("Error reading themes: {}", e))?;

    let mut themes = Vec::new();
    for entry in entries.flatten() {
        if let Ok(metadata) = entry.metadata() {
            if metadata.is_dir() {
                if let Ok(file_name) = entry.file_name().into_string() {
                    themes.push(file_name);
                }
            }
        }
    }

    themes.sort();
    Ok(themes)
}

#[tauri::command]
pub async fn get_cursor_themes() -> Result<Vec<String>, String> {
    let home = std::env::var("HOME").unwrap_or_default();
    let local_icons = PathBuf::from(&home).join(".local/share/icons");

    let cursor_paths = vec![PathBuf::from("/usr/share/icons"), local_icons];

    let mut cursors = std::collections::HashSet::new();
    cursors.insert("Adwaita".to_string());

    for path in cursor_paths {
        if let Ok(entries) = std::fs::read_dir(&path) {
            for entry in entries.flatten() {
                let cursors_dir = entry.path().join("cursors");
                if cursors_dir.exists() && cursors_dir.is_dir() {
                    if let Ok(file_name) = entry.file_name().into_string() {
                        cursors.insert(file_name);
                    }
                }
            }
        }
    }

    let mut result: Vec<String> = cursors.into_iter().collect();
    result.sort();
    Ok(result)
}

#[tauri::command]
pub async fn get_icon_packs() -> Result<Vec<String>, String> {
    let home = std::env::var("HOME").unwrap_or_default();
    let local_icons = PathBuf::from(&home).join(".local/share/icons");

    let icon_paths = vec![PathBuf::from("/usr/share/icons"), local_icons];

    let mut icons = std::collections::HashSet::new();
    icons.insert("Adwaita".to_string());

    for path in icon_paths {
        if let Ok(entries) = std::fs::read_dir(&path) {
            for entry in entries.flatten() {
                let entry_path = entry.path();
                let index_theme = entry_path.join("index.theme");

                if !index_theme.exists() {
                    continue;
                }

                let file_name = match entry.file_name().into_string() {
                    Ok(file_name) => file_name,
                    Err(_) => continue,
                };

                let is_cursor_theme = file_name.to_ascii_lowercase().contains("cursor");
                if is_cursor_theme {
                    continue;
                }

                icons.insert(file_name);
            }
        }
    }

    let mut result: Vec<String> = icons.into_iter().collect();
    result.sort();
    Ok(result)
}

#[tauri::command]
pub async fn get_official_wallpapers() -> Result<Vec<String>, String> {
    let wallpapers_path = PathBuf::from("/usr/share/backgrounds/vasakos");

    if !wallpapers_path.exists() {
        return Ok(vec![]);
    }

    let entries = std::fs::read_dir(&wallpapers_path)
        .map_err(|e| format!("Error leyendo wallpapers oficiales: {}", e))?;

    let allowed_extensions = ["jpg", "jpeg", "png", "webp", "bmp", "gif", "avif"];
    let mut wallpapers = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let extension = path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.to_lowercase())
            .unwrap_or_default();

        if allowed_extensions.contains(&extension.as_str()) {
            wallpapers.push(path.to_string_lossy().to_string());
        }
    }

    wallpapers.sort();
    Ok(wallpapers)
}

#[tauri::command]
pub async fn get_icon_pack_icons(icon_pack: String) -> Result<IconPackPreview, String> {
    let home = std::env::var("HOME").unwrap_or_default();
    let local_icons = PathBuf::from(&home).join(".local/share/icons");

    let icon_paths = vec![PathBuf::from("/usr/share/icons"), local_icons];

    let mut pack_path = PathBuf::new();

    for path in icon_paths {
        let potential_pack = path.join(&icon_pack);
        if potential_pack.exists() {
            pack_path = potential_pack;
            break;
        }
    }

    if pack_path.as_os_str().is_empty() {
        return Err(format!("Icon pack '{}' no encontrado", icon_pack));
    }

    let mut icons = Vec::new();
    let mut seen = std::collections::HashSet::new();

    let push_icon = |path: PathBuf, icons: &mut Vec<String>, seen: &mut std::collections::HashSet<String>| {
        if path.is_file() {
            let icon_path = path.to_string_lossy().to_string();
            if seen.insert(icon_path.clone()) {
                icons.push(icon_path);
            }
        }
    };

    let preferred_basenames = [
        "default-folder",
        "folder",
        "emptytrash",
        "user-trash",
        "dialog-information",
        "video-display",
        "preferences-desktop-display",
        "application-x-generic",
        "image-x-generic",
    ];

    let preferred_aliases: &[(&str, &[&str])] = &[
        ("default-folder", &["folder", "folder-default", "folder-documents"]),
        (
            "emptytrash",
            &["user-trash", "user-trash-full", "trash-empty", "trash-can"],
        ),
        (
            "dialog-information",
            &["dialog-information-symbolic", "information", "info"],
        ),
        (
            "video-display",
            &["preferences-desktop-display", "display", "video-projector"],
        ),
    ];

    let image_extensions = ["svg", "png", "xpm", "jpg", "jpeg", "webp"];

    let find_matching_icon = |root: &PathBuf, base_names: &[&str], icons: &mut Vec<String>, seen: &mut std::collections::HashSet<String>| {
        let mut stack = vec![root.clone()];

        while let Some(current_dir) = stack.pop() {
            if icons.len() >= 4 {
                break;
            }

            let entries = match std::fs::read_dir(&current_dir) {
                Ok(entries) => entries,
                Err(_) => continue,
            };

            for entry in entries.flatten() {
                if icons.len() >= 4 {
                    break;
                }

                let entry_path = entry.path();
                if entry_path.is_dir() {
                    stack.push(entry_path);
                    continue;
                }

                let stem = match entry_path.file_stem().and_then(|stem| stem.to_str()) {
                    Some(stem) => stem.to_ascii_lowercase(),
                    None => continue,
                };

                let extension_ok = entry_path
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .map(|ext| image_extensions.contains(&ext.to_ascii_lowercase().as_str()))
                    .unwrap_or(false);

                if !extension_ok {
                    continue;
                }

                if base_names.iter().any(|base_name| {
                    let base_name = base_name.to_ascii_lowercase();
                    stem == base_name || stem.starts_with(&format!("{}-", base_name)) || stem.ends_with(&format!("-{}", base_name))
                }) {
                    push_icon(entry_path, icons, seen);
                }
            }
        }
    };

    for base_name in preferred_basenames {
        if icons.len() >= 4 {
            break;
        }

        let mut search_names = vec![base_name];
        if let Some((_, aliases)) = preferred_aliases.iter().find(|(name, _)| *name == base_name) {
            search_names.extend_from_slice(aliases);
        }

        find_matching_icon(&pack_path, &search_names, &mut icons, &mut seen);
    }

    let search_roots = [
        "actions",
        "status",
        "places",
        "mimetypes",
        "apps",
        "devices",
        "categories",
        "emblems",
        "stock",
        "scalable",
        "48x48",
        "64x64",
        "32x32",
        "24x24",
        "16x16",
    ];

    for relative_root in search_roots {
        if icons.len() >= 4 {
            break;
        }

        let root_path = pack_path.join(relative_root);
        if !root_path.exists() {
            continue;
        }

        let mut stack = vec![root_path];

        while let Some(current_dir) = stack.pop() {
            if icons.len() >= 4 {
                break;
            }

            let entries = match std::fs::read_dir(&current_dir) {
                Ok(entries) => entries,
                Err(_) => continue,
            };

            for entry in entries.flatten() {
                if icons.len() >= 4 {
                    break;
                }

                let entry_path = entry.path();
                if entry_path.is_dir() {
                    stack.push(entry_path);
                    continue;
                }

                let is_preview_icon = entry_path
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .map(|ext| image_extensions.contains(&ext.to_ascii_lowercase().as_str()))
                    .unwrap_or(false);

                if is_preview_icon {
                    push_icon(entry_path, &mut icons, &mut seen);
                }
            }
        }
    }

    if icons.len() < 4 {
        let mut stack = vec![pack_path.clone()];

        while let Some(current_dir) = stack.pop() {
            if icons.len() >= 4 {
                break;
            }

            let entries = match std::fs::read_dir(&current_dir) {
                Ok(entries) => entries,
                Err(_) => continue,
            };

            for entry in entries.flatten() {
                if icons.len() >= 4 {
                    break;
                }

                let entry_path = entry.path();
                if entry_path.is_dir() {
                    stack.push(entry_path);
                    continue;
                }

                let is_preview_icon = entry_path
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .map(|ext| image_extensions.contains(&ext.to_ascii_lowercase().as_str()))
                    .unwrap_or(false);

                if is_preview_icon {
                    push_icon(entry_path, &mut icons, &mut seen);
                }
            }
        }
    }

    icons.truncate(4);

    Ok(IconPackPreview {
        name: icon_pack.clone(),
        path: pack_path.to_string_lossy().to_string(),
        icons,
    })
}

//! El editor visual de `fastfetch`.
//!
//! Edita **la configuración del usuario**, `~/.config/fastfetch/config.jsonc`, y
//! no toca la del sistema (`/etc/fastfetch/config.jsonc`), que trae el logo del
//! lince para quien no tiene la suya. `fastfetch` se queda con la **primera**
//! configuración que encuentra, así que escribir la del usuario la hace ganar;
//! «restablecer» borra la del usuario y el sistema vuelve a mandar.
//!
//! Este primer tramo cubre el emblema (tipo, origen, tamaño) y la vista previa.
//! La lista de módulos se maneja aparte: un `config.jsonc` **reemplaza** lo que
//! `fastfetch` trae por omisión, así que al escribir hay que **preservar** la
//! lista que ya estuviera —por eso cargamos la config efectiva de base y sólo
//! reemplazamos su bloque `logo`, en vez de escribir uno nuevo que dejaría la
//! lectura sin ninguna fila.

use crate::logger::{log_debug, log_error};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::path::PathBuf;
use std::process::Command;

const SYSTEM_CONFIG: &str = "/etc/fastfetch/config.jsonc";

/// El emblema, en los términos que entiende la pantalla.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct FastfetchLogo {
    /// `image`, `builtin`, `ascii` o `none`.
    pub kind: String,
    /// El archivo (para `image`/`ascii`) o el nombre (para `builtin`).
    #[serde(default)]
    pub source: Option<String>,
    #[serde(default)]
    pub width: Option<u32>,
    #[serde(default)]
    pub height: Option<u32>,
    /// Relleno a la izquierda, en celdas de carácter.
    #[serde(default)]
    pub padding: Option<u32>,
}

/// Lo que ve la pantalla al abrir.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FastfetchState {
    /// Si el binario `fastfetch` está instalado.
    pub available: bool,
    /// Si existe la configuración del usuario (si no, manda la del sistema).
    pub user_config_exists: bool,
    pub logo: FastfetchLogo,
    /// La lectura previsualizada (texto plano), o vacía si no se pudo.
    pub preview: String,
}

fn user_config_path() -> Option<PathBuf> {
    dirs::config_dir().map(|dir| dir.join("fastfetch").join("config.jsonc"))
}

/// Saca de un `jsonc` los comentarios `//` y `/* */` y las comas colgadas, para
/// poder parsearlo con `serde_json`. Respeta lo que está entre comillas: un `//`
/// adentro de una cadena no es un comentario.
fn strip_jsonc(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = String::with_capacity(input.len());
    let mut i = 0;
    let mut in_string = false;
    let mut escaped = false;
    while i < bytes.len() {
        let c = bytes[i] as char;
        if in_string {
            out.push(c);
            if escaped {
                escaped = false;
            } else if c == '\\' {
                escaped = true;
            } else if c == '"' {
                in_string = false;
            }
            i += 1;
            continue;
        }
        if c == '"' {
            in_string = true;
            out.push(c);
            i += 1;
            continue;
        }
        if c == '/' && i + 1 < bytes.len() {
            let next = bytes[i + 1] as char;
            if next == '/' {
                i += 2;
                while i < bytes.len() && bytes[i] as char != '\n' {
                    i += 1;
                }
                continue;
            }
            if next == '*' {
                i += 2;
                while i + 1 < bytes.len() && !(bytes[i] as char == '*' && bytes[i + 1] as char == '/')
                {
                    i += 1;
                }
                i += 2;
                continue;
            }
        }
        out.push(c);
        i += 1;
    }
    drop_trailing_commas(&out)
}

/// Quita las comas que quedan antes de `}` o `]` (válidas en jsonc, no en json).
fn drop_trailing_commas(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = String::with_capacity(input.len());
    let mut in_string = false;
    let mut escaped = false;
    let mut i = 0;
    while i < bytes.len() {
        let c = bytes[i] as char;
        if in_string {
            out.push(c);
            if escaped {
                escaped = false;
            } else if c == '\\' {
                escaped = true;
            } else if c == '"' {
                in_string = false;
            }
            i += 1;
            continue;
        }
        if c == '"' {
            in_string = true;
            out.push(c);
            i += 1;
            continue;
        }
        if c == ',' {
            // Mirar el próximo carácter que no sea espacio.
            let mut j = i + 1;
            while j < bytes.len() && (bytes[j] as char).is_whitespace() {
                j += 1;
            }
            if j < bytes.len() && (bytes[j] as char == '}' || bytes[j] as char == ']') {
                i += 1; // saltear la coma colgada
                continue;
            }
        }
        out.push(c);
        i += 1;
    }
    out
}

fn parse_jsonc(raw: &str) -> Result<Value, String> {
    serde_json::from_str(&strip_jsonc(raw)).map_err(|e| format!("No se pudo leer el jsonc: {e}"))
}

/// Saca el emblema de un `Value` de fastfetch. Un `logo` que es sólo una cadena
/// es el nombre de un `builtin`.
fn logo_from_value(root: &Value) -> FastfetchLogo {
    match root.get("logo") {
        Some(Value::String(name)) => FastfetchLogo {
            kind: "builtin".into(),
            source: Some(name.clone()),
            ..Default::default()
        },
        Some(Value::Object(obj)) => {
            let kind = obj
                .get("type")
                .and_then(Value::as_str)
                .unwrap_or("builtin")
                .to_string();
            let padding = obj
                .get("padding")
                .and_then(|p| p.get("left"))
                .and_then(Value::as_u64)
                .map(|n| n as u32);
            FastfetchLogo {
                kind,
                source: obj.get("source").and_then(Value::as_str).map(String::from),
                width: obj.get("width").and_then(Value::as_u64).map(|n| n as u32),
                height: obj.get("height").and_then(Value::as_u64).map(|n| n as u32),
                padding,
            }
        }
        _ => FastfetchLogo {
            kind: "builtin".into(),
            ..Default::default()
        },
    }
}

/// Arma el `Value` del emblema a partir de lo que mandó la pantalla.
fn logo_to_value(logo: &FastfetchLogo) -> Value {
    if logo.kind == "none" {
        return Value::String("none".into());
    }
    let mut obj = Map::new();
    obj.insert("type".into(), Value::String(logo.kind.clone()));
    if let Some(src) = &logo.source {
        if !src.is_empty() {
            obj.insert("source".into(), Value::String(src.clone()));
        }
    }
    if let Some(w) = logo.width {
        obj.insert("width".into(), Value::from(w));
    }
    if let Some(h) = logo.height {
        obj.insert("height".into(), Value::from(h));
    }
    if let Some(p) = logo.padding {
        let mut pad = Map::new();
        pad.insert("left".into(), Value::from(p));
        obj.insert("padding".into(), Value::Object(pad));
    }
    Value::Object(obj)
}

fn fastfetch_available() -> bool {
    Command::new("fastfetch")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// La config efectiva, para leer o para usar de base al escribir: la del
/// usuario si existe, si no la del sistema, si no la que genera fastfetch.
fn effective_config() -> Result<Value, String> {
    if let Some(path) = user_config_path() {
        if path.exists() {
            let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
            return parse_jsonc(&raw);
        }
    }
    if let Ok(raw) = std::fs::read_to_string(SYSTEM_CONFIG) {
        if let Ok(value) = parse_jsonc(&raw) {
            return Ok(value);
        }
    }
    // Último recurso: la config que fastfetch genera, para no perder la lista de
    // módulos. Si ni eso, un objeto vacío.
    if let Ok(out) = Command::new("fastfetch").arg("--gen-config-force").arg("-").output() {
        if out.status.success() {
            if let Ok(value) = parse_jsonc(&String::from_utf8_lossy(&out.stdout)) {
                return Ok(value);
            }
        }
    }
    Ok(Value::Object(Map::new()))
}

fn run_preview() -> String {
    // `--pipe` fuerza texto sin colores ni gráficos: una lectura fiel para
    // mostrar en la ventana, donde el logo real (gráficos de kitty) no se dibuja.
    Command::new("fastfetch")
        .arg("--pipe")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
        .unwrap_or_default()
}

/// Lee el estado para abrir la pantalla.
#[tauri::command]
pub async fn get_fastfetch_config() -> Result<FastfetchState, String> {
    log_debug("Leyendo la configuración de fastfetch");
    let available = fastfetch_available();
    let user_config_exists = user_config_path().map(|p| p.exists()).unwrap_or(false);
    let logo = effective_config().map(|v| logo_from_value(&v)).unwrap_or_default();
    let preview = if available { run_preview() } else { String::new() };
    Ok(FastfetchState {
        available,
        user_config_exists,
        logo,
        preview,
    })
}

/// Escribe el emblema, preservando el resto de la configuración efectiva.
#[tauri::command]
pub async fn set_fastfetch_logo(logo: FastfetchLogo) -> Result<FastfetchState, String> {
    let path = user_config_path().ok_or("No se pudo resolver ~/.config")?;
    let mut root = effective_config()?;
    if !root.is_object() {
        root = Value::Object(Map::new());
    }
    if let Value::Object(map) = &mut root {
        map.insert("logo".into(), logo_to_value(&logo));
        // Asegurar el `$schema`, que ayuda a los editores.
        map.entry("$schema").or_insert_with(|| {
            Value::String(
                "https://github.com/fastfetch-cli/fastfetch/raw/master/doc/json_schema.json".into(),
            )
        });
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let pretty = serde_json::to_string_pretty(&root).map_err(|e| e.to_string())?;
    std::fs::write(&path, pretty).map_err(|e| {
        log_error(&format!("No se pudo escribir {}: {e}", path.display()));
        e.to_string()
    })?;
    get_fastfetch_config().await
}

/// Borra la config del usuario: vuelve a mandar la del sistema.
#[tauri::command]
pub async fn reset_fastfetch_config() -> Result<FastfetchState, String> {
    if let Some(path) = user_config_path() {
        if path.exists() {
            std::fs::remove_file(&path).map_err(|e| e.to_string())?;
        }
    }
    get_fastfetch_config().await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_quita_comentarios_y_comas_colgadas() {
        let raw = r#"{
            // una línea
            "a": 1, /* en medio */
            "b": "http://no-es-comentario", // al final
            "c": [1, 2,],
        }"#;
        let value = parse_jsonc(raw).expect("parsea");
        assert_eq!(value["a"], 1);
        assert_eq!(value["b"], "http://no-es-comentario");
        assert_eq!(value["c"], serde_json::json!([1, 2]));
    }

    #[test]
    fn logo_cadena_es_builtin() {
        let value = serde_json::json!({ "logo": "arch" });
        let logo = logo_from_value(&value);
        assert_eq!(logo.kind, "builtin");
        assert_eq!(logo.source.as_deref(), Some("arch"));
    }

    #[test]
    fn logo_objeto_se_lee_entero() {
        let value = serde_json::json!({
            "logo": { "type": "file", "source": "l.png", "width": 28, "height": 12,
                      "padding": { "left": 3 } }
        });
        let logo = logo_from_value(&value);
        assert_eq!(logo.kind, "file");
        assert_eq!(logo.source.as_deref(), Some("l.png"));
        assert_eq!(logo.width, Some(28));
        assert_eq!(logo.height, Some(12));
        assert_eq!(logo.padding, Some(3));
    }

    #[test]
    fn none_viaja_como_cadena() {
        let logo = FastfetchLogo {
            kind: "none".into(),
            ..Default::default()
        };
        assert_eq!(logo_to_value(&logo), Value::String("none".into()));
    }

    #[test]
    fn ida_y_vuelta_del_emblema() {
        let logo = FastfetchLogo {
            kind: "file".into(),
            source: Some("l.png".into()),
            width: Some(20),
            height: Some(10),
            padding: Some(2),
        };
        let round = logo_from_value(&serde_json::json!({ "logo": logo_to_value(&logo) }));
        assert_eq!(round, logo);
    }
}

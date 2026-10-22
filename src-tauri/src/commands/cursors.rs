//! El cursor del sistema, en un solo lugar.
//!
//! Antes se cambiaba en dos pantallas que no se hablaban —el tema, en «Tema», por
//! `gsettings`; el tema y el tamaño, en las entradas de Wayfire, por `wayfire.ini`—
//! y quedaba un cursor para las aplicaciones y otro para el escritorio. Acá se
//! aplican los dos a la vez, y además se dibujan los cursores de cada tema para
//! elegir con la vista, como los iconos.
//!
//! Los cursores son archivos Xcursor, no imágenes: para mostrarlos se decodifica
//! el formato (cabecera, tabla de contenidos y un cuadro ARGB premultiplicado) y
//! se vuelve a escribir como PNG.

use crate::commands::system_config::{get_cursor_themes, set_cursor_theme};
use crate::commands::wayfire_config::WayfireConfig;
use crate::commands::wayfire_ini::update_section;
use base64::Engine;
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Los cursores que se dibujan de cada tema, con los nombres que puede tener cada
/// uno: los temas viejos usan `hand2` donde los nuevos usan `pointer`.
const PREVIEW_CURSORS: [&[&str]; 4] = [
    &["left_ptr", "default", "arrow"],
    &["pointer", "hand2", "hand1"],
    &["text", "xterm", "ibeam"],
    &["watch", "wait", "progress"],
];

/// El tamaño al que se piden los cuadros del cursor para la vista previa.
const PREVIEW_SIZE: u32 = 32;

/// Los tamaños que se ofrecen. Wayfire y GTK aceptan cualquiera; éstos son los
/// que los temas traen dibujados.
const SIZES: [u32; 6] = [16, 24, 32, 48, 64, 96];

/// Más grande que esto no es un cursor, es un archivo mal hecho.
const MAX_SIDE: u32 = 512;

const XCURSOR_MAGIC: &[u8; 4] = b"Xcur";
const XCURSOR_IMAGE: u32 = 0xfffd0002;

#[derive(Debug, Serialize)]
pub struct CursorThemePreview {
    pub name: String,
    /// PNG en `data:`, uno por cada cursor que el tema trae de la lista.
    pub images: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct CursorState {
    pub theme: String,
    pub size: u32,
}

/// Un cuadro ya decodificado: `rgba` sin premultiplicar, ancho por alto.
#[derive(Debug, PartialEq)]
pub struct CursorFrame {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

fn read_u32(bytes: &[u8], at: usize) -> Option<u32> {
    let end = at.checked_add(4)?;
    Some(u32::from_le_bytes(bytes.get(at..end)?.try_into().ok()?))
}

/// El cuadro del archivo Xcursor cuyo tamaño nominal es el más cercano a
/// `wanted`. `None` si el archivo no es un Xcursor o está truncado.
///
/// Todo se lee con límites comprobados: es un archivo de otro programa, y uno
/// roto no puede hacer que se pida memoria de más ni que se lea fuera de él.
pub fn decode_xcursor(bytes: &[u8], wanted: u32) -> Option<CursorFrame> {
    if bytes.get(0..4)? != XCURSOR_MAGIC {
        return None;
    }
    let entries = read_u32(bytes, 12)? as usize;
    // Cada entrada son tres u32; más de las que caben en el archivo es mentira.
    if entries > bytes.len() / 12 {
        return None;
    }

    let mut best: Option<(u32, usize)> = None;
    for index in 0..entries {
        let at = 16 + index * 12;
        if read_u32(bytes, at)? != XCURSOR_IMAGE {
            continue;
        }
        let size = read_u32(bytes, at + 4)?;
        let position = read_u32(bytes, at + 8)? as usize;
        let distance = size.abs_diff(wanted);
        if best.is_none_or(|(best_distance, _)| distance < best_distance) {
            best = Some((distance, position));
        }
    }
    let (_, chunk) = best?;

    // Cabecera del cuadro: largo, tipo, tamaño, versión, ancho, alto, dos puntos
    // de agarre y el retardo; después, los píxeles.
    let header_len = read_u32(bytes, chunk)? as usize;
    let width = read_u32(bytes, chunk + 16)?;
    let height = read_u32(bytes, chunk + 20)?;
    if width == 0 || height == 0 || width > MAX_SIDE || height > MAX_SIDE {
        return None;
    }
    let pixels = (width * height) as usize;
    let start = chunk.checked_add(header_len)?;
    let data = bytes.get(start..start.checked_add(pixels.checked_mul(4)?)?)?;

    let mut rgba = Vec::with_capacity(pixels * 4);
    for pixel in data.chunks_exact(4) {
        let argb = u32::from_le_bytes(pixel.try_into().ok()?);
        let alpha = argb >> 24;
        // Xcursor guarda el color ya multiplicado por el alfa.
        let unpremultiply = |channel: u32| -> u8 {
            if alpha == 0 {
                0
            } else {
                ((channel * 255 + alpha / 2) / alpha).min(255) as u8
            }
        };
        rgba.push(unpremultiply((argb >> 16) & 0xff));
        rgba.push(unpremultiply((argb >> 8) & 0xff));
        rgba.push(unpremultiply(argb & 0xff));
        rgba.push(alpha as u8);
    }
    Some(CursorFrame {
        width,
        height,
        rgba,
    })
}

fn encode_png(frame: &CursorFrame) -> Option<Vec<u8>> {
    let mut out = Vec::new();
    let mut encoder = png::Encoder::new(&mut out, frame.width, frame.height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header().ok()?;
    writer.write_image_data(&frame.rgba).ok()?;
    writer.finish().ok()?;
    Some(out)
}

/// Un nombre de tema no es una ruta: sin separadores ni `..`, o se podría pedir
/// cualquier archivo del disco.
fn is_plain_name(name: &str) -> bool {
    !name.is_empty() && !name.contains('/') && !name.contains('\\') && name != "." && name != ".."
}

fn icon_roots() -> Vec<PathBuf> {
    let home = std::env::var("HOME").unwrap_or_default();
    let home = PathBuf::from(home);
    vec![
        home.join(".local/share/icons"),
        home.join(".icons"),
        PathBuf::from("/usr/share/icons"),
    ]
}

/// Los temas de los que hereda `index.theme`, en el orden en que los declara.
fn inherits(theme_dir: &Path) -> Vec<String> {
    let Ok(index) = std::fs::read_to_string(theme_dir.join("index.theme")) else {
        return Vec::new();
    };
    index
        .lines()
        .find_map(|line| line.trim().strip_prefix("Inherits="))
        .map(|list| {
            list.split(',')
                .map(|name| name.trim().to_string())
                .filter(|name| is_plain_name(name))
                .collect()
        })
        .unwrap_or_default()
}

/// La carpeta `cursors` del tema, o la del primer tema del que hereda y la tenga.
/// La herencia se sigue hasta cuatro niveles: un ciclo no puede colgarla.
fn cursors_dir(roots: &[PathBuf], theme: &str, depth: u32) -> Option<PathBuf> {
    if depth > 4 || !is_plain_name(theme) {
        return None;
    }
    for root in roots {
        let base = root.join(theme);
        let cursors = base.join("cursors");
        if cursors.is_dir() {
            return Some(cursors);
        }
        for parent in inherits(&base) {
            if let Some(found) = cursors_dir(roots, &parent, depth + 1) {
                return Some(found);
            }
        }
    }
    None
}

/// Los cuadros de la vista previa de un tema, ya como PNG en `data:`.
fn preview_images(roots: &[PathBuf], theme: &str) -> Vec<String> {
    let Some(dir) = cursors_dir(roots, theme, 0) else {
        return Vec::new();
    };
    PREVIEW_CURSORS
        .iter()
        .filter_map(|names| {
            names.iter().find_map(|name| {
                let bytes = std::fs::read(dir.join(name)).ok()?;
                let png = encode_png(&decode_xcursor(&bytes, PREVIEW_SIZE)?)?;
                Some(format!(
                    "data:image/png;base64,{}",
                    base64::engine::general_purpose::STANDARD.encode(png)
                ))
            })
        })
        .collect()
}

#[tauri::command]
pub async fn get_cursor_theme_preview(theme: String) -> Result<CursorThemePreview, String> {
    if !is_plain_name(&theme) {
        return Err(format!("Tema de cursor inválido: «{theme}»"));
    }
    Ok(CursorThemePreview {
        images: preview_images(&icon_roots(), &theme),
        name: theme,
    })
}

fn gsettings_get(key: &str) -> Option<String> {
    let output = Command::new("gsettings")
        .args(["get", "org.gnome.desktop.interface", key])
        .output()
        .ok()?;
    output.status.success().then(|| {
        String::from_utf8_lossy(&output.stdout)
            .trim()
            .trim_matches('\'')
            .to_string()
    })
}

#[tauri::command]
pub async fn get_cursor_state() -> Result<CursorState, String> {
    // `gsettings` es un proceso que se espera: va en un hilo aparte para no
    // trabar el ejecutor asíncrono.
    tauri::async_runtime::spawn_blocking(|| CursorState {
        theme: gsettings_get("cursor-theme")
            .filter(|theme| !theme.is_empty())
            .unwrap_or_else(|| "Adwaita".to_string()),
        size: gsettings_get("cursor-size")
            .and_then(|size| size.parse().ok())
            .filter(|size| SIZES.contains(size))
            .unwrap_or(24),
    })
    .await
    .map_err(|e| format!("No se pudo leer el cursor: {e}"))
}

fn set_cursor_size(size: u32) -> Result<(), String> {
    let output = Command::new("gsettings")
        .args([
            "set",
            "org.gnome.desktop.interface",
            "cursor-size",
            &size.to_string(),
        ])
        .output()
        .map_err(|e| format!("Error ejecutando gsettings para el tamaño del cursor: {e}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "Error al aplicar el tamaño del cursor: {}",
            String::from_utf8_lossy(&output.stderr)
        ))
    }
}

/// Lo que se escribe en la sección `[input]` de `wayfire.ini`.
fn wayfire_values(theme: &str, size: u32) -> HashMap<String, String> {
    HashMap::from([
        ("cursor_theme".to_string(), theme.to_string()),
        ("cursor_size".to_string(), size.to_string()),
    ])
}

/// Aplica el cursor a las aplicaciones (`gsettings`) y al escritorio (Wayfire) a
/// la vez.
#[tauri::command]
pub async fn apply_cursor(theme: String, size: u32) -> Result<(), String> {
    if !SIZES.contains(&size) {
        return Err(format!("Tamaño de cursor no ofrecido: {size}"));
    }
    if !get_cursor_themes().await?.contains(&theme) {
        return Err(format!("Tema de cursor no encontrado: «{theme}»"));
    }

    set_cursor_theme(&theme).await?;
    tauri::async_runtime::spawn_blocking(move || set_cursor_size(size))
        .await
        .map_err(|e| format!("No se pudo aplicar el tamaño del cursor: {e}"))??;

    let values = wayfire_values(&theme, size);
    WayfireConfig::global()
        .edit(|content| update_section(content, "input", &values, false))
        .map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Un Xcursor con un cuadro por cada `(tamaño nominal, píxeles ARGB)`, de
    /// 1×`pixels.len()` para no armar nada más.
    fn xcursor(frames: &[(u32, &[u32])]) -> Vec<u8> {
        let mut out = Vec::new();
        out.extend_from_slice(b"Xcur");
        out.extend_from_slice(&16u32.to_le_bytes());
        out.extend_from_slice(&0x10000u32.to_le_bytes());
        out.extend_from_slice(&(frames.len() as u32).to_le_bytes());
        let mut position = 16 + frames.len() * 12;
        for (size, pixels) in frames {
            out.extend_from_slice(&XCURSOR_IMAGE.to_le_bytes());
            out.extend_from_slice(&size.to_le_bytes());
            out.extend_from_slice(&(position as u32).to_le_bytes());
            position += 36 + pixels.len() * 4;
        }
        for (size, pixels) in frames {
            for value in [36, XCURSOR_IMAGE, *size, 1, 1, pixels.len() as u32, 0, 0, 0] {
                out.extend_from_slice(&u32::to_le_bytes(value));
            }
            for pixel in *pixels {
                out.extend_from_slice(&pixel.to_le_bytes());
            }
        }
        out
    }

    #[test]
    fn decodifica_y_deshace_el_premultiplicado() {
        // Alfa 0x80 con el rojo ya multiplicado: 0x40 es la mitad de 0x80.
        let bytes = xcursor(&[(32, &[0x8040_0000])]);
        let frame = decode_xcursor(&bytes, 32).expect("un cursor bien formado");

        assert_eq!((frame.width, frame.height), (1, 1));
        assert_eq!(frame.rgba[3], 0x80, "el alfa se conserva");
        assert!(
            (frame.rgba[0] as i32 - 0x80).abs() <= 1,
            "el rojo vuelve a su valor sin multiplicar"
        );
        assert_eq!((frame.rgba[1], frame.rgba[2]), (0, 0));
    }

    #[test]
    fn un_pixel_transparente_no_divide_por_cero() {
        let bytes = xcursor(&[(32, &[0x0000_0000])]);
        let frame = decode_xcursor(&bytes, 32).unwrap();

        assert_eq!(frame.rgba, vec![0, 0, 0, 0]);
    }

    #[test]
    fn elige_el_cuadro_de_tamano_mas_cercano() {
        let bytes = xcursor(&[(24, &[0xff00_0000]), (48, &[0xffff_ffff])]);

        let chico = decode_xcursor(&bytes, 28).unwrap();
        let grande = decode_xcursor(&bytes, 40).unwrap();

        assert_eq!(chico.rgba[0], 0, "el de 24 es negro");
        assert_eq!(grande.rgba[0], 255, "el de 48 es blanco");
    }

    #[test]
    fn un_archivo_que_no_es_xcursor_o_esta_truncado_no_se_decodifica() {
        assert!(decode_xcursor(b"", 32).is_none());
        assert!(decode_xcursor(b"PNG\0aaaaaaaaaaaaaaaaaaaa", 32).is_none());

        let bytes = xcursor(&[(32, &[0xff00_ff00])]);
        for corte in [4, 15, 20, 30, bytes.len() - 1] {
            assert!(
                decode_xcursor(&bytes[..corte], 32).is_none(),
                "cortado en {corte}"
            );
        }
    }

    #[test]
    fn una_tabla_que_miente_sobre_su_largo_no_pide_memoria() {
        let mut bytes = xcursor(&[(32, &[0xff00_ff00])]);
        bytes[12..16].copy_from_slice(&u32::MAX.to_le_bytes());

        assert!(decode_xcursor(&bytes, 32).is_none());
    }

    #[test]
    fn un_cuadro_enorme_se_descarta() {
        let mut bytes = xcursor(&[(32, &[0xff00_ff00])]);
        let chunk = 16 + 12;
        bytes[chunk + 16..chunk + 20].copy_from_slice(&u32::MAX.to_le_bytes());

        assert!(decode_xcursor(&bytes, 32).is_none());
    }

    #[test]
    fn el_png_se_puede_volver_a_leer() {
        let frame = CursorFrame {
            width: 2,
            height: 1,
            rgba: vec![255, 0, 0, 255, 0, 0, 255, 128],
        };

        let bytes = encode_png(&frame).unwrap();
        let mut reader = png::Decoder::new(std::io::Cursor::new(bytes))
            .read_info()
            .unwrap();
        let mut buffer = vec![0; reader.output_buffer_size().unwrap()];
        reader.next_frame(&mut buffer).unwrap();

        assert_eq!(buffer, frame.rgba);
    }

    #[test]
    fn un_nombre_de_tema_no_es_una_ruta() {
        assert!(is_plain_name("Adwaita"));
        assert!(is_plain_name("Bibata-Modern-Ice"));
        for malo in ["", ".", "..", "../etc", "a/b", "a\\b"] {
            assert!(!is_plain_name(malo), "«{malo}»");
        }
    }

    struct Dir(PathBuf);
    impl Dir {
        fn new(nombre: &str) -> Self {
            let ruta = std::env::temp_dir().join(format!(
                "vasak-settings-cursor-{nombre}-{}",
                std::process::id()
            ));
            let _ = std::fs::remove_dir_all(&ruta);
            std::fs::create_dir_all(&ruta).unwrap();
            Self(ruta)
        }
    }
    impl Drop for Dir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn tema(raiz: &Path, nombre: &str, cursores: &[&str], inherits: Option<&str>) {
        let base = raiz.join(nombre);
        std::fs::create_dir_all(&base).unwrap();
        if let Some(padre) = inherits {
            std::fs::write(
                base.join("index.theme"),
                format!("[Icon Theme]\nName={nombre}\nInherits={padre}\n"),
            )
            .unwrap();
        }
        if !cursores.is_empty() {
            std::fs::create_dir_all(base.join("cursors")).unwrap();
            for cursor in cursores {
                std::fs::write(
                    base.join("cursors").join(cursor),
                    xcursor(&[(32, &[0xffff_ffff])]),
                )
                .unwrap();
            }
        }
    }

    #[test]
    fn la_vista_previa_junta_un_cuadro_por_cada_cursor_que_el_tema_trae() {
        let dir = Dir::new("preview");
        tema(&dir.0, "Mio", &["left_ptr", "hand2", "xterm"], None);

        let imagenes = preview_images(&[dir.0.clone()], "Mio");

        assert_eq!(imagenes.len(), 3, "sin `watch` ni sus alias hay tres");
        assert!(imagenes
            .iter()
            .all(|imagen| imagen.starts_with("data:image/png;base64,")));
    }

    #[test]
    fn un_tema_sin_cursores_hereda_los_del_padre() {
        let dir = Dir::new("hereda");
        tema(&dir.0, "Padre", &["left_ptr"], None);
        tema(&dir.0, "Hijo", &[], Some("Padre"));

        assert_eq!(preview_images(&[dir.0.clone()], "Hijo").len(), 1);
    }

    #[test]
    fn una_herencia_en_ciclo_no_cuelga_la_busqueda() {
        let dir = Dir::new("ciclo");
        tema(&dir.0, "A", &[], Some("B"));
        tema(&dir.0, "B", &[], Some("A"));

        assert!(preview_images(&[dir.0.clone()], "A").is_empty());
    }

    #[test]
    fn un_tema_que_no_esta_da_una_vista_previa_vacia() {
        let dir = Dir::new("ausente");

        assert!(preview_images(&[dir.0.clone()], "NoExiste").is_empty());
        assert!(preview_images(&[dir.0.clone()], "../etc").is_empty());
    }

    #[test]
    fn el_tema_y_el_tamano_van_juntos_a_la_seccion_input_de_wayfire() {
        let antes = "[core]\nplugins = a b\n\n[input]\nxkb_layout = us\ncursor_size = 24\n";
        let valores = wayfire_values("Bibata", 48);

        let despues = update_section(antes, "input", &valores, false);

        assert!(despues.contains("cursor_theme = Bibata"));
        assert!(despues.contains("cursor_size = 48"));
        assert!(
            despues.contains("xkb_layout = us"),
            "lo que la pantalla no maneja se conserva"
        );
        assert!(despues.contains("plugins = a b"));
    }

    #[test]
    fn los_tamanos_ofrecidos_incluyen_el_de_siempre() {
        assert!(SIZES.contains(&24));
    }
}

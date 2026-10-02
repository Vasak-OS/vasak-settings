//! Los píxeles del fondo de pantalla, para sacarle los colores al esquema.
//!
//! Lo que se lee es **la misma miniatura** que muestra la grilla de fondos
//! (`wallpaper_thumbnail`): de una imagen, una copia escalada; de un video, un
//! cuadro fijo a un segundo del principio. Así un fondo de video da siempre el
//! mismo color, y es el cuadro que la persona ve en la lista.
//!
//! De esa miniatura ffmpeg devuelve una versión chiquita en RGB crudo —96
//! píxeles de ancho, unos cinco mil en total—, que alcanza para la paleta y se
//! manda entera a la interfaz. La cuantización y el contraste se hacen del lado
//! de TypeScript (`src/utils/wallpaper-palette.ts`), que se prueba sin Tauri.
//!
//! ffmpeg ya es dependencia de la aplicación por los fondos de video: con esto
//! no se enlaza ninguna biblioteca nueva.

use std::path::PathBuf;
use std::process::Stdio;

use serde::Serialize;
use tokio::process::Command;

use super::wallpaper_video::{es_video, wallpaper_thumbnail};

/// El ancho de la muestra. Más no cambia la paleta y cuesta más mandarla.
pub const SAMPLE_WIDTH: u32 = 96;

/// Los píxeles de la muestra, fila por fila, tres bytes por píxel (RGB).
#[derive(Debug, Serialize, PartialEq)]
pub struct WallpaperPixels {
    pub width: u32,
    pub height: u32,
    pub data: Vec<u8>,
    /// Si el fondo es un video y los píxeles son de un cuadro suyo.
    pub video: bool,
}

/// Arma la muestra con lo que devolvió ffmpeg, o dice por qué no sirve.
///
/// ffmpeg puede terminar bien y no dejar nada —un archivo que no decodifica—,
/// y una salida que no es un múltiplo de una fila entera es una muestra
/// cortada: en los dos casos se avisa en vez de sacar colores de basura.
pub fn pixels_from_raw(data: Vec<u8>, width: u32, video: bool) -> Result<WallpaperPixels, String> {
    let row = width as usize * 3;
    if row == 0 || data.is_empty() {
        return Err("el fondo no se pudo decodificar".into());
    }
    if !data.len().is_multiple_of(row) {
        return Err("la muestra del fondo llegó cortada".into());
    }
    let height = (data.len() / row) as u32;
    Ok(WallpaperPixels {
        width,
        height,
        data,
        video,
    })
}

/// Los argumentos de ffmpeg para pasar una imagen a RGB crudo por la salida.
pub fn raw_args(input: &str, width: u32) -> Vec<String> {
    vec![
        "-hide_banner".into(),
        "-nostdin".into(),
        "-loglevel".into(),
        "error".into(),
        "-i".into(),
        input.into(),
        "-frames:v".into(),
        "1".into(),
        "-vf".into(),
        format!("scale={width}:-1:flags=area"),
        "-f".into(),
        "rawvideo".into(),
        "-pix_fmt".into(),
        "rgb24".into(),
        "pipe:1".into(),
    ]
}

/// Lee una imagen ya decodificable (la miniatura) como RGB crudo.
pub async fn read_raw_pixels(image: &str, width: u32) -> Result<Vec<u8>, String> {
    let output = Command::new("ffmpeg")
        .args(raw_args(image, width))
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .await
        .map_err(|e| format!("no se pudo ejecutar ffmpeg: {e}"))?;
    if !output.status.success() {
        return Err("el fondo no se pudo decodificar".into());
    }
    Ok(output.stdout)
}

/// Los píxeles del fondo, del cuadro de su miniatura.
///
/// Un error deja todo como estaba: la interfaz se queda con los colores que
/// tenía y lo avisa.
#[tauri::command]
pub async fn wallpaper_pixels(path: String) -> Result<WallpaperPixels, String> {
    let video = es_video(&PathBuf::from(&path));
    let thumbnail = wallpaper_thumbnail(path).await?;
    let data = read_raw_pixels(&thumbnail, SAMPLE_WIDTH).await?;
    pixels_from_raw(data, SAMPLE_WIDTH, video)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn una_muestra_entera_da_su_alto() {
        let data = vec![0u8; 96 * 3 * 54];
        let pixels = pixels_from_raw(data, 96, false).expect("una muestra entera");
        assert_eq!(pixels.width, 96);
        assert_eq!(pixels.height, 54);
        assert!(!pixels.video);
    }

    #[test]
    fn una_salida_vacia_es_un_fondo_que_no_decodifica() {
        assert!(pixels_from_raw(Vec::new(), 96, true).is_err());
    }

    #[test]
    fn una_fila_cortada_no_se_usa() {
        assert!(pixels_from_raw(vec![0u8; 96 * 3 + 5], 96, false).is_err());
    }

    #[test]
    fn ffmpeg_escala_con_el_alto_proporcional_y_saca_rgb_crudo() {
        let args = raw_args("/tmp/x.jpg", 96);
        let joined = args.join(" ");
        assert!(joined.contains("-i /tmp/x.jpg"));
        assert!(joined.contains("scale=96:-1"));
        assert!(joined.contains("-pix_fmt rgb24"));
        assert!(joined.ends_with("pipe:1"));
    }

    /// Con ffmpeg instalado, una imagen de color liso sale de ese color, y un
    /// archivo que no es una imagen da error en vez de una paleta inventada.
    /// Sin ffmpeg la prueba no tiene qué medir y se saltea.
    #[tokio::test]
    async fn de_una_imagen_lisa_sale_su_color_y_de_basura_un_error() {
        if std::process::Command::new("ffmpeg")
            .arg("-version")
            .output()
            .is_err()
        {
            return;
        }
        let dir = std::env::temp_dir().join(format!("vasak-settings-wp-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let png = dir.join("liso.png");
        let ok = std::process::Command::new("ffmpeg")
            .args([
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-f",
                "lavfi",
                "-i",
            ])
            .arg("color=c=0x2a9d8f:s=320x180")
            .args(["-frames:v", "1"])
            .arg(&png)
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        assert!(ok, "ffmpeg genera la imagen de prueba");

        let data = read_raw_pixels(png.to_str().unwrap(), 96).await.unwrap();
        let pixels = pixels_from_raw(data, 96, false).unwrap();
        assert_eq!(pixels.height, 54);
        let (r, g, b) = (pixels.data[0], pixels.data[1], pixels.data[2]);
        assert!((r as i32 - 0x2a).abs() <= 3, "rojo {r}");
        assert!((g as i32 - 0x9d).abs() <= 3, "verde {g}");
        assert!((b as i32 - 0x8f).abs() <= 3, "azul {b}");

        let garbage = dir.join("roto.mp4");
        std::fs::write(&garbage, b"esto no es un video").unwrap();
        let result = read_raw_pixels(garbage.to_str().unwrap(), 96).await;
        assert!(result
            .map(|d| pixels_from_raw(d, 96, true).is_err())
            .unwrap_or(true));

        let _ = std::fs::remove_dir_all(&dir);
    }
}

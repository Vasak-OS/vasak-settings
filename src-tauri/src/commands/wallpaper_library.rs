//! La biblioteca propia de fondos: copiar —y de paso optimizar— la imagen
//! elegida a una carpeta gestionada, junto a las oficiales, para que cualquier
//! app la vea.
//!
//! # Por qué copiar
//!
//! Antes, elegir o soltar una imagen de una carpeta cualquiera guardaba esa ruta
//! tal cual en `desktop.wallpaper`. Aplicarla dependía entonces de autorizar una
//! ruta arbitraria en el protocolo de assets (`wallpaper_assets`), que es
//! frágil: basta que el archivo se mueva, se borre o quede fuera de toda raíz
//! conocida para que el fondo no aparezca. Copiándola a una carpeta propia
//! —`~/.local/share/vasak/wallpapers`— el fondo queda siempre bajo una raíz
//! estable que todas las apps pueden leer y listar, y se muestra junto a los
//! oficiales.
//!
//! # Y de paso, más liviana
//!
//! Los fondos pueden ser de 4K o 5K: decodificados ocupan cientos de megas (ver
//! `wallpaper_video`). Al importarla se la baja a la resolución del monitor y se
//! recodifica a WebP, que pesa bastante menos que el PNG o el JPEG original sin
//! que se note en pantalla. Si ffmpeg no está o falla, se copia el original tal
//! cual: poder optimizar no es condición para poder poner el fondo.

use std::path::{Path, PathBuf};

use tokio::process::Command;

use super::system_config::{list_wallpapers_in, WALLPAPER_IMAGE_EXTENSIONS};

/// Dónde viven los fondos propios ya importados.
pub fn library_dir() -> Option<PathBuf> {
    dirs::data_dir().map(|data| data.join("vasak").join("wallpapers"))
}

/// Si una ruta es una imagen que se puede importar, por su extensión. Un video
/// no: los fondos en movimiento se preparan aparte (`wallpaper_video`).
pub fn is_importable_image(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .map(|ext| WALLPAPER_IMAGE_EXTENSIONS.contains(&ext.as_str()))
        .unwrap_or(false)
}

/// El nombre del archivo importado: el del original más su tamaño y su fecha de
/// modificación, para que dos imágenes distintas con el mismo nombre no se
/// pisen y la misma imagen no se reimporte. La extensión la pone quien llama
/// según haya podido optimizar (`webp`) o no (la original).
pub fn import_name(source: &Path, len: u64, modified: u64, extension: &str) -> String {
    let stem = source
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("fondo");
    format!("{stem}-{len}-{modified}.{extension}")
}

/// El tamaño y la fecha de modificación de un archivo, para armar su nombre.
async fn len_and_modified(path: &Path) -> Result<(u64, u64), String> {
    let metadata = tokio::fs::metadata(path)
        .await
        .map_err(|error| format!("{error}"))?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or(0);
    Ok((metadata.len(), modified))
}

/// Si un archivo existe, sin bloquear el runtime. Un error al mirar (permisos,
/// la carpeta no está) cuenta como «no está»: peor caso, se rehace la copia.
async fn path_exists(path: &Path) -> bool {
    tokio::fs::try_exists(path).await.unwrap_or(false)
}

/// Baja la imagen a lo sumo a `width`×`height` —sin agrandarla nunca— y la
/// recodifica a WebP. Devuelve si dejó un archivo con contenido.
///
/// `scale='min(iw,W)':'min(ih,H)':force_original_aspect_ratio=decrease` tapa
/// cada lado en el del monitor conservando la proporción; con `min` una imagen
/// ya chica se deja como está en vez de estirarla.
async fn optimize_to_webp(source: &Path, output: &Path, width: u32, height: u32) -> bool {
    let (Some(input), Some(target)) = (source.to_str(), output.to_str()) else {
        return false;
    };
    let filter = format!(
        "scale='min(iw,{width})':'min(ih,{height})':force_original_aspect_ratio=decrease:flags=lanczos"
    );
    let status = Command::new("ffmpeg")
        .args([
            "-hide_banner",
            "-nostdin",
            "-y",
            "-i",
            input,
            "-vf",
            &filter,
            "-c:v",
            "libwebp",
            "-quality",
            "90",
            "-compression_level",
            "6",
            target,
        ])
        .status()
        .await;

    matches!(status, Ok(status) if status.success()) && super::wallpaper_video::has_content(output)
}

/// Importa una imagen a la biblioteca propia y devuelve la ruta del archivo
/// importado, que es la que hay que guardar en `desktop.wallpaper`.
///
/// Si ya está importada (mismo tamaño y fecha), devuelve la copia que ya existe
/// sin rehacer nada.
#[tauri::command]
pub async fn import_wallpaper(path: String) -> Result<String, String> {
    let source = tokio::fs::canonicalize(path.trim())
        .await
        .map_err(|error| format!("no se pudo resolver {}: {error}", path.trim()))?;

    if !is_importable_image(&source) {
        return Err(format!(
            "{} no es una imagen que se pueda importar",
            source.display()
        ));
    }

    let dir = library_dir().ok_or("no se pudo determinar la carpeta de la biblioteca")?;
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|error| format!("{error}"))?;

    let (len, modified) = len_and_modified(&source).await?;

    // La copia optimizada: si ya está, no se rehace.
    let optimized = dir.join(import_name(&source, len, modified, "webp"));
    if path_exists(&optimized).await {
        return Ok(optimized.to_string_lossy().into_owned());
    }

    // Un parcial con nombre único por importación: dos guardados del mismo
    // archivo —o dos procesos— no se pisan el temporal, que si no uno podía
    // renombrarlo mientras el otro lo escribía y dejar un WebP cortado tomado
    // por bueno.
    let unique = uuid::Uuid::new_v4();

    let (width, height) = super::wallpaper_video::target_resolution().await;
    let partial = dir.join(format!(".parcial-{unique}.webp"));
    if optimize_to_webp(&source, &partial, width, height).await {
        tokio::fs::rename(&partial, &optimized)
            .await
            .map_err(|error| format!("{error}"))?;
        return Ok(optimized.to_string_lossy().into_owned());
    }
    let _ = tokio::fs::remove_file(&partial).await;

    // Que no se pueda optimizar no es motivo para no poder poner el fondo: se
    // copia el original tal cual. Se copia a un parcial y recién se renombra,
    // para que una copia cortada a la mitad no quede con nombre de fondo válido.
    let extension = source
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("img");
    let copy = dir.join(import_name(&source, len, modified, extension));
    if path_exists(&copy).await {
        return Ok(copy.to_string_lossy().into_owned());
    }
    let partial_copy = dir.join(format!(".parcial-{unique}.{extension}"));
    if let Err(error) = tokio::fs::copy(&source, &partial_copy).await {
        let _ = tokio::fs::remove_file(&partial_copy).await;
        return Err(format!("{error}"));
    }
    tokio::fs::rename(&partial_copy, &copy)
        .await
        .map_err(|error| format!("{error}"))?;
    Ok(copy.to_string_lossy().into_owned())
}

/// Los fondos propios ya importados, para mostrarlos junto a los oficiales.
#[tauri::command]
pub async fn get_library_wallpapers() -> Result<Vec<String>, String> {
    let Some(dir) = library_dir() else {
        return Ok(vec![]);
    };
    Ok(list_wallpapers_in(&dir, &WALLPAPER_IMAGE_EXTENSIONS))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn solo_las_imagenes_se_importan() {
        assert!(is_importable_image(Path::new("/x/foto.jpg")));
        assert!(is_importable_image(Path::new("/x/foto.PNG")));
        assert!(is_importable_image(Path::new("/x/foto.webp")));
        assert!(!is_importable_image(Path::new("/x/video.mp4")));
        assert!(!is_importable_image(Path::new("/x/video.webm")));
        assert!(!is_importable_image(Path::new("/x/sin-extension")));
    }

    #[test]
    fn el_nombre_importado_lleva_tamano_y_fecha() {
        let name = import_name(
            Path::new("/descargas/Mi Foto.jpg"),
            2048,
            1700000000,
            "webp",
        );
        assert_eq!(name, "Mi Foto-2048-1700000000.webp");
    }

    #[test]
    fn dos_imagenes_distintas_con_el_mismo_nombre_no_se_pisan() {
        let a = import_name(Path::new("/a/foto.jpg"), 10, 100, "webp");
        let b = import_name(Path::new("/b/foto.jpg"), 20, 200, "webp");
        assert_ne!(a, b);
    }

    // `dirs::data_dir()` lee `XDG_DATA_HOME` del proceso, que es global: los
    // tests que lo cambian se turnan, y cada uno apunta a un directorio propio
    // para no tocar el hogar real.
    static ENTORNO: std::sync::Mutex<()> = std::sync::Mutex::new(());

    /// Corre `prueba` con `XDG_DATA_HOME` en una carpeta nueva y la limpia al final.
    fn con_datos_temporales(name: &str, prueba: impl FnOnce(&Path)) {
        let _turno = ENTORNO.lock().unwrap_or_else(|e| e.into_inner());
        let base = std::env::temp_dir().join(format!("vasak-wp-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).unwrap();
        let anterior = std::env::var_os("XDG_DATA_HOME");
        std::env::set_var("XDG_DATA_HOME", &base);
        prueba(&base);
        match anterior {
            Some(valor) => std::env::set_var("XDG_DATA_HOME", valor),
            None => std::env::remove_var("XDG_DATA_HOME"),
        }
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn la_biblioteca_vive_bajo_los_datos_del_usuario() {
        con_datos_temporales("dir", |base| {
            assert_eq!(library_dir(), Some(base.join("vasak").join("wallpapers")));
        });
    }

    #[test]
    fn una_biblioteca_que_no_existe_no_lista_nada() {
        con_datos_temporales("vacia", |_| {
            let lista = tauri::async_runtime::block_on(get_library_wallpapers()).unwrap();
            assert!(lista.is_empty());
        });
    }

    #[test]
    fn la_biblioteca_lista_solo_imagenes() {
        con_datos_temporales("lista", |base| {
            let dir = base.join("vasak").join("wallpapers");
            std::fs::create_dir_all(&dir).unwrap();
            for name in ["b.webp", "a.png", "loop.mp4", "notas.txt"] {
                std::fs::write(dir.join(name), b"x").unwrap();
            }
            let lista = tauri::async_runtime::block_on(get_library_wallpapers()).unwrap();
            let nombres: Vec<_> = lista
                .iter()
                .map(|p| {
                    Path::new(p)
                        .file_name()
                        .unwrap()
                        .to_str()
                        .unwrap()
                        .to_owned()
                })
                .collect();
            assert_eq!(nombres, ["a.png", "b.webp"]);
        });
    }

    #[test]
    fn importar_algo_que_no_es_una_imagen_es_un_error() {
        con_datos_temporales("noimg", |base| {
            let video = base.join("loop.mp4");
            std::fs::write(&video, b"x").unwrap();
            let result = tauri::async_runtime::block_on(import_wallpaper(
                video.to_string_lossy().into_owned(),
            ));
            assert!(result.is_err());
            assert!(!base
                .join("vasak")
                .join("wallpapers")
                .join("loop.mp4")
                .exists());
        });
    }

    #[test]
    fn importar_una_ruta_que_no_existe_es_un_error() {
        con_datos_temporales("noexiste", |_| {
            let result =
                tauri::async_runtime::block_on(import_wallpaper("/no/existe/foto.jpg".into()));
            assert!(result.is_err());
        });
    }

    /// Sin poder optimizar (aquí, un `.png` que no es una imagen y ffmpeg lo
    /// rechaza) se copia el original a la biblioteca, y reimportar devuelve la
    /// misma copia sin duplicarla.
    #[test]
    fn si_no_se_puede_optimizar_se_copia_el_original_y_reimportar_no_duplica() {
        con_datos_temporales("copia", |base| {
            let origen = base.join("Descargas").join("foto.png");
            std::fs::create_dir_all(origen.parent().unwrap()).unwrap();
            std::fs::write(&origen, b"esto no es un png de verdad").unwrap();
            let ruta = origen.to_string_lossy().into_owned();

            let primera = tauri::async_runtime::block_on(import_wallpaper(ruta.clone())).unwrap();
            let dir = base.join("vasak").join("wallpapers");
            assert!(Path::new(&primera).starts_with(std::fs::canonicalize(&dir).unwrap()));
            assert_eq!(
                std::fs::read(&primera).unwrap(),
                b"esto no es un png de verdad"
            );
            // Quedó la copia y ningún parcial a medias.
            assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 1);

            let segunda = tauri::async_runtime::block_on(import_wallpaper(ruta)).unwrap();
            assert_eq!(primera, segunda);
            assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 1);

            // Y ya aparece en la lista de la biblioteca.
            let lista = tauri::async_runtime::block_on(get_library_wallpapers()).unwrap();
            assert_eq!(lista, [primera]);
        });
    }

    /// Con ffmpeg de verdad: deja un `.webp` en la biblioteca y reimportar el
    /// mismo archivo devuelve la misma ruta. Sin ffmpeg en la máquina no hay
    /// nada que probar y se salta.
    #[test]
    fn con_ffmpeg_la_imagen_queda_en_webp_y_reimportar_devuelve_la_misma_ruta() {
        con_datos_temporales("ffmpeg", |base| {
            let origen = base.join("origen.png");
            let hecho = std::process::Command::new("ffmpeg")
                .args([
                    "-hide_banner",
                    "-nostdin",
                    "-y",
                    "-f",
                    "lavfi",
                    "-i",
                    "testsrc=size=64x64:rate=1",
                    "-frames:v",
                    "1",
                ])
                .arg(&origen)
                .stderr(std::process::Stdio::null())
                .status();
            if !matches!(hecho, Ok(s) if s.success()) {
                eprintln!("sin ffmpeg: se salta");
                return;
            }
            let ruta = origen.to_string_lossy().into_owned();

            let primera = tauri::async_runtime::block_on(import_wallpaper(ruta.clone())).unwrap();
            assert!(primera.ends_with(".webp"), "{primera}");
            assert!(Path::new(&primera).starts_with(std::fs::canonicalize(base).unwrap()));
            assert!(super::super::wallpaper_video::has_content(Path::new(
                &primera
            )));

            let hecho_en = std::fs::metadata(&primera).unwrap().modified().unwrap();
            let segunda = tauri::async_runtime::block_on(import_wallpaper(ruta)).unwrap();
            assert_eq!(primera, segunda);
            // No se rehizo: el archivo es el mismo, no uno recodificado encima.
            assert_eq!(
                std::fs::metadata(&segunda).unwrap().modified().unwrap(),
                hecho_en
            );
        });
    }
}

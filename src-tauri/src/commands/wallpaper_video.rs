//! Preparar un video para usarlo de fondo, una vez, al elegirlo.
//!
//! Un fondo en movimiento se decodifica sin parar mientras se lo mira, así que
//! todo lo que se pueda ahorrar conviene ahorrarlo **antes**, no en cada cuadro:
//!
//!  · **Escala**: un video 4K en una pantalla 1080p decodifica cuatro veces los
//!    píxeles que se van a ver. Se baja a la resolución del monitor más grande;
//!    nunca se agranda, que sería gastar por nada.
//!  · **Cuadros por segundo**: arriba de 30 no se nota en un fondo y cuesta el
//!    doble.
//!  · **Audio**: un fondo va en silencio siempre, y la pista se sigue
//!    decodificando igual. Se saca.
//!  · **Códec**: si no es H.264, se recodifica, porque es el único que se puede
//!    dar por reproducible en cualquier máquina.
//!
//! El resultado va a la caché, con una clave que incluye el archivo de origen y
//! la resolución de destino, así que elegir dos veces el mismo fondo no vuelve a
//! recodificar. Si no hay nada que mejorar, se devuelve el original: no tiene
//! sentido copiar 30 MB para dejarlos igual.
//!
//! Si algo falla —no está ffmpeg, el archivo está roto— se devuelve el original
//! y el fondo funciona como antes. Una optimización que impide poner un fondo
//! sería peor que no tenerla.

use std::path::{Path, PathBuf};
use std::process::Stdio;

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

/// Arriba de esto no se nota en un fondo y cuesta el doble.
const MAX_FPS: f64 = 30.0;

/// Con qué se compara cuando no se pudo averiguar la resolución de las
/// pantallas: lo más común, y equivocarse para abajo sólo cuesta nitidez.
const FALLBACK_WIDTH: u32 = 1920;
const FALLBACK_HEIGHT: u32 = 1080;

#[derive(Debug, Clone, Serialize)]
pub struct PreparedWallpaper {
    /// La ruta que hay que guardar en la configuración.
    pub path: String,
    /// Si se generó una copia optimizada o se dejó el original.
    pub optimized: bool,
    /// Qué se hizo, o por qué no se hizo nada. Va a la interfaz.
    pub detail: String,
}

/// Lo que ffprobe cuenta del archivo.
#[derive(Debug, Clone, PartialEq)]
pub struct VideoFacts {
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub codec: String,
    pub has_audio: bool,
    pub duration: f64,
}

/// Qué hay que arreglar. Vacío significa que el archivo ya está bien.
#[derive(Debug, Default, PartialEq)]
pub struct Plan {
    pub scale_to: Option<(u32, u32)>,
    pub cap_fps: bool,
    pub drop_audio: bool,
    pub recode: bool,
}

impl Plan {
    pub fn is_empty(&self) -> bool {
        self.scale_to.is_none() && !self.cap_fps && !self.drop_audio && !self.recode
    }
}

/// Decide qué hacer, sin tocar el disco: es la parte que se puede probar.
pub fn plan_for(facts: &VideoFacts, target: (u32, u32)) -> Plan {
    let (target_w, target_h) = target;

    Plan {
        // Sólo hacia abajo. Y manteniendo la proporción: se escala por el lado
        // que más sobra, y el otro sale de ahí.
        scale_to: (facts.width > target_w || facts.height > target_h)
            .then(|| fit_inside(facts.width, facts.height, target_w, target_h)),
        cap_fps: facts.fps > MAX_FPS + 0.5,
        drop_audio: facts.has_audio,
        recode: facts.codec != "h264",
    }
}

/// Las medidas que entran en el destino sin deformar la imagen.
///
/// Los dos lados salen pares porque H.264 con submuestreo de croma no admite
/// impares: ffmpeg falla, y falla con un mensaje que no dice eso.
pub fn fit_inside(width: u32, height: u32, max_width: u32, max_height: u32) -> (u32, u32) {
    let factor = f64::min(
        max_width as f64 / width as f64,
        max_height as f64 / height as f64,
    );

    let par = |valor: f64| -> u32 {
        let entero = valor.round().max(2.0) as u32;
        entero - (entero % 2)
    };

    (par(width as f64 * factor), par(height as f64 * factor))
}

/// El nombre del archivo en la caché.
///
/// Incluye el tamaño y la fecha del original: si alguien reemplaza el video
/// dejando el mismo nombre, la clave cambia y no se sirve la copia vieja.
pub fn cache_key(source: &Path, size: u64, modified_secs: u64, target: (u32, u32)) -> String {
    use std::hash::{Hash, Hasher};

    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    source.hash(&mut hasher);
    size.hash(&mut hasher);
    modified_secs.hash(&mut hasher);
    target.hash(&mut hasher);

    format!("fondo-{:016x}.mp4", hasher.finish())
}

/// El avance que informa ffmpeg, en segundos de video ya procesados.
pub fn parse_progress(line: &str) -> Option<f64> {
    let valor = line.strip_prefix("out_time_us=")?.trim();
    valor.parse::<f64>().ok().map(|micros| micros / 1_000_000.0)
}

fn cache_dir() -> Option<PathBuf> {
    let base = std::env::var("XDG_CACHE_HOME")
        .ok()
        .map(PathBuf::from)
        .or_else(|| std::env::var("HOME").ok().map(|h| PathBuf::from(h).join(".cache")))?;
    Some(base.join("vasak").join("wallpapers"))
}

async fn probe(path: &str) -> Result<VideoFacts, String> {
    let salida = Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-show_entries",
            "stream=codec_type,codec_name,width,height,r_frame_rate:format=duration",
            "-of",
            "default=noprint_wrappers=1",
            path,
        ])
        .output()
        .await
        .map_err(|e| format!("no se pudo ejecutar ffprobe: {e}"))?;

    if !salida.status.success() {
        return Err(String::from_utf8_lossy(&salida.stderr).trim().to_string());
    }

    parse_ffprobe(&String::from_utf8_lossy(&salida.stdout))
}

/// Lee la salida de ffprobe. Separado para poder probarlo con texto fijo.
pub fn parse_ffprobe(texto: &str) -> Result<VideoFacts, String> {
    let mut facts = VideoFacts {
        width: 0,
        height: 0,
        fps: 0.0,
        codec: String::new(),
        has_audio: false,
        duration: 0.0,
    };
    let mut en_video = false;

    for linea in texto.lines() {
        let (clave, valor) = match linea.split_once('=') {
            Some(par) => par,
            None => continue,
        };

        match clave {
            "codec_type" => {
                en_video = valor == "video";
                if valor == "audio" {
                    facts.has_audio = true;
                }
            }
            "codec_name" if en_video => facts.codec = valor.to_string(),
            "width" if en_video => facts.width = valor.parse().unwrap_or(0),
            "height" if en_video => facts.height = valor.parse().unwrap_or(0),
            "r_frame_rate" if en_video => {
                // Viene como fracción: 30000/1001.
                if let Some((num, den)) = valor.split_once('/') {
                    let num: f64 = num.parse().unwrap_or(0.0);
                    let den: f64 = den.parse().unwrap_or(1.0);
                    if den > 0.0 {
                        facts.fps = num / den;
                    }
                }
            }
            "duration" => facts.duration = valor.parse().unwrap_or(0.0),
            _ => {}
        }
    }

    if facts.width == 0 || facts.height == 0 {
        return Err("el archivo no tiene una pista de video que se pueda leer".into());
    }

    Ok(facts)
}

/// La resolución a la que conviene dejar el video: la del monitor más grande.
async fn target_resolution() -> (u32, u32) {
    match super::monitors::get_detected_monitors().await {
        Ok(report) => report
            .monitors
            .iter()
            .filter(|monitor| monitor.enabled)
            .map(|monitor| (monitor.logical_width, monitor.logical_height))
            .max_by_key(|(width, height)| (*width as u64) * (*height as u64))
            .filter(|(width, height)| *width > 0 && *height > 0)
            .unwrap_or((FALLBACK_WIDTH, FALLBACK_HEIGHT)),
        Err(_) => (FALLBACK_WIDTH, FALLBACK_HEIGHT),
    }
}

/// Una miniatura del fondo, sea imagen o video.
///
/// Los fondos que trae VasakOS son de 4K y 5K: decodificados en memoria, los
/// diez de la grilla suman más de medio giga, y WebKit además guarda copias
/// escaladas. Entregarle los archivos originales para dibujar recuadros de 200
/// píxeles es lo que hacía que la aplicación creciera hasta que el kernel la
/// mataba.
///
/// Con los videos hay una razón más: un elemento multimedia apuntando al
/// protocolo interno de la aplicación falla —el reproductor de WebKit no sabe
/// leer de un esquema propio— y **reintenta**, y en cada intento el protocolo
/// entrega el archivo completo otra vez.
///
/// ffmpeg sirve para los dos casos: de un video saca un cuadro, de una imagen
/// una copia escalada.
#[tauri::command]
pub async fn wallpaper_thumbnail(path: String) -> Result<String, String> {
    let source = PathBuf::from(&path);
    let metadata = std::fs::metadata(&source).map_err(|e| format!("{e}"))?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let dir = cache_dir().ok_or("no se pudo determinar la carpeta de caché")?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("{e}"))?;

    let destino = dir.join(thumbnail_name(&source, metadata.len(), modified));

    if destino.exists() {
        return Ok(destino.to_string_lossy().into_owned());
    }

    let parcial = destino.with_extension("parcial.jpg");

    // Una imagen y un video no se tratan igual. En un video conviene saltar un
    // segundo, porque el primer cuadro de muchos es negro; en una imagen ese
    // salto hace que ffmpeg escriba un archivo **vacío y devuelva éxito**, que
    // es la peor forma de fallar: el chequeo de «terminó bien y el archivo
    // existe» lo daba por bueno y la previsualización quedaba en blanco.
    let salto: &[&str] = if es_video(&source) { &["-ss", "1"] } else { &[] };

    if !extraer_cuadro(&path, &parcial, salto).await? && es_video(&source) {
        // Un video más corto que el salto: se reintenta desde el principio.
        extraer_cuadro(&path, &parcial, &[]).await?;
    }

    if !archivo_con_contenido(&parcial) {
        let _ = std::fs::remove_file(&parcial);
        return Err("no se pudo generar la miniatura".into());
    }

    std::fs::rename(&parcial, &destino).map_err(|e| format!("{e}"))?;
    Ok(destino.to_string_lossy().into_owned())
}

/// Si el archivo es un video, por su extensión.
///
/// Alcanza con la extensión: lo único que decide es qué argumentos usar, y
/// equivocarse cuesta un reintento, no una miniatura mal hecha.
pub fn es_video(path: &Path) -> bool {
    const VIDEOS: [&str; 6] = ["mp4", "webm", "ogv", "mkv", "mov", "avi"];

    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .map(|e| VIDEOS.contains(&e.as_str()))
        .unwrap_or(false)
}

/// Que el archivo exista no alcanza: ffmpeg puede dejar uno vacío y terminar
/// bien. Un JPEG de menos de cien bytes no es una imagen.
pub fn archivo_con_contenido(path: &Path) -> bool {
    std::fs::metadata(path).map(|m| m.len() > 100).unwrap_or(false)
}

/// Corre ffmpeg una vez. Devuelve si dejó una miniatura de verdad.
async fn extraer_cuadro(entrada: &str, salida: &Path, salto: &[&str]) -> Result<bool, String> {
    let destino = salida.to_str().ok_or("ruta inválida")?;
    let mut args: Vec<&str> = vec!["-hide_banner", "-nostdin", "-y"];
    args.extend_from_slice(salto);
    args.extend_from_slice(&[
        "-i",
        entrada,
        "-frames:v",
        "1",
        "-vf",
        ANCHO_FILTRO,
        "-q:v",
        "4",
        destino,
    ]);

    let resultado = Command::new("ffmpeg")
        .args(&args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .await
        .map_err(|e| format!("no se pudo ejecutar ffmpeg: {e}"))?;

    Ok(resultado.status.success() && archivo_con_contenido(salida))
}

/// El ancho de las miniaturas. La grilla dibuja recuadros de unos 200 px, así
/// que 480 alcanza para pantallas con escala y sigue siendo dos órdenes de
/// magnitud menos memoria que un 5K.
const ANCHO_MINIATURA: u32 = 480;
const ANCHO_FILTRO: &str = "scale=480:-2";

/// El nombre de la miniatura en la caché, con la misma idea que el del video: si
/// el archivo cambia, la clave cambia y no se muestra una miniatura vieja.
pub fn thumbnail_name(source: &Path, size: u64, modified_secs: u64) -> String {
    use std::hash::{Hash, Hasher};

    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    source.hash(&mut hasher);
    size.hash(&mut hasher);
    modified_secs.hash(&mut hasher);
    "miniatura".hash(&mut hasher);

    format!("miniatura-{:016x}.jpg", hasher.finish())
}

#[tauri::command]
pub async fn prepare_wallpaper_video(app: AppHandle, path: String) -> Result<PreparedWallpaper, String> {
    let source = PathBuf::from(&path);
    let sin_cambios = |detail: &str| PreparedWallpaper {
        path: path.clone(),
        optimized: false,
        detail: detail.to_string(),
    };

    let facts = match probe(&path).await {
        Ok(facts) => facts,
        Err(error) => return Ok(sin_cambios(&format!("no se pudo analizar: {error}"))),
    };

    let target = target_resolution().await;
    let plan = plan_for(&facts, target);

    if plan.is_empty() {
        return Ok(sin_cambios("ya estaba en el formato más conveniente"));
    }

    let metadata = std::fs::metadata(&source).map_err(|e| format!("{e}"))?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let dir = cache_dir().ok_or("no se pudo determinar la carpeta de caché")?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("{e}"))?;
    let destino = dir.join(cache_key(&source, metadata.len(), modified, target));

    if destino.exists() {
        return Ok(PreparedWallpaper {
            path: destino.to_string_lossy().into_owned(),
            optimized: true,
            detail: "se reutilizó la copia optimizada".into(),
        });
    }

    // Se escribe aparte y se renombra al final: si la recodificación se
    // interrumpe, la caché no queda con un archivo a medias que después se
    // sirve como si estuviera bien.
    let parcial = destino.with_extension("parcial.mp4");
    let mut filtros: Vec<String> = Vec::new();

    if let Some((width, height)) = plan.scale_to {
        filtros.push(format!("scale={width}:{height}"));
    }
    if plan.cap_fps {
        filtros.push(format!("fps={MAX_FPS}"));
    }

    let mut args: Vec<String> = vec![
        "-hide_banner".into(),
        "-nostdin".into(),
        "-y".into(),
        "-i".into(),
        path.clone(),
        "-an".into(),
    ];

    if !filtros.is_empty() {
        args.push("-vf".into());
        args.push(filtros.join(","));
    }

    args.extend([
        "-c:v".into(),
        "libx264".into(),
        "-preset".into(),
        "veryfast".into(),
        "-crf".into(),
        "23".into(),
        "-pix_fmt".into(),
        "yuv420p".into(),
        // Sin esto algunos reproductores no arrancan hasta tener todo el
        // archivo: el índice queda al final.
        "-movflags".into(),
        "+faststart".into(),
        "-progress".into(),
        "pipe:1".into(),
        "-nostats".into(),
        parcial.to_string_lossy().into_owned(),
    ]);

    let mut hijo = Command::new("ffmpeg")
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("no se pudo ejecutar ffmpeg: {e}"))?;

    if let Some(stdout) = hijo.stdout.take() {
        let duracion = facts.duration.max(0.1);
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            let mut lineas = BufReader::new(stdout).lines();
            while let Ok(Some(linea)) = lineas.next_line().await {
                if let Some(segundos) = parse_progress(&linea) {
                    let avance = ((segundos / duracion) * 100.0).clamp(0.0, 100.0);
                    let _ = app.emit("wallpaper-video-progress", avance.round() as u32);
                }
            }
        });
    }

    let estado = hijo
        .wait()
        .await
        .map_err(|e| format!("ffmpeg terminó mal: {e}"))?;

    if !estado.success() {
        let _ = std::fs::remove_file(&parcial);
        return Ok(sin_cambios("ffmpeg no pudo optimizarlo"));
    }

    std::fs::rename(&parcial, &destino).map_err(|e| format!("{e}"))?;

    let mut hecho: Vec<String> = Vec::new();
    if let Some((width, height)) = plan.scale_to {
        hecho.push(format!("{width}×{height}"));
    }
    if plan.cap_fps {
        hecho.push(format!("{MAX_FPS:.0} fps"));
    }
    if plan.drop_audio {
        hecho.push("sin audio".into());
    }

    Ok(PreparedWallpaper {
        path: destino.to_string_lossy().into_owned(),
        optimized: true,
        detail: hecho.join(", "),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn facts(width: u32, height: u32, fps: f64, codec: &str, audio: bool) -> VideoFacts {
        VideoFacts {
            width,
            height,
            fps,
            codec: codec.into(),
            has_audio: audio,
            duration: 10.0,
        }
    }

    /// Lo que motivó todo esto: un 4K60 en una pantalla 1080p decodifica cuatro
    /// veces los píxeles que se ven, al doble de cuadros.
    #[test]
    fn un_4k60_en_una_pantalla_1080p_se_baja() {
        let plan = plan_for(&facts(3840, 2160, 60.0, "h264", true), (1920, 1080));
        assert_eq!(plan.scale_to, Some((1920, 1080)));
        assert!(plan.cap_fps);
        assert!(plan.drop_audio);
        assert!(!plan.recode, "ya era H.264");
    }

    /// Y lo contrario: un archivo que ya está bien se deja en paz, porque
    /// recodificarlo sólo perdería calidad y tiempo.
    #[test]
    fn lo_que_ya_esta_bien_no_se_toca() {
        let plan = plan_for(&facts(1920, 1080, 30.0, "h264", false), (1920, 1080));
        assert!(plan.is_empty());
    }

    /// Nunca hacia arriba: agrandar un video chico cuesta más y no se ve mejor.
    #[test]
    fn un_video_mas_chico_que_la_pantalla_no_se_agranda() {
        let plan = plan_for(&facts(1280, 720, 24.0, "h264", false), (3840, 2160));
        assert_eq!(plan.scale_to, None);
        assert!(!plan.cap_fps);
    }

    /// La proporción se mantiene, y los dos lados quedan pares: H.264 con
    /// croma 4:2:0 no admite impares y ffmpeg falla con un error que no lo dice.
    #[test]
    fn al_escalar_mantiene_la_proporcion_y_lados_pares() {
        assert_eq!(fit_inside(3840, 2160, 1920, 1080), (1920, 1080));
        // Un video vertical en una pantalla horizontal entra por el alto, y el
        // ancho sale de la proporción: 1080 × (1080/1920) = 607,5 → 608.
        assert_eq!(fit_inside(1080, 1920, 1920, 1080), (608, 1080));

        let (ancho, alto) = fit_inside(1999, 1333, 1280, 1024);
        assert_eq!(ancho % 2, 0);
        assert_eq!(alto % 2, 0);
    }

    /// Un códec que no es H.264 se recodifica: es el único que se puede dar por
    /// reproducible en cualquier máquina.
    #[test]
    fn un_codec_menos_comun_se_recodifica() {
        assert!(plan_for(&facts(1280, 720, 24.0, "vp9", false), (1920, 1080)).recode);
        assert!(plan_for(&facts(1280, 720, 24.0, "hevc", false), (1920, 1080)).recode);
    }

    #[test]
    fn lee_la_salida_de_ffprobe() {
        let texto = "codec_type=video\ncodec_name=h264\nwidth=3840\nheight=2160\n\
                     r_frame_rate=60000/1001\ncodec_type=audio\ncodec_name=aac\nduration=12.500000\n";
        let leido = parse_ffprobe(texto).unwrap();
        assert_eq!(leido.width, 3840);
        assert_eq!(leido.height, 2160);
        assert!((leido.fps - 59.94).abs() < 0.1);
        assert_eq!(leido.codec, "h264");
        assert!(leido.has_audio);
        assert!((leido.duration - 12.5).abs() < 0.01);
    }

    /// Un archivo sin pista de video no es un fondo, y decirlo acá evita
    /// llamar a ffmpeg para que falle después.
    #[test]
    fn un_archivo_sin_video_se_rechaza() {
        assert!(parse_ffprobe("codec_type=audio\ncodec_name=mp3\nduration=180\n").is_err());
    }

    #[test]
    fn la_clave_de_cache_cambia_si_cambia_el_archivo() {
        let ruta = Path::new("/home/pato/fondo.mp4");
        let a = cache_key(ruta, 1000, 111, (1920, 1080));
        assert_eq!(a, cache_key(ruta, 1000, 111, (1920, 1080)), "misma entrada, misma clave");
        assert_ne!(a, cache_key(ruta, 2000, 111, (1920, 1080)), "otro tamaño");
        assert_ne!(a, cache_key(ruta, 1000, 222, (1920, 1080)), "otra fecha");
        assert_ne!(a, cache_key(ruta, 1000, 111, (3840, 2160)), "otra pantalla");
    }

    /// Una imagen y un video no llevan los mismos argumentos, y confundirlos no
    /// da un error: da un archivo vacío.
    #[test]
    fn distingue_imagen_de_video_por_la_extension() {
        assert!(es_video(Path::new("/home/pato/fondo.mp4")));
        assert!(es_video(Path::new("/home/pato/fondo.WEBM")), "sin importar mayúsculas");
        assert!(!es_video(Path::new("/usr/share/backgrounds/vasakos/wallpaper-1.jpg")));
        assert!(!es_video(Path::new("/home/pato/sin-extension")));
    }

    /// El error que rompió la previsualización: con `-ss 1` sobre una imagen,
    /// ffmpeg escribe un archivo vacío y **devuelve éxito**. Mirar el código de
    /// salida y que el archivo exista no alcanza para nada.
    #[test]
    fn un_archivo_vacio_no_cuenta_como_miniatura() {
        let dir = std::env::temp_dir().join("vasak-miniatura-prueba");
        let _ = std::fs::create_dir_all(&dir);

        let vacio = dir.join("vacio.jpg");
        std::fs::write(&vacio, b"").unwrap();
        assert!(!archivo_con_contenido(&vacio));

        let recortado = dir.join("recortado.jpg");
        std::fs::write(&recortado, b"apenas unos bytes").unwrap();
        assert!(!archivo_con_contenido(&recortado), "un JPEG no pesa 17 bytes");

        let bueno = dir.join("bueno.jpg");
        std::fs::write(&bueno, vec![0u8; 4096]).unwrap();
        assert!(archivo_con_contenido(&bueno));

        assert!(!archivo_con_contenido(&dir.join("no-existe.jpg")));
    }

    /// La miniatura se rehace si el archivo cambió, y nunca choca con la clave
    /// del video optimizado del mismo archivo.
    #[test]
    fn la_clave_de_la_miniatura_es_propia_y_cambia_con_el_archivo() {
        let ruta = Path::new("/home/pato/fondo.mp4");
        let a = thumbnail_name(ruta, 1000, 111);
        assert_eq!(a, thumbnail_name(ruta, 1000, 111));
        assert_ne!(a, thumbnail_name(ruta, 2000, 111));
        assert!(a.ends_with(".jpg"));
        assert_ne!(
            a.trim_start_matches("miniatura-"),
            cache_key(ruta, 1000, 111, (1920, 1080)).trim_start_matches("fondo-"),
            "la miniatura y el video optimizado no pueden compartir clave"
        );
    }

    #[test]
    fn lee_el_avance_de_ffmpeg() {
        assert_eq!(parse_progress("out_time_us=2500000"), Some(2.5));
        assert_eq!(parse_progress("frame=42"), None);
    }
}

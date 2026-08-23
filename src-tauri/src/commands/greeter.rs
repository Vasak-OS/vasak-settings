//! La configuración de la pantalla de inicio de sesión (vasak-session-manager).
//!
//! El greeter corre **antes** de que haya sesión de usuario, así que nada de
//! esto puede vivir en `~/.config/vasak/vasak.conf`: cuando se dibuja el inicio
//! de sesión no hay usuario cuyo home leer, y encima los homes en VasakOS son
//! 0700, así que el greeter no puede ni entrar. Su configuración es del sistema
//! y va en `/etc/vasak-session-manager/`, en archivos de una línea, que es la
//! interfaz que ya inventó el greeter para el fondo:
//!
//! * `background` → la ruta absoluta de la imagen o el video de fondo.
//! * `theme` → `dark` o `light`.
//! * `scheme.json` → el documento del esquema de colores, copiado completo.
//!
//! El esquema se copia entero y no por id a propósito: los esquemas viven en
//! `~/.config/vasak/schemes` y en `/usr/share/schemes`, y el primero de esos dos
//! no existe para el greeter. Guardar el id serviría sólo para los esquemas que
//! trae el sistema; guardar el documento sirve para todos.
//!
//! Estado real, para que no sorprenda: **hoy el greeter lee `background` y nada
//! más**. `theme` y `scheme.json` quedan escritos con los nombres que le
//! corresponden, esperando el lado que los lea (ver el informe del cambio): la
//! pantalla de inicio tiene los colores fijos en su hoja de estilos y forzado el
//! modo oscuro en `main.ts`.

use serde::Serialize;
use std::io::Read;
use std::os::unix::fs::{DirBuilderExt, PermissionsExt};
use std::path::{Path, PathBuf};

use crate::logger::{log_error, log_info};
use crate::utils::command::CommandExecutor;

/// El directorio de configuración del greeter. Es el que ya usa para el fondo.
const CONFIG_DIR: &str = "/etc/vasak-session-manager";

const BACKGROUND_FILE: &str = "background";
const THEME_FILE: &str = "theme";
const SCHEME_FILE: &str = "scheme.json";

/// Los mismos candidatos que resuelve el greeter cuando no hay nada
/// configurado. Están duplicados porque son dos programas distintos, y esta
/// pantalla tiene que poder mostrar lo que se va a ver, no lo que se guardó.
const IMAGE_DEFAULTS: &[&str] = &[
    "/usr/share/backgrounds/vasakos/default.jpg",
    "/usr/share/backgrounds/vasakos/default.png",
    "/usr/share/backgrounds/vasakos/default.webp",
];

const VIDEO_DEFAULTS: &[&str] = &[
    "/usr/share/backgrounds/vasakos/default.mp4",
    "/usr/share/backgrounds/vasakos/default.webm",
];

/// Los límites del greeter, no unos nuevos: la imagen cruza el puente IPC en
/// base64 antes del primer dibujado, y el video se reproduce desde memoria.
/// Aceptar acá un archivo que el greeter va a descartar es prometer un fondo que
/// nadie va a ver.
const MAX_IMAGE_BYTES: u64 = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES: u64 = 64 * 1024 * 1024;

/// Un esquema de colores es un puñado de códigos hexadecimales; un archivo más
/// grande que esto no es un esquema.
const MAX_SCHEME_BYTES: u64 = 256 * 1024;

/// Lo que el elemento `<video>` de WebKit puede llegar a reproducir, y lo que el
/// greeter reconoce como video **por la extensión**: el nombre del archivo es
/// parte de la configuración, no un detalle.
const VIDEO_EXTENSIONS: &[&str] = &["mp4", "webm", "ogv"];

/// De dónde puede salir un esquema. Cualquier otra ruta sería esta pantalla
/// copiando a `/etc` un archivo elegido por el lado de la interfaz.
fn scheme_roots() -> Vec<PathBuf> {
    let mut roots = vec![PathBuf::from("/usr/share/schemes")];

    if let Ok(home) = std::env::var("HOME") {
        roots.push(PathBuf::from(home).join(".config/vasak/schemes"));
    }

    roots
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BackgroundKind {
    Image,
    Video,
}

/// Lo que la pantalla de configuración necesita mostrar: lo que está guardado y,
/// aparte, lo que el greeter va a dibujar con eso.
#[derive(Debug, Serialize)]
pub struct GreeterConfig {
    /// El contenido de `background`, o `null` si no hay nada configurado y el
    /// greeter se queda con el fondo que trae el sistema.
    pub background: Option<String>,
    /// La imagen que se va a ver. Siempre hay una si el sistema trae fondos:
    /// es también el respaldo del video.
    pub effective_image: Option<String>,
    /// El video que se va a intentar reproducir encima, si hay uno.
    pub effective_video: Option<String>,
    pub theme: String,
    /// El id que quedó guardado en `scheme.json`, para que la interfaz pueda
    /// marcar el esquema elegido sin volver a leer el archivo.
    pub scheme_id: Option<String>,
    /// Si el directorio de configuración ya existe. No hace falta que exista
    /// para guardar —se crea— pero sirve para explicar que no hay nada puesto.
    pub configured: bool,
}

// ── Lectura ──────────────────────────────────────────────────────────────────

/// La primera línea que cuenta de un archivo de configuración del greeter.
///
/// Misma regla que aplica el greeter: se saltean las vacías y las que empiezan
/// con `#`, así un administrador puede dejar anotado lo que sacó.
fn first_config_line(content: &str) -> Option<String> {
    content
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty() && !line.starts_with('#'))
        .map(str::to_string)
}

fn config_file(name: &str) -> PathBuf {
    PathBuf::from(CONFIG_DIR).join(name)
}

fn read_config_line(name: &str) -> Option<String> {
    let content = std::fs::read_to_string(config_file(name)).ok()?;
    first_config_line(&content)
}

fn extension_of(path: &Path) -> String {
    path.extension()
        .map(|ext| ext.to_string_lossy().to_lowercase())
        .unwrap_or_default()
}

fn is_video(path: &Path) -> bool {
    VIDEO_EXTENSIONS.contains(&extension_of(path).as_str())
}

/// El tamaño del archivo cuando se puede usar, `None` cuando no: no existe, no
/// es un archivo, está vacío, o pasa el límite.
fn usable_size(path: &Path, max: u64) -> Option<u64> {
    let meta = std::fs::metadata(path).ok()?;

    (meta.is_file() && meta.len() > 0 && meta.len() <= max).then(|| meta.len())
}

/// La imagen que va a dibujar el greeter, resolviendo igual que él: lo
/// configurado si es una imagen usable, y si no, la que trae el sistema.
fn effective_image(configured: Option<&str>) -> Option<String> {
    configured
        .map(PathBuf::from)
        .into_iter()
        .chain(IMAGE_DEFAULTS.iter().map(PathBuf::from))
        .filter(|path| !is_video(path))
        .filter(|path| usable_size(path, MAX_IMAGE_BYTES).is_some())
        .filter(|path| sniff_image(path).is_some())
        .map(|path| path.to_string_lossy().into_owned())
        .next()
}

/// El video que va a intentar el greeter. Un fondo configurado es una decisión
/// explícita: si lo elegido es una imagen, no se pone un video encima porque el
/// archivo por omisión exista.
fn effective_video(configured: Option<&str>) -> Option<String> {
    let path = match configured.map(PathBuf::from) {
        Some(path) if is_video(&path) => path,
        Some(_) => return None,
        None => VIDEO_DEFAULTS
            .iter()
            .map(PathBuf::from)
            .find(|path| path.is_file())?,
    };

    usable_size(&path, MAX_VIDEO_BYTES).map(|_| path.to_string_lossy().into_owned())
}

/// El id del esquema guardado, leyendo el documento que se copió.
fn stored_scheme_id() -> Option<String> {
    let content = std::fs::read_to_string(config_file(SCHEME_FILE)).ok()?;
    let document: serde_json::Value = serde_json::from_str(&content).ok()?;

    document
        .get("id")
        .and_then(serde_json::Value::as_str)
        .map(str::to_string)
}

#[tauri::command]
pub async fn get_greeter_config() -> Result<GreeterConfig, String> {
    let background = read_config_line(BACKGROUND_FILE);

    // El greeter arranca en oscuro cuando no hay nada dicho (es lo habitual en
    // una pantalla de inicio de sesión), así que eso es lo que hay que mostrar
    // como estado actual y no un «claro» que nunca fue verdad.
    let theme = read_config_line(THEME_FILE)
        .filter(|value| validate_theme(value).is_ok())
        .unwrap_or_else(|| "dark".to_string());

    Ok(GreeterConfig {
        effective_image: effective_image(background.as_deref()),
        effective_video: effective_video(background.as_deref()),
        background,
        theme,
        scheme_id: stored_scheme_id(),
        configured: Path::new(CONFIG_DIR).is_dir(),
    })
}

// ── Validación ───────────────────────────────────────────────────────────────

fn validate_theme(theme: &str) -> Result<&'static str, String> {
    match theme {
        "dark" => Ok("dark"),
        "light" => Ok("light"),
        otro => Err(format!(
            "«{otro}» no es un tema: la pantalla de inicio de sesión sólo puede ser «dark» o «light»."
        )),
    }
}

/// Reconoce la imagen por el contenido, igual que el greeter.
///
/// El greeter no mira la extensión para decidir si puede dibujar una imagen:
/// olfatea los primeros bytes. Un `.png` que en realidad es un AVIF se guarda
/// sin queja y aparece como una pantalla sin fondo, así que se descarta acá.
fn sniff_image(path: &Path) -> Option<&'static str> {
    let mut header = [0u8; 12];
    let mut file = std::fs::File::open(path).ok()?;
    let leidos = file.read(&mut header).ok()?;
    let header = &header[..leidos];

    if header.starts_with(b"\x89PNG") {
        Some("image/png")
    } else if header.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("image/jpeg")
    } else if header.starts_with(b"GIF8") {
        Some("image/gif")
    } else if header.starts_with(b"<svg") || header.starts_with(b"<?xml") {
        Some("image/svg+xml")
    } else if header.starts_with(b"RIFF") && header.get(8..12) == Some(b"WEBP") {
        Some("image/webp")
    } else {
        None
    }
}

/// El fondo elegido, resuelto y revisado contra lo que el greeter puede usar.
///
/// Devuelve la ruta canónica —sin enlaces ni `..`— porque es la que se va a
/// escribir en `/etc` y la que hay que revisar para saber si el greeter la puede
/// leer.
fn validate_background(raw: &str) -> Result<(PathBuf, BackgroundKind), String> {
    let raw = raw.trim();

    if raw.is_empty() {
        return Err("No se eligió ningún fondo.".to_string());
    }

    // El archivo de configuración es de una línea: una ruta con un salto de
    // línea guardaría media ruta y dejaría basura debajo.
    if raw.contains(['\n', '\r']) {
        return Err("La ruta del fondo no puede tener saltos de línea.".to_string());
    }

    if !raw.starts_with('/') {
        return Err(format!(
            "«{raw}» no es una ruta absoluta, y el greeter no tiene desde dónde resolverla: \
             corre antes de que haya sesión."
        ));
    }

    let path = std::fs::canonicalize(raw)
        .map_err(|error| format!("No se pudo resolver la ruta «{raw}»: {error}"))?;

    let kind = if is_video(&path) {
        BackgroundKind::Video
    } else {
        BackgroundKind::Image
    };

    let (max, limite) = match kind {
        BackgroundKind::Image => (MAX_IMAGE_BYTES, MAX_IMAGE_BYTES / 1024 / 1024),
        BackgroundKind::Video => (MAX_VIDEO_BYTES, MAX_VIDEO_BYTES / 1024 / 1024),
    };

    let meta = std::fs::metadata(&path)
        .map_err(|error| format!("No se pudo leer «{}»: {error}", path.display()))?;

    if !meta.is_file() {
        return Err(format!("«{}» no es un archivo.", path.display()));
    }

    if meta.len() == 0 {
        return Err(format!("«{}» está vacío.", path.display()));
    }

    if meta.len() > max {
        return Err(format!(
            "«{}» pasa el límite de {limite} MB que la pantalla de inicio de sesión puede usar, \
             porque el fondo se carga completo en memoria antes de dibujar nada.",
            path.display()
        ));
    }

    if kind == BackgroundKind::Image && sniff_image(&path).is_none() {
        return Err(format!(
            "«{}» no es una imagen que la pantalla de inicio de sesión pueda dibujar. \
             Sirven PNG, JPEG, GIF, WebP y SVG; los videos, MP4, WebM y OGV.",
            path.display()
        ));
    }

    Ok((path, kind))
}

/// Si el usuario `greeter` puede leer este archivo.
///
/// No es una formalidad: los homes de VasakOS son 0700, así que un fondo elegido
/// desde «Imágenes» no lo puede abrir nadie más que su dueño. El greeter se
/// quedaría con el fondo del sistema y el síntoma sería «lo configuré y no
/// cambió nada», sin ninguna pista. Cuando la respuesta es «no», el fondo se
/// copia a `/etc` en vez de apuntarlo.
///
/// Se mira el bit de «otros» y no el grupo a propósito: es la respuesta
/// conservadora, y equivocarse hacia el lado de copiar sólo cuesta un archivo.
fn readable_by_greeter(path: &Path) -> bool {
    let readable = std::fs::metadata(path)
        .map(|meta| meta.permissions().mode() & 0o004 != 0)
        .unwrap_or(false);

    if !readable {
        return false;
    }

    // Y además hay que poder llegar: sin el bit de ejecución en cada directorio
    // del camino, el archivo es ilegible por más permisos que tenga.
    path.ancestors().skip(1).all(|dir| {
        std::fs::metadata(dir)
            .map(|meta| meta.permissions().mode() & 0o001 != 0)
            .unwrap_or(false)
    })
}

/// Si el fondo elegido hay que copiar a `/etc` en vez de apuntarlo donde está.
///
/// Dos razones distintas para lo mismo:
///
/// * el greeter no lo puede leer donde está —el caso de un archivo en la carpeta
///   personal, que es 0700—, o
/// * es la copia que dejó el guardado anterior. Esa hay que volver a copiarla:
///   la instalación borra `background.*` antes de copiar lo nuevo, así que
///   apuntarla dejaría la configuración señalando un archivo recién borrado.
///   Pasa siempre que se guarda dos veces seguidas —cambiando sólo el tema, por
///   ejemplo— porque la pantalla vuelve a leer lo que quedó guardado.
fn needs_copy(origen: &Path, legible_por_el_greeter: bool) -> bool {
    let ya_instalado = origen.parent() == Some(Path::new(CONFIG_DIR))
        && origen.file_stem().map(|stem| stem == BACKGROUND_FILE) == Some(true);

    !legible_por_el_greeter || ya_instalado
}

/// El documento del esquema, leído de una ruta que tiene que ser una de las
/// nuestras, y con un `id` adentro para poder mostrar después qué está puesto.
fn read_scheme_document(raw: &str) -> Result<String, String> {
    let path = std::fs::canonicalize(raw.trim())
        .map_err(|error| format!("No se pudo resolver el esquema «{raw}»: {error}"))?;

    if !scheme_roots().iter().any(|root| {
        std::fs::canonicalize(root)
            .map(|root| path.starts_with(root))
            .unwrap_or(false)
    }) {
        return Err(format!(
            "«{}» no está en los directorios de esquemas del sistema.",
            path.display()
        ));
    }

    if usable_size(&path, MAX_SCHEME_BYTES).is_none() {
        return Err(format!(
            "«{}» no es un archivo de esquema usable.",
            path.display()
        ));
    }

    let content = std::fs::read_to_string(&path)
        .map_err(|error| format!("No se pudo leer el esquema: {error}"))?;

    validate_scheme_document(&content)?;

    Ok(content)
}

/// Que el documento sea un esquema y no cualquier JSON: sin `id` no hay con qué
/// mostrar después qué esquema quedó puesto, y sin colores no hay esquema.
fn validate_scheme_document(content: &str) -> Result<String, String> {
    let document: serde_json::Value = serde_json::from_str(content)
        .map_err(|error| format!("El esquema no es un JSON válido: {error}"))?;

    let id = document
        .get("id")
        .and_then(serde_json::Value::as_str)
        .filter(|id| !id.trim().is_empty())
        .ok_or_else(|| "El esquema no trae un «id».".to_string())?;

    if document.get("colors").and_then(|colors| colors.get("dark")).is_none()
        || document.get("colors").and_then(|colors| colors.get("light")).is_none()
    {
        return Err("El esquema no trae los colores claros y oscuros.".to_string());
    }

    Ok(id.to_string())
}

// ── Escritura ────────────────────────────────────────────────────────────────

/// Lo que hace falta para dejar la configuración en su lugar, en **una** sola
/// elevación de privilegios.
///
/// Una por archivo serían tres diálogos de contraseña seguidos: la acción
/// `org.freedesktop.policykit.exec` de este sistema es `auth_admin`, sin
/// `_keep`, así que no hay autorización que se reutilice entre llamadas.
///
/// Las rutas entran como argumentos posicionales y no interpoladas en el texto:
/// así no hay nada que citar ni escapar, y una ruta con espacios, comillas o un
/// `;` es una ruta y no un comando.
const INSTALL_SCRIPT: &str = r#"
set -e
dir="$1"
stage="$2"
mkdir -p "$dir"
chmod 0755 "$dir"
# Se borra lo anterior antes de copiar: el fondo se guarda con la extensión del
# archivo original, así que pasar de un video a una imagen dejaría los dos y el
# greeter elegiría el que no se pidió.
rm -f "$dir/background" "$dir"/background.* "$dir/theme" "$dir/scheme.json"
cp -R "$stage/." "$dir/"
# Sólo los archivos que se acaban de copiar: el greeter tiene que poder leerlos
# (corre como su propio usuario) y cualquier otra cosa que un administrador haya
# dejado en el directorio no es asunto de esta pantalla. El dueño ya es root,
# porque root es quien los copió.
for archivo in "$stage"/*; do
  chmod 0644 "$dir/$(basename "$archivo")"
done
"#;

/// Un directorio propio donde armar los archivos antes de elevar.
///
/// Va en `XDG_RUNTIME_DIR` (0700 del usuario) y no en `/tmp`, y se crea en modo
/// 0700: entre que se arma y que `cp` lo copia como root, nadie más tiene que
/// poder cambiar lo que hay adentro.
fn staging_dir() -> Result<PathBuf, String> {
    let base = std::env::var("XDG_RUNTIME_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir());

    let dir = base.join(format!("vasak-settings-greeter-{}", uuid::Uuid::new_v4()));

    std::fs::DirBuilder::new()
        .recursive(false)
        .mode(0o700)
        .create(&dir)
        .map_err(|error| format!("No se pudo preparar la configuración: {error}"))?;

    Ok(dir)
}

/// Deja en el directorio de preparación exactamente los archivos que van a
/// quedar en `/etc/vasak-session-manager`, y devuelve la ruta que se guardó como
/// fondo (que no es la elegida cuando hubo que copiarla).
fn stage_config(
    stage: &Path,
    background: Option<&str>,
    theme: &str,
    scheme_path: Option<&str>,
) -> Result<Option<String>, String> {
    let theme = validate_theme(theme)?;
    std::fs::write(stage.join(THEME_FILE), format!("{theme}\n"))
        .map_err(|error| format!("No se pudo preparar el tema: {error}"))?;

    if let Some(scheme_path) = scheme_path {
        let document = read_scheme_document(scheme_path)?;
        std::fs::write(stage.join(SCHEME_FILE), document)
            .map_err(|error| format!("No se pudo preparar el esquema: {error}"))?;
    }

    let Some(background) = background else {
        // Sin fondo configurado el greeter usa el del sistema, que es
        // exactamente lo que significa no dejar el archivo.
        return Ok(None);
    };

    let (origen, _) = validate_background(background)?;

    let guardado = if !needs_copy(&origen, readable_by_greeter(&origen)) {
        origen.to_string_lossy().into_owned()
    } else {
        // Se copia con la extensión original: el greeter decide si es video por
        // el nombre del archivo.
        let extension = extension_of(&origen);
        let nombre = if extension.is_empty() {
            BACKGROUND_FILE.to_string()
        } else {
            format!("{BACKGROUND_FILE}.{extension}")
        };

        std::fs::copy(&origen, stage.join(&nombre)).map_err(|error| {
            format!(
                "No se pudo copiar el fondo «{}»: {error}",
                origen.display()
            )
        })?;

        format!("{CONFIG_DIR}/{nombre}")
    };

    std::fs::write(stage.join(BACKGROUND_FILE), format!("{guardado}\n"))
        .map_err(|error| format!("No se pudo preparar el fondo: {error}"))?;

    Ok(Some(guardado))
}

/// Traduce la negativa de polkit a algo que la pantalla pueda mostrar tal cual.
fn install_error(raw: String) -> String {
    if raw.contains("not authorized")
        || raw.contains("Not authorized")
        || raw.contains("dismissed")
        || raw.contains("Authentication failed")
    {
        "No se autorizó el cambio: la configuración de la pantalla de inicio de sesión es del \
         sistema, así que hace falta una contraseña de administrador."
            .to_string()
    } else {
        format!("No se pudo guardar la configuración del inicio de sesión: {raw}")
    }
}

/// Guarda todo junto: el tema, el esquema y el fondo.
///
/// Todo en una sola operación porque todo cuesta una contraseña: guardar de a
/// una opción serían tres diálogos para un cambio que se piensa como uno.
#[tauri::command]
pub async fn set_greeter_config(
    background: Option<String>,
    theme: String,
    scheme_path: Option<String>,
) -> Result<GreeterConfig, String> {
    let stage = staging_dir()?;

    let resultado = stage_config(
        &stage,
        background.as_deref().filter(|raw| !raw.trim().is_empty()),
        &theme,
        scheme_path.as_deref().filter(|raw| !raw.trim().is_empty()),
    )
    .and_then(|guardado| {
        let stage_arg = stage.to_string_lossy().into_owned();

        CommandExecutor::run_elevated(
            "/bin/sh",
            &["-c", INSTALL_SCRIPT, "sh", CONFIG_DIR, &stage_arg],
        )
        .map(|_| guardado)
        .map_err(install_error)
    });

    // El directorio de preparación no sobrevive a la operación, ni cuando sale
    // mal: puede tener una copia del fondo, y son megas.
    let _ = std::fs::remove_dir_all(&stage);

    match resultado {
        Ok(guardado) => {
            log_info(&format!(
                "Configuración del inicio de sesión guardada en {CONFIG_DIR} (fondo: {})",
                guardado.unwrap_or_else(|| "el del sistema".to_string())
            ));
            get_greeter_config().await
        }
        Err(error) => {
            log_error(&error);
            Err(error)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    /// Un directorio de trabajo propio por prueba, sin dependencias nuevas.
    fn temp_dir(nombre: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "vasak-settings-greeter-test-{nombre}-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).expect("crear el directorio de la prueba");
        dir
    }

    fn write_file(path: &Path, bytes: &[u8]) {
        std::fs::File::create(path)
            .expect("crear el archivo")
            .write_all(bytes)
            .expect("escribir el archivo");
    }

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\n-----------";

    #[test]
    fn la_primera_linea_util_es_la_que_manda() {
        assert_eq!(
            first_config_line("\n# lo de antes\n  /usr/share/fondo.png  \n/otro.png\n"),
            Some("/usr/share/fondo.png".to_string())
        );
        assert_eq!(first_config_line("\n\n# nada más\n"), None);
        assert_eq!(first_config_line(""), None);
    }

    #[test]
    fn los_videos_se_reconocen_por_extension_sin_importar_la_capitalizacion() {
        assert!(is_video(Path::new("/tmp/fondo.mp4")));
        assert!(is_video(Path::new("/tmp/fondo.WebM")));
        assert!(is_video(Path::new("/tmp/fondo.ogv")));

        assert!(!is_video(Path::new("/tmp/fondo.jpg")));
        assert!(!is_video(Path::new("/tmp/fondo")));
        // La extensión es la última: esto es una imagen para el greeter.
        assert!(!is_video(Path::new("/tmp/fondo.mp4.jpg")));
    }

    #[test]
    fn una_imagen_se_reconoce_por_su_contenido_y_no_por_el_nombre() {
        let dir = temp_dir("sniff");

        let disfrazada = dir.join("fondo.txt");
        write_file(&disfrazada, PNG);
        assert_eq!(sniff_image(&disfrazada), Some("image/png"));

        let mentirosa = dir.join("fondo.png");
        write_file(&mentirosa, b"no soy una imagen");
        assert_eq!(sniff_image(&mentirosa), None);

        let webp = dir.join("fondo.webp");
        write_file(&webp, b"RIFF\x00\x00\x00\x00WEBPVP8 ");
        assert_eq!(sniff_image(&webp), Some("image/webp"));

        // Un WebP truncado antes de decir que es WebP no alcanza.
        let corto = dir.join("corto.webp");
        write_file(&corto, b"RIFF");
        assert_eq!(sniff_image(&corto), None);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn el_fondo_tiene_que_ser_una_ruta_absoluta_y_existir() {
        assert!(validate_background("fondo.png").is_err());
        assert!(validate_background("").is_err());
        assert!(validate_background("/no/existe/fondo.png").is_err());
        // Una ruta con salto de línea escribiría media configuración.
        assert!(validate_background("/usr/share/fondo.png\n/etc/passwd").is_err());
    }

    #[test]
    fn el_limite_de_tamano_es_el_que_el_greeter_va_a_poder_dibujar() {
        let dir = temp_dir("tamano");

        let vacia = dir.join("vacia.png");
        write_file(&vacia, b"");
        assert!(validate_background(vacia.to_str().unwrap()).is_err());

        let normal = dir.join("normal.png");
        write_file(&normal, PNG);
        let (ruta, kind) = validate_background(normal.to_str().unwrap()).expect("es usable");
        assert_eq!(kind, BackgroundKind::Image);
        assert_eq!(ruta, std::fs::canonicalize(&normal).unwrap());

        // Un video se mide contra su propio límite, que es mucho más grande, así
        // que un archivo que como imagen no entraría acá pasa.
        let grande = dir.join("grande.mp4");
        write_file(&grande, &vec![0u8; (MAX_IMAGE_BYTES + 1) as usize]);
        let (_, kind) = validate_background(grande.to_str().unwrap()).expect("es usable");
        assert_eq!(kind, BackgroundKind::Video);

        let enorme = dir.join("enorme.png");
        write_file(&enorme, &vec![0u8; (MAX_IMAGE_BYTES + 1) as usize]);
        assert!(validate_background(enorme.to_str().unwrap()).is_err());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn un_archivo_que_el_greeter_no_puede_leer_se_detecta() {
        let dir = temp_dir("permisos");
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o755)).unwrap();

        let publica = dir.join("publica.png");
        write_file(&publica, PNG);
        std::fs::set_permissions(&publica, std::fs::Permissions::from_mode(0o644)).unwrap();
        assert!(readable_by_greeter(&publica));

        let privada = dir.join("privada.png");
        write_file(&privada, PNG);
        std::fs::set_permissions(&privada, std::fs::Permissions::from_mode(0o600)).unwrap();
        assert!(!readable_by_greeter(&privada));

        // Y un archivo legible dentro de un directorio cerrado tampoco alcanza:
        // es exactamente el caso de un fondo en el home del usuario.
        let cerrado = dir.join("cerrado");
        std::fs::create_dir(&cerrado).unwrap();
        let adentro = cerrado.join("fondo.png");
        write_file(&adentro, PNG);
        std::fs::set_permissions(&adentro, std::fs::Permissions::from_mode(0o644)).unwrap();
        std::fs::set_permissions(&cerrado, std::fs::Permissions::from_mode(0o700)).unwrap();
        assert!(!readable_by_greeter(&adentro));

        std::fs::set_permissions(&cerrado, std::fs::Permissions::from_mode(0o755)).unwrap();
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Guardar dos veces seguidas no puede dejar la configuración apuntando a un
    /// archivo que la propia instalación acaba de borrar.
    #[test]
    fn la_copia_del_guardado_anterior_se_vuelve_a_copiar() {
        let instalada = PathBuf::from(format!("{CONFIG_DIR}/{BACKGROUND_FILE}.jpg"));
        assert!(needs_copy(&instalada, true));
        assert!(needs_copy(&PathBuf::from(format!("{CONFIG_DIR}/{BACKGROUND_FILE}")), true));

        // Un fondo que un administrador dejó en el mismo directorio con otro
        // nombre no lo borra la instalación, así que se apunta donde está.
        assert!(!needs_copy(
            &PathBuf::from(format!("{CONFIG_DIR}/mi-foto.jpg")),
            true
        ));

        assert!(!needs_copy(
            &PathBuf::from("/usr/share/backgrounds/vasakos/default.jpg"),
            true
        ));
        assert!(needs_copy(
            &PathBuf::from("/home/alguien/Imágenes/fondo.png"),
            false
        ));
    }

    #[test]
    fn el_tema_solo_admite_claro_u_oscuro() {
        assert_eq!(validate_theme("dark"), Ok("dark"));
        assert_eq!(validate_theme("light"), Ok("light"));
        assert!(validate_theme("Dark").is_err());
        assert!(validate_theme("").is_err());
    }

    #[test]
    fn un_esquema_sin_id_o_sin_colores_no_es_un_esquema() {
        let completo = r#"{"id":"vasak-default","colors":{"dark":{},"light":{}}}"#;
        assert_eq!(
            validate_scheme_document(completo),
            Ok("vasak-default".to_string())
        );

        assert!(validate_scheme_document(r#"{"colors":{"dark":{},"light":{}}}"#).is_err());
        assert!(validate_scheme_document(r#"{"id":"  ","colors":{"dark":{},"light":{}}}"#).is_err());
        assert!(validate_scheme_document(r#"{"id":"x","colors":{"dark":{}}}"#).is_err());
        assert!(validate_scheme_document("no soy json").is_err());
    }

    #[test]
    fn el_esquema_tiene_que_venir_de_un_directorio_de_esquemas() {
        let dir = temp_dir("esquema");
        let ajeno = dir.join("esquema.json");
        write_file(&ajeno, br#"{"id":"x","colors":{"dark":{},"light":{}}}"#);

        assert!(read_scheme_document(ajeno.to_str().unwrap()).is_err());

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Lo que se guarda no siempre es lo que se eligió: un fondo que el greeter
    /// no puede leer se copia, y la configuración apunta a la copia.
    #[test]
    fn un_fondo_ilegible_para_el_greeter_se_copia_y_la_configuracion_apunta_a_la_copia() {
        let dir = temp_dir("preparar");
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o755)).unwrap();

        let privado = dir.join("privado.png");
        write_file(&privado, PNG);
        std::fs::set_permissions(&privado, std::fs::Permissions::from_mode(0o600)).unwrap();

        let stage = dir.join("stage");
        std::fs::create_dir(&stage).unwrap();

        let guardado = stage_config(&stage, Some(privado.to_str().unwrap()), "light", None)
            .expect("se prepara");

        assert_eq!(
            guardado,
            Some(format!("{CONFIG_DIR}/{BACKGROUND_FILE}.png"))
        );
        assert!(stage.join("background.png").is_file(), "se copió el archivo");
        assert_eq!(
            std::fs::read_to_string(stage.join(BACKGROUND_FILE)).unwrap(),
            format!("{CONFIG_DIR}/{BACKGROUND_FILE}.png\n")
        );
        assert_eq!(
            std::fs::read_to_string(stage.join(THEME_FILE)).unwrap(),
            "light\n"
        );
        assert!(
            !stage.join(SCHEME_FILE).exists(),
            "sin esquema elegido no se deja archivo, y el greeter usa sus colores"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Y un fondo que sí puede leer se apunta donde está: copiar 60 MB de video
    /// a /etc para nada es peor que apuntarlo.
    #[test]
    fn un_fondo_legible_se_apunta_donde_esta() {
        let dir = temp_dir("apuntar");
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o755)).unwrap();

        let publico = dir.join("publico.png");
        write_file(&publico, PNG);
        std::fs::set_permissions(&publico, std::fs::Permissions::from_mode(0o644)).unwrap();

        let stage = dir.join("stage");
        std::fs::create_dir(&stage).unwrap();

        let esperado = std::fs::canonicalize(&publico).unwrap();
        let guardado = stage_config(&stage, Some(publico.to_str().unwrap()), "dark", None)
            .expect("se prepara");

        assert_eq!(guardado, Some(esperado.to_string_lossy().into_owned()));
        assert!(
            std::fs::read_dir(&stage)
                .unwrap()
                .all(|entrada| entrada.unwrap().file_name() != "background.png"),
            "no se copia lo que ya se puede leer"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn sin_fondo_elegido_no_queda_archivo_de_fondo() {
        let dir = temp_dir("sin-fondo");
        let stage = dir.join("stage");
        std::fs::create_dir_all(&stage).unwrap();

        let guardado = stage_config(&stage, None, "dark", None).expect("se prepara");

        assert_eq!(guardado, None);
        assert!(
            !stage.join(BACKGROUND_FILE).exists(),
            "no dejar el archivo es lo que significa «usar el fondo del sistema»"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }
}

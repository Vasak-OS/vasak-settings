//! El engrosado de trazos de FreeType, encendido o apagado.
//!
//! El «stem darkening» engrosa los trazos de la letra según el tamaño en que se
//! dibujan, en lugar de dejarlos del grosor que salga de la rasterización: el
//! texto se lee más lleno y menos desvaído, sobre todo en cuerpos chicos y en
//! pantallas sin mucha densidad.
//!
//! `vasak-desktop-settings` lo enciende para todo el sistema con un archivo en
//! `/usr/lib/environment.d`. Acá se escribe **un archivo con el mismo nombre en
//! la carpeta del usuario**, que es como systemd deja anular un ajuste del
//! sistema: ante dos archivos homónimos gana el de mayor precedencia, y
//! `~/.config` la tiene sobre `/usr/lib`.
//!
//! # Lo que no puede hacer
//!
//! **No cambia nada de lo que ya está abierto.** FreeType lee estas propiedades
//! cuando se inicializa, o sea una vez por proceso: lo que ya está corriendo
//! sigue dibujando como antes. La pantalla lo dice, porque un ajuste que parece
//! no hacer nada es peor que uno que avisa que hace falta volver a entrar.

use std::path::PathBuf;

use crate::logger::log_error;

/// El nombre del archivo, que tiene que ser **el mismo** que el del paquete.
///
/// De eso depende todo el mecanismo: systemd no fusiona los dos archivos, el de
/// mayor precedencia enmascara al otro. Un nombre distinto acá daría dos
/// archivos que se suman, y el del sistema seguiría encendiendo lo que éste
/// intenta apagar.
const ARCHIVO: &str = "50-vasakos-fuentes.conf";

/// La variable y sus dos valores.
///
/// `no-stem-darkening=0` es un doble negativo: significa **encender** el
/// engrosado. Es la forma en que FreeType nombra la propiedad, y por eso el
/// valor apagado no es «quitar la variable» sino ponerla en `1`: si la variable
/// no está, FreeType usa su valor de fábrica, que hoy es apagado — pero apagar
/// explícitamente deja escrito que fue una elección.
const ENCENDIDO: &str = "FREETYPE_PROPERTIES=cff:no-stem-darkening=0 autofitter:no-stem-darkening=0";
const APAGADO: &str = "FREETYPE_PROPERTIES=cff:no-stem-darkening=1 autofitter:no-stem-darkening=1";

/// El contenido que se escribe en la carpeta del usuario.
///
/// Lleva el porqué adentro: alguien que se encuentre este archivo tiene que
/// poder entender de dónde salió sin buscar en ningún otro lado.
pub fn contenido(activo: bool) -> String {
    let cabecera = "\
# Escrito por Ajustes → Apariencia → Fuentes.
#
# Enmascara al archivo del mismo nombre que envía vasak-desktop-settings en
# /usr/lib/environment.d. Borrarlo devuelve el ajuste del sistema.
#
# Sólo lo toman los procesos que arrancan después: FreeType lee esto al
# inicializarse.
";
    format!("{cabecera}{}\n", if activo { ENCENDIDO } else { APAGADO })
}

/// Si un contenido de `environment.d` pide el engrosado encendido.
///
/// Se lee la variable y no el archivo entero: un comentario que nombre la
/// propiedad no es una asignación, y el archivo del sistema tiene varios.
pub fn esta_activo(contenido: &str) -> Option<bool> {
    let valor = contenido
        .lines()
        .map(str::trim)
        .filter(|linea| !linea.starts_with('#'))
        .find_map(|linea| linea.strip_prefix("FREETYPE_PROPERTIES="))?;

    // Alcanza con el autofitter: es el que alcanza a las TrueType con el
    // `hintslight` que usa el escritorio, y el que decide lo que se ve.
    if valor.contains("autofitter:no-stem-darkening=0") {
        Some(true)
    } else if valor.contains("autofitter:no-stem-darkening=1") {
        Some(false)
    } else {
        None
    }
}

fn ruta_del_usuario() -> Option<PathBuf> {
    let base = std::env::var_os("XDG_CONFIG_HOME")
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
        .or_else(|| dirs::home_dir().map(|h| h.join(".config")))?;
    Some(base.join("environment.d").join(ARCHIVO))
}

fn ruta_del_sistema() -> PathBuf {
    PathBuf::from("/usr/lib/environment.d").join(ARCHIVO)
}

/// Si el engrosado está pedido, mirando primero lo del usuario.
///
/// Sin ninguno de los dos archivos devuelve `false`, que es el valor de fábrica
/// de FreeType.
#[tauri::command]
pub fn nitidez_activa() -> bool {
    let del_usuario = ruta_del_usuario()
        .and_then(|ruta| std::fs::read_to_string(ruta).ok())
        .and_then(|texto| esta_activo(&texto));

    if let Some(activo) = del_usuario {
        return activo;
    }

    std::fs::read_to_string(ruta_del_sistema())
        .ok()
        .and_then(|texto| esta_activo(&texto))
        .unwrap_or(false)
}

/// Escribe la preferencia. Toma efecto al volver a iniciar sesión.
#[tauri::command]
pub fn fijar_nitidez(activa: bool) -> Result<(), String> {
    let ruta = ruta_del_usuario().ok_or("no se pudo determinar la carpeta de configuración")?;
    if let Some(padre) = ruta.parent() {
        std::fs::create_dir_all(padre).map_err(|e| {
            log_error(&format!("no se pudo crear {}: {e}", padre.display()));
            format!("no se pudo crear {}: {e}", padre.display())
        })?;
    }

    std::fs::write(&ruta, contenido(activa)).map_err(|e| {
        log_error(&format!("no se pudo escribir {}: {e}", ruta.display()));
        format!("no se pudo escribir {}: {e}", ruta.display())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn el_contenido_encendido_se_lee_como_encendido() {
        assert_eq!(esta_activo(&contenido(true)), Some(true));
    }

    #[test]
    fn el_contenido_apagado_se_lee_como_apagado() {
        // Ida y vuelta: lo que se escribe tiene que poder volver a leerse. Sin
        // esto, el interruptor podía guardar algo que después no reconocía y
        // volvía solo a su posición anterior.
        assert_eq!(esta_activo(&contenido(false)), Some(false));
    }

    #[test]
    fn un_comentario_que_nombra_la_propiedad_no_es_una_asignacion() {
        // El archivo del sistema explica la propiedad en sus comentarios, y son
        // más largos que la línea que importa.
        let texto = "\
# FREETYPE_PROPERTIES=cff:no-stem-darkening=0 sería encenderlo
# pero acá está apagado
FREETYPE_PROPERTIES=cff:no-stem-darkening=1 autofitter:no-stem-darkening=1
";
        assert_eq!(esta_activo(texto), Some(false));
    }

    #[test]
    fn sin_la_variable_no_hay_respuesta() {
        // Distinto de «apagado»: un archivo sin la variable no dice nada, y
        // quien pregunta tiene que poder mirar el del sistema.
        assert_eq!(esta_activo("# vacío\nOTRA_COSA=1\n"), None);
        assert_eq!(esta_activo(""), None);
    }

    #[test]
    fn manda_el_autofitter() {
        // Es el driver que alcanza a las TrueType con `hintslight`. Un archivo
        // que encienda sólo el de PostScript no cambia cómo se ve Noto Sans.
        assert_eq!(
            esta_activo("FREETYPE_PROPERTIES=cff:no-stem-darkening=0\n"),
            None
        );
    }

    #[test]
    fn el_nombre_es_el_mismo_que_el_del_paquete() {
        // De esto depende el mecanismo entero: systemd no fusiona los archivos
        // de environment.d, el de mayor precedencia enmascara al otro. Con
        // nombres distintos, el del sistema seguiría encendiendo lo que el del
        // usuario intenta apagar.
        assert_eq!(ARCHIVO, "50-vasakos-fuentes.conf");
        assert!(ruta_del_sistema().ends_with(ARCHIVO));
    }

    #[test]
    fn el_archivo_explica_de_donde_salio() {
        // Alguien que lo encuentre a mano tiene que poder entenderlo sin buscar
        // en otro lado, y saber que borrarlo devuelve el ajuste del sistema.
        let texto = contenido(true);
        assert!(texto.contains("Ajustes"));
        assert!(texto.contains("Borrarlo"));
    }
}

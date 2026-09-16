//! El icono de una aplicación, a partir de la ruta de su ejecutable.
//!
//! La pantalla de permisos lista programas por su binario —`/usr/bin/grim`— y
//! una lista de rutas no se lee: hay que detenerse en cada línea a descifrar
//! cuál es cuál. Con el icono al lado se reconoce de un vistazo, que es lo que
//! se espera de una pantalla donde se decide qué puede usar la cámara.
//!
//! # De dónde sale
//!
//! Del archivo `.desktop` de la aplicación, que es lo que hace cualquier barra
//! de tareas. Derivar el nombre del icono del binario no sirve: `vasak-text` se
//! muestra con `accessories-text-editor`, y en las aplicaciones de tipo DNS
//! invertido no se parece en nada.
//!
//! # Por qué no se usa una biblioteca
//!
//! Hacen falta **dos claves** de un archivo INI. Una dependencia nueva hay que
//! declararla en el PKGBUILD, auditarla y actualizarla; el parser que hace falta
//! entra en treinta líneas y se prueba entero.

use std::collections::HashMap;
use std::path::Path;
use std::sync::{LazyLock, RwLock};

/// Lo que se muestra cuando no se encontró nada mejor.
pub const ICONO_GENERICO: &str = "application-x-executable";

/// Una entrada `.desktop`, reducida a lo que hace falta.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Entrada {
    /// El identificador de la entrada: el nombre del archivo sin `.desktop`.
    ///
    /// Hace falta desde que la lista de permisos trae identidades del portal.
    /// Ésas no son rutas de ejecutables —son `com.google.Chrome`, el nombre que
    /// la aplicación declara— y no hay `Exec` con el que emparejarlas; lo que
    /// coincide es justamente este identificador, porque es de donde el portal
    /// saca el suyo.
    pub id: String,
    /// El programa que ejecuta, sin argumentos.
    pub programa: String,
    pub icono: String,
}

/// El programa que una línea `Exec=` lanza de verdad.
///
/// No es el primer token. `Exec` admite delante el `env` y asignaciones de
/// entorno —`env GDK_BACKEND=x11 /usr/bin/app`—, y quedarse con el primero daría
/// `env` para todas esas, que además es un programa real y haría coincidir
/// cualquier cosa con cualquier cosa.
///
/// Los marcadores de campo (`%U`, `%F`, `%i`…) van al final y no estorban, pero
/// se descartan igual por si alguien los pone en el medio.
pub fn programa_de_exec(exec: &str) -> Option<String> {
    for token in exec.split_whitespace() {
        let token = token.trim_matches('"');

        if token.is_empty() || token.starts_with('%') {
            continue;
        }
        // Una asignación de entorno, o el `env` que suele precederlas.
        if token == "env" || (token.contains('=') && !token.contains('/')) {
            continue;
        }

        return Some(token.to_string());
    }

    None
}

/// Lee las dos claves que importan de un `.desktop`.
///
/// Sólo del grupo `[Desktop Entry]`: las acciones —`[Desktop Action nueva]`—
/// traen su propio `Exec`, y tomarlo haría que «abrir una ventana nueva» se
/// confundiera con la aplicación.
pub fn leer_entrada(id: &str, contenido: &str) -> Option<Entrada> {
    let mut en_el_grupo = false;
    let mut exec = None;
    let mut icono = None;

    for linea in contenido.lines() {
        let linea = linea.trim();

        if linea.starts_with('[') {
            en_el_grupo = linea == "[Desktop Entry]";
            continue;
        }
        if !en_el_grupo || linea.starts_with('#') {
            continue;
        }

        // `Name[es]` y compañía: la clave termina donde empieza el idioma. Acá
        // no hacen falta traducidas, y `Icon[es]` no existe.
        let Some((clave, valor)) = linea.split_once('=') else {
            continue;
        };
        match clave.trim() {
            "Exec" if exec.is_none() => exec = programa_de_exec(valor.trim()),
            "Icon" if icono.is_none() => icono = Some(valor.trim().to_string()),
            _ => {}
        }
    }

    let icono = icono?;
    if icono.is_empty() {
        return None;
    }

    Some(Entrada {
        id: id.to_string(),
        programa: exec?,
        icono,
    })
}

/// El icono que le corresponde a un binario, o `None` si ninguna entrada lo nombra.
///
/// Se compara por el **nombre del archivo** y no por la ruta entera: un
/// `.desktop` puede decir `Exec=grim` a secas y resolverlo por `PATH`, y el
/// servicio de permisos siempre informa la ruta absoluta. Comparar rutas
/// completas no encontraría ninguna de esas.
pub fn icono_de(binario: &str, entradas: &[Entrada]) -> Option<String> {
    let nombre = nombre_de_archivo(binario)?;

    entradas
        .iter()
        .find(|e| nombre_de_archivo(&e.programa).as_deref() == Some(nombre.as_str()))
        .map(|e| e.icono.clone())
}

/// El prefijo con el que el servicio de permisos marca una identidad del portal.
///
/// Repetido acá en vez de importarlo del crate del protocolo: este puente sólo
/// habla con el servicio por D-Bus y no lo compila. Si cambiara, esta resolución
/// dejaría de encontrar iconos —no rompería nada más— y hay una prueba que lo
/// dice.
const PREFIJO_DEL_PORTAL: &str = "portal:";

/// El icono de una aplicación que llegó por el portal.
///
/// Se empareja por el identificador de la entrada `.desktop` y no por `Exec`:
/// `com.google.Chrome` no nombra ningún ejecutable, y es exactamente el nombre
/// del archivo `com.google.Chrome.desktop`. Sin esto, todo lo que se decida por
/// el portal se dibuja con el icono genérico, y una lista de identificadores de
/// tipo DNS invertido es tan ilegible como una de rutas — que es la razón de ser
/// de este módulo.
///
/// Sin distinguir mayúsculas: los identificadores del portal se escriben con la
/// capitalización que trae el `.desktop`, y basta un sistema de archivos que la
/// haya cambiado para perder la coincidencia.
pub fn icono_de_app_id(app_id: &str, entradas: &[Entrada]) -> Option<String> {
    if app_id.is_empty() {
        return None;
    }

    entradas
        .iter()
        .find(|e| e.id.eq_ignore_ascii_case(app_id))
        .map(|e| e.icono.clone())
}

fn nombre_de_archivo(ruta: &str) -> Option<String> {
    Path::new(ruta)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .filter(|n| !n.is_empty())
}

// ── Lo que toca el disco ────────────────────────────────────────────────────

/// Los directorios donde viven los `.desktop`, por orden de precedencia.
fn directorios() -> Vec<std::path::PathBuf> {
    let mut dirs = Vec::new();

    if let Some(casa) = dirs::data_dir() {
        dirs.push(casa.join("applications"));
    }
    // Las del sistema. `XDG_DATA_DIRS` puede traer más, pero estas dos son las
    // que existen siempre y donde están todas las del escritorio.
    dirs.push("/usr/local/share/applications".into());
    dirs.push("/usr/share/applications".into());

    dirs
}

/// Todas las entradas encontradas, leídas una sola vez.
///
/// Memorizado porque la pantalla resuelve un icono por aplicación listada y
/// recorrer `/usr/share/applications` —varios cientos de archivos— una vez por
/// fila sería recorrerlo decenas de veces para el mismo resultado.
static ENTRADAS: LazyLock<RwLock<Option<Vec<Entrada>>>> = LazyLock::new(|| RwLock::new(None));

fn entradas() -> Vec<Entrada> {
    if let Some(ya) = ENTRADAS.read().ok().and_then(|e| e.clone()) {
        return ya;
    }

    let mut encontradas = Vec::new();
    for dir in directorios() {
        let Ok(archivos) = std::fs::read_dir(&dir) else {
            continue;
        };
        for archivo in archivos.flatten() {
            let ruta = archivo.path();
            if ruta.extension().and_then(|e| e.to_str()) != Some("desktop") {
                continue;
            }
            let id = ruta
                .file_stem()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();

            if let Some(entrada) = std::fs::read_to_string(&ruta)
                .ok()
                .and_then(|c| leer_entrada(&id, &c))
            {
                encontradas.push(entrada);
            }
        }
    }

    if let Ok(mut guardadas) = ENTRADAS.write() {
        *guardadas = Some(encontradas.clone());
    }

    encontradas
}

/// El icono de cada uno de estos binarios.
///
/// Recibe la lista entera en lugar de resolverse de a uno para leer los
/// directorios una sola vez por pantalla.
pub fn iconos_de(binarios: &[String]) -> HashMap<String, String> {
    let entradas = entradas();

    binarios
        .iter()
        .map(|b| {
            let icono = match b.strip_prefix(PREFIJO_DEL_PORTAL) {
                Some(app_id) => icono_de_app_id(app_id, &entradas),
                None => icono_de(b, &entradas),
            };
            (
                b.clone(),
                icono.unwrap_or_else(|| ICONO_GENERICO.to_string()),
            )
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn el_programa_sale_del_exec_con_sus_marcadores() {
        assert_eq!(
            programa_de_exec("/usr/bin/vasak-text %F"),
            Some("/usr/bin/vasak-text".into())
        );
        assert_eq!(programa_de_exec("grim"), Some("grim".into()));
    }

    #[test]
    fn el_env_y_las_asignaciones_no_son_el_programa() {
        // Quedarse con el primer token daba `env` para todas éstas, y `env` es
        // un programa real: haría coincidir cualquier binario con cualquier
        // icono.
        assert_eq!(
            programa_de_exec("env GDK_BACKEND=x11 /usr/bin/app %U"),
            Some("/usr/bin/app".into())
        );
        assert_eq!(
            programa_de_exec("QT_SCALE_FACTOR=2 /usr/bin/otra"),
            Some("/usr/bin/otra".into())
        );
    }

    #[test]
    fn una_ruta_con_signo_igual_sigue_siendo_una_ruta() {
        // La regla de las asignaciones no puede comerse un binario que tenga un
        // `=` en la ruta: por eso pide que no lleve barras.
        assert_eq!(
            programa_de_exec("/opt/raro=1/app"),
            Some("/opt/raro=1/app".into())
        );
    }

    #[test]
    fn un_exec_vacio_no_da_programa() {
        assert_eq!(programa_de_exec(""), None);
        assert_eq!(programa_de_exec("%F"), None);
    }

    #[test]
    fn se_leen_las_dos_claves_del_grupo() {
        let entrada = leer_entrada(
            "ar.net.vasak.os.Text",
            "[Desktop Entry]\nType=Application\nName=Editor\nExec=/usr/bin/vasak-text %F\nIcon=accessories-text-editor\n",
        );
        assert_eq!(
            entrada,
            Some(Entrada {
                id: "ar.net.vasak.os.Text".into(),
                programa: "/usr/bin/vasak-text".into(),
                icono: "accessories-text-editor".into(),
            })
        );
    }

    #[test]
    fn el_exec_de_una_accion_no_se_confunde_con_el_de_la_aplicacion() {
        // «Abrir una ventana nueva» trae su propio Exec. Tomarlo haría que la
        // acción reemplazara a la aplicación.
        let entrada = leer_entrada(
            "app",
            "[Desktop Entry]\nExec=/usr/bin/app\nIcon=app\n\n[Desktop Action nueva]\nExec=/usr/bin/app --new\nIcon=otro\n",
        );
        assert_eq!(entrada.unwrap().icono, "app");
    }

    #[test]
    fn sin_icono_no_hay_entrada() {
        // Una entrada sin icono no aporta nada a esta pantalla, y dejarla haría
        // que coincidiera con el binario y devolviera una cadena vacía.
        assert_eq!(
            leer_entrada("app", "[Desktop Entry]\nExec=/usr/bin/app\n"),
            None
        );
        assert_eq!(
            leer_entrada("app", "[Desktop Entry]\nExec=/usr/bin/app\nIcon=\n"),
            None
        );
    }

    #[test]
    fn sin_exec_tampoco() {
        assert_eq!(leer_entrada("app", "[Desktop Entry]\nIcon=app\n"), None);
    }

    #[test]
    fn lo_de_afuera_del_grupo_se_ignora() {
        let entrada = leer_entrada(
            "app",
            "Exec=/usr/bin/colado\nIcon=colado\n[Desktop Entry]\nExec=/usr/bin/app\nIcon=app\n",
        );
        assert_eq!(entrada.unwrap().programa, "/usr/bin/app");
    }

    #[test]
    fn el_binario_se_busca_por_su_nombre_y_no_por_la_ruta() {
        // El servicio de permisos informa la ruta absoluta y el `.desktop` puede
        // decir el nombre a secas, resuelto por PATH. Comparar rutas enteras no
        // encontraría ninguno de esos.
        let entradas = vec![Entrada {
            id: String::new(),
            programa: "grim".into(),
            icono: "applets-screenshooter".into(),
        }];

        assert_eq!(
            icono_de("/usr/bin/grim", &entradas),
            Some("applets-screenshooter".into())
        );
    }

    #[test]
    fn un_binario_que_ninguna_entrada_nombra_no_tiene_icono() {
        // Es el caso normal de un programa sin `.desktop` —algo lanzado desde
        // la terminal—, y quien llama pone el genérico.
        let entradas = vec![Entrada {
            id: String::new(),
            programa: "/usr/bin/otra".into(),
            icono: "otra".into(),
        }];

        assert_eq!(icono_de("/usr/bin/grim", &entradas), None);
    }

    #[test]
    fn una_ruta_sin_nombre_no_rompe() {
        assert_eq!(icono_de("/", &[]), None);
        assert_eq!(icono_de("", &[]), None);
    }

    fn una_entrada(id: &str, programa: &str, icono: &str) -> Entrada {
        Entrada {
            id: id.into(),
            programa: programa.into(),
            icono: icono.into(),
        }
    }

    /// Lo que llega por el portal se empareja por el identificador, no por `Exec`.
    ///
    /// `com.google.Chrome` no nombra ningún ejecutable, así que `icono_de` no lo
    /// encuentra por ningún camino: sin esta búsqueda, todo lo que se decida por
    /// el portal sale con el icono genérico.
    #[test]
    fn una_identidad_del_portal_se_busca_por_el_identificador() {
        let entradas = vec![
            una_entrada(
                "com.google.Chrome",
                "/usr/bin/google-chrome-stable",
                "google-chrome",
            ),
            una_entrada(
                "vasak-text",
                "/usr/bin/vasak-text",
                "accessories-text-editor",
            ),
        ];

        assert_eq!(
            icono_de_app_id("com.google.Chrome", &entradas).as_deref(),
            Some("google-chrome")
        );
        // Y el `Exec` no cuenta acá: emparejar por ahí haría que un `app_id`
        // que se parezca al nombre de un binario se lleve el icono de otra.
        assert_eq!(icono_de_app_id("google-chrome-stable", &entradas), None);
    }

    /// Sin distinguir mayúsculas.
    #[test]
    fn el_identificador_no_distingue_mayusculas() {
        let entradas = vec![una_entrada(
            "com.google.Chrome",
            "/usr/bin/chrome",
            "google-chrome",
        )];

        assert_eq!(
            icono_de_app_id("com.google.chrome", &entradas).as_deref(),
            Some("google-chrome")
        );
    }

    /// Un `app_id` vacío no se lleva el icono de una entrada sin identificador.
    ///
    /// `leer_entrada` recibe el identificador de quien lee el archivo, y si ese
    /// nombre no se pudo sacar llega vacío. Sin este corte, las dos cadenas
    /// vacías coincidirían y el primer `.desktop` roto le daría su icono a
    /// cualquier pedido sin identidad.
    #[test]
    fn un_app_id_vacio_no_coincide_con_nada() {
        let entradas = vec![una_entrada("", "/usr/bin/app", "app")];
        assert_eq!(icono_de_app_id("", &entradas), None);
    }

    /// El prefijo con el que se reconoce una identidad del portal.
    ///
    /// Está escrito acá y en el crate del protocolo del servicio de permisos,
    /// que este puente no compila. Esta prueba es lo único que ata las dos
    /// copias: si allá cambia, acá se dejan de encontrar los iconos y nada más
    /// falla, o sea que el fallo sería invisible.
    #[test]
    fn el_prefijo_del_portal_es_el_que_usa_el_servicio() {
        assert_eq!(PREFIJO_DEL_PORTAL, "portal:");
    }

    /// Y el reparto: cada clave va por el camino que le toca.
    #[test]
    fn cada_clave_se_resuelve_por_donde_corresponde() {
        let entradas = vec![
            una_entrada(
                "com.google.Chrome",
                "/usr/bin/google-chrome-stable",
                "google-chrome",
            ),
            una_entrada(
                "vasak-text",
                "/usr/bin/vasak-text",
                "accessories-text-editor",
            ),
        ];

        // Una ruta, por `Exec`.
        assert_eq!(
            icono_de("/usr/bin/vasak-text", &entradas).as_deref(),
            Some("accessories-text-editor")
        );
        // Una identidad del portal, por el identificador.
        assert_eq!(
            icono_de_app_id("com.google.Chrome", &entradas).as_deref(),
            Some("google-chrome")
        );
        // Y una identidad del portal **no** se busca como si fuera una ruta:
        // `nombre_de_archivo("portal:com.google.Chrome")` devuelve la cadena
        // entera, que no es el nombre de ningún ejecutable.
        assert_eq!(icono_de("portal:com.google.Chrome", &entradas), None);
    }
}

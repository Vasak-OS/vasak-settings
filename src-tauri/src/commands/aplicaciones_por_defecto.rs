//! Con qué abre el sistema cada cosa.
//!
//! Hasta ahora esto se cambiaba editando `~/.config/mimeapps.list` a mano, o no
//! se cambiaba. El archivo del sistema —el que trae `vasak-desktop-settings` en
//! `/usr/share/applications/mimeapps.list`— decide los valores por omisión, y el
//! de la persona le gana; pero no había ninguna pantalla que lo escribiera, así
//! que «cambiar el navegador por omisión» era una tarea de editor de texto.
//!
//! # Quién resuelve
//!
//! Leer y escribir se delegan en `xdg-mime`, que ya viene con el escritorio
//! (`xdg-utils`, declarado en `vasakos-desktop`). La resolución de XDG no es
//! mirar un archivo: son varios, en un orden que depende de `XDG_DATA_DIRS` y
//! del escritorio en uso, con listas de añadidos y de quitados. Reimplementar
//! eso acá daría una pantalla que muestra una cosa y un sistema que hace otra,
//! que es peor que no tener pantalla.
//!
//! # La terminal es distinta
//!
//! No tiene tipo MIME: no se puede elegir con `mimeapps.list` como el navegador
//! o el correo. Se escribe en los dos lugares donde se la busca de verdad:
//!
//!   - `~/.config/xdg-terminals.list`, que es lo que mira `xdg-terminal-exec`;
//!   - `~/.config/environment.d/50-vasak-terminal.conf` con `TERMINAL=`, que es
//!     lo que leen los guiones — y lo que buscó `limine-snapper-restore` antes
//!     de contestar «No suitable terminal found».
//!
//! Ninguno de los dos alcanza solo, y por eso van los dos.

use serde::Serialize;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use crate::commands::iconos_de_apps::programa_de_exec;

/// Lo que se muestra cuando la aplicación no declara icono.
const ICONO_GENERICO: &str = "application-x-executable";

/// La categoría con la que un `.desktop` dice «soy una terminal».
const CATEGORIA_TERMINAL: &str = "TerminalEmulator";

/// Una aplicación que puede quedar elegida.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Candidata {
    /// El identificador: el nombre del archivo, `vasak-terminal.desktop`.
    ///
    /// Es lo que se le pasa a `xdg-mime` y lo que se escribe en
    /// `xdg-terminals.list`; no el nombre visible, que cambia con el idioma.
    pub id: String,
    pub nombre: String,
    pub icono: String,
    /// El programa que lanza, sin argumentos. Hace falta sólo para la terminal,
    /// porque `TERMINAL=` quiere un binario y no un `.desktop`.
    pub programa: String,
}

/// Un `.desktop` reducido a lo que decide esta pantalla.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Entrada {
    pub id: String,
    pub nombre: String,
    pub icono: String,
    pub programa: String,
    pub tipos: Vec<String>,
    pub categorias: Vec<String>,
}

impl Entrada {
    /// Si maneja alguno de los tipos pedidos.
    pub fn maneja_alguno(&self, tipos: &[String]) -> bool {
        tipos
            .iter()
            .any(|buscado| self.tipos.iter().any(|t| t == buscado))
    }

    pub fn es_terminal(&self) -> bool {
        self.categorias.iter().any(|c| c == CATEGORIA_TERMINAL)
    }

    pub fn a_candidata(&self) -> Candidata {
        Candidata {
            id: self.id.clone(),
            nombre: self.nombre.clone(),
            icono: self.icono.clone(),
            programa: self.programa.clone(),
        }
    }
}

/// Lee un `.desktop`, quedándose con el nombre en el idioma que se pida.
///
/// `idioma` es el código corto —`es`, `en`—. Un `.desktop` trae `Name` y tantos
/// `Name[xx]` como traducciones tenga, y mostrar siempre el `Name` pelado
/// dejaría media lista en inglés dentro de una ventana traducida.
///
/// Devuelve `None` para lo que no debe aparecer en una lista: las entradas sin
/// nombre o sin `Exec`, y las que piden explícitamente no mostrarse
/// (`NoDisplay`, `Hidden`) — que es como se marcan los manejadores internos,
/// los `.desktop` de un solo tipo MIME y las entradas desactivadas.
pub fn leer_entrada(id: &str, contenido: &str, idioma: &str) -> Option<Entrada> {
    let mut en_el_grupo = false;
    let mut claves: BTreeMap<String, String> = BTreeMap::new();

    for linea in contenido.lines() {
        let linea = linea.trim();

        if linea.starts_with('[') {
            // Un `.desktop` tiene además un grupo por acción —«Abrir en una
            // ventana nueva»—, cada uno con su propio `Exec` y su propio
            // `Name`. Leerlos mezclaría la acción con la aplicación.
            en_el_grupo = linea == "[Desktop Entry]";
            continue;
        }

        if !en_el_grupo || linea.is_empty() || linea.starts_with('#') {
            continue;
        }

        let Some((clave, valor)) = linea.split_once('=') else {
            continue;
        };
        claves
            .entry(clave.trim().to_string())
            .or_insert_with(|| valor.trim().to_string());
    }

    let leer = |clave: &str| claves.get(clave).map(String::as_str).unwrap_or_default();

    if leer("NoDisplay").eq_ignore_ascii_case("true") || leer("Hidden").eq_ignore_ascii_case("true")
    {
        return None;
    }

    let nombre = claves
        .get(&format!("Name[{idioma}]"))
        .or_else(|| claves.get("Name"))
        .filter(|n| !n.is_empty())?
        .clone();

    let programa = programa_de_exec(leer("Exec"))?;

    Some(Entrada {
        id: id.to_string(),
        nombre,
        icono: {
            let icono = leer("Icon");
            if icono.is_empty() {
                ICONO_GENERICO.to_string()
            } else {
                icono.to_string()
            }
        },
        programa,
        tipos: lista(leer("MimeType")),
        categorias: lista(leer("Categories")),
    })
}

/// Una lista separada por `;`, sin vacíos.
fn lista(valor: &str) -> Vec<String> {
    valor
        .split(';')
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_string)
        .collect()
}

/// Lo que va en `environment.d` para que los guiones encuentren la terminal.
///
/// Se escribe el **binario** y no el `.desktop`: `TERMINAL=` lo consume gente
/// que hace `command -v "$TERMINAL"`, y un `vasak-terminal.desktop` ahí no lo
/// encontraría nadie.
pub fn contenido_de_environment_d(programa: &str) -> String {
    format!(
        "# Generado por Configuración de VasakOS: la terminal elegida.\n\
         #\n\
         # Lo leen los programas que quieren abrir una consola. Muchos de ellos\n\
         # sólo prueban una lista de nombres conocidos —konsole, gnome-terminal,\n\
         # foot, kitty…— y ninguna terminal propia entra en esas listas, así que\n\
         # sin esta variable no encuentran ninguna.\n\
         #\n\
         # systemd lo lee al iniciar la sesión: el cambio se ve en la próxima.\n\
         TERMINAL={programa}\n"
    )
}

/// Lo que va en `xdg-terminals.list`.
///
/// Una línea con el identificador de la entrada, que es el formato que espera
/// `xdg-terminal-exec`: la primera que exista gana.
pub fn contenido_de_xdg_terminals(id: &str) -> String {
    format!("{id}\n")
}

// ── Lo que toca el disco ────────────────────────────────────────────────────

/// El código corto del idioma de la sesión, para elegir el `Name[xx]`.
fn idioma() -> String {
    let crudo = std::env::var("LC_ALL")
        .or_else(|_| std::env::var("LC_MESSAGES"))
        .or_else(|_| std::env::var("LANG"))
        .unwrap_or_default();

    crudo
        .split(['_', '.', '@'])
        .next()
        .unwrap_or("")
        .to_string()
}

fn directorios() -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    if let Some(casa) = dirs::data_dir() {
        dirs.push(casa.join("applications"));
    }
    dirs.push("/usr/local/share/applications".into());
    dirs.push("/usr/share/applications".into());

    dirs
}

/// Todas las entradas del sistema.
///
/// Sin memorizar, a diferencia de `iconos_de_apps`: acá la lista se pide cuando
/// alguien abre la pantalla, y tiene que reflejar lo que se haya instalado desde
/// que la aplicación arrancó. Son unos cientos de archivos y se leen en
/// milisegundos.
fn entradas() -> Vec<Entrada> {
    let idioma = idioma();
    let mut encontradas: Vec<Entrada> = Vec::new();

    for dir in directorios() {
        let Ok(archivos) = std::fs::read_dir(&dir) else {
            continue;
        };

        for archivo in archivos.flatten() {
            let ruta = archivo.path();

            if ruta.extension().and_then(|e| e.to_str()) != Some("desktop") {
                continue;
            }

            let Some(id) = ruta.file_name().and_then(|n| n.to_str()) else {
                continue;
            };
            // El primero gana: los directorios vienen por precedencia, así que
            // un `.desktop` del usuario le gana al del sistema con el mismo
            // nombre — que es la regla de XDG.
            if encontradas.iter().any(|e| e.id == id) {
                continue;
            }

            let Ok(contenido) = std::fs::read_to_string(&ruta) else {
                continue;
            };

            if let Some(entrada) = leer_entrada(id, &contenido, &idioma) {
                encontradas.push(entrada);
            }
        }
    }

    encontradas.sort_by(|a, b| a.nombre.to_lowercase().cmp(&b.nombre.to_lowercase()));
    encontradas
}

/// Las aplicaciones que pueden abrir alguno de estos tipos.
#[tauri::command]
pub fn candidatas_para(tipos: Vec<String>) -> Vec<Candidata> {
    entradas()
        .iter()
        .filter(|e| e.maneja_alguno(&tipos))
        .map(Entrada::a_candidata)
        .collect()
}

/// Las terminales instaladas.
#[tauri::command]
pub fn terminales_disponibles() -> Vec<Candidata> {
    entradas()
        .iter()
        .filter(|e| e.es_terminal())
        .map(Entrada::a_candidata)
        .collect()
}

/// Qué abre hoy este tipo, según el sistema.
#[tauri::command]
pub fn aplicacion_por_defecto(tipo: String) -> Option<String> {
    let salida = std::process::Command::new("xdg-mime")
        .args(["query", "default", &tipo])
        .output()
        .ok()?;

    let id = String::from_utf8_lossy(&salida.stdout).trim().to_string();

    // `xdg-mime` contesta vacío y con éxito cuando no hay ninguna elegida.
    if id.is_empty() {
        None
    } else {
        Some(id)
    }
}

/// Elige la aplicación para todos esos tipos.
///
/// Son varios porque una sola elección de la pantalla —«el navegador»— son tres
/// tipos: `http`, `https` y `text/html`. Se hace en una sola llamada a
/// `xdg-mime` para que no queden a medias si falla en el medio.
#[tauri::command]
pub fn definir_aplicacion(tipos: Vec<String>, id: String) -> Result<(), String> {
    if tipos.is_empty() {
        return Err("No se dijo para qué tipos".to_string());
    }

    let salida = std::process::Command::new("xdg-mime")
        .arg("default")
        .arg(&id)
        .args(&tipos)
        .output()
        .map_err(|e| format!("No se pudo ejecutar xdg-mime: {e}"))?;

    if salida.status.success() {
        Ok(())
    } else {
        Err(format!(
            "xdg-mime falló: {}",
            String::from_utf8_lossy(&salida.stderr).trim()
        ))
    }
}

fn ruta_de_config(resto: &str) -> Option<PathBuf> {
    dirs::config_dir().map(|base| base.join(resto))
}

/// La terminal elegida, si hay una.
#[tauri::command]
pub fn terminal_por_defecto() -> Option<String> {
    let ruta = ruta_de_config("xdg-terminals.list")?;
    let contenido = std::fs::read_to_string(ruta).ok()?;

    contenido
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty() && !l.starts_with('#'))
        .map(str::to_string)
}

/// Deja elegida la terminal, en los dos lugares donde se la busca.
#[tauri::command]
pub fn definir_terminal(id: String, programa: String) -> Result<(), String> {
    let lista = ruta_de_config("xdg-terminals.list")
        .ok_or_else(|| "No se encontró el directorio de configuración".to_string())?;

    escribir(&lista, &contenido_de_xdg_terminals(&id))?;

    let entorno = ruta_de_config("environment.d/50-vasak-terminal.conf")
        .ok_or_else(|| "No se encontró el directorio de configuración".to_string())?;

    escribir(&entorno, &contenido_de_environment_d(&programa))
}

fn escribir(ruta: &Path, contenido: &str) -> Result<(), String> {
    if let Some(padre) = ruta.parent() {
        std::fs::create_dir_all(padre)
            .map_err(|e| format!("No se pudo crear {}: {e}", padre.display()))?;
    }

    std::fs::write(ruta, contenido)
        .map_err(|e| format!("No se pudo escribir {}: {e}", ruta.display()))
}

#[cfg(test)]
mod pruebas {
    use super::*;

    const UNA_TERMINAL: &str = "[Desktop Entry]\n\
        Type=Application\n\
        Name=Terminal\n\
        Name[es]=Terminal de VasakOS\n\
        Exec=vasak-terminal %f\n\
        Icon=utilities-terminal\n\
        Categories=TerminalEmulator;System;Utility;\n";

    #[test]
    fn se_leen_las_claves_que_decide_la_pantalla() {
        let entrada = leer_entrada("vasak-terminal.desktop", UNA_TERMINAL, "en").unwrap();

        assert_eq!(entrada.id, "vasak-terminal.desktop");
        assert_eq!(entrada.nombre, "Terminal");
        assert_eq!(entrada.icono, "utilities-terminal");
        assert_eq!(entrada.programa, "vasak-terminal");
        assert!(entrada.es_terminal());
    }

    #[test]
    fn el_nombre_sale_en_el_idioma_de_la_sesion() {
        // Sin esto, media lista queda en inglés adentro de una ventana
        // traducida.
        let entrada = leer_entrada("vasak-terminal.desktop", UNA_TERMINAL, "es").unwrap();

        assert_eq!(entrada.nombre, "Terminal de VasakOS");
    }

    #[test]
    fn un_idioma_que_la_entrada_no_trae_cae_al_nombre_pelado() {
        let entrada = leer_entrada("vasak-terminal.desktop", UNA_TERMINAL, "ja").unwrap();

        assert_eq!(entrada.nombre, "Terminal");
    }

    #[test]
    fn una_entrada_que_pide_no_mostrarse_no_se_muestra() {
        // Así se marcan los manejadores internos: un `.desktop` que existe sólo
        // para quedarse con un tipo MIME y que no es una aplicación que alguien
        // quiera elegir.
        for clave in ["NoDisplay", "Hidden"] {
            let contenido = format!("{UNA_TERMINAL}{clave}=true\n");

            assert_eq!(leer_entrada("x.desktop", &contenido, "es"), None);
        }
    }

    #[test]
    fn sin_exec_no_hay_entrada() {
        let contenido = "[Desktop Entry]\nName=Sin programa\nIcon=x\n";

        assert_eq!(leer_entrada("x.desktop", contenido, "es"), None);
    }

    #[test]
    fn sin_nombre_tampoco() {
        let contenido = "[Desktop Entry]\nExec=algo\nIcon=x\n";

        assert_eq!(leer_entrada("x.desktop", contenido, "es"), None);
    }

    #[test]
    fn sin_icono_se_usa_el_generico() {
        let contenido = "[Desktop Entry]\nName=Algo\nExec=algo\n";
        let entrada = leer_entrada("x.desktop", contenido, "es").unwrap();

        assert_eq!(entrada.icono, ICONO_GENERICO);
    }

    #[test]
    fn el_grupo_de_una_accion_no_se_mezcla_con_la_aplicacion() {
        // Un `.desktop` con acciones tiene varios `Name` y varios `Exec`. Sin
        // mirar el grupo, la lista mostraría «Ventana nueva» como si fuera una
        // aplicación aparte.
        let contenido = format!(
            "{UNA_TERMINAL}\n[Desktop Action NewWindow]\nName=Ventana nueva\nExec=otro-programa\n"
        );
        let entrada = leer_entrada("x.desktop", &contenido, "en").unwrap();

        assert_eq!(entrada.nombre, "Terminal");
        assert_eq!(entrada.programa, "vasak-terminal");
    }

    #[test]
    fn los_tipos_se_parten_por_punto_y_coma() {
        let contenido = "[Desktop Entry]\nName=Navegador\nExec=nav\n\
            MimeType=text/html;x-scheme-handler/http;x-scheme-handler/https;\n";
        let entrada = leer_entrada("nav.desktop", contenido, "es").unwrap();

        assert_eq!(
            entrada.tipos,
            vec![
                "text/html",
                "x-scheme-handler/http",
                "x-scheme-handler/https"
            ]
        );
    }

    #[test]
    fn maneja_alguno_alcanza_con_uno() {
        // El navegador se elige para tres tipos y muchos declaran sólo dos. Si
        // se pidieran los tres, la lista saldría vacía.
        let contenido = "[Desktop Entry]\nName=Navegador\nExec=nav\n\
            MimeType=x-scheme-handler/http;\n";
        let entrada = leer_entrada("nav.desktop", contenido, "es").unwrap();

        let pedidos = vec![
            "text/html".to_string(),
            "x-scheme-handler/http".to_string(),
            "x-scheme-handler/https".to_string(),
        ];

        assert!(entrada.maneja_alguno(&pedidos));
        assert!(!entrada.maneja_alguno(&["application/pdf".to_string()]));
    }

    #[test]
    fn una_aplicacion_comun_no_es_una_terminal() {
        let contenido = "[Desktop Entry]\nName=Galería\nExec=g\nCategories=Graphics;Viewer;\n";
        let entrada = leer_entrada("g.desktop", contenido, "es").unwrap();

        assert!(!entrada.es_terminal());
    }

    #[test]
    fn el_environment_d_lleva_el_binario_y_no_el_desktop() {
        // `TERMINAL=` lo consume gente que hace `command -v "$TERMINAL"`.
        let contenido = contenido_de_environment_d("vasak-terminal");

        assert!(contenido.contains("\nTERMINAL=vasak-terminal\n"));
        assert!(!contenido.contains(".desktop"));
    }

    #[test]
    fn el_xdg_terminals_lleva_el_desktop_y_termina_en_salto() {
        // Sin el salto final, la línea siguiente que alguien agregue se pega a
        // ésta y no se encuentra ninguna de las dos.
        assert_eq!(
            contenido_de_xdg_terminals("vasak-terminal.desktop"),
            "vasak-terminal.desktop\n"
        );
    }
}

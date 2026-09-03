//! Abrir la configuración directamente en una sección.
//!
//! `vasak-settings appearance-panel` abre la pantalla del panel en vez de la
//! portada. Lo usa el menú del clic derecho del panel —«Configuración del
//! panel»— y sirve para cualquier lugar del escritorio que quiera llevar a un
//! ajuste puntual en vez de dejar a la persona buscándolo en el menú lateral.
//!
//! Acá sólo se limpia el argumento; **quién decide si esa sección existe es el
//! router**, que es el que tiene la lista de verdad. Si esta lista se duplicara
//! en Rust, agregar una pantalla obligaría a tocar los dos lados y el día que
//! alguien se olvide, la sección nueva no se podría abrir.

/// Un nombre de sección es lo que usa el router: minúsculas y guiones.
///
/// El filtro no es por seguridad —el router ignora lo que no conoce— sino para
/// que un argumento cualquiera (una ruta de archivo, una URL, un pegote de
/// varias líneas) no cruce el puente hacia el JavaScript.
fn es_nombre_de_seccion(valor: &str) -> bool {
    !valor.is_empty()
        && valor.len() <= 40
        && valor
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// La sección que pide una invocación, a partir de sus argumentos.
///
/// Se separa del comando porque hay **dos** invocaciones que la piden y tienen
/// que entenderla igual: la que arranca el proceso, que lee `std::env::args()`,
/// y la de una segunda ejecución cuando la ventana ya está abierta, que llega
/// por `tauri-plugin-single-instance` como un `argv` armado aparte. Con la
/// lectura escrita dos veces, alcanzaba con que una contara el argumento cero y
/// las dos formas de abrir la misma pantalla dejaban de coincidir.
///
/// Los dos `argv` incluyen el nombre del programa, así que la sección es el
/// primero después de él.
pub fn seccion_pedida<I>(argumentos: I) -> Option<String>
where
    I: IntoIterator<Item = String>,
{
    argumentos
        .into_iter()
        .nth(1)
        .filter(|argumento| es_nombre_de_seccion(argumento))
}

#[tauri::command]
pub fn initial_section() -> Option<String> {
    seccion_pedida(std::env::args())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn los_nombres_del_router_pasan() {
        assert!(es_nombre_de_seccion("appearance-panel"));
        assert!(es_nombre_de_seccion("home"));
        assert!(es_nombre_de_seccion("network-wifi"));
        assert!(es_nombre_de_seccion("monitors"));
    }

    #[test]
    fn lo_que_no_es_un_nombre_no_pasa() {
        assert!(!es_nombre_de_seccion(""), "vacío");
        assert!(!es_nombre_de_seccion("/etc/passwd"), "una ruta");
        assert!(!es_nombre_de_seccion("https://ejemplo"), "una URL");
        assert!(!es_nombre_de_seccion("Appearance-Panel"), "mayúsculas");
        assert!(!es_nombre_de_seccion("panel con espacios"));
        assert!(!es_nombre_de_seccion("panel\nhome"), "varias líneas");
        assert!(!es_nombre_de_seccion("../otro"));
    }

    /// Las dos formas de invocar leen el mismo argumento.
    ///
    /// `std::env::args()` y el `argv` de una segunda ejecución empiezan los dos
    /// por el nombre del programa. Si una de las dos contara desde otro lado,
    /// `vasak-settings network-wifi` abriría una pantalla distinta según hubiera
    /// o no una ventana abierta.
    #[test]
    fn la_seccion_es_el_argumento_despues_del_programa() {
        let como_lo_ve_el_arranque = ["/usr/bin/vasak-settings", "network-wifi"];
        let como_llega_la_segunda = ["vasak-settings", "network-wifi"];

        for argv in [como_lo_ve_el_arranque, como_llega_la_segunda] {
            assert_eq!(
                seccion_pedida(argv.iter().map(|s| s.to_string())),
                Some("network-wifi".to_string())
            );
        }
    }

    #[test]
    fn sin_argumento_no_hay_seccion() {
        // Es cómo la abre el menú de aplicaciones: sin nada, va a la portada.
        let solo_el_programa = ["/usr/bin/vasak-settings"];
        assert_eq!(seccion_pedida(solo_el_programa.iter().map(|s| s.to_string())), None);
    }

    #[test]
    fn un_argumento_que_no_es_seccion_no_pasa_el_puente() {
        let con_basura = ["vasak-settings", "/etc/passwd"];
        assert_eq!(seccion_pedida(con_basura.iter().map(|s| s.to_string())), None);
    }

    #[test]
    fn un_argumento_larguisimo_no_pasa() {
        assert!(!es_nombre_de_seccion(&"a".repeat(41)));
        assert!(es_nombre_de_seccion(&"a".repeat(40)), "el límite es válido");
    }
}

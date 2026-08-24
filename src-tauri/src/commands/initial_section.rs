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

#[tauri::command]
pub fn initial_section() -> Option<String> {
    std::env::args()
        .nth(1)
        .filter(|argumento| es_nombre_de_seccion(argumento))
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

    #[test]
    fn un_argumento_larguisimo_no_pasa() {
        assert!(!es_nombre_de_seccion(&"a".repeat(41)));
        assert!(es_nombre_de_seccion(&"a".repeat(40)), "el límite es válido");
    }
}

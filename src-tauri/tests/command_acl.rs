//! Paridad entre los comandos del `generate_handler!`, el `AppManifest` de
//! `build.rs` y las capabilities (vasak-settings#197). Sin manifiesto, cualquier
//! ventana (incluida `vsk_context_menu`) puede llamar a todos los comandos.

use std::collections::BTreeSet;
use std::fs;

fn leer(ruta: &str) -> String {
    fs::read_to_string(format!("{}/{ruta}", env!("CARGO_MANIFEST_DIR")))
        .unwrap_or_else(|e| panic!("no se pudo leer {ruta}: {e}"))
}

/// Último segmento de cada ruta `a::b::comando,` dentro del `generate_handler!`.
fn comandos_del_handler() -> BTreeSet<String> {
    let lib = leer("src/lib.rs");
    let inicio = lib
        .find("generate_handler![")
        .expect("lib.rs sin generate_handler!");
    let bloque = &lib[inicio + "generate_handler![".len()..];
    let bloque = &bloque[..bloque.find(']').expect("generate_handler! sin cierre")];
    bloque
        .lines()
        .map(str::trim)
        .filter(|l| !l.starts_with("//") && l.contains("::"))
        .map(|l| {
            l.trim_end_matches(',')
                .rsplit("::")
                .next()
                .unwrap()
                .to_string()
        })
        .collect()
}

/// Literales string dentro de `commands(&[ ... ])` de `build.rs`.
fn comandos_del_manifiesto() -> BTreeSet<String> {
    let build = leer("build.rs");
    let inicio = build
        .find("commands(&[")
        .expect("build.rs sin AppManifest::commands");
    let bloque = &build[inicio + "commands(&[".len()..];
    let bloque = &bloque[..bloque.find("])").expect("commands sin cierre")];
    bloque
        .split('"')
        .skip(1)
        .step_by(2)
        .map(str::to_string)
        .collect()
}

fn permisos(capability: &str) -> BTreeSet<String> {
    let json = leer(&format!("capabilities/{capability}.json"));
    let inicio = json.find("\"permissions\"").expect("sin permissions");
    let bloque = &json[inicio..];
    let bloque = &bloque[..bloque.find(']').expect("permissions sin cierre")];
    bloque
        .split('"')
        .skip(3)
        .step_by(2)
        .map(str::to_string)
        .collect()
}

#[test]
fn el_manifiesto_declara_exactamente_los_comandos_del_handler() {
    let handler = comandos_del_handler();
    let manifiesto = comandos_del_manifiesto();
    assert!(!handler.is_empty(), "no se leyó ningún comando del handler");
    let sin_gatear: Vec<_> = handler.difference(&manifiesto).collect();
    let sobran: Vec<_> = manifiesto.difference(&handler).collect();
    assert!(
        sin_gatear.is_empty() && sobran.is_empty(),
        "en el handler pero no en el manifiesto (sin gatear por la ACL: cualquier ventana los llama): {sin_gatear:?}; \
         en el manifiesto pero no en el handler: {sobran:?}"
    );
}

#[test]
fn la_ventana_principal_puede_llamar_a_todos_los_comandos() {
    let default = permisos("default");
    let faltan: Vec<_> = comandos_del_handler()
        .into_iter()
        .map(|c| format!("allow-{}", c.replace('_', "-")))
        .filter(|p| !default.contains(p))
        .collect();
    assert!(faltan.is_empty(), "default.json no concede: {faltan:?}");
}

#[test]
fn la_ventana_del_menu_contextual_no_recibe_comandos_de_la_app() {
    let propios: Vec<_> = permisos("context-menu")
        .into_iter()
        .filter(|p| p.starts_with("allow-") && !p.contains(':'))
        .collect();
    assert!(
        propios.is_empty(),
        "context-menu.json concede comandos propios: {propios:?}"
    );
}

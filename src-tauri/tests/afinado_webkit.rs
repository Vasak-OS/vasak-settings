//! Que el afinado del WebKit siga cableado de punta a punta.
//!
//! El glue de GTK (`commands/webkit.rs`) no se puede ejercitar sin un display ni
//! un WebKit reales, así que esta prueba lee el fuente y comprueba el cableado:
//! que el comando exista con sus palancas, que esté registrado en `lib.rs` y que
//! el frontend lo invoque al montar. No corre GTK.

use std::path::PathBuf;

fn read(relative: &str) -> String {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(relative);
    std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("no se pudo leer {}: {e}", path.display()))
}

#[test]
fn el_comando_afina_las_palancas_esperadas() {
    let source = read("src/commands/webkit.rs");
    assert!(
        source.contains("pub fn tune_webview"),
        "falta el comando tune_webview en commands/webkit.rs"
    );
    for lever in [
        "set_enable_developer_extras(false)",
        "set_enable_back_forward_navigation_gestures(false)",
        "CacheModel::DocumentViewer",
    ] {
        assert!(
            source.contains(lever),
            "commands/webkit.rs no aplica «{lever}»"
        );
    }
}

#[test]
fn el_comando_esta_registrado_en_lib() {
    assert!(
        read("src/lib.rs").contains("commands::webkit::tune_webview"),
        "lib.rs no registra commands::webkit::tune_webview en generate_handler"
    );
}

#[test]
fn el_frontend_invoca_el_afinado_al_montar() {
    assert!(
        read("../src/App.vue").contains("invoke('tune_webview')"),
        "App.vue no invoca tune_webview al montar"
    );
}

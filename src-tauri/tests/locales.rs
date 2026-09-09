//! Que los catálogos de idioma sirvan.
//!
//! El plugin de i18n los parsea en tiempo de ejecución y **paniquea** si no
//! puede, así que un error de sintaxis no se ve hasta que la aplicación no
//! arranca. Y una clave que falta en un idioma no falla: se muestra cruda, con
//! el nombre de la clave a la vista de la persona.
//!
//! Estos tests aparecieron al mover el bloque de permisos de `views.privacy` a
//! `views.onlineAccounts.permissions`: reindentar un bloque de veinte líneas a
//! mano en dos archivos es exactamente donde se pierde una clave.

use std::collections::BTreeSet;
use std::path::PathBuf;

fn catalogo(idioma: &str) -> serde_yaml::Value {
    let ruta = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("locales")
        .join(format!("{idioma}.yml"));
    let texto = std::fs::read_to_string(&ruta)
        .unwrap_or_else(|e| panic!("no se pudo leer {}: {e}", ruta.display()));
    serde_yaml::from_str(&texto)
        .unwrap_or_else(|e| panic!("{} no es YAML válido: {e}", ruta.display()))
}

/// Todas las claves, aplanadas con puntos, como las busca el plugin.
fn claves(valor: &serde_yaml::Value, prefijo: &str, salida: &mut BTreeSet<String>) {
    match valor {
        serde_yaml::Value::Mapping(mapa) => {
            for (clave, hijo) in mapa {
                let nombre = clave.as_str().unwrap_or_default();
                let completa = if prefijo.is_empty() {
                    nombre.to_string()
                } else {
                    format!("{prefijo}.{nombre}")
                };
                claves(hijo, &completa, salida);
            }
        }
        _ => {
            salida.insert(prefijo.to_string());
        }
    }
}

fn claves_de(idioma: &str) -> BTreeSet<String> {
    let mut salida = BTreeSet::new();
    claves(&catalogo(idioma), "", &mut salida);
    salida
}

#[test]
fn los_dos_idiomas_parsean_y_la_raiz_es_un_mapeo() {
    for idioma in ["es", "en"] {
        let raiz = catalogo(idioma);
        assert!(
            raiz.is_mapping(),
            "la raíz de {idioma}.yml tiene que ser un mapeo, no un valor suelto"
        );
    }
}

#[test]
fn los_dos_idiomas_tienen_las_mismas_claves() {
    let es = claves_de("es");
    let en = claves_de("en");

    let solo_es: Vec<_> = es.difference(&en).collect();
    let solo_en: Vec<_> = en.difference(&es).collect();

    assert!(
        solo_es.is_empty() && solo_en.is_empty(),
        "las claves no coinciden.\n  sólo en es: {solo_es:?}\n  sólo en en: {solo_en:?}"
    );
}

#[test]
fn ningun_texto_esta_vacio() {
    // Una clave vacía no es un texto faltante que se note: se muestra como nada,
    // y el control queda sin etiqueta.
    for idioma in ["es", "en"] {
        let raiz = catalogo(idioma);
        let mut vacias = Vec::new();
        let mut todas = BTreeSet::new();
        claves(&raiz, "", &mut todas);

        for clave in &todas {
            let mut actual = &raiz;
            for parte in clave.split('.') {
                actual = &actual[parte];
            }
            if actual.as_str().map(|s| s.trim().is_empty()).unwrap_or(false) {
                vacias.push(clave.clone());
            }
        }
        assert!(vacias.is_empty(), "textos vacíos en {idioma}.yml: {vacias:?}");
    }
}

#[test]
fn los_marcadores_de_interpolacion_coinciden() {
    // Un `{0}` que está en un idioma y no en el otro pierde el dato: el texto
    // sale sin el nombre del proveedor, sin el error, sin el número.
    let es = catalogo("es");
    let en = catalogo("en");
    let mut todas = BTreeSet::new();
    claves(&es, "", &mut todas);

    let marcadores = |v: &serde_yaml::Value| -> Vec<String> {
        let texto = v.as_str().unwrap_or_default();
        let mut encontrados: Vec<String> = texto
            .match_indices('{')
            .filter_map(|(i, _)| texto[i..].find('}').map(|j| texto[i..i + j + 1].to_string()))
            .collect();
        encontrados.sort();
        encontrados
    };

    for clave in &todas {
        let mut a = &es;
        let mut b = &en;
        for parte in clave.split('.') {
            a = &a[parte];
            b = &b[parte];
        }
        assert_eq!(
            marcadores(a),
            marcadores(b),
            "los marcadores de «{clave}» no coinciden entre idiomas"
        );
    }
}

/// El bloque que se movió, comprobado por nombre.
///
/// No basta con que los dos idiomas coincidan: si el bloque hubiera quedado
/// anidado un nivel más arriba, coincidirían igual y la pantalla mostraría las
/// claves crudas.
#[test]
fn los_permisos_cuelgan_de_las_cuentas_en_linea() {
    for idioma in ["es", "en"] {
        let raiz = catalogo(idioma);
        let permisos = &raiz["views"]["onlineAccounts"]["permissions"];
        assert!(
            permisos.is_mapping(),
            "views.onlineAccounts.permissions falta en {idioma}.yml"
        );
        for esperada in ["title", "description", "allow", "deny", "forget", "note", "resources"] {
            assert!(
                !permisos[esperada].is_null(),
                "falta views.onlineAccounts.permissions.{esperada} en {idioma}.yml"
            );
        }
        assert!(
            raiz["views"]["privacy"].is_null(),
            "views.privacy quedó en {idioma}.yml después de moverlo"
        );
    }
}

/// El motivo por el que un proveedor todavía no se puede conectar.
///
/// La pantalla lo muestra debajo del botón apagado, así que si la clave falta el
/// botón queda deshabilitado y sin explicación — que es peor que el estado
/// anterior, donde al menos estaba encendido.
///
/// Es **un** motivo y no uno por proveedor: la lista la trae el catálogo del
/// servicio, así que acá no se sabe qué proveedores hay, y la razón por la que
/// alguno no está listo es siempre la misma —le falta el client_id—.
#[test]
fn un_proveedor_sin_configurar_explica_por_que() {
    for idioma in ["es", "en"] {
        let raiz = catalogo(idioma);
        let texto = raiz["views"]["onlineAccounts"]["unavailable"]["noClientId"]
            .as_str()
            .unwrap_or_default();

        assert!(
            !texto.trim().is_empty(),
            "falta views.onlineAccounts.unavailable.noClientId en {idioma}.yml"
        );
        // Tiene que decir dónde, o no es una explicación: es un «no» sin salida.
        assert!(
            texto.contains("/etc/vasak-accounts/providers.d"),
            "el motivo no dice dónde dejar el client_id en {idioma}.yml: {texto}"
        );
    }
}

/// Las capacidades se nombran con la misma clave con la que las nombra el
/// servicio, así que una que falte se muestra cruda —«drive» en vez de
/// «Archivos en la nube»— en la lista de cada proveedor y de cada cuenta.
#[test]
fn todas_las_capacidades_tienen_nombre_visible() {
    for idioma in ["es", "en"] {
        let raiz = catalogo(idioma);
        let nombres = &raiz["views"]["onlineAccounts"]["capabilities"];

        for capacidad in ["email", "calendar", "contacts", "chat", "drive", "tasks"] {
            assert!(
                nombres[capacidad]
                    .as_str()
                    .is_some_and(|t| !t.trim().is_empty()),
                "falta el nombre de '{capacidad}' en {idioma}.yml"
            );
        }
    }
}

/// Proton no vuelve.
///
/// No tiene API pública para terceros: el botón registraba una cuenta vacía con
/// secreto vacío y no había forma de que llegara a funcionar. Si alguien
/// reintroduce sus textos, es que está por reintroducir el botón.
#[test]
fn proton_no_tiene_textos_porque_no_tiene_api() {
    for idioma in ["es", "en"] {
        let claves = claves_de(idioma);
        let restos: Vec<_> = claves
            .iter()
            .filter(|clave| clave.to_lowercase().contains("proton"))
            .collect();
        assert!(restos.is_empty(), "quedaron textos de Proton en {idioma}.yml: {restos:?}");
    }
}

/// Los textos de la prueba de conexión de una cuenta de correo.
///
/// El que más importa es `saveAnywayHint`: una prueba puede dar un falso
/// negativo —una red que filtra el puerto, un servidor con un mecanismo de
/// autenticación poco común— y sin ese texto la persona creería que su cuenta
/// está mal cuando el problema es la prueba.
#[test]
fn la_prueba_de_conexion_tiene_todos_sus_textos() {
    for idioma in ["es", "en"] {
        let raiz = catalogo(idioma);
        let prueba = &raiz["views"]["onlineAccounts"]["probe"];

        assert!(prueba.is_mapping(), "views.onlineAccounts.probe falta en {idioma}.yml");
        for clave in ["test", "testing", "imap", "smtp", "saveAnyway", "saveAnywayHint"] {
            assert!(
                prueba[clave].as_str().is_some_and(|t| !t.trim().is_empty()),
                "falta views.onlineAccounts.probe.{clave} en {idioma}.yml"
            );
        }
    }
}

/// Las dos puntas se nombran distinto, o el resultado no diría cuál falló —
/// que es la única razón de mostrarlas por separado.
#[test]
fn las_dos_puntas_del_correo_se_nombran_distinto() {
    for idioma in ["es", "en"] {
        let raiz = catalogo(idioma);
        let prueba = &raiz["views"]["onlineAccounts"]["probe"];
        let entrada = prueba["imap"].as_str().unwrap_or_default();
        let salida = prueba["smtp"].as_str().unwrap_or_default();

        assert_ne!(entrada, salida, "las dos puntas dicen lo mismo en {idioma}.yml");
    }
}

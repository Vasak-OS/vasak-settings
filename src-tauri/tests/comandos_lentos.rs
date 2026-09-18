//! Que un comando lento no se cuele por la vía que corre en el hilo principal.
//!
//! # El fallo que esto evita
//!
//! `informe_de_actualizaciones` lanza `vasak-update --json`, que **tarda un
//! minuto largo**: comprueba contra los servidores. Estaba escrito sin `async`,
//! y la macro de Tauri compila un comando así por la vía `Blocking`, que corre
//! el cuerpo dentro del manejador de IPC — o sea, en el hilo principal, que en
//! Linux es el de GTK y el que dibuja.
//!
//! El resultado: entrar a Actualizaciones congelaba la aplicación entera
//! durante ese minuto. Ni la barra lateral respondía, y no se leía como «está
//! cargando» sino como que se colgó.
//!
//! # Por qué es un test del fuente
//!
//! Porque no hay nada que ejecutar. La diferencia vive en el tipo de la
//! función, la decide una macro al compilar y no deja rastro que se pueda
//! consultar después. Sacarle el `async` vuelve a compilar perfecto, pasa
//! cualquier prueba de comportamiento —el comando devuelve lo mismo— y congela
//! la ventana otra vez.

const FUENTE: &str = include_str!("../src/commands/actualizaciones.rs");

/// Los comandos de este archivo que lanzan un proceso que puede tardar.
///
/// Los de `systemctl` no están: contestan al instante y hacerlos `async` sería
/// ceremonia sin motivo. El criterio es «puede tardar», no «lanza un proceso».
const LENTOS: [&str; 1] = ["informe_de_actualizaciones"];

#[test]
fn los_comandos_lentos_no_bloquean_el_hilo_principal() {
    for comando in LENTOS {
        let declaracion = format!("pub async fn {comando}(");
        assert!(
            FUENTE.contains(&declaracion),
            "«{comando}» tiene que declararse `pub async fn`.\n\
             Sin `async`, la macro de Tauri lo corre en el hilo principal y la \
             ventana se congela hasta que termine — medido, un minuto largo en \
             el caso de vasak-update. Con `async` se despacha con \
             async_runtime::spawn y el hilo que dibuja sigue libre."
        );
    }
}

/// Y que el trabajo que bloquea siga yendo a un hilo aparte.
///
/// `async` solo saca el problema del hilo principal pero no de todos lados:
/// `Command::output()` espera al proceso sin ceder, así que adentro de una
/// tarea asíncrona taparía un hilo del ejecutor durante el mismo minuto. La
/// ventana respondería y cualquier otro comando encolado atrás seguiría
/// esperando.
#[test]
fn lo_que_espera_a_un_proceso_va_en_spawn_blocking() {
    assert!(
        FUENTE.contains("spawn_blocking"),
        "el comando que espera a `vasak-update` tiene que envolver esa espera \
         en `tauri::async_runtime::spawn_blocking`: `Command::output()` no cede, \
         y suelto en una tarea asíncrona tapa un hilo del ejecutor."
    );
}

//! Lo que la pantalla de actualizaciones necesita del sistema.
//!
//! # Por qué acá no hay ningún analizador
//!
//! Estuvo, y se fue a `vasak-update`. La comprobación periódica y esta
//! pantalla miran exactamente lo mismo, y dos copias del mismo analizador son
//! dos que se separan: la que quedara vieja diría algo distinto de lo que el
//! aviso ya dijo.
//!
//! Así que se le pregunta al programa que ya sabe: `vasak-update --json`. Es
//! un proceso por vez que alguien abre la pantalla, o sea unas pocas veces por
//! día. Un servicio para eso sería un proceso vivo todo el tiempo para
//! contestar cada tanto.
//!
//! # Y por qué acá no se actualiza nada
//!
//! Aplicar necesita privilegios, y va a ser de la tienda: el candado de pacman
//! admite un solo dueño. Esta pantalla y `vasak-update` no lo piden nunca.

use std::process::{Command, Stdio};

use serde::Serialize;

use crate::utils::command::CommandExecutor;

/// Lo que informa `vasak-update --json`.
///
/// Se pasa tal cual al frontend en vez de volver a modelarlo: los campos son
/// los que el otro programa define, y describirlos otra vez acá sería una
/// tercera copia de lo mismo.
#[derive(Debug, Serialize)]
pub struct Informe {
    /// El JSON de `vasak-update`, ya parseado.
    pub datos: serde_json::Value,
    /// Si el programa está instalado. Sin él la pantalla explica qué falta en
    /// vez de mostrarse vacía, que es lo que parece un error.
    pub disponible: bool,
}

/// Lo que hay para actualizar.
///
/// # Por qué es `async`, y por qué eso no es un detalle
///
/// Medido: `vasak-update --json` tarda **un minuto largo** —comprueba contra
/// los servidores— y este comando es el único de la pantalla que hace algo
/// lento.
///
/// Escrito sin `async`, la macro de Tauri lo compila por la vía `Blocking`, que
/// corre el cuerpo dentro del manejador de IPC — o sea, en el hilo principal,
/// que en Linux es el de GTK y el que dibuja. El resultado era que entrar a
/// Actualizaciones **congelaba la aplicación entera** por ese minuto: ni la
/// barra lateral respondía, y no se veía como «está cargando» sino como que se
/// colgó.
///
/// Con `async`, la macro lo despacha con `async_runtime::spawn` y el hilo
/// principal sigue libre. El trabajo que bloquea va adentro de `spawn_blocking`
/// y no suelto en la tarea: `Command::output()` espera al proceso sin ceder, y
/// dejarlo en un hilo del ejecutor asíncrono taparía uno de esos durante el
/// mismo minuto. Se vería mejor —la ventana responde— pero cualquier otro
/// comando encolado atrás seguiría esperando.
#[tauri::command]
pub async fn informe_de_actualizaciones() -> Informe {
    let salida = tauri::async_runtime::spawn_blocking(|| {
        Command::new("vasak-update")
            .arg("--json")
            .stderr(Stdio::null())
            .output()
    })
    .await;

    // Dos fallos distintos, y los dos significan lo mismo para la pantalla: no
    // se pudo preguntar. El de afuera es que la tarea no llegó a terminar; el
    // de adentro, que no se pudo lanzar el programa.
    let Ok(Ok(salida)) = salida else {
        return Informe {
            datos: serde_json::Value::Null,
            disponible: false,
        };
    };

    Informe {
        datos: serde_json::from_slice(&salida.stdout).unwrap_or(serde_json::Value::Null),
        disponible: true,
    }
}

/// Si el aviso periódico está encendido.
#[tauri::command]
pub fn aviso_de_actualizaciones_activo() -> bool {
    CommandExecutor::run("systemctl", &["--user", "is-enabled", "vasak-update.timer"])
        .map(|s| s.trim() == "enabled")
        .unwrap_or(false)
}

/// Enciende o apaga el aviso periódico.
///
/// Con `--now` para que tenga efecto sin volver a iniciar sesión: apagarlo y
/// que siga avisando hasta el próximo arranque haría dudar de si el
/// interruptor hizo algo.
#[tauri::command]
pub fn activar_aviso_de_actualizaciones(activo: bool) -> Result<(), String> {
    let accion = if activo { "enable" } else { "disable" };
    CommandExecutor::run(
        "systemctl",
        &["--user", accion, "--now", "vasak-update.timer"],
    )
    .map(|_| ())
}

/// Cada cuánto se comprueba, en días.
///
/// Sale del temporizador y no de una configuración nuestra: systemd ya lleva
/// el horario, y un archivo propio con el mismo dato sería un segundo lugar
/// donde puede decir otra cosa.
#[tauri::command]
pub fn intervalo_de_comprobacion() -> u32 {
    let salida = CommandExecutor::run(
        "systemctl",
        &[
            "--user",
            "show",
            "vasak-update.timer",
            "--property=TimersMonotonic",
        ],
    )
    .unwrap_or_default();
    // `TimersMonotonic` trae los disparadores con su valor en microsegundos.
    // Se busca el de `OnUnitActiveSec`, que es el que se repite; el de
    // arranque no dice cada cuánto.
    salida
        .split_whitespace()
        .skip_while(|p| !p.contains("OnUnitActiveSec"))
        .find_map(|p| p.parse::<u64>().ok())
        .map(|micros| (micros / 86_400_000_000).max(1) as u32)
        .unwrap_or(1)
}

/// Cambia cada cuánto se comprueba.
///
/// Se escribe un archivo suelto en la carpeta del usuario en vez de tocar la
/// unidad del paquete: es el mecanismo que systemd tiene para esto, sobrevive
/// a las actualizaciones del paquete, y borrarlo devuelve el valor de fábrica
/// sin dejar rastro.
#[tauri::command]
pub fn poner_intervalo_de_comprobacion(dias: u32) -> Result<(), String> {
    if !(1..=30).contains(&dias) {
        return Err("el intervalo tiene que estar entre 1 y 30 días".into());
    }

    // Por `dirs::config_dir()`: leyéndolo a mano se aceptaba cualquier valor,
    // y acá abajo se escribe un añadido de systemd. Con una base relativa el
    // archivo caía bajo el directorio de trabajo, systemd no lo leía nunca y
    // el intervalo de actualización quedaba sin aplicar sin que nada fallara.
    let base = dirs::config_dir()
        .filter(|base| base.is_absolute())
        .ok_or_else(|| "no se pudo encontrar la carpeta de configuración".to_string())?;
    let dir = base.join("systemd/user/vasak-update.timer.d");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    std::fs::write(
        dir.join("vasak.conf"),
        format!(
            "# Escrito por Configuración → Actualizaciones.\n\
             [Timer]\n\
             OnUnitActiveSec={dias}d\n"
        ),
    )
    .map_err(|e| e.to_string())?;

    // Sin esto systemd sigue con el valor anterior hasta que alguien recargue
    // o vuelva a entrar, y el ajuste parecería no haber hecho nada.
    CommandExecutor::run("systemctl", &["--user", "daemon-reload"]).map(|_| ())
}

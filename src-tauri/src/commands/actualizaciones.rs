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

#[tauri::command]
pub fn informe_de_actualizaciones() -> Informe {
    let salida = Command::new("vasak-update")
        .arg("--json")
        .stderr(Stdio::null())
        .output();

    let Ok(salida) = salida else {
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

    let base = std::env::var("XDG_CONFIG_HOME")
        .map(std::path::PathBuf::from)
        .or_else(|_| std::env::var("HOME").map(|h| std::path::PathBuf::from(h).join(".config")))
        .map_err(|_| "no se pudo encontrar la carpeta de configuración".to_string())?;
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

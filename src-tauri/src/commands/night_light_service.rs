//! Encender y apagar la luz nocturna.
//!
//! La configuración (temperaturas, horario, ubicación) es del plugin
//! `tauri-plugin-display-manager`, que la comparte con el centro de control
//! del escritorio. Lo que queda acá es sólo prender y apagar el servicio de
//! usuario que corre `wlsunset`, como antes. Cuando vasak-desktop#178 lleve el
//! encendido al plugin —por el D-Bus de systemd y no con `systemctl`—, esto se
//! va también.

use std::process::Command;

use tauri_plugin_display_manager::night_light::UNIT_NAME;

use crate::logger::{log_debug, log_error};

/// Los `systemctl --user` que hay que correr, en orden.
///
/// Encender relee las unidades y **reinicia** el servicio: la configuración
/// vive en su `ExecStart`, así que un `enable --now` sobre un servicio que ya
/// corría dejaba los valores viejos hasta el próximo inicio de sesión.
pub fn steps(enabled: bool) -> Vec<Vec<&'static str>> {
    if enabled {
        vec![
            vec!["daemon-reload"],
            vec!["enable", UNIT_NAME],
            vec!["restart", UNIT_NAME],
        ]
    } else {
        vec![vec!["disable", "--now", UNIT_NAME]]
    }
}

fn systemctl(args: &[&str]) -> Result<(), String> {
    let output = Command::new("systemctl")
        .arg("--user")
        .args(args)
        .output()
        .map_err(|e| format!("No se pudo ejecutar systemctl: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let msg = format!("systemctl {:?} falló: {}", args, stderr.trim());
        log_error(&msg);
        return Err(msg);
    }

    Ok(())
}

#[tauri::command]
pub fn get_night_light_enabled() -> bool {
    Command::new("systemctl")
        .args(["--user", "is-active", "--quiet", UNIT_NAME])
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

/// Prende o apaga la luz nocturna con la configuración que ya guardó el
/// plugin. Devuelve si quedó encendida.
#[tauri::command]
pub fn set_night_light_enabled(enabled: bool) -> Result<bool, String> {
    for args in steps(enabled) {
        let result = systemctl(&args);
        // Apagar algo que ya estaba apagado no es un error.
        if enabled {
            result?;
        }
    }
    log_debug(if enabled {
        "Luz nocturna activada"
    } else {
        "Luz nocturna desactivada"
    });
    Ok(get_night_light_enabled())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encender_relee_y_reinicia_la_unidad_del_plugin() {
        assert_eq!(UNIT_NAME, "vasak-nightlight.service");
        assert_eq!(
            steps(true),
            vec![
                vec!["daemon-reload"],
                vec!["enable", "vasak-nightlight.service"],
                vec!["restart", "vasak-nightlight.service"],
            ]
        );
    }

    #[test]
    fn apagar_deshabilita_y_detiene() {
        assert_eq!(
            steps(false),
            vec![vec!["disable", "--now", "vasak-nightlight.service"]]
        );
    }
}

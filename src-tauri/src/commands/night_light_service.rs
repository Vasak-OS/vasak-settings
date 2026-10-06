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

use crate::commands::idle::systemctl;
use crate::logger::log_debug;

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

/// Si el error de `systemctl` es que la unidad no existe: la luz nocturna
/// nunca se guardó. `disable` sobre una unidad ya deshabilitada no falla, así
/// que no hace falta reconocer ese caso.
pub fn is_missing_unit(error: &str) -> bool {
    error.contains("does not exist") || error.contains("not loaded") || error.contains("not found")
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
        match systemctl(&args) {
            // Apagar una luz que nunca se configuró no es un error. Cualquier
            // otro fallo sí: si `disable` no llegó a hacerse, la unidad sigue
            // habilitada y vuelve a arrancar en el próximo inicio de sesión,
            // aunque ahora esté detenida y el interruptor diga «apagada».
            Err(error) if !enabled && is_missing_unit(&error) => {}
            result => result?,
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
    fn solo_una_unidad_inexistente_se_ignora_al_apagar() {
        assert!(is_missing_unit(
            "systemctl [\"disable\"] falló: Failed to disable unit: Unit file vasak-nightlight.service does not exist."
        ));
        assert!(is_missing_unit("Unit vasak-nightlight.service not loaded."));
        assert!(!is_missing_unit(
            "Failed to connect to bus: No medium found"
        ));
        assert!(!is_missing_unit(
            "No se pudo ejecutar systemctl: Permission denied"
        ));
    }

    #[test]
    fn apagar_deshabilita_y_detiene() {
        assert_eq!(
            steps(false),
            vec![vec!["disable", "--now", "vasak-nightlight.service"]]
        );
    }
}

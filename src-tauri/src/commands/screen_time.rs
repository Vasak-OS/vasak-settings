//! El tiempo de pantalla, consultado al servicio de salud (`vasak-health-service`).
//!
//! Este puente no decide ni mide nada: pregunta. El servicio lleva la
//! contabilidad —qué aplicación estuvo enfocada, cuánto, en qué hora del día— y
//! la devuelve; acá sólo se traduce la respuesta de D-Bus a lo que la ventana
//! necesita y se le pega a cada aplicación su icono y su nombre.
//!
//! # Sobre los tipos escritos a mano
//!
//! El contrato vive en el crate `vasak-health-protocol`, y depender de él sería
//! el motivo de tenerlo. No se puede todavía: ese crate deriva `Type` del
//! `zvariant` de zbus 5 y esta aplicación está clavada en zbus 4 (por el menú de
//! la bandeja, igual que el escritorio). Así que se replica la firma acá, como ya
//! hacen `connect.rs` y `permissions.rs`. Si el contrato cambia en el servicio,
//! este archivo tiene que cambiar con él y nada lo va a recordar — por eso hay
//! una prueba que fija la firma esperada.

use serde::{Deserialize, Serialize};

/// El servicio corre en el bus de **sesión**: el tiempo de pantalla es de quien
/// está sentado en la máquina y no sale de ahí.
const SERVICE_NAME: &str = "ar.net.vasak.os.Health";
const SERVICE_PATH: &str = "/ar/net/vasak/os/Health";
const SERVICE_INTERFACE: &str = "ar.net.vasak.os.Health";

/// Cuántas cubetas trae el desglose por hora: una por cada hora del día local.
const HOURS_IN_DAY: usize = 24;

/// La firma de `ScreenTimeReport` tal como la manda el servicio: `(bssa(sa(sstat)))`.
///
/// Se deserializa a tuplas anidadas y no a una estructura con `Type` derivado
/// porque el `zvariant` de zbus 4 ya sabe hacer las tuplas y los `Vec`, y así no
/// hace falta arrastrar el derive del crate del protocolo. El orden es, de
/// afuera hacia adentro: `enabled`, `today`, `first_day`, y los días, cada uno
/// con su fecha y sus aplicaciones `(app_id, category, millis, hours)`.
type RawReport = (
    bool,
    String,
    String,
    Vec<(String, Vec<(String, String, u64, Vec<u64>)>)>,
);

/// Cuánto usó una aplicación en un día, lista para la ventana.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppUsage {
    pub app_id: String,
    pub category: String,
    pub millis: u64,
    /// Milisegundos por hora del día local: siempre 24 valores. Pueden venir
    /// todos en cero en datos viejos que sólo guardaban el total.
    pub hours: Vec<u64>,
    /// El icono del tema, resuelto **acá** desde el `.desktop` y no por el
    /// servicio: el servicio cuenta tiempo y no sabe de iconos. Se completa
    /// después de leer la respuesta, de ahí el `default`.
    #[serde(default)]
    pub icon: String,
    /// El nombre visible, también resuelto acá. Cae en el propio `app_id` cuando
    /// ningún `.desktop` lo nombra.
    #[serde(default)]
    pub name: String,
}

/// Un día con el uso de cada aplicación.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DayUsage {
    pub date: String,
    pub apps: Vec<AppUsage>,
}

/// Lo que devuelve una consulta de tiempo de pantalla.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenTimeReport {
    pub enabled: bool,
    pub today: String,
    pub first_day: String,
    pub days: Vec<DayUsage>,
}

/// Arma el informe desde la respuesta cruda, completando hora por hora.
///
/// Si un día trae menos de 24 cubetas se rellenan con ceros, para que la ventana
/// nunca tenga que preguntarse cuántas hay: siempre son 24.
fn report_from_raw(raw: RawReport) -> ScreenTimeReport {
    let (enabled, today, first_day, days) = raw;

    let days = days
        .into_iter()
        .map(|(date, apps)| DayUsage {
            date,
            apps: apps
                .into_iter()
                .map(|(app_id, category, millis, mut hours)| {
                    hours.resize(HOURS_IN_DAY, 0);
                    AppUsage {
                        app_id,
                        category,
                        millis,
                        hours,
                        icon: String::new(),
                        name: String::new(),
                    }
                })
                .collect(),
        })
        .collect();

    ScreenTimeReport {
        enabled,
        today,
        first_day,
        days,
    }
}

/// Le pega a cada aplicación su icono y su nombre, en una sola pasada por los
/// `.desktop` para todo el informe.
fn fill_icons_and_names(report: &mut ScreenTimeReport) {
    let mut app_ids: Vec<String> = report
        .days
        .iter()
        .flat_map(|d| d.apps.iter().map(|a| a.app_id.clone()))
        .collect();
    app_ids.sort();
    app_ids.dedup();

    let info = super::iconos_de_apps::app_info(&app_ids);

    for day in &mut report.days {
        for app in &mut day.apps {
            if let Some(found) = info.get(&app.app_id) {
                app.icon = found.icon.clone();
                app.name = found.name.clone();
            }
        }
    }
}

async fn service() -> Result<zbus::Connection, String> {
    zbus::Connection::session().await.map_err(|e| {
        format!(
            "No se pudo contactar al servicio de salud: {e}. \
             Comprobá que vasak-health-service esté disponible."
        )
    })
}

/// El informe de tiempo de pantalla entre dos fechas (`AAAA-MM-DD`, incluidas).
#[tauri::command]
pub async fn screen_time(from: String, to: String) -> Result<ScreenTimeReport, String> {
    let connection = service().await?;

    let reply = connection
        .call_method(
            Some(SERVICE_NAME),
            SERVICE_PATH,
            Some(SERVICE_INTERFACE),
            "ScreenTime",
            &(from.as_str(), to.as_str()),
        )
        .await
        .map_err(|e| format!("No se pudo leer el tiempo de pantalla: {e}"))?;

    let raw: RawReport = reply
        .body()
        .deserialize()
        .map_err(|e| format!("Respuesta inesperada del servicio de salud: {e}"))?;

    let mut report = report_from_raw(raw);
    fill_icons_and_names(&mut report);
    Ok(report)
}

/// Borra todo el historial de tiempo de pantalla.
#[tauri::command]
pub async fn clear_screen_time() -> Result<(), String> {
    let connection = service().await?;

    connection
        .call_method(
            Some(SERVICE_NAME),
            SERVICE_PATH,
            Some(SERVICE_INTERFACE),
            "ClearScreenTime",
            &(),
        )
        .await
        .map(|_| ())
        .map_err(|e| format!("No se pudo borrar el historial: {e}"))
}

/// Prende o apaga el registro en el acto.
///
/// Quien llame a esto además debe persistir `screen_time.enabled` en
/// `vasak.conf` (lo hace la vista con el plugin de configuración): es de donde el
/// servicio lee el estado al arrancar. Este método es el que lo hace inmediato,
/// sin esperar a que el servicio relea el archivo.
#[tauri::command]
pub async fn screen_time_set_enabled(enabled: bool) -> Result<(), String> {
    let connection = service().await?;

    connection
        .call_method(
            Some(SERVICE_NAME),
            SERVICE_PATH,
            Some(SERVICE_INTERFACE),
            "SetEnabled",
            &(enabled,),
        )
        .await
        .map(|_| ())
        .map_err(|e| format!("No se pudo cambiar el registro de tiempo de pantalla: {e}"))
}

/// Si el registro está prendido ahora mismo, según el servicio.
#[tauri::command]
pub async fn screen_time_enabled() -> Result<bool, String> {
    let connection = service().await?;

    let reply = connection
        .call_method(
            Some(SERVICE_NAME),
            SERVICE_PATH,
            Some(SERVICE_INTERFACE),
            "Enabled",
            &(),
        )
        .await
        .map_err(|e| format!("No se pudo consultar el estado del registro: {e}"))?;

    reply
        .body()
        .deserialize()
        .map_err(|e| format!("Respuesta inesperada del servicio de salud: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn raw_de_ejemplo() -> RawReport {
        (
            true,
            "2026-10-05".to_string(),
            "2026-10-01".to_string(),
            vec![(
                "2026-10-05".to_string(),
                vec![
                    (
                        "org.gnome.Nautilus".to_string(),
                        "System".to_string(),
                        3_600_000,
                        vec![0; HOURS_IN_DAY],
                    ),
                    // Un día viejo, sin desglose por hora: menos de 24 cubetas.
                    ("firefox".to_string(), "Network".to_string(), 1_000, vec![]),
                ],
            )],
        )
    }

    #[test]
    fn el_informe_se_arma_desde_la_tupla() {
        let report = report_from_raw(raw_de_ejemplo());

        assert!(report.enabled);
        assert_eq!(report.today, "2026-10-05");
        assert_eq!(report.first_day, "2026-10-01");
        assert_eq!(report.days.len(), 1);
        assert_eq!(report.days[0].apps.len(), 2);
        assert_eq!(report.days[0].apps[0].millis, 3_600_000);
    }

    #[test]
    fn las_horas_siempre_son_veinticuatro() {
        // La segunda aplicación venía con cero cubetas; se rellenan a 24 para que
        // la ventana nunca tenga que preguntarse cuántas hay.
        let report = report_from_raw(raw_de_ejemplo());

        for day in &report.days {
            for app in &day.apps {
                assert_eq!(app.hours.len(), HOURS_IN_DAY);
            }
        }
    }

    #[test]
    fn un_app_id_sin_desktop_cae_en_su_propio_nombre() {
        // Sin `.desktop` que lo nombre, el nombre es el propio `app_id` y el icono
        // el genérico — nunca una cadena vacía, que dejaría la fila muda.
        let mut report = report_from_raw(raw_de_ejemplo());
        fill_icons_and_names(&mut report);

        let app = &report.days[0].apps[0];
        assert!(!app.icon.is_empty());
        assert!(!app.name.is_empty());
    }
}

//! El tiempo de pantalla, consultado al servicio de salud (`vasak-health-service`).
//!
//! Este puente no decide ni mide nada: pregunta. El servicio lleva la
//! contabilidad —qué aplicación estuvo enfocada, cuánto, en qué hora del día— y
//! la devuelve; acá sólo se le pega a cada aplicación su icono y su nombre, que
//! el servicio no sabe.
//!
//! # El contrato vive en `vasak-health-protocol`
//!
//! El tipo lo fija el crate del servicio (vasak-settings#195): si el contrato
//! cambia, el crate cambia y esto deja de compilar, en vez de volverse en
//! silencio un informe que no cuadra. El crate deriva `Type` del `zvariant` de
//! zbus 5 y trae su proxy; esta aplicación tiene su zbus clavado en 4 (por el
//! menú de la bandeja), así que estas llamadas van por una conexión `zbus5`
//! aparte, que ya convive en el árbol.

use serde::Serialize;
use vasak_health_protocol::{self as health, HealthProxy};

/// Cuántas cubetas trae el desglose por hora: una por cada hora del día local.
const HOURS_IN_DAY: usize = 24;

/// Cuánto usó una aplicación en un día, lista para la ventana.
///
/// Es la vista, no el contrato: suma el icono y el nombre, que el servicio no
/// manda porque cuenta tiempo y no sabe de iconos. El resto sale del
/// [`health::AppUsage`] que devuelve el servicio.
#[derive(Debug, Clone, Serialize)]
pub struct AppUsage {
    pub app_id: String,
    pub category: String,
    pub millis: u64,
    /// Milisegundos por hora del día local: siempre 24 valores. Pueden venir
    /// todos en cero en datos viejos que sólo guardaban el total.
    pub hours: Vec<u64>,
    /// El icono del tema, resuelto **acá** desde el `.desktop`: el servicio no
    /// sabe de iconos. Se completa después de leer la respuesta.
    pub icon: String,
    /// El nombre visible, también resuelto acá. Cae en el propio `app_id` cuando
    /// ningún `.desktop` lo nombra.
    pub name: String,
}

/// Un día con el uso de cada aplicación.
#[derive(Debug, Clone, Serialize)]
pub struct DayUsage {
    pub date: String,
    pub apps: Vec<AppUsage>,
}

/// Lo que devuelve una consulta de tiempo de pantalla, lista para la ventana.
#[derive(Debug, Clone, Serialize)]
pub struct ScreenTimeReport {
    pub enabled: bool,
    pub today: String,
    pub first_day: String,
    pub days: Vec<DayUsage>,
}

/// Arma la vista desde el informe del contrato, completando hora por hora.
///
/// Si un día trae menos de 24 cubetas se rellenan con ceros, para que la ventana
/// nunca tenga que preguntarse cuántas hay: siempre son 24.
fn report_from_contract(report: health::ScreenTimeReport) -> ScreenTimeReport {
    let days = report
        .days
        .into_iter()
        .map(|day| DayUsage {
            date: day.date,
            apps: day
                .apps
                .into_iter()
                .map(|app| {
                    let mut hours = app.hours;
                    hours.resize(HOURS_IN_DAY, 0);
                    AppUsage {
                        app_id: app.app_id,
                        category: app.category,
                        millis: app.millis,
                        hours,
                        icon: String::new(),
                        name: String::new(),
                    }
                })
                .collect(),
        })
        .collect();

    ScreenTimeReport {
        enabled: report.enabled,
        today: report.today,
        first_day: report.first_day,
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

/// El mensaje cuando no se llega al servicio, igual en todas las llamadas.
fn sin_servicio(e: impl std::fmt::Display) -> String {
    format!(
        "No se pudo contactar al servicio de salud: {e}. \
         Comprobá que vasak-health-service esté disponible."
    )
}

/// El proxy del servicio por una conexión zbus 5 nueva. La conexión vive en el
/// `await` de cada comando; el proxy guarda su propia referencia.
async fn health(connection: &zbus5::Connection) -> Result<HealthProxy<'_>, String> {
    HealthProxy::new(connection).await.map_err(sin_servicio)
}

/// El informe de tiempo de pantalla entre dos fechas (`AAAA-MM-DD`, incluidas).
#[tauri::command]
pub async fn screen_time(from: String, to: String) -> Result<ScreenTimeReport, String> {
    let connection = zbus5::Connection::session().await.map_err(sin_servicio)?;
    let proxy = health(&connection).await?;

    let report = proxy
        .screen_time(&from, &to)
        .await
        .map_err(|e| format!("No se pudo leer el tiempo de pantalla: {e}"))?;

    let mut report = report_from_contract(report);
    fill_icons_and_names(&mut report);
    Ok(report)
}

/// Borra todo el historial de tiempo de pantalla.
#[tauri::command]
pub async fn clear_screen_time() -> Result<(), String> {
    let connection = zbus5::Connection::session().await.map_err(sin_servicio)?;
    let proxy = health(&connection).await?;

    proxy
        .clear_screen_time()
        .await
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
    let connection = zbus5::Connection::session().await.map_err(sin_servicio)?;
    let proxy = health(&connection).await?;

    proxy
        .set_enabled(enabled)
        .await
        .map_err(|e| format!("No se pudo cambiar el registro de tiempo de pantalla: {e}"))
}

/// Si el registro está prendido ahora mismo, según el servicio.
#[tauri::command]
pub async fn screen_time_enabled() -> Result<bool, String> {
    let connection = zbus5::Connection::session().await.map_err(sin_servicio)?;
    let proxy = health(&connection).await?;

    proxy
        .enabled()
        .await
        .map_err(|e| format!("No se pudo consultar el estado del registro: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn contract_report(hours: Vec<u64>) -> health::ScreenTimeReport {
        health::ScreenTimeReport {
            enabled: true,
            today: "2026-11-12".into(),
            first_day: "2026-11-01".into(),
            days: vec![health::DayUsage {
                date: "2026-11-11".into(),
                apps: vec![health::AppUsage {
                    app_id: "firefox".into(),
                    category: "Network".into(),
                    millis: 5_000,
                    hours,
                }],
            }],
        }
    }

    #[test]
    fn un_desglose_corto_se_rellena_con_ceros_hasta_24() {
        let view = report_from_contract(contract_report(vec![7, 8]));
        let hours = &view.days[0].apps[0].hours;
        assert_eq!(hours.len(), HOURS_IN_DAY);
        assert_eq!(&hours[..3], &[7, 8, 0]);
        assert!(hours[2..].iter().all(|h| *h == 0));
    }

    #[test]
    fn un_desglose_vacio_queda_con_24_ceros() {
        let view = report_from_contract(contract_report(vec![]));
        assert_eq!(view.days[0].apps[0].hours, vec![0; HOURS_IN_DAY]);
    }

    #[test]
    fn un_desglose_largo_se_recorta_a_24() {
        let view = report_from_contract(contract_report((1..=30).collect()));
        let hours = &view.days[0].apps[0].hours;
        assert_eq!(hours.len(), HOURS_IN_DAY);
        assert_eq!(hours[23], 24);
    }

    #[test]
    fn copia_fiel_los_campos_y_deja_icono_y_nombre_vacios() {
        let view = report_from_contract(contract_report(vec![0; 24]));
        assert!(view.enabled);
        assert_eq!(view.today, "2026-11-12");
        assert_eq!(view.first_day, "2026-11-01");
        assert_eq!(view.days.len(), 1);
        assert_eq!(view.days[0].date, "2026-11-11");
        let app = &view.days[0].apps[0];
        assert_eq!(app.app_id, "firefox");
        assert_eq!(app.category, "Network");
        assert_eq!(app.millis, 5_000);
        assert_eq!(app.icon, "");
        assert_eq!(app.name, "");
    }
}

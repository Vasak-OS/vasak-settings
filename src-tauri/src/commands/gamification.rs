//! La gamificación (XP, racha, logros), consultada al servicio
//! `vasak-gamification`.
//!
//! Salió de `vasak-health-service` a su propio servicio reutilizable: cualquier
//! módulo que haga algo puntuable le avisa, y el servicio lleva la cuenta. Acá
//! sólo se pregunta el progreso para mostrarlo; no se decide ni se mide nada.
//!
//! # El contrato vive en `vasak-gamification-protocol`
//!
//! El tipo lo fija el crate del servicio: si el contrato cambia, el crate cambia
//! y esto deja de compilar, en vez de volverse en silencio un informe que no
//! cuadra. El crate deriva `Type` del `zvariant` de zbus 5 y trae su proxy; esta
//! aplicación tiene su zbus clavado en 4 (por el menú de la bandeja), así que
//! estas llamadas van por una conexión `zbus5` aparte, que ya convive en el árbol.

use vasak_gamification_protocol::{GamificationProgress, GamificationProxy};

/// El mensaje cuando no se llega al servicio.
fn sin_servicio(e: impl std::fmt::Display) -> String {
    format!(
        "No se pudo contactar al servicio de gamificación: {e}. \
         Comprobá que vasak-gamification esté disponible."
    )
}

/// El progreso de gamificación: XP, racha y logros desbloqueados. Apagada la
/// capa, viene en cero con `enabled` en `false`. El tipo lo fija el contrato
/// (`vasak-gamification-protocol`) y ya deriva `Serialize`, así que viaja tal
/// cual a la ventana.
#[tauri::command]
pub async fn gamification() -> Result<GamificationProgress, String> {
    let connection = zbus5::Connection::session().await.map_err(sin_servicio)?;
    let proxy = GamificationProxy::new(&connection)
        .await
        .map_err(sin_servicio)?;

    proxy
        .progress()
        .await
        .map_err(|e| format!("No se pudo leer el progreso de gamificación: {e}"))
}

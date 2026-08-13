//! The settings screen's side of `vasak-connect`: the Android phone service.
//!
//! Read-only apart from renaming and forgetting. Everything that actually talks
//! to a phone lives in the daemon.
//!
//! **On the hand-written types.** The contract's home is the `protocol` crate
//! of vasak-connect, and depending on it directly would be the point of having
//! it. It cannot be done yet: that crate derives `Type` from zbus 5's zvariant
//! and this application is on zbus 4. If the daemon's contract changes, this
//! file has to change with it, and nothing will remind anybody.

use serde::{Deserialize, Serialize};
use zbus::Connection;

const SERVICE: &str = "ar.net.vasak.os.Connect";
const PATH: &str = "/ar/net/vasak/os/Connect";

/// The service lives on the **session** bus: the phone belongs to whoever is
/// logged in, and so does the list of the ones they have accepted.
async fn connect_service() -> Result<Connection, String> {
    Connection::session().await.map_err(|e| {
        format!(
            "No se pudo contactar al servicio de dispositivos: {e}. \
             Comprobá que vasak-connect esté en ejecución."
        )
    })
}

/// A phone that has been connected at least once.
///
/// `first_seen` and `last_address` come from the daemon's own record; there is
/// no credential here and none is stored. Whether a phone may actually connect
/// is decided by adb's authorisation, which lives on the phone.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnownDevice {
    pub serial: String,
    /// The alias if the person set one, otherwise the model.
    pub name: String,
    pub first_seen: String,
    pub last_address: String,
    /// Filled in from `ListDevices`: whether it is plugged in right now.
    #[serde(default)]
    pub connected: bool,
    /// `ready`, `unauthorized`, `connecting`, `offline`, or empty when absent.
    #[serde(default)]
    pub state: String,
}

/// Every phone this person has accepted, connected or not.
///
/// Both lists are needed: the known list is what makes it possible to forget a
/// device that is not here, and the connected list is what says which of them
/// is in front of you.
#[tauri::command]
pub async fn connect_list_known_devices() -> Result<Vec<KnownDevice>, String> {
    let connection = connect_service().await?;

    let reply = connection
        .call_method(Some(SERVICE), PATH, Some(SERVICE), "ListKnownDevices", &())
        .await
        .map_err(|e| format!("No se pudo leer la lista de dispositivos: {e}"))?;

    let known: Vec<(String, String, String, String)> = reply
        .body()
        .deserialize()
        .map_err(|e| format!("Respuesta inesperada del servicio: {e}"))?;

    // A device that is not connected is still listed, just without a state. A
    // failure here is not fatal: the known list is the point of the screen.
    let live: Vec<(String, String, String, String, bool, String)> = connection
        .call_method(Some(SERVICE), PATH, Some(SERVICE), "ListDevices", &())
        .await
        .ok()
        .and_then(|reply| reply.body().deserialize().ok())
        .unwrap_or_default();

    Ok(known
        .into_iter()
        .map(|(serial, name, first_seen, last_address)| {
            let present = live.iter().find(|device| device.0 == serial);
            KnownDevice {
                connected: present.is_some(),
                state: present.map(|d| d.3.clone()).unwrap_or_default(),
                serial,
                name,
                first_seen,
                last_address,
            }
        })
        .collect())
}

/// Renames a device.
#[tauri::command]
pub async fn connect_set_alias(serial: String, alias: String) -> Result<bool, String> {
    let connection = connect_service().await?;
    let reply = connection
        .call_method(Some(SERVICE), PATH, Some(SERVICE), "SetAlias", &(serial, alias))
        .await
        .map_err(|e| format!("No se pudo renombrar el dispositivo: {e}"))?;

    reply.body().deserialize().map_err(|e| e.to_string())
}

/// Removes a device from the known list.
///
/// This does **not** revoke adb's authorisation — that lives on the phone, and
/// is what actually decides whether a connection is allowed. The screen has to
/// say so, or somebody will press this believing they cut off access.
#[tauri::command]
pub async fn connect_forget_device(serial: String) -> Result<bool, String> {
    let connection = connect_service().await?;
    let reply = connection
        .call_method(Some(SERVICE), PATH, Some(SERVICE), "ForgetDevice", &(serial,))
        .await
        .map_err(|e| format!("No se pudo olvidar el dispositivo: {e}"))?;

    reply.body().deserialize().map_err(|e| e.to_string())
}

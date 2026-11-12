//! The settings screen's side of `vasak-connect`: the Android phone service.
//!
//! Read-only apart from renaming and forgetting. Everything that actually talks
//! to a phone lives in the daemon.
//!
//! **On the contract (vasak-settings#195).** `ListDevices` returns the
//! `Device` the daemon defines in `vasak-connect-protocol`, so it is read into
//! that type: a field renamed there stops this file compiling instead of turning
//! into a device that never matches. The crate derives `Type` from zbus 5, so
//! these calls go over a `zbus5` connection, separate from the zbus 4 the tray
//! menu still pins. `ListKnownDevices`, `SetAlias` and `ForgetDevice` have no
//! type in the crate yet —only the device service and the panel used them— so
//! their shapes stay here; adding them to the crate is a follow-up.

use serde::{Deserialize, Serialize};
use vasak_connect_protocol::{Device, SERVICE_NAME, SERVICE_PATH};

/// The service lives on the **session** bus: the phone belongs to whoever is
/// logged in, and so does the list of the ones they have accepted.
async fn connect_service() -> Result<zbus5::Connection, String> {
    zbus5::Connection::session().await.map_err(|e| {
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

    // `ListKnownDevices` is the daemon's own record; the crate does not define
    // its shape, so it is read as the tuple the service sends.
    let reply = connection
        .call_method(
            Some(SERVICE_NAME),
            SERVICE_PATH,
            Some(SERVICE_NAME),
            "ListKnownDevices",
            &(),
        )
        .await
        .map_err(|e| format!("No se pudo leer la lista de dispositivos: {e}"))?;

    let known: Vec<(String, String, String, String)> = reply
        .body()
        .deserialize()
        .map_err(|e| format!("Respuesta inesperada del servicio: {e}"))?;

    // A device that is not connected is still listed, just without a state. A
    // failure here is not fatal: the known list is the point of the screen. The
    // live list is the daemon's `Device`, read into the shared contract type.
    let live: Vec<Device> = connection
        .call_method(
            Some(SERVICE_NAME),
            SERVICE_PATH,
            Some(SERVICE_NAME),
            "ListDevices",
            &(),
        )
        .await
        .ok()
        .and_then(|reply| reply.body().deserialize().ok())
        .unwrap_or_default();

    Ok(merge_known_with_live(known, &live))
}

/// El registro de conocidos del servicio: `(serial, nombre, primera vez, última
/// dirección)`. El crate no define esta forma todavía —sólo la usaban el servicio
/// y el panel—, así que vive acá.
type KnownRecord = (String, String, String, String);

/// Cruza el registro de conocidos con los dispositivos vivos: marca cuáles están
/// conectados ahora y con qué estado. Un conocido que no está presente queda sin
/// estado, pero sigue en la lista —olvidarlo es el punto de la pantalla—.
fn merge_known_with_live(known: Vec<KnownRecord>, live: &[Device]) -> Vec<KnownDevice> {
    known
        .into_iter()
        .map(|(serial, name, first_seen, last_address)| {
            let present = live.iter().find(|device| device.serial == serial);
            KnownDevice {
                connected: present.is_some(),
                state: present
                    .map(|d| d.state.as_str().to_string())
                    .unwrap_or_default(),
                serial,
                name,
                first_seen,
                last_address,
            }
        })
        .collect()
}

/// Renames a device.
#[tauri::command]
pub async fn connect_set_alias(serial: String, alias: String) -> Result<bool, String> {
    let connection = connect_service().await?;
    let reply = connection
        .call_method(
            Some(SERVICE_NAME),
            SERVICE_PATH,
            Some(SERVICE_NAME),
            "SetAlias",
            &(serial, alias),
        )
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
        .call_method(
            Some(SERVICE_NAME),
            SERVICE_PATH,
            Some(SERVICE_NAME),
            "ForgetDevice",
            &(serial,),
        )
        .await
        .map_err(|e| format!("No se pudo olvidar el dispositivo: {e}"))?;

    reply.body().deserialize().map_err(|e| e.to_string())
}

/// Forwards the device service's signals to the window as Tauri events.
///
/// Without this the screen only reflected what was true when it was opened: a
/// phone plugged in or unplugged while the window sat there changed nothing, and
/// there was no way to find out short of closing and reopening Settings.
///
/// Polling was the alternative and it is the wrong one here. The daemon already
/// learns the instant udev tells it, and a settings window left open all day
/// would spend that day asking a question whose answer almost never changes.
///
/// This stays on zbus 4: it matches signals by member name and carries no
/// contract type, so there is nothing to share with the crate.
pub async fn watch_signals(app: tauri::AppHandle) {
    use futures_util::StreamExt;
    use tauri::Emitter;

    let Ok(connection) = zbus::Connection::session().await else {
        crate::logger::log_debug("vasak-connect: sin bus de sesión, no se escuchan señales");
        return;
    };

    let rule = format!(
        "type='signal',sender='{SERVICE_NAME}',path='{SERVICE_PATH}',interface='{SERVICE_NAME}'"
    );

    let Ok(proxy) = zbus::fdo::DBusProxy::new(&connection).await else {
        return;
    };
    let Ok(parsed) = rule.as_str().try_into() else {
        return;
    };
    if proxy.add_match_rule(parsed).await.is_err() {
        crate::logger::log_debug("vasak-connect: no se pudo suscribir a las señales");
        return;
    }

    tauri::async_runtime::spawn(async move {
        let mut stream = zbus::MessageStream::from(connection);
        while let Some(Ok(message)) = stream.next().await {
            let header = message.header();
            if header.interface().map(|i| i.as_str()) != Some(SERVICE_NAME) {
                continue;
            }
            // The screen shows a list, not one device, so the payload does not
            // matter: any of these means "read it again".
            if matches!(
                header.member().map(|m| m.as_str()),
                Some("DeviceAdded") | Some("DeviceRemoved") | Some("DeviceChanged")
            ) {
                let _ = app.emit("connect-devices-changed", ());
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use vasak_connect_protocol::{DeviceState, Transport};

    fn live_device(serial: &str, state: DeviceState) -> Device {
        Device {
            serial: serial.into(),
            model: "modelo".into(),
            transport: Transport::Usb,
            state,
            trusted: true,
            address: String::new(),
        }
    }

    fn known(serial: &str, name: &str) -> KnownRecord {
        (
            serial.into(),
            name.into(),
            "2026-10-01".into(),
            "10.0.0.5".into(),
        )
    }

    #[test]
    fn un_conocido_presente_queda_conectado_con_el_estado_vivo() {
        let out = merge_known_with_live(
            vec![known("A1", "Mi teléfono")],
            &[live_device("A1", DeviceState::Unauthorized)],
        );
        assert!(out[0].connected);
        assert_eq!(out[0].state, "unauthorized");
    }

    #[test]
    fn un_conocido_ausente_sigue_en_la_lista_sin_estado() {
        let out = merge_known_with_live(
            vec![known("A1", "Mi teléfono")],
            &[live_device("OTRO", DeviceState::Ready)],
        );
        assert_eq!(out.len(), 1);
        assert!(!out[0].connected);
        assert_eq!(out[0].state, "");
    }

    #[test]
    fn el_cruce_es_por_serial_y_conserva_el_registro() {
        let out = merge_known_with_live(
            vec![known("A1", "Uno"), known("B2", "Dos")],
            &[live_device("B2", DeviceState::Ready)],
        );
        assert_eq!(out.len(), 2);
        assert!(!out[0].connected);
        assert!(out[1].connected);
        assert_eq!(out[1].state, "ready");
        assert_eq!(out[1].serial, "B2");
        assert_eq!(out[1].name, "Dos");
        assert_eq!(out[1].first_seen, "2026-10-01");
        assert_eq!(out[1].last_address, "10.0.0.5");
    }
}

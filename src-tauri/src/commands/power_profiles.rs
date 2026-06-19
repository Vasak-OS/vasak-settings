use zbus::Connection;
use zbus::zvariant::{OwnedValue, Value};

use crate::logger::{log_debug, log_error};

const DEST: &str = "net.hadess.PowerProfiles";
const PATH: &str = "/net/hadess/PowerProfiles";
const IFACE: &str = "net.hadess.PowerProfiles";

fn unvariant<'a>(value: &'a Value<'a>) -> &'a Value<'a> {
    match value {
        Value::Value(b) => b.as_ref(),
        other => other,
    }
}

fn string_from_value(value: &Value<'_>) -> Option<String> {
    match value {
        Value::Str(s) => Some(s.to_string()),
        Value::Value(b) => string_from_value(b.as_ref()),
        _ => None,
    }
}

fn read_str_vec(value: &OwnedValue) -> Vec<String> {
    let arr = match unvariant(value) {
        Value::Array(arr) => arr,
        _ => return Vec::new(),
    };

    arr.iter()
        .filter_map(|item| {
            let item = unvariant(item);
            match item {
                Value::Dict(dict) => {
                    for pair in dict.iter() {
                        if let Value::Str(k) = pair.0 {
                            if k.as_str().eq_ignore_ascii_case("profile") {
                                if let Some(v) = string_from_value(pair.1) {
                                    return Some(v);
                                }
                            }
                        }
                    }
                    None
                }
                Value::Structure(s) => {
                    let fields = s.fields();
                    if fields.len() >= 2 {
                        if let Value::Str(k) = &fields[0] {
                            if k.as_str().eq_ignore_ascii_case("profile") {
                                if let Some(v) = string_from_value(&fields[1]) {
                                    return Some(v);
                                }
                            }
                        }
                    }
                    None
                }
                _ => None,
            }
        })
        .collect()
}

async fn get_property(conn: &Connection, prop: &str) -> Result<OwnedValue, String> {
    let msg = conn
        .call_method(
            Some(DEST),
            PATH,
            Some("org.freedesktop.DBus.Properties"),
            "Get",
            &(IFACE, prop),
        )
        .await
        .map_err(|e| format!("D-Bus Properties.Get {prop} failed: {e}"))?;

    msg.body()
        .deserialize::<OwnedValue>()
        .map_err(|e| format!("Deserialize Properties.Get response for {prop}: {e}"))
}

async fn set_property(conn: &Connection, prop: &str, value: &str) -> Result<(), String> {
    let inner = Value::new(value);
    let variant = Value::Value(Box::new(inner));
    conn.call_method(
            Some(DEST),
            PATH,
            Some("org.freedesktop.DBus.Properties"),
            "Set",
            &(IFACE, prop, &variant),
        )
        .await
        .map_err(|e| format!("D-Bus Properties.Set {prop} = {value} failed: {e}"))?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_power_profiles() -> Result<Vec<String>, String> {
    let conn = Connection::system().await.map_err(|e| {
        let msg = format!("Failed to connect to D-Bus system bus: {e}");
        log_error(&msg);
        msg
    })?;

    let raw = get_property(&conn, "Profiles").await.map_err(|e| {
        log_error(&format!("power-profiles-daemon: {e}"));
        format!("No se pudieron obtener los perfiles de energía. ¿Está instalado power-profiles-daemon? {e}")
    })?;

    let profiles = read_str_vec(&raw);

    log_debug(&format!("Available power profiles: {profiles:?}"));
    Ok(profiles)
}

#[tauri::command]
pub async fn get_active_power_profile() -> Result<String, String> {
    let conn = Connection::system().await.map_err(|e| {
        let msg = format!("Failed to connect to D-Bus system bus: {e}");
        log_error(&msg);
        msg
    })?;

    let raw = get_property(&conn, "ActiveProfile").await.map_err(|e| {
        log_error(&format!("power-profiles-daemon: {e}"));
        format!("No se pudo obtener el perfil activo. ¿Está instalado power-profiles-daemon? {e}")
    })?;

    match string_from_value(unvariant(&raw)) {
        Some(s) => Ok(s),
        None => Err("ActiveProfile property is not a string".to_string()),
    }
}

#[tauri::command]
pub async fn set_power_profile(profile: String) -> Result<(), String> {
    let conn = Connection::system().await.map_err(|e| {
        let msg = format!("Failed to connect to D-Bus system bus: {e}");
        log_error(&msg);
        msg
    })?;

    // Verify that the profile is in the list before applying it
    let raw = get_property(&conn, "Profiles").await.map_err(|e| {
        format!("Error reading available profiles: {e}")
    })?;
    let available = read_str_vec(&raw);

    if !available.contains(&profile) {
        let msg = format!(
            "El perfil '{profile}' no está disponible. Perfiles: {:?}",
            available
        );
        log_error(&msg);
        return Err(msg);
    }

    set_property(&conn, "ActiveProfile", &profile).await.map_err(|e| {
        let msg = format!("Error aplicando perfil '{profile}': {e}");
        log_error(&msg);
        msg
    })?;

    log_debug(&format!("Power profile changed to '{profile}'"));
    Ok(())
}

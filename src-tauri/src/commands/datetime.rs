use serde::Serialize;
use zbus::Connection;

use crate::logger::{log_debug, log_error};

const DEST: &str = "org.freedesktop.timedate1";
const PATH: &str = "/org/freedesktop/timedate1";
const IFACE: &str = "org.freedesktop.timedate1";

#[derive(Serialize)]
pub struct DateTimeInfo {
    pub timezone: String,
    /// Whether the system clock is synchronised by a network time service.
    pub ntp_enabled: bool,
    pub ntp_synchronized: bool,
    /// False when no NTP implementation is installed, so the UI can explain
    /// why the automatic-time switch is unavailable instead of failing.
    pub can_ntp: bool,
    /// True when the RTC keeps local time instead of UTC (dual-boot with Windows).
    pub local_rtc: bool,
    /// System clock, microseconds since the epoch.
    pub time_usec: u64,
}

async fn proxy() -> Result<zbus::Proxy<'static>, String> {
    let connection = Connection::system().await.map_err(|e| {
        let msg = format!("No se pudo conectar al bus del sistema: {}", e);
        log_error(&msg);
        msg
    })?;

    zbus::Proxy::new(&connection, DEST, PATH, IFACE)
        .await
        .map_err(|e| {
            let msg = format!("No se pudo acceder a timedated: {}", e);
            log_error(&msg);
            msg
        })
}

/// Maps the polkit "not authorized" failure onto a message the UI can show.
fn call_error(action: &str, error: zbus::Error) -> String {
    let raw = error.to_string();

    let msg = if raw.contains("not authorized") || raw.contains("NotAuthorized") {
        format!("No se autorizó el cambio de {}.", action)
    } else {
        format!("Error al cambiar {}: {}", action, raw)
    };

    log_error(&msg);
    msg
}

#[tauri::command]
pub async fn get_datetime_info() -> Result<DateTimeInfo, String> {
    let proxy = proxy().await?;

    let read_bool = |name: &'static str| {
        let proxy = proxy.clone();
        async move { proxy.get_property::<bool>(name).await.unwrap_or(false) }
    };

    Ok(DateTimeInfo {
        timezone: proxy
            .get_property::<String>("Timezone")
            .await
            .unwrap_or_else(|_| "UTC".to_string()),
        ntp_enabled: read_bool("NTP").await,
        ntp_synchronized: read_bool("NTPSynchronized").await,
        can_ntp: read_bool("CanNTP").await,
        local_rtc: read_bool("LocalRTC").await,
        time_usec: proxy.get_property::<u64>("TimeUSec").await.unwrap_or(0),
    })
}

#[tauri::command]
pub async fn list_timezones() -> Result<Vec<String>, String> {
    let proxy = proxy().await?;

    let zones: Vec<String> = proxy
        .call("ListTimezones", &())
        .await
        .map_err(|e| format!("No se pudo listar las zonas horarias: {}", e))?;

    Ok(zones)
}

#[tauri::command]
pub async fn set_timezone(timezone: String) -> Result<(), String> {
    let proxy = proxy().await?;

    // `interactive = true` lets polkit prompt for authentication instead of
    // rejecting the call outright.
    proxy
        .call::<_, _, ()>("SetTimezone", &(timezone.as_str(), true))
        .await
        .map_err(|e| call_error("la zona horaria", e))?;

    log_debug(&format!("Zona horaria cambiada a {}", timezone));
    Ok(())
}

#[tauri::command]
pub async fn set_ntp(enabled: bool) -> Result<(), String> {
    let proxy = proxy().await?;

    proxy
        .call::<_, _, ()>("SetNTP", &(enabled, true))
        .await
        .map_err(|e| call_error("la sincronización automática", e))?;

    log_debug(&format!("NTP {}", if enabled { "activado" } else { "desactivado" }));
    Ok(())
}

/// Sets the wall clock. timedated rejects this while NTP is on, so the UI keeps
/// the manual fields disabled in that case.
#[tauri::command]
pub async fn set_system_time(unix_seconds: i64) -> Result<(), String> {
    let proxy = proxy().await?;

    let usec = unix_seconds
        .checked_mul(1_000_000)
        .ok_or_else(|| "Fecha fuera de rango".to_string())?;

    proxy
        .call::<_, _, ()>("SetTime", &(usec, false, true))
        .await
        .map_err(|e| call_error("la hora del sistema", e))?;

    Ok(())
}

#[tauri::command]
pub async fn set_local_rtc(local: bool) -> Result<(), String> {
    let proxy = proxy().await?;

    // (local_rtc, fix_system, interactive) — fix_system=false keeps the system
    // clock as-is and only reinterprets the RTC.
    proxy
        .call::<_, _, ()>("SetLocalRTC", &(local, false, true))
        .await
        .map_err(|e| call_error("el modo del reloj de hardware", e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Talks to the real timedated on the session's machine. Ignored by default
    /// so CI without a system bus stays green; run with `--ignored`.
    #[test]
    #[ignore]
    fn reads_the_live_clock_configuration() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let info = rt.block_on(get_datetime_info()).expect("timedated should answer");

        assert!(!info.timezone.is_empty(), "timezone should not be empty");
        assert!(info.time_usec > 1_600_000_000_000_000, "clock looks wrong: {}", info.time_usec);

        let zones = rt.block_on(list_timezones()).expect("ListTimezones should answer");
        assert!(zones.len() > 100, "expected the full tz database, got {}", zones.len());
        assert!(zones.contains(&info.timezone), "current zone must be in the list");
    }
}

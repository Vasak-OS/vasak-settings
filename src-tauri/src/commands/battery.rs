use serde::{Deserialize, Serialize};
use zbus::Connection;
use zbus::zvariant::{OwnedValue, Value};

use crate::logger::{log_debug, log_error, log_info};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BatteryInfo {
    pub has_battery: bool,
    pub status: String,
    pub percentage: f64,
    pub energy_rate: f64,
    pub health: f64,
    pub technology: String,
    pub model: String,
    pub manufacturer: String,
    pub time_to_empty: i64,
    pub time_to_full: i64,
    pub cycle_count: u32,
}

// ---------------------------------------------------------------------------
// D-Bus helpers
// ---------------------------------------------------------------------------

async fn get_prop(conn: &Connection, path: &str, prop: &str) -> Result<OwnedValue, String> {
    let args = ("org.freedesktop.UPower.Device", prop);
    let msg = conn
        .call_method(
            Some("org.freedesktop.UPower"),
            path,
            Some("org.freedesktop.DBus.Properties"),
            "Get",
            &args,
        )
        .await
        .map_err(|e| format!("D-Bus Properties.Get {prop} on {path} failed: {e}"))?;

    msg.body().deserialize::<OwnedValue>().map_err(|e| {
        format!("Deserialize Properties.Get response for {prop}: {e}")
    })
}

fn unvariant<'a>(value: &'a Value<'a>) -> &'a Value<'a> {
    match value {
        Value::Value(b) => b.as_ref(),
        other => other,
    }
}

fn read_u32(value: &OwnedValue) -> Option<u32> {
    match unvariant(value) {
        Value::U32(x) => Some(*x),
        Value::I32(x) => (*x >= 0).then_some(*x as u32),
        Value::U64(x) => Some(*x as u32),
        Value::I64(x) => (*x >= 0).then_some(*x as u32),
        Value::U8(x) => Some(*x as u32),
        _ => None,
    }
}

fn read_f64(value: &OwnedValue) -> Option<f64> {
    match unvariant(value) {
        Value::F64(x) => Some(*x),
        Value::I32(x) => Some(*x as f64),
        Value::U32(x) => Some(*x as f64),
        Value::I64(x) => Some(*x as f64),
        Value::U64(x) => Some(*x as f64),
        Value::I16(x) => Some(*x as f64),
        Value::U16(x) => Some(*x as f64),
        _ => None,
    }
}

fn read_i64(value: &OwnedValue) -> Option<i64> {
    match unvariant(value) {
        Value::I64(x) => Some(*x),
        Value::I32(x) => Some(*x as i64),
        Value::U32(x) => Some(*x as i64),
        Value::U64(x) => Some(*x as i64),
        Value::I16(x) => Some(*x as i64),
        Value::U16(x) => Some(*x as i64),
        _ => None,
    }
}

fn read_string(value: &OwnedValue) -> Option<String> {
    match unvariant(value) {
        Value::Str(s) => Some(s.to_string()),
        _ => None,
    }
}

fn read_bool(value: &OwnedValue) -> Option<bool> {
    match unvariant(value) {
        Value::Bool(b) => Some(*b),
        Value::U32(x) => Some(*x != 0),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// UPower enum mappers
// ---------------------------------------------------------------------------

fn map_state(state: u32) -> String {
    match state {
        1 => "Charging",
        2 => "Discharging",
        3 => "Empty",
        4 => "FullyCharged",
        5 => "PendingCharge",
        6 => "PendingDischarge",
        _ => "Unknown",
    }
    .to_string()
}

fn map_technology(tech: u32) -> String {
    match tech {
        1 => "Lithium Ion",
        2 => "Lead Acid",
        3 => "Nickel Cadmium",
        4 => "Nickel Metal Hydride",
        5 => "Lithium Polymer",
        6 => "Lithium Iron Phosphate",
        7 => "Lithium Titanate",
        _ => "Unknown",
    }
    .to_string()
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_battery_info() -> BatteryInfo {
    let empty = BatteryInfo {
        has_battery: false,
        status: String::new(),
        percentage: 0.0,
        energy_rate: 0.0,
        health: 0.0,
        technology: String::new(),
        model: String::new(),
        manufacturer: String::new(),
        time_to_empty: 0,
        time_to_full: 0,
        cycle_count: 0,
    };

    let conn = match Connection::system().await {
        Ok(c) => c,
        Err(e) => {
            log_error(&format!("Failed to connect to D-Bus system bus: {e}"));
            return empty;
        }
    };

    let devices = match enumerate_devices(&conn).await {
        Ok(d) => d,
        Err(e) => {
            log_error(&format!("Failed to enumerate UPower devices: {e}"));
            return empty;
        }
    };

    let battery_path = match find_present_battery(&conn, &devices).await {
        Some(p) => p,
        None => {
            log_info("No battery detected via UPower");
            return empty;
        }
    };

    log_debug(&format!("Found battery at UPower path: {battery_path}"));

    let state = read_prop_u32(&conn, &battery_path, "State").await.unwrap_or(0);
    let status = map_state(state);
    let percentage = read_prop_f64(&conn, &battery_path, "Percentage").await.unwrap_or(0.0);
    let energy_rate = read_prop_f64(&conn, &battery_path, "EnergyRate").await.unwrap_or(0.0);
    let technology = map_technology(read_prop_u32(&conn, &battery_path, "Technology").await.unwrap_or(0));
    let model = read_prop_str(&conn, &battery_path, "Model").await.unwrap_or_default();
    let manufacturer = read_prop_str(&conn, &battery_path, "Manufacturer").await.unwrap_or_default();
    let time_to_empty = read_prop_i64(&conn, &battery_path, "TimeToEmpty").await.unwrap_or(0);
    let time_to_full = read_prop_i64(&conn, &battery_path, "TimeToFull").await.unwrap_or(0);
    let cycle_count = read_prop_u32(&conn, &battery_path, "CycleCount").await.unwrap_or(0);
    let health = calculate_health(&conn, &battery_path).await;

    BatteryInfo {
        has_battery: true,
        status,
        percentage,
        energy_rate,
        health,
        technology,
        model,
        manufacturer,
        time_to_empty,
        time_to_full,
        cycle_count,
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async fn enumerate_devices(conn: &Connection) -> Result<Vec<String>, String> {
    let msg = conn
        .call_method(
            Some("org.freedesktop.UPower"),
            "/org/freedesktop/UPower",
            Some("org.freedesktop.UPower"),
            "EnumerateDevices",
            &(),
        )
        .await
        .map_err(|e| format!("EnumerateDevices failed: {e}"))?;

    let paths: Vec<zbus::zvariant::OwnedObjectPath> = msg
        .body()
        .deserialize()
        .map_err(|e| format!("Deserialize EnumerateDevices response: {e}"))?;

    Ok(paths.iter().map(|p| p.to_string()).collect())
}

async fn find_present_battery(conn: &Connection, devices: &[String]) -> Option<String> {
    for path in devices {
        let dev_type = read_prop_u32(conn, path, "Type").await.unwrap_or(0);
        if dev_type != 2 {
            continue;
        }
        let present = read_prop_bool(conn, path, "IsPresent").await.unwrap_or(false);
        if present {
            return Some(path.clone());
        }
    }
    None
}

async fn calculate_health(conn: &Connection, path: &str) -> f64 {
    let full = read_prop_f64(conn, path, "EnergyFull").await;
    let design = read_prop_f64(conn, path, "EnergyFullDesign").await;

    match (full, design) {
        (Some(f), Some(d)) if d > 0.0 => (f / d) * 100.0,
        _ => read_prop_f64(conn, path, "Capacity").await.unwrap_or(0.0),
    }
}

// ---------------------------------------------------------------------------
// Typed property readers
// ---------------------------------------------------------------------------

async fn raw_property(conn: &Connection, path: &str, prop: &str) -> Option<OwnedValue> {
    match get_prop(conn, path, prop).await {
        Ok(v) => Some(v),
        Err(e) => {
            log_debug(&format!("Could not read property {prop} on {path}: {e}"));
            None
        }
    }
}

async fn read_prop_u32(conn: &Connection, path: &str, prop: &str) -> Option<u32> {
    raw_property(conn, path, prop).await.and_then(|v| read_u32(&v))
}

async fn read_prop_f64(conn: &Connection, path: &str, prop: &str) -> Option<f64> {
    raw_property(conn, path, prop).await.and_then(|v| read_f64(&v))
}

async fn read_prop_i64(conn: &Connection, path: &str, prop: &str) -> Option<i64> {
    raw_property(conn, path, prop).await.and_then(|v| read_i64(&v))
}

async fn read_prop_str(conn: &Connection, path: &str, prop: &str) -> Option<String> {
    raw_property(conn, path, prop).await.and_then(|v| read_string(&v))
}

async fn read_prop_bool(conn: &Connection, path: &str, prop: &str) -> Option<bool> {
    raw_property(conn, path, prop).await.and_then(|v| read_bool(&v))
}

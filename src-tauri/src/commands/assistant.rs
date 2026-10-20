//! La pantalla «Asistente»: Lince, el asistente residente de VasakOS
//! (`vasak-assistant`).
//!
//! Dos mitades. La unidad de systemd del usuario (instalada, encendida,
//! enmascarada) se maneja con `systemctl --user`; el estado del servicio, sus
//! capacidades, los modelos y la clave del proveedor remoto se piden por el bus
//! de **sesión**.
//!
//! **Sobre los tipos escritos a mano.** El contrato vive en el crate `protocol`
//! de vasak-assistant, que deriva `Type` del zvariant de zbus 5; esta aplicación
//! está en zbus 4 (igual que `connect.rs`). Si el contrato cambia, este archivo
//! tiene que cambiar con él.
//!
//! **Sobre el dueño del nombre.** Antes de cada llamada se comprueba que quien
//! tiene `ar.net.vasak.os.Assistant` sea un proceso de `vasak-assistant.service`
//! (vasak-assistant#5), y la llamada va a su nombre único, no al conocido: así
//! un impostor que tome el nombre después de la comprobación no recibe nada —
//! sobre todo, no recibe la clave.

use std::process::Command;

use serde::{Deserialize, Serialize};
use zbus::zvariant::Type;
use zbus::Connection;

use crate::commands::idle::systemctl;
use crate::commands::night_light_service::is_missing_unit;

const SERVICE: &str = "ar.net.vasak.os.Assistant";
const PATH: &str = "/ar/net/vasak/os/Assistant";
const UNIT: &str = "vasak-assistant.service";
const ERROR_PREFIX: &str = "ar.net.vasak.os.Assistant.Error.";
const UNKNOWN_METHOD: &str = "org.freedesktop.DBus.Error.UnknownMethod";
const NAME_HAS_NO_OWNER: &str = "org.freedesktop.DBus.Error.NameHasNoOwner";
const SERVICE_UNKNOWN: &str = "org.freedesktop.DBus.Error.ServiceUnknown";

pub const MAX_PROVIDER_URL_BYTES: usize = 2048;
pub const MAX_PROVIDER_KEY_BYTES: usize = 4096;

// ── Tipos ─────────────────────────────────────────────────────────────────────

/// Cómo está la unidad de usuario del asistente.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantUnitState {
    pub installed: bool,
    pub enabled: bool,
    pub active: bool,
    pub masked: bool,
}

/// `ModelInfo` del contrato: `(ssbs)`. En el cable los campos van por
/// posición; los nombres sólo importan hacia la ventana.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AssistantModel {
    pub provider: String,
    pub name: String,
    pub local: bool,
    pub host: String,
}

/// `ServiceStatus` del contrato: `(bs(ssbs)u)`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AssistantStatus {
    pub backend_available: bool,
    pub reason: String,
    pub model: AssistantModel,
    pub conversations: u32,
}

/// `Capability` del contrato: `(sbs)`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AssistantCapability {
    pub domain: String,
    pub available: bool,
    pub reason: String,
}

// ── Funciones puras ───────────────────────────────────────────────────────────

/// Lee la salida de `systemctl show -p LoadState,ActiveState,UnitFileState`.
pub fn parse_unit_state(output: &str) -> AssistantUnitState {
    let mut load = "";
    let mut active = "";
    let mut file = "";
    for line in output.lines() {
        match line.trim().split_once('=') {
            Some(("LoadState", v)) => load = v,
            Some(("ActiveState", v)) => active = v,
            Some(("UnitFileState", v)) => file = v,
            _ => {}
        }
    }
    let masked = load == "masked" || file == "masked";
    AssistantUnitState {
        installed: !load.is_empty() && load != "not-found",
        enabled: !masked && file.starts_with("enabled"),
        active: active == "active" || active == "reloading" || active == "activating",
        masked,
    }
}

/// Los `systemctl --user` para encender o apagar el asistente, en orden.
///
/// Apagar termina en `mask`: sin eso, la activación por D-Bus lo resucita la
/// próxima vez que algo le hable al nombre.
pub fn service_steps(enabled: bool) -> Vec<Vec<&'static str>> {
    if enabled {
        vec![vec!["unmask", UNIT], vec!["enable", "--now", UNIT]]
    } else {
        vec![vec!["disable", "--now", UNIT], vec!["mask", UNIT]]
    }
}

/// Si el `/proc/<pid>/cgroup` es el de un proceso de `vasak-assistant.service`.
pub fn cgroup_is_assistant_unit(cgroup: &str) -> bool {
    cgroup
        .lines()
        .any(|line| line.trim_end().ends_with("/vasak-assistant.service"))
}

/// Valida la dirección de un proveedor y la devuelve recortada.
pub fn validate_provider_url(url: &str) -> Result<&str, String> {
    let url = url.trim();
    if url.is_empty() {
        return Err("Falta la dirección del proveedor.".into());
    }
    if url.len() > MAX_PROVIDER_URL_BYTES {
        return Err(format!(
            "La dirección del proveedor no puede pasar de {MAX_PROVIDER_URL_BYTES} caracteres."
        ));
    }
    let parsed =
        url::Url::parse(url).map_err(|_| "La dirección del proveedor no es válida.".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("La dirección del proveedor tiene que empezar con http:// o https://.".into());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err(
            "La dirección del proveedor no puede llevar usuario ni contraseña: la clave va aparte."
                .into(),
        );
    }
    Ok(url)
}

/// Valida la clave del proveedor y la devuelve recortada. Ningún mensaje de
/// error la incluye.
pub fn validate_provider_key(key: &str) -> Result<&str, String> {
    let key = key.trim();
    if key.is_empty() {
        return Err("Falta la clave del proveedor.".into());
    }
    if key.len() > MAX_PROVIDER_KEY_BYTES {
        return Err(format!(
            "La clave del proveedor no puede pasar de {MAX_PROVIDER_KEY_BYTES} bytes."
        ));
    }
    if key.chars().any(char::is_control) {
        return Err("La clave del proveedor tiene caracteres no válidos.".into());
    }
    Ok(key)
}

/// Un error de D-Bus, por nombre y descripción, en palabras para la ventana.
pub fn describe_service_error(name: &str, description: Option<&str>) -> String {
    let description = description.map(str::trim).filter(|d| !d.is_empty());
    if let Some(kind) = name.strip_prefix(ERROR_PREFIX) {
        return description
            .map(str::to_owned)
            .unwrap_or_else(|| format!("El asistente devolvió un error ({kind})."));
    }
    if name == NAME_HAS_NO_OWNER || name == SERVICE_UNKNOWN {
        return "El asistente no está en ejecución.".into();
    }
    match description {
        Some(d) => format!("No se pudo hablar con el asistente: {d}"),
        None => format!("No se pudo hablar con el asistente ({name})."),
    }
}

// ── Pegamento: systemctl ──────────────────────────────────────────────────────

fn read_unit_state() -> Result<AssistantUnitState, String> {
    let output = Command::new("systemctl")
        .args([
            "--user",
            "show",
            UNIT,
            "-p",
            "LoadState,ActiveState,UnitFileState",
        ])
        .output()
        .map_err(|e| format!("No se pudo ejecutar systemctl: {e}"))?;
    if !output.status.success() {
        return Err(format!(
            "No se pudo leer el estado del asistente: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    Ok(parse_unit_state(&String::from_utf8_lossy(&output.stdout)))
}

fn apply_service_steps(enabled: bool) -> Result<AssistantUnitState, String> {
    for args in service_steps(enabled) {
        match systemctl(&args) {
            // Apagar un asistente que no está instalado no es un error.
            Err(error) if !enabled && is_missing_unit(&error) => {}
            result => result?,
        }
    }
    read_unit_state()
}

/// `systemctl` bloquea: fuera del hilo de la ventana y del runtime.
async fn blocking<T: Send + 'static>(
    job: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(job)
        .await
        .map_err(|e| format!("No se pudo ejecutar systemctl: {e}"))?
}

#[tauri::command]
pub async fn assistant_unit_state() -> Result<AssistantUnitState, String> {
    blocking(read_unit_state).await
}

#[tauri::command]
pub async fn set_assistant_service_enabled(enabled: bool) -> Result<AssistantUnitState, String> {
    blocking(move || apply_service_steps(enabled)).await
}

#[tauri::command]
pub async fn restart_assistant_service() -> Result<(), String> {
    blocking(|| systemctl(&["try-restart", UNIT])).await
}

// ── Pegamento: D-Bus ──────────────────────────────────────────────────────────

fn error_parts(error: &zbus::Error) -> Option<(&str, Option<&str>)> {
    match error {
        zbus::Error::MethodError(name, description, _) => {
            Some((name.as_str(), description.as_deref()))
        }
        _ => None,
    }
}

fn describe(error: &zbus::Error) -> String {
    match error_parts(error) {
        Some((name, description)) => describe_service_error(name, description),
        None => format!("No se pudo hablar con el asistente: {error}"),
    }
}

fn is_unknown_method(error: &zbus::Error) -> bool {
    error_parts(error).is_some_and(|(name, _)| name == UNKNOWN_METHOD)
}

async fn session() -> Result<Connection, String> {
    Connection::session()
        .await
        .map_err(|e| format!("No se pudo abrir el bus de sesión: {e}"))
}

async fn bus_call<B, R>(conn: &Connection, method: &str, body: &B) -> zbus::Result<R>
where
    B: Serialize + zbus::zvariant::DynamicType,
    R: serde::de::DeserializeOwned + Type,
{
    conn.call_method(
        Some("org.freedesktop.DBus"),
        "/org/freedesktop/DBus",
        Some("org.freedesktop.DBus"),
        method,
        body,
    )
    .await?
    .body()
    .deserialize()
}

/// El nombre único del dueño de `ar.net.vasak.os.Assistant`, sólo si es un
/// proceso de `vasak-assistant.service`. Si nadie lo tiene, lo arranca por
/// activación (que pasa por la misma unidad de systemd).
async fn verify_owner(conn: &Connection) -> Result<String, String> {
    let owner: String = match bus_call(conn, "GetNameOwner", &(SERVICE,)).await {
        Ok(owner) => owner,
        Err(e) if error_parts(&e).is_some_and(|(name, _)| name == NAME_HAS_NO_OWNER) => {
            let _: u32 = bus_call(conn, "StartServiceByName", &(SERVICE, 0u32))
                .await
                .map_err(|e| describe(&e))?;
            bus_call(conn, "GetNameOwner", &(SERVICE,))
                .await
                .map_err(|e| describe(&e))?
        }
        Err(e) => return Err(describe(&e)),
    };
    let pid: u32 = bus_call(conn, "GetConnectionUnixProcessID", &(owner.as_str(),))
        .await
        .map_err(|e| describe(&e))?;
    let cgroup = tokio::fs::read_to_string(format!("/proc/{pid}/cgroup"))
        .await
        .unwrap_or_default();
    if !cgroup_is_assistant_unit(&cgroup) {
        crate::logger::log_error(&format!(
            "vasak-assistant: el nombre {SERVICE} lo tiene el pid {pid}, que no es de {UNIT}"
        ));
        return Err(format!(
            "El servicio que responde como asistente no es {UNIT}: no se le habla."
        ));
    }
    Ok(owner)
}

/// Comprueba el dueño y llama al método en su nombre único.
async fn assistant_call<B, R>(method: &str, body: &B) -> Result<zbus::Result<R>, String>
where
    B: Serialize + zbus::zvariant::DynamicType,
    R: serde::de::DeserializeOwned + Type,
{
    let conn = session().await?;
    let owner = verify_owner(&conn).await?;
    let reply = conn
        .call_method(Some(owner.as_str()), PATH, Some(SERVICE), method, body)
        .await;
    Ok(reply.and_then(|message| message.body().deserialize()))
}

#[tauri::command]
pub async fn assistant_status() -> Result<AssistantStatus, String> {
    assistant_call("Status", &())
        .await?
        .map_err(|e| describe(&e))
}

#[tauri::command]
pub async fn assistant_capabilities() -> Result<Vec<AssistantCapability>, String> {
    assistant_call("Capabilities", &())
        .await?
        .map_err(|e| describe(&e))
}

#[tauri::command]
pub async fn assistant_models() -> Result<Vec<String>, String> {
    assistant_call("Models", &())
        .await?
        .map_err(|e| describe(&e))
}

/// `None` si el servicio instalado todavía no tiene `HasProviderKey`.
#[tauri::command]
pub async fn assistant_has_provider_key(url: String) -> Result<Option<bool>, String> {
    let url = validate_provider_url(&url)?;
    match assistant_call::<_, bool>("HasProviderKey", &(url,)).await? {
        Ok(has) => Ok(Some(has)),
        Err(e) if is_unknown_method(&e) => Ok(None),
        Err(e) => Err(describe(&e)),
    }
}

/// Guarda la clave en el llavero, a través del servicio. La clave no va a
/// ningún log ni mensaje: si el servicio la repite en su error, se tacha.
#[tauri::command]
pub async fn set_assistant_provider_key(url: String, key: String) -> Result<(), String> {
    let url = validate_provider_url(&url)?;
    let key = validate_provider_key(&key)?;
    match assistant_call::<_, ()>("SetProviderKey", &(url, key)).await? {
        Ok(()) => Ok(()),
        Err(e) if is_unknown_method(&e) => Err(
            "El servicio instalado no permite guardar la clave: actualizá vasak-assistant.".into(),
        ),
        Err(e) => Err(describe(&e).replace(key, "…")),
    }
}

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
//! tiene `ar.net.vasak.os.Assistant` sea el proceso principal (`MainPID`) de
//! `vasak-assistant.service`, que corra `/usr/bin/vasak-assistant` y que esté en
//! el cgroup exacto de esa unidad (vasak-assistant#5), y la llamada va a su
//! nombre único, no al conocido: así
//! un impostor que tome el nombre después de la comprobación no recibe nada —
//! sobre todo, no recibe la clave.

use std::os::fd::{AsFd, AsRawFd, BorrowedFd};
use std::os::unix::fs::MetadataExt;
use std::path::Path;
use std::process::Command;

use serde::{Deserialize, Serialize};
use zbus::zvariant::{DeserializeDict, OwnedFd, Type};
use zbus::Connection;

use crate::commands::idle::systemctl;
use crate::commands::night_light_service::is_missing_unit;

const SERVICE: &str = "ar.net.vasak.os.Assistant";
const PATH: &str = "/ar/net/vasak/os/Assistant";
const UNIT: &str = "vasak-assistant.service";
const ASSISTANT_EXE: &str = "/usr/bin/vasak-assistant";
const ERROR_PREFIX: &str = "ar.net.vasak.os.Assistant.Error.";
const UNKNOWN_METHOD: &str = "org.freedesktop.DBus.Error.UnknownMethod";
const NAME_HAS_NO_OWNER: &str = "org.freedesktop.DBus.Error.NameHasNoOwner";
const SERVICE_UNKNOWN: &str = "org.freedesktop.DBus.Error.ServiceUnknown";
// Sufijo de `ERROR_PREFIX`; no es `org.freedesktop.DBus.Error.AccessDenied`.
const ASSISTANT_ACCESS_DENIED: &str = "AccessDenied";

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

/// `MemoryStatus` del contrato: `(bbst)`. `bytes` va a la ventana como número:
/// el tamaño de una base en disco no se acerca a 2^53.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AssistantMemoryStatus {
    pub enabled: bool,
    pub available: bool,
    pub reason: String,
    pub bytes: u64,
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

/// Si el `/proc/<pid>/cgroup` tiene la línea `0::` exacta de la unidad del
/// asistente en el gestor de usuario de `uid`. Comparar el sufijo no alcanza:
/// `app.slice` es del usuario y cualquiera crea ahí un subcgroup con ese nombre.
fn cgroup_is_assistant_unit(cgroup: &str, uid: u32) -> bool {
    let expected = format!("/user.slice/user-{uid}.slice/user@{uid}.service/app.slice/{UNIT}");
    cgroup
        .lines()
        .any(|line| line.strip_prefix("0::") == Some(expected.as_str()))
}

/// Si el proceso `pid`, dueño del nombre, es el asistente: el `MainPID` de la
/// unidad (0 si está detenida o enmascarada), corriendo `/usr/bin/vasak-assistant`
/// y en el cgroup exacto de la unidad del usuario `uid`.
///
/// Tras actualizar el paquete, `/proc/<pid>/exe` dice
/// `/usr/bin/vasak-assistant (deleted)`: se rechaza a propósito (no hay forma
/// de distinguir ese binario viejo de otro cualquiera) y la persona reinicia el
/// servicio.
///
/// `owner_alive` es la última guarda: el pidfd del dueño confirma que su `pid`
/// no se recicló mientras se leía `/proc/<pid>`. Sin eso, un proceso que muere
/// y cuyo `pid` hereda el demonio legítimo haría pasar el chequeo contra el
/// proceso equivocado (#196).
pub fn owner_is_assistant(
    pid: u32,
    main_pid: u32,
    exe: &Path,
    cgroup: &str,
    uid: u32,
    owner_alive: bool,
) -> bool {
    owner_alive
        && main_pid != 0
        && pid == main_pid
        && exe == Path::new(ASSISTANT_EXE)
        && cgroup_is_assistant_unit(cgroup, uid)
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
    // La misma regla que el demonio (`config::is_local`): en claro, sólo a la
    // propia máquina; un nombre que resuelva a loopback igual cuenta como remoto.
    if parsed.scheme() == "http" && !is_loopback_host(&parsed) {
        return Err(
            "Un proveedor remoto tiene que usar https://; http:// sólo vale para esta computadora (localhost)."
                .into(),
        );
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err(
            "La dirección del proveedor no puede llevar usuario ni contraseña: la clave va aparte."
                .into(),
        );
    }
    Ok(url)
}

fn is_loopback_host(url: &url::Url) -> bool {
    match url.host() {
        Some(url::Host::Domain(domain)) => domain.eq_ignore_ascii_case("localhost"),
        Some(url::Host::Ipv4(ip)) => ip.is_loopback(),
        Some(url::Host::Ipv6(ip)) => ip.is_loopback(),
        None => false,
    }
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
        if kind == ASSISTANT_ACCESS_DENIED {
            return "El asistente no le permite esta operación a esta aplicación.".into();
        }
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

/// El error de `SetProviderKey` en una frase fija, sólo por su nombre. La
/// descripción del servicio no se reenvía: podría traer la clave escapada,
/// truncada o partida, y tacharla no alcanza.
pub fn describe_set_key_error(name: &str) -> String {
    match name.strip_prefix(ERROR_PREFIX) {
        Some("Unavailable") => {
            "El asistente no puede guardar la clave ahora (llavero bloqueado o no disponible)."
                .into()
        }
        Some("InvalidArgs") => "La dirección o la clave no son válidas.".into(),
        Some(_) => "El asistente no pudo guardar la clave.".into(),
        None => describe_service_error(name, None),
    }
}

// ── Pegamento: systemctl ──────────────────────────────────────────────────────

/// `systemctl --user show <unidad> <args>`, con la salida.
fn show_unit(args: &[&str]) -> Result<String, String> {
    let output = Command::new("systemctl")
        .args(["--user", "show", UNIT])
        .args(args)
        .output()
        .map_err(|e| format!("No se pudo ejecutar systemctl: {e}"))?;
    if !output.status.success() {
        return Err(format!(
            "No se pudo leer el estado del asistente: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

fn read_unit_state() -> Result<AssistantUnitState, String> {
    show_unit(&["-p", "LoadState,ActiveState,UnitFileState"]).map(|out| parse_unit_state(&out))
}

/// El `MainPID` de la unidad; 0 si está detenida, enmascarada o no se entiende.
fn read_main_pid() -> Result<u32, String> {
    show_unit(&["-p", "MainPID", "--value"]).map(|out| out.trim().parse().unwrap_or(0))
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

/// Las credenciales del dueño de un nombre (`GetConnectionCredentials`). Las
/// claves que no se nombran acá se ignoran. `ProcessFD` lo entrega dbus-broker;
/// con un `dbus-daemon` viejo puede faltar y entonces se cae al `pid` solo.
#[derive(DeserializeDict, Type)]
#[zvariant(signature = "a{sv}")]
struct OwnerCredentials {
    #[zvariant(rename = "ProcessID")]
    process_id: Option<u32>,
    #[zvariant(rename = "ProcessFD")]
    process_fd: Option<OwnedFd>,
}

/// `true` si el pidfd todavía apunta a un proceso sin cosechar: su `pid` no se
/// pudo reciclar entre que el bus lo anotó y ahora, así que lo que se leyó de
/// `/proc/<pid>` es de ese proceso y no de otro que heredó el `pid`. Se
/// comprueba **después** de esas lecturas. `pidfd_send_signal` con la señal 0
/// devuelve `ESRCH` recién cuando el proceso fue cosechado.
fn pidfd_still_alive(fd: BorrowedFd<'_>) -> bool {
    // SAFETY: syscall sin punteros de salida; `fd` sigue prestado durante la llamada.
    let rc = unsafe {
        libc::syscall(
            libc::SYS_pidfd_send_signal,
            fd.as_raw_fd(),
            0,
            std::ptr::null::<libc::siginfo_t>(),
            0u32,
        )
    };
    rc == 0
}

/// El nombre único del dueño de `ar.net.vasak.os.Assistant`, sólo si es el
/// proceso principal de `vasak-assistant.service` (ver `owner_is_assistant`).
/// Si nadie lo tiene, lo arranca por activación (que pasa por la misma unidad
/// de systemd); el `MainPID` se lee después, así que el recién arrancado
/// también tiene que coincidir.
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
    let creds: OwnerCredentials = bus_call(conn, "GetConnectionCredentials", &(owner.as_str(),))
        .await
        .map_err(|e| describe(&e))?;
    let Some(pid) = creds.process_id else {
        return Err(format!("El bus no informó el pid del dueño de {SERVICE}."));
    };
    let main_pid = blocking(read_main_pid).await?;
    // Cualquier lectura que falle cuenta como «no es el asistente».
    let exe = tokio::fs::read_link(format!("/proc/{pid}/exe"))
        .await
        .unwrap_or_default();
    let cgroup = tokio::fs::read_to_string(format!("/proc/{pid}/cgroup"))
        .await
        .unwrap_or_default();
    let uid = tokio::fs::metadata("/proc/self").await.map(|m| m.uid());
    // El pidfd del bus (si lo dio) cierra la carrera del pid reciclado; sin él,
    // el comportamiento es el de antes.
    let owner_alive = creds
        .process_fd
        .as_ref()
        .map_or(true, |fd| pidfd_still_alive(fd.as_fd()));
    let is_assistant =
        uid.is_ok_and(|uid| owner_is_assistant(pid, main_pid, &exe, &cgroup, uid, owner_alive));
    if !is_assistant {
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
/// ningún log ni mensaje: del error del servicio sólo se usa el nombre.
#[tauri::command]
pub async fn set_assistant_provider_key(url: String, key: String) -> Result<(), String> {
    let url = validate_provider_url(&url)?;
    let key = validate_provider_key(&key)?;
    match assistant_call::<_, ()>("SetProviderKey", &(url, key)).await? {
        Ok(()) => Ok(()),
        Err(e) if is_unknown_method(&e) => Err(
            "El servicio instalado no permite guardar la clave: actualizá vasak-assistant.".into(),
        ),
        Err(e) => Err(match error_parts(&e) {
            Some((name, _)) => describe_set_key_error(name),
            None => "No se pudo hablar con el asistente para guardar la clave.".into(),
        }),
    }
}

/// `None` si el servicio instalado todavía no tiene memoria (`MemoryStatus`).
#[tauri::command]
pub async fn assistant_memory_status() -> Result<Option<AssistantMemoryStatus>, String> {
    match assistant_call("MemoryStatus", &()).await? {
        Ok(status) => Ok(Some(status)),
        Err(e) if is_unknown_method(&e) => Ok(None),
        Err(e) => Err(describe(&e)),
    }
}

const MEMORY_UNSUPPORTED: &str =
    "El servicio instalado no tiene memoria: actualizá vasak-assistant.";

/// Apagar no borra: los archivos y la llave quedan.
#[tauri::command]
pub async fn set_assistant_memory_enabled(enabled: bool) -> Result<(), String> {
    match assistant_call::<_, ()>("SetMemoryEnabled", &(enabled,)).await? {
        Ok(()) => Ok(()),
        Err(e) if is_unknown_method(&e) => Err(MEMORY_UNSUPPORTED.into()),
        Err(e) => Err(describe(&e)),
    }
}

/// Borra la memoria; si estaba encendida, el servicio la recrea vacía.
#[tauri::command]
pub async fn clear_assistant_memory() -> Result<(), String> {
    match assistant_call::<_, ()>("ClearMemory", &()).await? {
        Ok(()) => Ok(()),
        Err(e) if is_unknown_method(&e) => Err(MEMORY_UNSUPPORTED.into()),
        Err(e) => Err(describe(&e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use zbus::zvariant::{serialized::Context, to_bytes, LE};

    fn firma<T: Type>() -> String {
        T::signature().to_string()
    }

    fn ida_y_vuelta<T>(valor: &T) -> T
    where
        T: Serialize + serde::de::DeserializeOwned + Type,
    {
        let bytes = to_bytes(Context::new_dbus(LE, 0), valor).expect("serializa");
        let (vuelta, _): (T, usize) = bytes.deserialize().expect("deserializa");
        vuelta
    }

    fn modelo() -> AssistantModel {
        AssistantModel {
            provider: "openai".into(),
            name: "gpt-x".into(),
            local: false,
            host: "api.ejemplo.com".into(),
        }
    }

    // ── Contrato del cable ────────────────────────────────────────────────────

    #[test]
    fn la_firma_de_cada_tipo_es_la_del_contrato() {
        assert_eq!(firma::<AssistantModel>(), "(ssbs)");
        assert_eq!(firma::<AssistantStatus>(), "(bs(ssbs)u)");
        assert_eq!(firma::<AssistantCapability>(), "(sbs)");
        assert_eq!(firma::<Vec<AssistantCapability>>(), "a(sbs)");
    }

    #[test]
    fn los_tipos_sobreviven_a_la_ida_y_vuelta_por_el_cable() {
        let status = AssistantStatus {
            backend_available: true,
            reason: "ok".into(),
            model: modelo(),
            conversations: 7,
        };
        assert_eq!(ida_y_vuelta(&modelo()), modelo());
        assert_eq!(ida_y_vuelta(&status), status);
        let caps = vec![
            AssistantCapability {
                domain: "mail".into(),
                available: false,
                reason: "todavía no".into(),
            },
            AssistantCapability {
                domain: "memory".into(),
                available: true,
                reason: String::new(),
            },
        ];
        assert_eq!(ida_y_vuelta(&caps), caps);
    }

    #[test]
    fn hacia_la_ventana_los_campos_van_en_camel_case() {
        let status = AssistantStatus {
            backend_available: true,
            reason: String::new(),
            model: modelo(),
            conversations: 2,
        };
        let json = serde_json::to_value(&status).unwrap();
        assert_eq!(json["backendAvailable"], true);
        assert_eq!(json["conversations"], 2);
        assert_eq!(json["model"]["local"], false);
        assert_eq!(json["model"]["host"], "api.ejemplo.com");
        assert!(json.get("backend_available").is_none());

        let unit = serde_json::to_value(AssistantUnitState {
            installed: true,
            enabled: true,
            active: false,
            masked: false,
        })
        .unwrap();
        assert_eq!(
            unit,
            serde_json::json!({"installed": true, "enabled": true, "active": false, "masked": false})
        );
    }

    // ── parse_unit_state ──────────────────────────────────────────────────────

    #[test]
    fn una_unidad_habilitada_y_activa_se_lee_completa() {
        let s = parse_unit_state("LoadState=loaded\nActiveState=active\nUnitFileState=enabled\n");
        assert_eq!(
            s,
            AssistantUnitState {
                installed: true,
                enabled: true,
                active: true,
                masked: false
            }
        );
    }

    #[test]
    fn una_unidad_inexistente_no_esta_instalada() {
        let s = parse_unit_state("LoadState=not-found\nActiveState=inactive\nUnitFileState=\n");
        assert_eq!(s, AssistantUnitState::default());
        assert_eq!(parse_unit_state(""), AssistantUnitState::default());
    }

    #[test]
    fn una_unidad_enmascarada_no_cuenta_como_habilitada() {
        let por_carga =
            parse_unit_state("LoadState=masked\nActiveState=inactive\nUnitFileState=masked");
        assert!(por_carga.masked && por_carga.installed && !por_carga.enabled);
        // `enabled-runtime` empieza con «enabled», pero enmascarada manda.
        let por_archivo =
            parse_unit_state("LoadState=loaded\nActiveState=inactive\nUnitFileState=masked");
        assert!(por_archivo.masked && !por_archivo.enabled);
        let ambas = parse_unit_state("LoadState=masked\nUnitFileState=enabled");
        assert!(ambas.masked && !ambas.enabled);
    }

    #[test]
    fn enabled_runtime_cuenta_como_habilitada() {
        let s = parse_unit_state(
            "LoadState=loaded\nActiveState=inactive\nUnitFileState=enabled-runtime",
        );
        assert!(s.enabled && !s.active);
        let d = parse_unit_state("LoadState=loaded\nActiveState=inactive\nUnitFileState=disabled");
        assert!(!d.enabled && d.installed);
    }

    #[test]
    fn solo_activa_recargando_o_activandose_cuentan_como_activa() {
        for (estado, activa) in [
            ("active", true),
            ("reloading", true),
            ("activating", true),
            ("inactive", false),
            ("failed", false),
            ("deactivating", false),
        ] {
            let s = parse_unit_state(&format!("LoadState=loaded\nActiveState={estado}"));
            assert_eq!(s.active, activa, "ActiveState={estado}");
        }
    }

    #[test]
    fn las_lineas_ajenas_o_con_espacios_no_confunden_la_lectura() {
        let s = parse_unit_state("  LoadState=loaded  \nruido\nOtra=cosa\n ActiveState=active\n");
        assert!(s.installed && s.active);
    }

    // ── service_steps ─────────────────────────────────────────────────────────

    #[test]
    fn encender_desenmascara_y_habilita_con_now() {
        assert_eq!(
            service_steps(true),
            vec![
                vec!["unmask", "vasak-assistant.service"],
                vec!["enable", "--now", "vasak-assistant.service"]
            ]
        );
    }

    #[test]
    fn apagar_deshabilita_con_now_y_termina_enmascarando() {
        let pasos = service_steps(false);
        assert_eq!(
            pasos,
            vec![
                vec!["disable", "--now", "vasak-assistant.service"],
                vec!["mask", "vasak-assistant.service"]
            ]
        );
        // Sin `mask` la activación por D-Bus lo resucita.
        assert_eq!(pasos.last().unwrap()[0], "mask");
    }

    // ── cgroup_is_assistant_unit ──────────────────────────────────────────────

    #[test]
    fn el_cgroup_de_la_unidad_del_asistente_se_reconoce() {
        let cg =
            "0::/user.slice/user-1000.slice/user@1000.service/app.slice/vasak-assistant.service\n";
        assert!(cgroup_is_assistant_unit(cg, 1000));
    }

    #[test]
    fn otra_unidad_o_un_nombre_parecido_no_es_el_asistente() {
        for cg in [
            "",
            "0::/user.slice/user@1000.service/app.slice/otro.service\n",
            "0::/user.slice/user@1000.service/app.slice/evil-vasak-assistant.service\n",
            "0::/user.slice/user@1000.service/app.slice/vasak-assistant.service.d/x\n",
            "0::/user.slice/user@1000.service/app.slice/vasak-assistant.socket\n",
            "0::/user.slice/vasak-assistant.service/hijo/otra.scope\n",
            "0::/user.slice/session-3.scope\n",
            "0::/user.slice/user@1000.service/app.slice/vasak-assistant.service\n",
        ] {
            assert!(!cgroup_is_assistant_unit(cg, 1000), "{cg:?}");
        }
    }

    // ── validate_provider_url ─────────────────────────────────────────────────

    #[test]
    fn una_direccion_valida_vuelve_recortada() {
        assert_eq!(
            validate_provider_url("  https://api.ejemplo.com/v1 \n"),
            Ok("https://api.ejemplo.com/v1")
        );
        assert_eq!(
            validate_provider_url("http://127.0.0.1:11434"),
            Ok("http://127.0.0.1:11434")
        );
    }

    #[test]
    fn una_direccion_vacia_o_ilegible_se_rechaza() {
        assert!(validate_provider_url("").unwrap_err().contains("Falta"));
        assert!(validate_provider_url("   ").unwrap_err().contains("Falta"));
        assert!(validate_provider_url("no es una url")
            .unwrap_err()
            .contains("no es válida"));
    }

    #[test]
    fn solo_http_y_https_valen() {
        for url in [
            "ftp://x.com/",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "ssh://h",
        ] {
            assert!(
                validate_provider_url(url).unwrap_err().contains("http"),
                "{url}"
            );
        }
    }

    #[test]
    fn la_direccion_no_puede_llevar_usuario_ni_contrasena() {
        for url in [
            "https://usuario@api.ejemplo.com",
            "https://usuario:secreta@api.ejemplo.com",
            "https://:secreta@api.ejemplo.com",
        ] {
            let error = validate_provider_url(url).unwrap_err();
            assert!(error.contains("usuario"), "{url}");
            assert!(!error.contains("secreta"));
        }
    }

    #[test]
    fn el_largo_de_la_direccion_tiene_tope() {
        let relleno =
            |n: usize| format!("https://a.com/{}", "x".repeat(n - "https://a.com/".len()));
        let justo = relleno(MAX_PROVIDER_URL_BYTES);
        assert_eq!(justo.len(), MAX_PROVIDER_URL_BYTES);
        assert!(validate_provider_url(&justo).is_ok());
        let largo = relleno(MAX_PROVIDER_URL_BYTES + 1);
        assert!(validate_provider_url(&largo).unwrap_err().contains("2048"));
    }

    // ── validate_provider_key ─────────────────────────────────────────────────

    #[test]
    fn una_clave_valida_vuelve_recortada() {
        assert_eq!(validate_provider_key("  sk-abc123 \n"), Ok("sk-abc123"));
    }

    #[test]
    fn una_clave_vacia_se_rechaza() {
        assert!(validate_provider_key("").unwrap_err().contains("Falta"));
        assert!(validate_provider_key(" \t\n")
            .unwrap_err()
            .contains("Falta"));
    }

    #[test]
    fn el_largo_de_la_clave_tiene_tope() {
        assert!(validate_provider_key(&"k".repeat(MAX_PROVIDER_KEY_BYTES)).is_ok());
        let error = validate_provider_key(&"k".repeat(MAX_PROVIDER_KEY_BYTES + 1)).unwrap_err();
        assert!(error.contains("4096"));
    }

    #[test]
    fn una_clave_con_caracteres_de_control_se_rechaza() {
        for key in ["sk-a\nb", "sk-a\0b", "sk-a\u{7f}b", "sk-a\tb", "sk-\u{85}b"] {
            assert!(
                validate_provider_key(key)
                    .unwrap_err()
                    .contains("no válidos"),
                "{key:?}"
            );
        }
    }

    #[test]
    fn ningun_error_de_validacion_incluye_la_clave() {
        let secreta = "sk-SECRETISIMA";
        let con_control = format!("{secreta}\n{secreta}");
        let larga = format!("{secreta}{}", "k".repeat(MAX_PROVIDER_KEY_BYTES));
        for key in [con_control.as_str(), larga.as_str()] {
            let error = validate_provider_key(key).unwrap_err();
            assert!(!error.contains("SECRETISIMA"), "{error}");
        }
    }

    // ── describe_service_error ────────────────────────────────────────────────

    #[test]
    fn un_error_del_asistente_usa_su_descripcion() {
        let nombre = "ar.net.vasak.os.Assistant.Error.InvalidArgument";
        assert_eq!(
            describe_service_error(nombre, Some("  la URL no vale ")),
            "la URL no vale"
        );
    }

    #[test]
    fn un_error_del_asistente_sin_descripcion_dice_de_que_clase_es() {
        let nombre = "ar.net.vasak.os.Assistant.Error.Backend";
        for d in [None, Some(""), Some("   ")] {
            assert_eq!(
                describe_service_error(nombre, d),
                "El asistente devolvió un error (Backend)."
            );
        }
    }

    #[test]
    fn sin_dueno_del_nombre_el_asistente_no_esta_en_ejecucion() {
        for nombre in [
            "org.freedesktop.DBus.Error.NameHasNoOwner",
            "org.freedesktop.DBus.Error.ServiceUnknown",
        ] {
            assert_eq!(
                describe_service_error(nombre, Some("detalle del bus")),
                "El asistente no está en ejecución."
            );
        }
    }

    #[test]
    fn cualquier_otro_error_de_dbus_conserva_el_nombre_o_la_descripcion() {
        assert_eq!(
            describe_service_error("org.freedesktop.DBus.Error.NoReply", Some("tardó")),
            "No se pudo hablar con el asistente: tardó"
        );
        assert_eq!(
            describe_service_error("org.freedesktop.DBus.Error.NoReply", None),
            "No se pudo hablar con el asistente (org.freedesktop.DBus.Error.NoReply)."
        );
    }

    // ── Pegamento sin bus ─────────────────────────────────────────────────────

    #[test]
    fn un_error_de_metodo_se_traduce_con_su_nombre_y_el_desconocido_se_detecta() {
        use zbus::names::ErrorName;
        // Sin cuerpo real: `MethodError` sólo necesita el mensaje, y la
        // construcción se prueba por el camino que usa el pegamento.
        let nombre = ErrorName::try_from(UNKNOWN_METHOD).unwrap();
        let mensaje = zbus::message::Message::method("/", "X")
            .unwrap()
            .build(&())
            .unwrap();
        let error = zbus::Error::MethodError(nombre.into(), Some("no existe".into()), mensaje);
        assert!(is_unknown_method(&error));
        assert_eq!(
            describe(&error),
            "No se pudo hablar con el asistente: no existe"
        );
        assert!(!is_unknown_method(&zbus::Error::InvalidReply));
        assert!(describe(&zbus::Error::InvalidReply).starts_with("No se pudo hablar"));
    }
    // ── Dueño del nombre ──────────────────────────────────────────────────────

    const CG: &str =
        "0::/user.slice/user-1000.slice/user@1000.service/app.slice/vasak-assistant.service\n";

    #[test]
    fn el_cgroup_tiene_que_ser_el_exacto_del_usuario() {
        assert!(cgroup_is_assistant_unit(CG, 1000));
        // Otro uid, otra jerarquía o un prefijo distinto de `0::`.
        assert!(!cgroup_is_assistant_unit(CG, 1001));
        for cg in [
            "1:name=systemd:/user.slice/user-1000.slice/user@1000.service/app.slice/vasak-assistant.service\n",
            "0::/user.slice/user-1000.slice/user@1000.service/app.slice/vasak-assistant.service/hijo\n",
            "0::/x/user.slice/user-1000.slice/user@1000.service/app.slice/vasak-assistant.service\n",
            "0::/user.slice/user-1000.slice/user@1000.service/app.slice/app-x.slice/vasak-assistant.service\n",
        ] {
            assert!(!cgroup_is_assistant_unit(cg, 1000), "{cg:?}");
        }
    }

    #[test]
    fn el_dueno_es_el_asistente_solo_si_cumple_las_cuatro_condiciones() {
        let exe = Path::new("/usr/bin/vasak-assistant");
        assert!(owner_is_assistant(42, 42, exe, CG, 1000, true));
        // El MainPID de una unidad detenida o enmascarada es 0: nadie lo es.
        assert!(!owner_is_assistant(0, 0, exe, CG, 1000, true));
        assert!(!owner_is_assistant(42, 0, exe, CG, 1000, true));
        // Otro proceso, aunque esté en el cgroup y corra el binario.
        assert!(!owner_is_assistant(43, 42, exe, CG, 1000, true));
        // Otro binario, o el reemplazado por una actualización.
        assert!(!owner_is_assistant(
            42,
            42,
            Path::new("/usr/bin/python3"),
            CG,
            1000,
            true
        ));
        assert!(!owner_is_assistant(
            42,
            42,
            Path::new("/usr/bin/vasak-assistant (deleted)"),
            CG,
            1000,
            true
        ));
        assert!(!owner_is_assistant(42, 42, Path::new(""), CG, 1000, true));
        // Otro cgroup o el de otro usuario.
        assert!(!owner_is_assistant(
            42,
            42,
            exe,
            "0::/user.slice/session-3.scope\n",
            1000,
            true
        ));
        assert!(!owner_is_assistant(42, 42, exe, CG, 1001, true));
    }

    #[test]
    fn un_pidfd_que_ya_no_esta_vivo_rechaza_al_dueno() {
        let exe = Path::new("/usr/bin/vasak-assistant");
        // #196: aunque las cuatro condiciones de `/proc` coincidan, si el pidfd
        // del bus ya no apunta a un proceso vivo el pid se pudo reciclar entre
        // la lectura y el uso —y el demonio legítimo pudo heredarlo—, así que el
        // dueño se rechaza.
        assert!(!owner_is_assistant(42, 42, exe, CG, 1000, false));
        // Con el pidfd vivo y todo lo demás en verde, sí es el asistente.
        assert!(owner_is_assistant(42, 42, exe, CG, 1000, true));
    }

    #[test]
    fn pidfd_still_alive_sigue_al_proceso_no_al_pid() {
        use std::os::fd::{FromRawFd, OwnedFd};
        // Un hijo vivo: su pidfd está vivo.
        let mut child = Command::new("sleep")
            .arg("30")
            .spawn()
            .expect("se pudo arrancar el hijo");
        // SAFETY: pidfd_open sobre un pid recién arrancado que todavía no cosechamos.
        let raw = unsafe { libc::syscall(libc::SYS_pidfd_open, child.id() as libc::pid_t, 0) };
        assert!(raw >= 0, "pidfd_open falló: {raw}");
        // SAFETY: `raw` es un fd recién abierto y válido; lo tomamos en propiedad.
        let fd = unsafe { OwnedFd::from_raw_fd(raw as i32) };
        assert!(
            pidfd_still_alive(fd.as_fd()),
            "el hijo vivo debería estar vivo"
        );
        // Al cosecharlo, su pid queda libre para reciclar y el pidfd da ESRCH:
        // es justo la señal que #196 necesita para no mirar un pid heredado.
        child.kill().expect("se pudo matar al hijo");
        child.wait().expect("se pudo cosechar al hijo");
        assert!(
            !pidfd_still_alive(fd.as_fd()),
            "tras cosechar al hijo el pidfd ya no está vivo"
        );
    }

    // ── Direcciones: http sólo a la propia máquina ────────────────────────────

    #[test]
    fn http_vale_solo_hacia_loopback() {
        for url in [
            "http://localhost:11434",
            "http://LOCALHOST/v1",
            "http://127.0.0.1:8080/v1",
            "http://127.5.5.5",
            "http://[::1]:11434",
        ] {
            assert_eq!(validate_provider_url(url), Ok(url), "{url}");
        }
        for url in [
            "http://api.ejemplo.com/v1",
            "http://10.0.0.5:11434",
            "http://192.168.1.2",
            "http://localhost.evil.com",
            "http://ia.localhost",
            "http://[::2]",
            "http://128.0.0.1",
        ] {
            let error = validate_provider_url(url).unwrap_err();
            assert!(error.contains("https://"), "{url}: {error}");
        }
        assert!(validate_provider_url("https://api.ejemplo.com/v1").is_ok());
    }

    #[test]
    fn is_loopback_host_distingue_dominios_y_direcciones() {
        let host = |u: &str| is_loopback_host(&url::Url::parse(u).unwrap());
        assert!(host("http://localhost"));
        assert!(host("http://127.0.0.1"));
        assert!(host("http://[::1]"));
        assert!(!host("http://example.com"));
        assert!(!host("http://8.8.8.8"));
        // Sin host (p. ej. `mailto:`) no es loopback.
        assert!(!host("mailto:alguien@ejemplo.com"));
    }

    // ── Errores de SetProviderKey ─────────────────────────────────────────────

    #[test]
    fn el_error_de_guardar_la_clave_es_una_frase_fija_por_nombre() {
        let nombre = |kind: &str| format!("{ERROR_PREFIX}{kind}");
        assert!(describe_set_key_error(&nombre("Unavailable")).contains("llavero"));
        assert_eq!(
            describe_set_key_error(&nombre("InvalidArgs")),
            "La dirección o la clave no son válidas."
        );
        assert_eq!(
            describe_set_key_error(&nombre("Otro")),
            "El asistente no pudo guardar la clave."
        );
        // Fuera del espacio de nombres del asistente cae al mensaje general.
        assert_eq!(
            describe_set_key_error("org.freedesktop.DBus.Error.NameHasNoOwner"),
            "El asistente no está en ejecución."
        );
        assert!(describe_set_key_error("org.freedesktop.DBus.Error.NoReply")
            .starts_with("No se pudo hablar con el asistente"));
    }

    // ── Memoria ───────────────────────────────────────────────────────────────

    fn memoria() -> AssistantMemoryStatus {
        AssistantMemoryStatus {
            enabled: true,
            available: false,
            reason: "llavero bloqueado".into(),
            bytes: 1_572_864,
        }
    }

    #[test]
    fn la_firma_de_la_memoria_es_la_del_contrato() {
        assert_eq!(firma::<AssistantMemoryStatus>(), "(bbst)");
    }

    #[test]
    fn la_memoria_sobrevive_a_la_ida_y_vuelta_por_el_cable() {
        assert_eq!(ida_y_vuelta(&memoria()), memoria());
        let grande = AssistantMemoryStatus {
            bytes: u64::MAX,
            ..memoria()
        };
        assert_eq!(ida_y_vuelta(&grande), grande);
    }

    #[test]
    fn la_memoria_va_a_la_ventana_en_camel_case_con_bytes_como_numero() {
        let json = serde_json::to_value(memoria()).unwrap();
        assert_eq!(
            json,
            serde_json::json!({
                "enabled": true,
                "available": false,
                "reason": "llavero bloqueado",
                "bytes": 1_572_864u64
            })
        );
    }

    #[test]
    fn acceso_denegado_dice_que_la_aplicacion_no_tiene_permiso() {
        let nombre = format!("{ERROR_PREFIX}AccessDenied");
        let esperado = "El asistente no le permite esta operación a esta aplicación.";
        // Con o sin descripción del servicio, la frase es la misma.
        assert_eq!(describe_service_error(&nombre, None), esperado);
        assert_eq!(
            describe_service_error(&nombre, Some("uid 1000 no autorizado")),
            esperado
        );
    }

    #[test]
    fn un_metodo_desconocido_se_detecta_y_no_se_confunde_con_acceso_denegado() {
        use zbus::names::ErrorName;
        let mensaje = || {
            zbus::message::Message::method("/", "X")
                .unwrap()
                .build(&())
                .unwrap()
        };
        let con = |nombre: &str| {
            zbus::Error::MethodError(
                ErrorName::try_from(nombre.to_string()).unwrap().into(),
                None,
                mensaje(),
            )
        };
        assert!(is_unknown_method(&con(UNKNOWN_METHOD)));
        assert!(!is_unknown_method(&con(&format!(
            "{ERROR_PREFIX}AccessDenied"
        ))));
        assert_eq!(
            describe(&con(&format!("{ERROR_PREFIX}AccessDenied"))),
            "El asistente no le permite esta operación a esta aplicación."
        );
    }

    #[test]
    fn el_mensaje_de_servicio_sin_memoria_pide_actualizar() {
        assert!(MEMORY_UNSUPPORTED.contains("actualizá vasak-assistant"));
    }

    // ── Pegamento con un bus de sesión propio ─────────────────────────────────

    use std::io::{BufRead, BufReader};
    use std::process::{Child, Stdio};
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    /// Un `dbus-daemon` de sesión sin servicios de activación, para no despertar
    /// el asistente real de quien corre las pruebas.
    struct BusPrivado {
        child: Child,
        address: String,
    }

    impl BusPrivado {
        fn arrancar() -> Option<Self> {
            let config =
                std::env::temp_dir().join(format!("vasak-asistente-{}.conf", std::process::id()));
            std::fs::write(
                &config,
                "<busconfig><type>session</type><listen>unix:tmpdir=/tmp</listen>\
                 <auth>EXTERNAL</auth><policy context=\"default\"><allow send_destination=\"*\" eavesdrop=\"true\"/>\
                 <allow receive_sender=\"*\"/><allow own=\"*\"/></policy></busconfig>",
            )
            .ok()?;
            let mut child = Command::new("dbus-daemon")
                .arg("--nofork")
                .arg("--print-address=1")
                .arg(format!("--config-file={}", config.display()))
                .stdout(Stdio::piped())
                .spawn()
                .ok()?;
            let mut address = String::new();
            BufReader::new(child.stdout.take()?)
                .read_line(&mut address)
                .ok()?;
            let _ = std::fs::remove_file(&config);
            Some(Self {
                child,
                address: address.trim().to_string(),
            })
        }
    }

    impl Drop for BusPrivado {
        fn drop(&mut self) {
            let _ = self.child.kill();
            let _ = self.child.wait();
        }
    }

    /// Alguien que toma el nombre del asistente sin ser `vasak-assistant.service`.
    struct Impostor(Arc<AtomicUsize>);

    #[zbus::interface(name = "ar.net.vasak.os.Assistant")]
    impl Impostor {
        fn set_provider_key(&self, _url: String, _key: String) {
            self.0.fetch_add(1, Ordering::SeqCst);
        }
        fn has_provider_key(&self, _url: String) -> bool {
            self.0.fetch_add(1, Ordering::SeqCst);
            true
        }
        fn memory_status(&self) -> (bool, bool, String, u64) {
            self.0.fetch_add(1, Ordering::SeqCst);
            (true, true, String::new(), 0)
        }
        fn set_memory_enabled(&self, _enabled: bool) {
            self.0.fetch_add(1, Ordering::SeqCst);
        }
        fn clear_memory(&self) {
            self.0.fetch_add(1, Ordering::SeqCst);
        }
        fn models(&self) -> Vec<String> {
            self.0.fetch_add(1, Ordering::SeqCst);
            vec![]
        }
        fn capabilities(&self) -> Vec<AssistantCapability> {
            self.0.fetch_add(1, Ordering::SeqCst);
            vec![]
        }
    }

    #[test]
    fn sin_dueno_no_hay_asistente_y_un_impostor_no_recibe_nada() {
        let Some(bus) = BusPrivado::arrancar() else {
            eprintln!("sin dbus-daemon: no se prueba el pegamento de D-Bus");
            return;
        };
        std::env::set_var("DBUS_SESSION_BUS_ADDRESS", &bus.address);
        tauri::async_runtime::block_on(async {
            // Nadie tiene el nombre y no hay quién lo active.
            assert_eq!(
                assistant_status().await.unwrap_err(),
                "El asistente no está en ejecución."
            );

            let llamadas = Arc::new(AtomicUsize::new(0));
            let _impostor = zbus::connection::Builder::session()
                .unwrap()
                .name(SERVICE)
                .unwrap()
                .serve_at(PATH, Impostor(llamadas.clone()))
                .unwrap()
                .build()
                .await
                .unwrap();

            let url = "https://api.ejemplo.com/v1".to_string();
            // Sin `systemd --user` (CI) la comprobación falla antes, por otro
            // lado («No se pudo leer el estado…»): igual se niega, y eso es lo
            // que importa.
            let rechazado = |e: &str| {
                e.contains("no es vasak-assistant.service") || e.starts_with("No se pudo")
            };
            let clave = set_assistant_provider_key(url.clone(), "sk-SECRETISIMA".into())
                .await
                .unwrap_err();
            assert!(rechazado(&clave), "{clave}");
            assert!(!clave.contains("SECRETISIMA"));
            assert!(rechazado(
                &assistant_has_provider_key(url).await.unwrap_err()
            ));
            assert!(rechazado(&assistant_models().await.unwrap_err()));
            assert!(rechazado(&assistant_capabilities().await.unwrap_err()));
            assert!(rechazado(&assistant_status().await.unwrap_err()));
            // Ni la memoria: ni el estado, ni encenderla, ni borrarla.
            assert!(rechazado(&assistant_memory_status().await.unwrap_err()));
            assert!(rechazado(
                &set_assistant_memory_enabled(true).await.unwrap_err()
            ));
            assert!(rechazado(&clear_assistant_memory().await.unwrap_err()));
            // La clave, ni ninguna otra llamada, llegó al impostor.
            assert_eq!(llamadas.load(Ordering::SeqCst), 0);
        });
    }

    #[test]
    fn el_estado_de_la_unidad_es_coherente_con_o_sin_systemd_de_usuario() {
        // En una máquina de CI puede no haber `systemd --user`: cualquiera de los
        // dos resultados sirve, pero uno enmascarado nunca figura habilitado.
        if let Ok(unit) = tauri::async_runtime::block_on(assistant_unit_state()) {
            assert!(!(unit.masked && unit.enabled));
            assert!(unit.installed || !unit.active);
        }
    }
}

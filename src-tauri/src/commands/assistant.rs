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
        assert!(cgroup_is_assistant_unit(cg));
        assert!(cgroup_is_assistant_unit(
            "0::/user.slice/user@1000.service/app.slice/vasak-assistant.service"
        ));
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
        ] {
            assert!(!cgroup_is_assistant_unit(cg), "{cg:?}");
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
}

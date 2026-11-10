//! Reading and changing what each application is allowed to use.
//!
//! Everything here goes through `vasak-permissions`, the system service that
//! owns the decisions. This screen deliberately holds no copy of them: two
//! places recording the same permission is how they end up disagreeing, and
//! only one of them is the file a program cannot rewrite.

use serde::{Deserialize, Serialize};

const SERVICE_NAME: &str = "ar.net.vasak.os.Permissions";
const SERVICE_PATH: &str = "/ar/net/vasak/os/Permissions";
const SERVICE_INTERFACE: &str = "ar.net.vasak.os.Permissions";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionApplication {
    pub binary_path: String,
    pub display_name: String,
    /// `"system-installed"` or `"unverified"`.
    pub provenance: String,
    /// El nombre del icono, resuelto **acá** y no por el servicio.
    ///
    /// El servicio decide política y no sabe de temas de iconos ni de archivos
    /// `.desktop`, que es lo correcto: el icono es presentación. Se completa
    /// después de leer la respuesta, así que el servicio no lo manda — de ahí el
    /// `default`, sin el cual `serde` fallaría al leer.
    #[serde(default)]
    pub icon: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionEntry {
    pub application: PermissionApplication,
    /// Si el programa **pregunta** antes de usar el recurso.
    ///
    /// Este puente vuelve a declarar la forma que manda el servicio, así que un
    /// campo que no esté acá **se pierde en silencio**: serde lo descarta al
    /// leer y la interfaz lo recibe como `undefined`. Pasó con éste — la
    /// pantalla apagaba los controles de todo lo que instaló el sistema, que es
    /// exactamente lo que el campo venía a arreglar.
    ///
    /// Con `default` para que un servicio más viejo, que todavía no lo manda,
    /// no rompa la lectura: sale en `false`, que es lo que valía antes.
    #[serde(default)]
    pub asks: bool,
    /// Resource id → `"allowed"` | `"denied"` | `"unknown"`.
    pub decisions: std::collections::BTreeMap<String, String>,
}

async fn service() -> Result<zbus::Connection, String> {
    zbus::Connection::system().await.map_err(|e| {
        format!(
            "No se pudo contactar al servicio de permisos: {e}. \
             Comprobá que vasak-permissions esté en ejecución."
        )
    })
}

/// Llama un método sin argumentos del servicio y devuelve su respuesta JSON cruda.
///
/// `que` nombra lo que se estaba leyendo, para el mensaje de error. Centraliza el
/// `call_method` + `deserialize` que comparten todas las lecturas de lista, así no
/// se repite el bloque en cada comando.
async fn leer_json(metodo: &str, que: &str) -> Result<String, String> {
    let connection = service().await?;

    let reply = connection
        .call_method(
            Some(SERVICE_NAME),
            SERVICE_PATH,
            Some(SERVICE_INTERFACE),
            metodo,
            &(),
        )
        .await
        .map_err(|e| format!("No se pudo leer {que}: {e}"))?;

    reply
        .body()
        .deserialize::<String>()
        .map_err(|e| format!("Respuesta inválida del servicio de permisos: {e}"))
}

#[tauri::command]
pub async fn list_permissions() -> Result<Vec<PermissionEntry>, String> {
    let raw = leer_json("ListPermissions", "los permisos").await?;

    let mut entradas: Vec<PermissionEntry> = serde_json::from_str(&raw)
        .map_err(|e| format!("No se pudo interpretar la respuesta: {e}"))?;

    // El icono, en una sola pasada por los `.desktop` para toda la lista. Una
    // lista de rutas de binarios no se lee de un vistazo: hay que detenerse en
    // cada línea a descifrar cuál es cuál, y acá se decide quién usa la cámara.
    let binarios: Vec<String> = entradas
        .iter()
        .map(|e| e.application.binary_path.clone())
        .collect();
    let iconos = super::iconos_de_apps::iconos_de(&binarios);

    for entrada in &mut entradas {
        if let Some(icono) = iconos.get(&entrada.application.binary_path) {
            entrada.application.icon = icono.clone();
        }
    }

    Ok(entradas)
}

/// Grants or revokes one resource for one program.
///
/// The service asks polkit before it writes anything, so this call surfaces an
/// authentication dialog the first time and may be refused — which is the
/// point: without it, any program could grant itself what it was refused.
#[tauri::command]
pub async fn set_permission(
    binary_path: String,
    resource_id: String,
    allowed: bool,
) -> Result<(), String> {
    let connection = service().await?;

    connection
        .call_method(
            Some(SERVICE_NAME),
            SERVICE_PATH,
            Some(SERVICE_INTERFACE),
            "SetPermission",
            &(binary_path.as_str(), resource_id.as_str(), allowed),
        )
        .await
        .map(|_| ())
        .map_err(|e| format!("No se pudo cambiar el permiso: {e}"))
}

/// Forgets a program entirely, so the next time it asks the user is asked again.
#[tauri::command]
pub async fn forget_permission(binary_path: String) -> Result<(), String> {
    let connection = service().await?;

    connection
        .call_method(
            Some(SERVICE_NAME),
            SERVICE_PATH,
            Some(SERVICE_INTERFACE),
            "ForgetPermission",
            &(binary_path.as_str(),),
        )
        .await
        .map(|_| ())
        .map_err(|e| format!("No se pudo olvidar la aplicación: {e}"))
}

/// Un destino observado por el cortafuegos, tal como lo manda el servicio.
///
/// Los campos opcionales llevan `default` por la misma razón que `asks` arriba:
/// un servicio más viejo que no los manda no tiene que romper la lectura.
/// `domain` y `binary_path` los influye quien abre la conexión: la interfaz los
/// dibuja como texto, nunca como HTML.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObservedConnection {
    pub uid: u32,
    pub binary_path: String,
    pub ip: String,
    pub port: u16,
    pub proto: String,
    pub allowed: bool,
    #[serde(default)]
    pub count: u32,
    #[serde(default)]
    pub last_seen_secs: u64,
    #[serde(default)]
    pub domain: Option<String>,
}

/// Una regla de bloqueo por dominio: a `binary_path` se le corta `domain`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockedDomain {
    pub binary_path: String,
    pub domain: String,
}

/// El mapa de conexiones en vivo del usuario que llama (sólo en memoria en el servicio).
#[tauri::command]
pub async fn list_connections() -> Result<Vec<ObservedConnection>, String> {
    let raw = leer_json("ListConnections", "las conexiones").await?;
    serde_json::from_str(&raw).map_err(|e| format!("No se pudo interpretar la respuesta: {e}"))
}

/// Las reglas de bloqueo por dominio del usuario que llama.
#[tauri::command]
pub async fn list_domain_rules() -> Result<Vec<BlockedDomain>, String> {
    let raw = leer_json("ListDomainRules", "las reglas por dominio").await?;
    serde_json::from_str(&raw).map_err(|e| format!("No se pudo interpretar la respuesta: {e}"))
}

/// Prende o apaga el bloqueo de un dominio para un programa.
///
/// Pasa por polkit en el servicio, como `set_permission`: puede mostrar un
/// diálogo de autenticación y ser rechazado.
#[tauri::command]
pub async fn set_domain_rule(
    binary_path: String,
    domain: String,
    blocked: bool,
) -> Result<(), String> {
    let connection = service().await?;

    connection
        .call_method(
            Some(SERVICE_NAME),
            SERVICE_PATH,
            Some(SERVICE_INTERFACE),
            "SetDomainRule",
            &(binary_path.as_str(), domain.as_str(), blocked),
        )
        .await
        .map(|_| ())
        .map_err(|e| format!("No se pudo cambiar la regla: {e}"))
}

/// Un bloqueo del registro persistente del cortafuegos (opt-in), tal como lo manda el servicio.
///
/// `binary_path` y `destination` los influye la aplicación: la interfaz los
/// dibuja como texto, nunca como HTML. `reason` viene vacío si el servicio no lo supo.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FirewallLogEntry {
    pub timestamp: u64,
    pub uid: u32,
    pub binary_path: String,
    pub destination: String,
    pub port: u16,
    pub proto: String,
    #[serde(default)]
    pub reason: String,
}

/// Los bloqueos registrados del usuario que llama (vacío si el registro está apagado).
#[tauri::command]
pub async fn read_firewall_log() -> Result<Vec<FirewallLogEntry>, String> {
    let raw = leer_json("ReadFirewallLog", "el registro de bloqueos").await?;
    serde_json::from_str(&raw).map_err(|e| format!("No se pudo interpretar la respuesta: {e}"))
}

/// Si el registro persistente de bloqueos está prendido.
#[tauri::command]
pub async fn firewall_logging_enabled() -> Result<bool, String> {
    let connection = service().await?;
    let reply = connection
        .call_method(
            Some(SERVICE_NAME),
            SERVICE_PATH,
            Some(SERVICE_INTERFACE),
            "FirewallLoggingEnabled",
            &(),
        )
        .await
        .map_err(|e| format!("No se pudo leer el estado del registro: {e}"))?;
    reply
        .body()
        .deserialize::<bool>()
        .map_err(|e| format!("Respuesta inválida del servicio de permisos: {e}"))
}

/// Prende o apaga el registro de bloqueos. Pasa por polkit; apagar NO borra lo guardado.
#[tauri::command]
pub async fn set_firewall_logging(enabled: bool) -> Result<(), String> {
    let connection = service().await?;

    connection
        .call_method(
            Some(SERVICE_NAME),
            SERVICE_PATH,
            Some(SERVICE_INTERFACE),
            "SetFirewallLogging",
            &(enabled,),
        )
        .await
        .map(|_| ())
        .map_err(|e| format!("No se pudo cambiar el registro: {e}"))
}

/// Borra el registro de bloqueos. Pasa por polkit.
#[tauri::command]
pub async fn clear_firewall_log() -> Result<(), String> {
    let connection = service().await?;

    connection
        .call_method(
            Some(SERVICE_NAME),
            SERVICE_PATH,
            Some(SERVICE_INTERFACE),
            "ClearFirewallLog",
            &(),
        )
        .await
        .map(|_| ())
        .map_err(|e| format!("No se pudo borrar el registro: {e}"))
}

/// Reenvía la señal `ConnectionObserved` a la ventana como evento de Tauri.
///
/// La señal lleva sólo el uid (viaja por el bus del sistema y la oye cualquiera),
/// así que no trae el destino: el evento es un «volvé a leer» y la pantalla llama
/// a `list_connections`, que filtra por el usuario que llama.
pub async fn watch_connection_signals(app: tauri::AppHandle) {
    use futures_util::StreamExt;
    use tauri::Emitter;

    let Ok(connection) = zbus::Connection::system().await else {
        crate::logger::log_debug("vasak-permissions: sin bus del sistema, no se escuchan señales");
        return;
    };
    let Ok(proxy) = zbus::fdo::DBusProxy::new(&connection).await else {
        return;
    };
    let rule = format!(
        "type='signal',sender='{SERVICE_NAME}',path='{SERVICE_PATH}',\
         interface='{SERVICE_INTERFACE}',member='ConnectionObserved'"
    );
    let Ok(parsed) = rule.as_str().try_into() else {
        return;
    };
    if proxy.add_match_rule(parsed).await.is_err() {
        crate::logger::log_debug("vasak-permissions: no se pudo suscribir a las señales");
        return;
    }

    let mut stream = zbus::MessageStream::from(connection);
    while let Some(Ok(message)) = stream.next().await {
        let header = message.header();
        if header.interface().map(|i| i.as_str()) == Some(SERVICE_INTERFACE)
            && header.member().map(|m| m.as_str()) == Some("ConnectionObserved")
        {
            let _ = app.emit("permissions-connection-observed", ());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Verbatim from a running service. The two sides are separate programs, so
    /// a field renamed on one of them would otherwise only show up as an empty
    /// screen with no explanation.
    #[test]
    fn a_connection_and_a_rule_from_the_service_are_understood() {
        let c: Vec<ObservedConnection> = serde_json::from_str(
            r#"[{"uid":1000,"binary_path":"/usr/bin/curl","ip":"1.2.3.4","port":443,"proto":"tcp","allowed":false,"count":2,"last_seen_secs":5,"domain":"example.com"}]"#,
        )
        .unwrap();
        assert_eq!(c[0].domain.as_deref(), Some("example.com"));
        let r: Vec<BlockedDomain> =
            serde_json::from_str(r#"[{"binary_path":"/usr/bin/curl","domain":"a.com"}]"#).unwrap();
        assert_eq!(r[0].domain, "a.com");
    }

    #[test]
    fn a_log_entry_from_the_service_is_understood_and_reason_may_be_missing() {
        let l: Vec<FirewallLogEntry> = serde_json::from_str(
            r#"[{"timestamp":1700000000,"uid":1000,"binary_path":"/usr/bin/curl","destination":"example.com","port":443,"proto":"tcp","reason":"domain-rule"},{"timestamp":1,"uid":1000,"binary_path":"/x","destination":"1.2.3.4","port":53,"proto":"udp"}]"#,
        )
        .unwrap();
        assert_eq!(l[0].reason, "domain-rule");
        assert_eq!(l[0].port, 443);
        assert_eq!(l[1].reason, "");
    }

    const FROM_THE_SERVICE: &str = r#"[{"application":{"binary_path":"/usr/bin/busctl","display_name":"busctl","provenance":"system-installed"},"asks":true,"decisions":{"account.email":"denied","camera":"denied"}}]"#;

    #[test]
    fn the_service_reply_is_understood_as_sent() {
        let entries: Vec<PermissionEntry> = serde_json::from_str(FROM_THE_SERVICE).expect("parse");

        assert_eq!(entries.len(), 1);
        let entry = &entries[0];
        assert_eq!(entry.application.binary_path, "/usr/bin/busctl");
        assert_eq!(entry.application.display_name, "busctl");
        assert_eq!(entry.application.provenance, "system-installed");

        // Account resources carry a dot in the key; it has to survive as one
        // key rather than being read as a nested structure.
        assert_eq!(
            entry.decisions.get("account.email").map(String::as_str),
            Some("denied")
        );
        assert_eq!(
            entry.decisions.get("camera").map(String::as_str),
            Some("denied")
        );

        // Este puente vuelve a declarar la forma del servicio, así que un campo
        // que falte acá se pierde sin que nada falle. Con éste, la pantalla
        // apagaba los controles de todo lo instalado por el sistema — incluido
        // lo que sí pregunta, como vasak-connect con la cámara del teléfono.
        assert!(entry.asks, "«asks» no llegó del servicio a la interfaz");
    }

    /// Y un servicio más viejo, que todavía no manda el campo, se sigue
    /// leyendo. Sale en `false`, que es lo que valía antes de que existiera.
    #[test]
    fn a_service_without_the_field_is_still_understood() {
        let sin_campo = r#"[{"application":{"binary_path":"/usr/bin/x","display_name":"x","provenance":"unverified"},"decisions":{}}]"#;
        let entries: Vec<PermissionEntry> = serde_json::from_str(sin_campo).expect("parse");
        assert!(!entries[0].asks);
    }

    #[test]
    fn a_program_with_nothing_decided_is_still_valid() {
        let entries: Vec<PermissionEntry> = serde_json::from_str(
            r#"[{"application":{"binary_path":"/x","display_name":"x","provenance":"unverified"},"decisions":{}}]"#,
        )
        .expect("parse");

        assert!(entries[0].decisions.is_empty());
    }
}

/// Un bloqueo que ocurrió y espera decisión.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct BlockedItem {
    /// El perfil de AppArmor que lo produjo. Es la identidad: se engancha al
    /// binario, así que es más estable que la ruta del proceso.
    pub perfil: String,
    pub ruta: String,
    pub mascara: String,
    /// De qué programa venía, si se pudo averiguar. Sólo para mostrar.
    pub programa: String,
    /// Cuántas veces se repitió el mismo intento.
    pub veces: u32,
}

/// Lo que algún perfil de AppArmor bloqueó y todavía nadie decidió.
///
/// Son los bloqueos que no corresponden a un recurso con nombre —cámara,
/// micrófono, credenciales— sino a una ruta concreta que un perfil del sistema
/// no dejó abrir. Existen para que se puedan desbloquear: sin esta lista, un
/// perfil que niega algo deja un programa que falla sin explicación.
#[tauri::command]
pub async fn list_blocked() -> Result<Vec<BlockedItem>, String> {
    let raw = leer_json("ListBlocked", "lo bloqueado").await?;
    serde_json::from_str(&raw).map_err(|e| format!("No se pudo interpretar la respuesta: {e}"))
}

/// Permite exactamente lo que se bloqueó. Pasa por polkit.
#[tauri::command]
pub async fn allow_blocked(profile: String, path: String) -> Result<(), String> {
    let connection = service().await?;
    connection
        .call_method(
            Some(SERVICE_NAME),
            SERVICE_PATH,
            Some(SERVICE_INTERFACE),
            "AllowBlocked",
            &(profile, path),
        )
        .await
        .map(|_| ())
        .map_err(|e| format!("No se pudo permitir: {e}"))
}

/// Saca el bloqueo de la lista sin permitirlo.
#[tauri::command]
pub async fn dismiss_blocked(profile: String, path: String) -> Result<(), String> {
    let connection = service().await?;
    connection
        .call_method(
            Some(SERVICE_NAME),
            SERVICE_PATH,
            Some(SERVICE_INTERFACE),
            "DismissBlocked",
            &(profile, path),
        )
        .await
        .map(|_| ())
        .map_err(|e| format!("No se pudo descartar: {e}"))
}

/// Lo que ya se le permitió a un perfil, para poder retirarlo.
#[tauri::command]
pub async fn list_allowed(profile: String) -> Result<Vec<String>, String> {
    let connection = service().await?;
    let reply = connection
        .call_method(
            Some(SERVICE_NAME),
            SERVICE_PATH,
            Some(SERVICE_INTERFACE),
            "ListAllowed",
            &(profile,),
        )
        .await
        .map_err(|e| format!("No se pudo leer lo permitido: {e}"))?;
    let raw: String = reply
        .body()
        .deserialize()
        .map_err(|e| format!("Respuesta inválida del servicio de permisos: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("No se pudo interpretar la respuesta: {e}"))
}

/// Vuelve a bloquear algo que se había permitido. Pasa por polkit.
#[tauri::command]
pub async fn revoke_blocked(profile: String, rule: String) -> Result<(), String> {
    let connection = service().await?;
    connection
        .call_method(
            Some(SERVICE_NAME),
            SERVICE_PATH,
            Some(SERVICE_INTERFACE),
            "RevokeBlocked",
            &(profile, rule),
        )
        .await
        .map(|_| ())
        .map_err(|e| format!("No se pudo volver a bloquear: {e}"))
}

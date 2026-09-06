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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionEntry {
    pub application: PermissionApplication,
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

#[tauri::command]
pub async fn list_permissions() -> Result<Vec<PermissionEntry>, String> {
    let connection = service().await?;

    let reply = connection
        .call_method(
            Some(SERVICE_NAME),
            SERVICE_PATH,
            Some(SERVICE_INTERFACE),
            "ListPermissions",
            &(),
        )
        .await
        .map_err(|e| format!("No se pudieron leer los permisos: {e}"))?;

    let raw: String = reply
        .body()
        .deserialize()
        .map_err(|e| format!("Respuesta inválida del servicio de permisos: {e}"))?;

    serde_json::from_str(&raw).map_err(|e| format!("No se pudo interpretar la respuesta: {e}"))
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

#[cfg(test)]
mod tests {
    use super::*;

    /// Verbatim from a running service. The two sides are separate programs, so
    /// a field renamed on one of them would otherwise only show up as an empty
    /// screen with no explanation.
    const FROM_THE_SERVICE: &str = r#"[{"application":{"binary_path":"/usr/bin/busctl","display_name":"busctl","provenance":"system-installed"},"decisions":{"account.email":"denied","camera":"denied"}}]"#;

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
        assert_eq!(entry.decisions.get("account.email").map(String::as_str), Some("denied"));
        assert_eq!(entry.decisions.get("camera").map(String::as_str), Some("denied"));
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
    let connection = service().await?;

    let reply = connection
        .call_method(Some(SERVICE_NAME), SERVICE_PATH, Some(SERVICE_INTERFACE), "ListBlocked", &())
        .await
        .map_err(|e| format!("No se pudo leer lo bloqueado: {e}"))?;

    let raw: String = reply
        .body()
        .deserialize()
        .map_err(|e| format!("Respuesta inválida del servicio de permisos: {e}"))?;

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

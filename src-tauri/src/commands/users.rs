use serde::Serialize;
use std::io::Write;
use std::process::{Command, Stdio};
use zbus::zvariant::OwnedObjectPath;
use zbus::Connection;

use crate::logger::{log_debug, log_error};

const DEST: &str = "org.freedesktop.Accounts";
const PATH: &str = "/org/freedesktop/Accounts";
const IFACE: &str = "org.freedesktop.Accounts";
const USER_IFACE: &str = "org.freedesktop.Accounts.User";

/// accountsservice's own values for `AccountType`.
const ACCOUNT_TYPE_STANDARD: i32 = 0;
const ACCOUNT_TYPE_ADMIN: i32 = 1;

#[derive(Serialize)]
pub struct UserAccount {
    pub uid: u64,
    pub username: String,
    pub real_name: String,
    pub is_admin: bool,
    pub icon_file: String,
    pub locked: bool,
    pub home_directory: String,
    pub shell: String,
    /// Lets the UI stop you from deleting or demoting the account you're using.
    pub is_current: bool,
}

async fn connection() -> Result<Connection, String> {
    Connection::system().await.map_err(|e| {
        let msg = format!("No se pudo conectar al bus del sistema: {}", e);
        log_error(&msg);
        msg
    })
}

async fn accounts_proxy(connection: &Connection) -> Result<zbus::Proxy<'_>, String> {
    zbus::Proxy::new(connection, DEST, PATH, IFACE)
        .await
        .map_err(|e| {
            let msg = format!("No se pudo acceder a accountsservice: {}", e);
            log_error(&msg);
            msg
        })
}

async fn user_proxy(
    connection: &Connection,
    path: &OwnedObjectPath,
) -> Result<zbus::Proxy<'static>, String> {
    // Clone so the proxy owns its path instead of borrowing the caller's.
    zbus::Proxy::new(connection, DEST, path.clone(), USER_IFACE)
        .await
        .map_err(|e| format!("No se pudo acceder a la cuenta: {}", e))
}

/// Turns polkit's refusal into something the UI can show verbatim.
fn call_error(action: &str, error: zbus::Error) -> String {
    let raw = error.to_string();

    let msg = if raw.contains("not authorized") || raw.contains("NotAuthorized") {
        format!("No se autorizó {}.", action)
    } else {
        format!("Error al {}: {}", action, raw)
    };

    log_error(&msg);
    msg
}

// ── Validation ───────────────────────────────────────────────────────────────

/// Mirrors what useradd accepts, so the failure is reported before we ever call
/// accountsservice.
pub fn validate_username(username: &str) -> Result<(), String> {
    if username.is_empty() || username.len() > 32 {
        return Err("El nombre de usuario debe tener entre 1 y 32 caracteres.".to_string());
    }

    let mut chars = username.chars();
    let first = chars.next().unwrap_or_default();

    if !(first.is_ascii_lowercase() || first == '_') {
        return Err("El nombre de usuario debe empezar con una letra minúscula o «_».".to_string());
    }

    if !chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-') {
        return Err(
            "El nombre de usuario solo admite minúsculas, números, «-» y «_».".to_string(),
        );
    }

    Ok(())
}

/// `openssl passwd -stdin` reads a single line, so a password containing a
/// newline would be silently truncated — reject control characters outright
/// rather than storing a hash of something other than what was typed.
pub fn validate_password(password: &str) -> Result<(), String> {
    if password.is_empty() {
        return Err("La contraseña no puede estar vacía.".to_string());
    }

    if password.chars().any(|c| c.is_control()) {
        return Err("La contraseña no puede contener saltos de línea ni caracteres de control.".to_string());
    }

    Ok(())
}

/// Hashes with SHA-512 crypt. The password is written to the child's stdin, so
/// it never appears in the process arguments — /proc/<pid>/cmdline is readable
/// by every user on the machine.
fn crypt_password(password: &str) -> Result<String, String> {
    validate_password(password)?;

    let mut child = Command::new("openssl")
        .args(["passwd", "-6", "-stdin"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("No se pudo ejecutar openssl: {}. ¿Está instalado?", e))?;

    {
        let stdin = child
            .stdin
            .as_mut()
            .ok_or_else(|| "No se pudo escribir en openssl".to_string())?;

        stdin
            .write_all(password.as_bytes())
            .and_then(|()| stdin.write_all(b"\n"))
            .map_err(|e| format!("No se pudo enviar la contraseña a openssl: {}", e))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("openssl falló: {}", e))?;

    if !output.status.success() {
        // Deliberately not including stderr: it can echo the input.
        return Err("openssl no pudo generar el hash de la contraseña.".to_string());
    }

    let hash = String::from_utf8_lossy(&output.stdout).trim().to_string();

    if !hash.starts_with("$6$") {
        return Err("El hash generado no tiene el formato esperado.".to_string());
    }

    Ok(hash)
}

// ── Queries ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_users() -> Result<Vec<UserAccount>, String> {
    let connection = connection().await?;
    let proxy = accounts_proxy(&connection).await?;

    let paths: Vec<OwnedObjectPath> = proxy
        .call("ListCachedUsers", &())
        .await
        .map_err(|e| format!("No se pudo listar las cuentas: {}", e))?;

    let current = std::env::var("USER").unwrap_or_default();
    let mut users = Vec::new();

    for path in paths {
        let Ok(user) = user_proxy(&connection, &path).await else {
            continue;
        };

        let username = user
            .get_property::<String>("UserName")
            .await
            .unwrap_or_default();

        if username.is_empty() {
            continue;
        }

        users.push(UserAccount {
            uid: user.get_property::<u64>("Uid").await.unwrap_or(0),
            is_current: username == current,
            username,
            real_name: user
                .get_property::<String>("RealName")
                .await
                .unwrap_or_default(),
            is_admin: user
                .get_property::<i32>("AccountType")
                .await
                .unwrap_or(ACCOUNT_TYPE_STANDARD)
                == ACCOUNT_TYPE_ADMIN,
            icon_file: user
                .get_property::<String>("IconFile")
                .await
                .unwrap_or_default(),
            locked: user.get_property::<bool>("Locked").await.unwrap_or(false),
            home_directory: user
                .get_property::<String>("HomeDirectory")
                .await
                .unwrap_or_default(),
            shell: user.get_property::<String>("Shell").await.unwrap_or_default(),
        });
    }

    users.sort_by(|a, b| a.uid.cmp(&b.uid));
    Ok(users)
}

async fn find_user(connection: &Connection, uid: u64) -> Result<OwnedObjectPath, String> {
    let proxy = accounts_proxy(connection).await?;

    proxy
        .call("FindUserById", &(uid as i64))
        .await
        .map_err(|e| format!("No se encontró la cuenta {}: {}", uid, e))
}

// ── Mutations ────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn create_user(
    username: String,
    real_name: String,
    admin: bool,
    password: String,
) -> Result<(), String> {
    validate_username(&username)?;
    let hash = crypt_password(&password)?;

    let connection = connection().await?;
    let proxy = accounts_proxy(&connection).await?;

    let account_type = if admin {
        ACCOUNT_TYPE_ADMIN
    } else {
        ACCOUNT_TYPE_STANDARD
    };

    let path: OwnedObjectPath = proxy
        .call(
            "CreateUser",
            &(username.as_str(), real_name.as_str(), account_type),
        )
        .await
        .map_err(|e| call_error("crear la cuenta", e))?;

    let user = user_proxy(&connection, &path).await?;

    if let Err(error) = user
        .call::<_, _, ()>("SetPassword", &(hash.as_str(), ""))
        .await
    {
        // The account exists but has no usable password; say so rather than
        // leaving the user to discover it at the login screen.
        let msg = call_error("establecer la contraseña", error);
        return Err(format!("{} La cuenta se creó sin contraseña válida.", msg));
    }

    log_debug(&format!("Cuenta «{}» creada", username));
    Ok(())
}

#[tauri::command]
pub async fn delete_user(uid: u64, remove_files: bool) -> Result<(), String> {
    let connection = connection().await?;
    let proxy = accounts_proxy(&connection).await?;

    proxy
        .call::<_, _, ()>("DeleteUser", &(uid as i64, remove_files))
        .await
        .map_err(|e| call_error("eliminar la cuenta", e))?;

    log_debug(&format!("Cuenta {} eliminada", uid));
    Ok(())
}

#[tauri::command]
pub async fn set_user_password(uid: u64, password: String) -> Result<(), String> {
    let hash = crypt_password(&password)?;

    let connection = connection().await?;
    let path = find_user(&connection, uid).await?;
    let user = user_proxy(&connection, &path).await?;

    user.call::<_, _, ()>("SetPassword", &(hash.as_str(), ""))
        .await
        .map_err(|e| call_error("cambiar la contraseña", e))?;

    // Setting a password on a locked account leaves it unusable otherwise.
    let _ = user.call::<_, _, ()>("SetLocked", &(false,)).await;

    log_debug(&format!("Contraseña de la cuenta {} actualizada", uid));
    Ok(())
}

#[tauri::command]
pub async fn set_user_real_name(uid: u64, real_name: String) -> Result<(), String> {
    let connection = connection().await?;
    let path = find_user(&connection, uid).await?;
    let user = user_proxy(&connection, &path).await?;

    user.call::<_, _, ()>("SetRealName", &(real_name.as_str(),))
        .await
        .map_err(|e| call_error("cambiar el nombre", e))?;

    Ok(())
}

#[tauri::command]
pub async fn set_user_admin(uid: u64, admin: bool) -> Result<(), String> {
    let connection = connection().await?;
    let path = find_user(&connection, uid).await?;
    let user = user_proxy(&connection, &path).await?;

    let account_type = if admin {
        ACCOUNT_TYPE_ADMIN
    } else {
        ACCOUNT_TYPE_STANDARD
    };

    user.call::<_, _, ()>("SetAccountType", &(account_type,))
        .await
        .map_err(|e| call_error("cambiar el tipo de cuenta", e))?;

    Ok(())
}

#[tauri::command]
pub async fn set_user_locked(uid: u64, locked: bool) -> Result<(), String> {
    let connection = connection().await?;
    let path = find_user(&connection, uid).await?;
    let user = user_proxy(&connection, &path).await?;

    user.call::<_, _, ()>("SetLocked", &(locked,))
        .await
        .map_err(|e| call_error("bloquear o desbloquear la cuenta", e))?;

    Ok(())
}

#[tauri::command]
pub async fn set_user_icon(uid: u64, icon_path: String) -> Result<(), String> {
    let connection = connection().await?;
    let path = find_user(&connection, uid).await?;
    let user = user_proxy(&connection, &path).await?;

    user.call::<_, _, ()>("SetIconFile", &(icon_path.as_str(),))
        .await
        .map_err(|e| call_error("cambiar la foto de perfil", e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_ordinary_usernames() {
        for name in ["pato", "_svc", "user-1", "a", "maria_jose"] {
            assert!(validate_username(name).is_ok(), "{} should be valid", name);
        }
    }

    #[test]
    fn rejects_usernames_useradd_would_refuse() {
        for name in ["", "1user", "-user", "Pato", "user name", "usuário", "a".repeat(33).as_str()] {
            assert!(validate_username(name).is_err(), "{:?} should be invalid", name);
        }
    }

    #[test]
    fn rejects_passwords_that_would_be_truncated_by_stdin() {
        // openssl reads one line, so a newline would hash only the first part.
        assert!(validate_password("hunter2\nrest").is_err());
        assert!(validate_password("with\ttab").is_err());
        assert!(validate_password("nul\0byte").is_err());
        assert!(validate_password("").is_err());
    }

    #[test]
    fn accepts_passwords_with_spaces_and_symbols() {
        assert!(validate_password("una frase larga con espacios").is_ok());
        assert!(validate_password("p@$$w0rd!#%&").is_ok());
        assert!(validate_password("acentos áéíóú ñ").is_ok());
    }

    #[test]
    fn produces_a_sha512_crypt_hash() {
        let Ok(hash) = crypt_password("una contraseña de prueba") else {
            eprintln!("openssl no disponible; se omite");
            return;
        };

        assert!(hash.starts_with("$6$"), "expected SHA-512 crypt, got {}", hash);
        assert!(hash.len() > 20);
    }

    #[test]
    fn salts_make_each_hash_unique() {
        let (Ok(first), Ok(second)) = (crypt_password("misma clave"), crypt_password("misma clave"))
        else {
            eprintln!("openssl no disponible; se omite");
            return;
        };

        assert_ne!(first, second, "each hash must use a fresh random salt");
    }
}

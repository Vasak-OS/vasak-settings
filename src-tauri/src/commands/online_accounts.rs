use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use url::Url;
use zbus::Connection;

use crate::logger::log_debug;

// ---------------------------------------------------------------------------
// D-Bus constants — coincide con el daemon vasak-accounts
// ---------------------------------------------------------------------------

const ACCOUNTS_SERVICE: &str = "ar.net.vasak.os.AccountManager";
const ACCOUNTS_PATH: &str = "/ar/net/vasak/os/AccountManager";
const ACCOUNTS_INTERFACE: &str = "ar.net.vasak.os.AccountManager";

/// The account daemon lives on the **system** bus now: the tokens it hands out
/// are in root-owned files, so it has to run somewhere a program running as the
/// user cannot replace it.
async fn account_manager() -> Result<Connection, String> {
    Connection::system().await.map_err(|e| {
        format!(
            "No se pudo contactar al gestor de cuentas: {e}. \
             Comprobá que vasak-accounts esté en ejecución."
        )
    })
}

// ---------------------------------------------------------------------------
// Tipos compartidos (misma serialización que el daemon)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Hash, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CapabilityType {
    Email,
    Calendar,
    Contacts,
    Chat,
    Drive,
    Tasks,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
    pub id: String,
    pub display_name: String,
    pub provider_type: String,
    pub capabilities: HashMap<CapabilityType, Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AccountInfo {
    pub id: String,
    pub provider: String,
    pub display_name: String,
    pub metadata: HashMap<String, Value>,
    pub created_at: String,
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Creates an account through the account daemon.
///
/// The secret goes straight into root-owned storage and this process never
/// keeps a copy — it used to write `accounts.json` itself and put the token in
/// the user's keyring, which is exactly what let any program running as the
/// user read it without ever being asked.
#[tauri::command]
pub async fn register_new_account(
    provider: String,
    metadata: serde_json::Value,
    secret: String,
) -> Result<(), String> {
    let display_name = metadata
        .get("display_name")
        .and_then(|v| v.as_str())
        .unwrap_or(&provider)
        .to_string();

    let capabilities = serde_json::json!({ "email": metadata });
    let secrets = serde_json::json!({ "access": secret });

    let connection = account_manager().await?;
    let reply = connection
        .call_method(
            Some(ACCOUNTS_SERVICE),
            ACCOUNTS_PATH,
            Some(ACCOUNTS_INTERFACE),
            "RegisterAccount",
            &(
                display_name.as_str(),
                provider.as_str(),
                capabilities.to_string().as_str(),
                secrets.to_string().as_str(),
            ),
        )
        .await
        .map_err(|e| format!("No se pudo registrar la cuenta: {e}"))?;

    let account_id: String = reply
        .body()
        .deserialize()
        .map_err(|e| format!("Respuesta inválida del gestor de cuentas: {e}"))?;

    log_debug(&format!(
        "Account registered (provider: {provider}, id: {account_id})"
    ));
    Ok(())
}

/// Lists the accounts the daemon holds for this user. Metadata only — a token
/// never travels through here.
#[tauri::command]
pub async fn list_accounts() -> Result<Vec<AccountInfo>, String> {
    let connection = account_manager().await?;
    let reply = connection
        .call_method(
            Some(ACCOUNTS_SERVICE),
            ACCOUNTS_PATH,
            Some(ACCOUNTS_INTERFACE),
            "ListAccounts",
            &(),
        )
        .await
        .map_err(|e| format!("No se pudieron leer las cuentas: {e}"))?;

    let raw: String = reply
        .body()
        .deserialize()
        .map_err(|e| format!("Respuesta inválida del gestor de cuentas: {e}"))?;

    let accounts: Vec<Account> =
        serde_json::from_str(&raw).map_err(|e| format!("No se pudo interpretar la lista: {e}"))?;

    Ok(accounts
        .into_iter()
        .map(|account| {
            let metadata = account
                .capabilities
                .get(&CapabilityType::Email)
                .cloned()
                .and_then(|value| serde_json::from_value(value).ok())
                .unwrap_or_default();
            AccountInfo {
                id: account.id,
                provider: account.provider_type,
                display_name: account.display_name,
                metadata,
                created_at: String::new(),
            }
        })
        .collect())
}

/// Removes an account. The daemon clears its secrets along with it, so nothing
/// is left holding a live credential.
#[tauri::command]
pub async fn remove_account(account_id: String) -> Result<(), String> {
    let connection = account_manager().await?;
    let reply = connection
        .call_method(
            Some(ACCOUNTS_SERVICE),
            ACCOUNTS_PATH,
            Some(ACCOUNTS_INTERFACE),
            "RemoveAccount",
            &(account_id.as_str(),),
        )
        .await
        .map_err(|e| format!("No se pudo eliminar la cuenta: {e}"))?;

    let removed: bool = reply
        .body()
        .deserialize()
        .map_err(|e| format!("Respuesta inválida del gestor de cuentas: {e}"))?;

    if !removed {
        return Err(format!("No se encontró la cuenta '{account_id}'"));
    }

    log_debug(&format!("Account removed: {account_id}"));
    Ok(())
}

/// Inicia el flujo OAuth2 de Google:
/// 1. Abre un servidor HTTP local en un puerto aleatorio
/// 2. Abre el navegador del sistema con la URL de autenticación
/// 3. Espera el callback con el código de autorización
/// 4. Devuelve el código
#[tauri::command]
pub async fn start_google_oauth(client_id: String, scopes: Vec<String>) -> Result<String, String> {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("bind: {e}"))?;

    let port = listener
        .local_addr()
        .map_err(|e| format!("local_addr: {e}"))?
        .port();

    let redirect_uri = format!("http://127.0.0.1:{port}/callback");

    let mut auth_url = Url::parse("https://accounts.google.com/o/oauth2/v2/auth")
        .map_err(|e| format!("parse URL: {e}"))?;

    auth_url
        .query_pairs_mut()
        .append_pair("client_id", &client_id)
        .append_pair("redirect_uri", &redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", &scopes.join(" "))
        .append_pair("access_type", "offline")
        .append_pair("prompt", "consent");

    open::that(auth_url.as_str()).map_err(|e| format!("open browser: {e}"))?;

    let timeout = std::time::Duration::from_secs(300);
    let (mut stream, _) = tokio::time::timeout(timeout, listener.accept())
        .await
        .map_err(|_| "OAuth timeout: no se recibió el callback".to_string())?
        .map_err(|e| format!("accept: {e}"))?;

    let mut buf = vec![0u8; 4096];
    let n = stream
        .read(&mut buf)
        .await
        .map_err(|e| format!("read: {e}"))?;

    let request = String::from_utf8_lossy(&buf[..n]);

    let code = request
        .lines()
        .next()
        .and_then(|line| {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() < 2 {
                return None;
            }
            let path = parts[1];
            let query_start = path.find('?')?;
            let query = &path[query_start + 1..];
            for pair in query.split('&') {
                let mut kv = pair.splitn(2, '=');
                if let (Some(k), Some(v)) = (kv.next(), kv.next()) {
                    if k == "code" {
                        return Some(
                            url::form_urlencoded::parse(v.as_bytes())
                                .next()
                                .map(|(_, val)| val.into_owned()),
                        );
                    }
                }
            }
            None
        })
        .flatten()
        .ok_or_else(|| {
            let snippet = request.lines().next().unwrap_or("(empty)").to_string();
            format!("No se encontró el código de autorización en: {snippet}")
        })?;

    let response_body = concat!(
        "<!DOCTYPE html>\n",
        "<html lang=\"es\">\n",
        "<head><meta charset=\"utf-8\"><title>Autenticación completada</title></head>\n",
        "<body style=\"display:flex;align-items:center;justify-content:center;height:100vh;",
        "margin:0;font-family:sans-serif;background:#1a1a2e;color:#e0e0e0;\">\n",
        "  <div style=\"text-align:center;\">\n",
        "    <h1>✓ Autenticación completada</h1>\n",
        "    <p>Ya puedes cerrar esta pestaña y volver a la aplicación.</p>\n",
        "  </div>\n",
        "</body>\n</html>\n",
    );

    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\
         \r\nConnection: close\r\n\r\n{}",
        response_body.len(),
        response_body,
    );

    stream.write_all(response.as_bytes()).await.ok();

    Ok(code)
}

/// Proxy D-Bus hacia el método Ping del daemon.
#[tauri::command]
pub async fn account_manager_ping() -> Result<String, String> {
    let conn = account_manager().await?;

    let proxy = zbus::ProxyBuilder::<zbus::Proxy<'_>>::new(&conn)
        .destination(ACCOUNTS_SERVICE)
        .map_err(|e| format!("destination: {e}"))?
        .path(ACCOUNTS_PATH)
        .map_err(|e| format!("path: {e}"))?
        .interface(ACCOUNTS_INTERFACE)
        .map_err(|e| format!("interface: {e}"))?
        .build()
        .await
        .map_err(|e| format!("proxy: {e}"))?;

    let reply: String = proxy
        .call_method("Ping", &())
        .await
        .map_err(|e| format!("Ping call: {e}"))?
        .body()
        .deserialize()
        .map_err(|e| format!("Ping deserialize: {e}"))?;

    Ok(reply)
}

/// Obtiene metadatos de una capability desde el daemon via D-Bus.
#[tauri::command]
pub async fn get_account_data(
    account_id: String,
    capability: String,
) -> Result<String, String> {
    let conn = account_manager().await?;

    let proxy = zbus::ProxyBuilder::<zbus::Proxy<'_>>::new(&conn)
        .destination(ACCOUNTS_SERVICE)
        .map_err(|e| format!("destination: {e}"))?
        .path(ACCOUNTS_PATH)
        .map_err(|e| format!("path: {e}"))?
        .interface(ACCOUNTS_INTERFACE)
        .map_err(|e| format!("interface: {e}"))?
        .build()
        .await
        .map_err(|e| format!("proxy: {e}"))?;

    let reply: String = proxy
        .call_method("GetAccountData", &(account_id, capability))
        .await
        .map_err(|e| format!("GetAccountData call: {e}"))?
        .body()
        .deserialize()
        .map_err(|e| format!("GetAccountData deserialize: {e}"))?;

    Ok(reply)
}

/// Obtiene un access_token válido desde el daemon (con refresco automático).
#[tauri::command]
pub async fn get_access_token(
    account_id: String,
    capability: String,
) -> Result<String, String> {
    let conn = account_manager().await?;

    let proxy = zbus::ProxyBuilder::<zbus::Proxy<'_>>::new(&conn)
        .destination(ACCOUNTS_SERVICE)
        .map_err(|e| format!("destination: {e}"))?
        .path(ACCOUNTS_PATH)
        .map_err(|e| format!("path: {e}"))?
        .interface(ACCOUNTS_INTERFACE)
        .map_err(|e| format!("interface: {e}"))?
        .build()
        .await
        .map_err(|e| format!("proxy: {e}"))?;

    let reply: String = proxy
        .call_method("GetAccessToken", &(account_id, capability))
        .await
        .map_err(|e| format!("GetAccessToken call: {e}"))?
        .body()
        .deserialize()
        .map_err(|e| format!("GetAccessToken deserialize: {e}"))?;

    Ok(reply)
}

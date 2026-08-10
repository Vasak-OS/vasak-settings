use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use url::Url;
use zbus::Connection;

use crate::logger::log_debug;

// ---------------------------------------------------------------------------
// D-Bus constants — coincide con el daemon vasak-accounts
// ---------------------------------------------------------------------------

const ACCOUNT_MANAGER_DEST: &str = "ar.net.vasak.os.AccountManager";
const ACCOUNT_MANAGER_PATH: &str = "/ar/net/vasak/os/AccountManager";
const ACCOUNT_MANAGER_IFACE: &str = "ar.net.vasak.os.AccountManager";

// ---------------------------------------------------------------------------
// Storage constants — coincide con storage.rs del daemon
// ---------------------------------------------------------------------------

const KEYRING_SERVICE: &str = "vasakos-account-manager";
const STORAGE_DIR_NAME: &str = "vasakos";
const STORAGE_FILE_NAME: &str = "accounts.json";

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
// AccountDatabase — lee/escribe accounts.json (mismo formato que el daemon)
// ---------------------------------------------------------------------------

struct AccountDatabase {
    path: PathBuf,
    accounts: Vec<Account>,
}

impl AccountDatabase {
    fn path() -> PathBuf {
        dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(STORAGE_DIR_NAME)
            .join(STORAGE_FILE_NAME)
    }

    fn new() -> Self {
        let path = Self::path();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        AccountDatabase {
            path,
            accounts: Vec::new(),
        }
    }

    fn load(&mut self) -> Result<(), String> {
        if !self.path.exists() {
            self.accounts.clear();
            return Ok(());
        }
        let data = std::fs::read_to_string(&self.path)
            .map_err(|e| format!("leer accounts.json: {e}"))?;
        self.accounts = serde_json::from_str(&data)
            .map_err(|e| format!("parsear accounts.json: {e}"))?;
        Ok(())
    }

    fn save(&self) -> Result<(), String> {
        let data = serde_json::to_string_pretty(&self.accounts)
            .map_err(|e| format!("serializar accounts.json: {e}"))?;
        std::fs::write(&self.path, data)
            .map_err(|e| format!("escribir accounts.json: {e}"))?;
        Ok(())
    }

    fn add(&mut self, account: Account) -> Result<String, String> {
        let id = account.id.clone();
        self.accounts.push(account);
        self.save()?;
        Ok(id)
    }

    fn all(&self) -> &[Account] {
        &self.accounts
    }

    fn get(&self, id: &str) -> Option<&Account> {
        self.accounts.iter().find(|a| a.id == id)
    }

    fn remove(&mut self, id: &str) -> Result<bool, String> {
        let len = self.accounts.len();
        self.accounts.retain(|a| a.id != id);
        if self.accounts.len() != len {
            self.save()?;
            Ok(true)
        } else {
            Ok(false)
        }
    }
}

// ---------------------------------------------------------------------------
// Keyring helpers
// ---------------------------------------------------------------------------

fn store_token(account_id: &str, token: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, account_id)
        .map_err(|e| format!("keyring entry: {e}"))?;
    entry.set_password(token)
        .map_err(|e| format!("keyring set_password: {e}"))?;
    Ok(())
}

fn get_token(account_id: &str) -> Result<String, String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, account_id)
        .map_err(|e| format!("keyring entry: {e}"))?;
    entry.get_password()
        .map_err(|e| format!("keyring get_password: {e}"))
}

fn delete_token(account_id: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, account_id)
        .map_err(|e| format!("keyring entry: {e}"))?;
    entry.delete_credential()
        .map_err(|e| format!("keyring delete: {e}"))
}

fn store_secret(account_id: &str, key: &str, secret: &str) -> Result<(), String> {
    let label = format!("{account_id}:{key}");
    let entry = keyring::Entry::new(KEYRING_SERVICE, &label)
        .map_err(|e| format!("keyring entry: {e}"))?;
    entry.set_password(secret)
        .map_err(|e| format!("keyring set_password: {e}"))?;
    Ok(())
}

fn delete_secret(account_id: &str, key: &str) -> Result<(), String> {
    let label = format!("{account_id}:{key}");
    let entry = keyring::Entry::new(KEYRING_SERVICE, &label)
        .map_err(|e| format!("keyring entry: {e}"))?;
    entry.delete_credential()
        .map_err(|e| format!("keyring delete: {e}"))
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Crea una cuenta nueva escribiendo directamente en el almacenamiento
/// compartido con el daemon (accounts.json + keyring).
#[tauri::command]
pub async fn register_new_account(
    provider: String,
    metadata: serde_json::Value,
    secret: String,
) -> Result<(), String> {
    let mut db = AccountDatabase::new();
    db.load()?;

    let account = Account {
        id: uuid::Uuid::new_v4().to_string(),
        display_name: metadata
            .get("display_name")
            .and_then(|v| v.as_str())
            .unwrap_or(&provider)
            .to_string(),
        provider_type: provider.clone(),
        capabilities: {
            let mut caps = HashMap::new();
            caps.insert(CapabilityType::Email, metadata.clone());
            caps
        },
    };

    let account_id = db.add(account)?;

    store_token(&account_id, &secret)?;

    log_debug(&format!(
        "Account registered (provider: {}, id: {})",
        provider, account_id
    ));

    Ok(())
}

/// Lista todas las cuentas desde accounts.json.
#[tauri::command]
pub async fn list_accounts() -> Result<Vec<AccountInfo>, String> {
    let mut db = AccountDatabase::new();
    db.load()?;

    let list = db
        .all()
        .iter()
        .map(|a| {
            let cap = a
                .capabilities
                .get(&CapabilityType::Email)
                .cloned()
                .and_then(|v| serde_json::from_value(v).ok())
                .unwrap_or_default();
            AccountInfo {
                id: a.id.clone(),
                provider: a.provider_type.clone(),
                display_name: a.display_name.clone(),
                metadata: cap,
                created_at: String::new(),
            }
        })
        .collect();

    Ok(list)
}

/// Elimina una cuenta de accounts.json y del keyring.
#[tauri::command]
pub async fn remove_account(account_id: String) -> Result<(), String> {
    let mut db = AccountDatabase::new();
    db.load()?;

    let removed = db.remove(&account_id)?;
    if !removed {
        return Err(format!("Account '{}' not found", account_id));
    }

    delete_token(&account_id).ok();
    delete_secret(&account_id, "refresh").ok();

    log_debug(&format!("Account removed: {}", account_id));
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
    let conn = Connection::session()
        .await
        .map_err(|e| format!("D-Bus session bus: {e}"))?;

    let proxy = zbus::ProxyBuilder::<zbus::Proxy<'_>>::new(&conn)
        .destination(ACCOUNT_MANAGER_DEST)
        .map_err(|e| format!("destination: {e}"))?
        .path(ACCOUNT_MANAGER_PATH)
        .map_err(|e| format!("path: {e}"))?
        .interface(ACCOUNT_MANAGER_IFACE)
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
    let conn = Connection::session()
        .await
        .map_err(|e| format!("D-Bus session bus: {e}"))?;

    let proxy = zbus::ProxyBuilder::<zbus::Proxy<'_>>::new(&conn)
        .destination(ACCOUNT_MANAGER_DEST)
        .map_err(|e| format!("destination: {e}"))?
        .path(ACCOUNT_MANAGER_PATH)
        .map_err(|e| format!("path: {e}"))?
        .interface(ACCOUNT_MANAGER_IFACE)
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
    let conn = Connection::session()
        .await
        .map_err(|e| format!("D-Bus session bus: {e}"))?;

    let proxy = zbus::ProxyBuilder::<zbus::Proxy<'_>>::new(&conn)
        .destination(ACCOUNT_MANAGER_DEST)
        .map_err(|e| format!("destination: {e}"))?
        .path(ACCOUNT_MANAGER_PATH)
        .map_err(|e| format!("path: {e}"))?
        .interface(ACCOUNT_MANAGER_IFACE)
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

use serde::{Deserialize, Serialize};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
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

/// El resumen que devuelve `ListAccounts`.
///
/// Es un resumen y no la cuenta entera porque listar no pide permiso: lo que
/// sale por ahí lo ve cualquier programa del usuario. La configuración completa
/// —el servidor, el client_id— sigue detrás de `GetAccountData`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountInfo {
    pub id: String,
    pub display_name: String,
    pub provider_type: String,
    pub capabilities: Vec<String>,
    /// El proveedor dejó de aceptar la autorización y hay que reconectarla. La
    /// pantalla lo muestra: si no, la cuenta queda en la lista fallando en
    /// silencio.
    pub needs_reauth: bool,
}

/// Un proveedor del catálogo del servicio.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderInfo {
    pub id: String,
    pub display_name: String,
    pub capabilities: Vec<String>,
    /// Si se puede empezar un flujo tal como está. Es lo único que la pantalla
    /// necesita para decidir si el botón va encendido.
    ///
    /// Para OAuth2 depende de que alguien haya dejado el `client_id`; los de
    /// Nextcloud están listos siempre, porque las credenciales las emite el
    /// servidor de la propia persona.
    pub configured: bool,
    /// `oauth2` o `nextcloud`. Decide qué le pide la pantalla a la persona: el
    /// primero abre el navegador directo, el segundo necesita la dirección del
    /// servidor antes de poder empezar.
    pub kind: String,
}

/// Lo que `BeginAuth` devuelve.
#[derive(Debug, Deserialize)]
struct AuthStart {
    request_id: String,
    auth_url: String,
    state: String,
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Registra una cuenta con credenciales de **contraseña**: IMAP/SMTP, CalDAV,
/// CardDAV.
///
/// Recibe **todas** las capacidades juntas y no una: una cuenta de servidor
/// propio suele traer el correo, el calendario y los contactos con la misma
/// contraseña, y registrarlas de a una crearía tres cuentas separadas para lo
/// que la persona configuró como una sola.
///
/// El secreto va derecho al almacén de root y este proceso no se queda con una
/// copia. Las cuentas OAuth2 **no** pasan por acá: van por
/// [`connect_oauth_account`], que es el único camino que guarda además las URLs
/// para renovar el token.
#[tauri::command]
pub async fn register_password_account(
    provider: String,
    display_name: String,
    capabilities: serde_json::Value,
    secret: String,
) -> Result<String, String> {
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

    log_debug(&format!("Cuenta registrada (proveedor: {provider}, id: {account_id})"));
    Ok(account_id)
}

/// Los proveedores OAuth2 que el servicio conoce.
///
/// Incluye los que no están configurados, con `configured: false`: la pantalla
/// los muestra apagados con el motivo, y eso es mejor que esconderlos — un
/// proveedor que no aparece parece un proveedor que no existe.
#[tauri::command]
pub async fn list_providers() -> Result<Vec<ProviderInfo>, String> {
    let connection = account_manager().await?;
    let reply = connection
        .call_method(
            Some(ACCOUNTS_SERVICE),
            ACCOUNTS_PATH,
            Some(ACCOUNTS_INTERFACE),
            "ListProviders",
            &(),
        )
        .await
        .map_err(|e| format!("No se pudieron leer los proveedores: {e}"))?;

    let raw: String = reply
        .body()
        .deserialize()
        .map_err(|e| format!("Respuesta inválida del gestor de cuentas: {e}"))?;

    serde_json::from_str(&raw).map_err(|e| format!("No se pudo interpretar el catálogo: {e}"))
}

/// Las cuentas que el servicio guarda para este usuario.
///
/// Metadatos nada más: un token nunca viaja por acá.
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

    serde_json::from_str(&raw).map_err(|e| format!("No se pudo interpretar la lista: {e}"))
}

/// Cómo salió el borrado de una cuenta.
#[derive(Debug, Deserialize, Serialize)]
pub struct AccountRemoval {
    pub removed: bool,
    /// Si se le pudo avisar al proveedor que la autorización terminó.
    ///
    /// Cuando es `false` la cuenta **igual se borró**: negarse dejaría a alguien
    /// sin poder sacar una cuenta por no tener red. Lo que queda es algo que
    /// puede terminar desde la web del proveedor, y por eso se informa en vez de
    /// callarse.
    pub revoked: bool,
    pub detail: String,
}

/// Borra una cuenta y le avisa al proveedor.
///
/// El servicio limpia los secretos junto con ella, así que no queda nada
/// guardando una credencial viva de este lado. Del otro lado, le avisa al
/// proveedor que la autorización terminó — sin eso, borrar la cuenta la escondía
/// en vez de cortar el acceso.
#[tauri::command]
pub async fn remove_account(account_id: String) -> Result<AccountRemoval, String> {
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

    let raw: String = reply
        .body()
        .deserialize()
        .map_err(|e| format!("Respuesta inválida del gestor de cuentas: {e}"))?;
    let resultado: AccountRemoval =
        serde_json::from_str(&raw).map_err(|e| format!("No se pudo interpretar la respuesta: {e}"))?;

    if !resultado.removed {
        return Err(format!("No se encontró la cuenta '{account_id}'"));
    }

    log_debug(&format!("Account removed: {account_id}"));
    Ok(resultado)
}

/// Guarda **tus** credenciales para un proveedor OAuth2.
///
/// VasakOS no incluye un `client_id` propio para Google ni para Microsoft:
/// registrarlo con Google para llegar al correo cuesta una evaluación de
/// seguridad paga y anual. El de cada quien se saca gratis de la consola del
/// proveedor, y esto es para pegarlo sin tener que editar un archivo del
/// sistema.
///
/// Sólo el identificador y el secreto: las URLs siguen saliendo de los archivos
/// que instala el paquete, así que desde acá no se puede apuntar un proveedor a
/// otro servidor.
#[tauri::command]
pub async fn set_provider_credentials(
    provider_id: String,
    client_id: String,
    client_secret: String,
) -> Result<(), String> {
    let connection = account_manager().await?;
    connection
        .call_method(
            Some(ACCOUNTS_SERVICE),
            ACCOUNTS_PATH,
            Some(ACCOUNTS_INTERFACE),
            "SetProviderCredentials",
            &(
                provider_id.as_str(),
                client_id.as_str(),
                client_secret.as_str(),
            ),
        )
        .await
        .map_err(|e| format!("No se pudieron guardar las credenciales: {e}"))?;

    log_debug(&format!("Credenciales propias guardadas para {provider_id}"));
    Ok(())
}

/// Quita las credenciales propias de un proveedor.
///
/// Las cuentas ya conectadas siguen funcionando: cada una guarda el `client_id`
/// con el que se autorizó.
#[tauri::command]
pub async fn clear_provider_credentials(provider_id: String) -> Result<(), String> {
    let connection = account_manager().await?;
    connection
        .call_method(
            Some(ACCOUNTS_SERVICE),
            ACCOUNTS_PATH,
            Some(ACCOUNTS_INTERFACE),
            "ClearProviderCredentials",
            &(provider_id.as_str(),),
        )
        .await
        .map_err(|e| format!("No se pudieron quitar las credenciales: {e}"))?;

    log_debug(&format!("Credenciales propias de {provider_id} quitadas"));
    Ok(())
}

/// Conecta una cuenta OAuth2 de punta a punta.
///
/// Todo el flujo en **un** comando, y eso es deliberado. Ni el código de
/// autorización ni el `state` entran nunca al webview: si estuviera partido en
/// tres comandos, el código tendría que pasar por JavaScript entre uno y otro, y
/// el proceso que menos confianza merece de los tres terminaría manipulando la
/// pieza que se canjea por un token.
///
/// El `code_verifier` de PKCE vive en el servicio de cuentas y no pasa ni por
/// acá. Un código sin su verifier no sirve para nada, así que ni siquiera este
/// proceso maneja un secreto.
///
/// Los pasos:
///
///   1. Se abre un puerto en `127.0.0.1` — es adonde el proveedor va a devolver
///      el código, y el servicio rechaza cualquier destino que no sea local.
///   2. `BeginAuth` devuelve la URL, un `request_id` y el `state`.
///   3. Se abre el navegador del sistema y se espera la vuelta.
///   4. Se comprueba el `state` y se le pasa el código a `CompleteAuth`.
#[tauri::command]
pub async fn connect_oauth_account(
    provider_id: String,
    capabilities: Vec<String>,
    display_name: String,
) -> Result<String, String> {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("no se pudo abrir el puerto de retorno: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("no se pudo leer el puerto: {e}"))?
        .port();
    let redirect_uri = format!("http://127.0.0.1:{port}/callback");

    let connection = account_manager().await?;
    let inicio = begin_auth(&connection, &provider_id, &capabilities, &redirect_uri).await?;

    open::that(&inicio.auth_url).map_err(|e| {
        format!("no se pudo abrir el navegador: {e}. La dirección era {}", inicio.auth_url)
    })?;

    // Si la espera termina mal, el flujo queda ocupando lugar en el servicio
    // hasta que venza. Se cancela para que apretar el botón de nuevo funcione
    // en el momento y no en cinco minutos.
    let vuelta = wait_for_callback(listener).await;
    let (code, state) = match vuelta {
        Ok(par) => par,
        Err(e) => {
            cancel_auth(&connection, &inicio.request_id).await;
            return Err(e);
        }
    };

    if state != inicio.state {
        cancel_auth(&connection, &inicio.request_id).await;
        return Err(
            "la respuesta del navegador no corresponde a esta autorización; \
             volvé a intentarlo"
                .into(),
        );
    }

    complete_auth(&connection, &inicio.request_id, &code, &state, &display_name).await
}

async fn begin_auth(
    connection: &Connection,
    provider_id: &str,
    capabilities: &[String],
    redirect_uri: &str,
) -> Result<AuthStart, String> {
    let capacidades = serde_json::to_string(capabilities)
        .map_err(|e| format!("no se pudieron serializar las capacidades: {e}"))?;

    let reply = connection
        .call_method(
            Some(ACCOUNTS_SERVICE),
            ACCOUNTS_PATH,
            Some(ACCOUNTS_INTERFACE),
            "BeginAuth",
            &(provider_id, capacidades.as_str(), redirect_uri),
        )
        .await
        .map_err(|e| format!("No se pudo iniciar la autorización: {e}"))?;

    let raw: String = reply
        .body()
        .deserialize()
        .map_err(|e| format!("Respuesta inválida del gestor de cuentas: {e}"))?;

    serde_json::from_str(&raw).map_err(|e| format!("No se pudo interpretar la respuesta: {e}"))
}

async fn complete_auth(
    connection: &Connection,
    request_id: &str,
    code: &str,
    state: &str,
    display_name: &str,
) -> Result<String, String> {
    let reply = connection
        .call_method(
            Some(ACCOUNTS_SERVICE),
            ACCOUNTS_PATH,
            Some(ACCOUNTS_INTERFACE),
            "CompleteAuth",
            &(request_id, code, state, display_name),
        )
        .await
        .map_err(|e| format!("No se pudo completar la autorización: {e}"))?;

    let account_id: String = reply
        .body()
        .deserialize()
        .map_err(|e| format!("Respuesta inválida del gestor de cuentas: {e}"))?;

    log_debug(&format!("Cuenta OAuth2 conectada (id: {account_id})"));
    Ok(account_id)
}

/// Descarta un flujo abandonado. Un fallo acá no se le cuenta a nadie: el
/// error que importa es el que llevó a cancelar, y el flujo vence solo.
async fn cancel_auth(connection: &Connection, request_id: &str) {
    let _ = connection
        .call_method(
            Some(ACCOUNTS_SERVICE),
            ACCOUNTS_PATH,
            Some(ACCOUNTS_INTERFACE),
            "CancelAuth",
            &(request_id,),
        )
        .await;
}

/// Conecta una cuenta de Nextcloud de punta a punta.
///
/// Un solo comando, por lo mismo que el de OAuth2: la contraseña de aplicación
/// no tiene por qué pasar por el webview. Acá tampoco pasa por este proceso —
/// el servicio de cuentas la recibe del servidor, la guarda, y devuelve nada más
/// que el identificador de la cuenta.
///
/// El bucle de sondeo vive de este lado a propósito. Un método D-Bus que se
/// queda esperando a que la persona escriba su contraseña en el navegador supera
/// el tiempo de espera del bus, y lo que llegaría al cliente sería un error de
/// transporte y no una respuesta.
#[tauri::command]
pub async fn connect_nextcloud_account(
    server: String,
    display_name: String,
) -> Result<String, String> {
    let connection = account_manager().await?;

    let reply = connection
        .call_method(
            Some(ACCOUNTS_SERVICE),
            ACCOUNTS_PATH,
            Some(ACCOUNTS_INTERFACE),
            "BeginNextcloudLogin",
            &(server.as_str(), display_name.as_str()),
        )
        .await
        .map_err(|e| format!("No se pudo iniciar el inicio de sesión: {e}"))?;

    let raw: String = reply
        .body()
        .deserialize()
        .map_err(|e| format!("Respuesta inválida del gestor de cuentas: {e}"))?;
    let inicio: NextcloudLoginStart =
        serde_json::from_str(&raw).map_err(|e| format!("No se pudo interpretar la respuesta: {e}"))?;

    open::that(&inicio.login_url).map_err(|e| {
        format!(
            "no se pudo abrir el navegador: {e}. La dirección era {}",
            inicio.login_url
        )
    })?;

    poll_until_done(&connection, &inicio.request_id).await
}

#[derive(Debug, Deserialize)]
struct NextcloudLoginStart {
    request_id: String,
    login_url: String,
}

#[derive(Debug, Deserialize)]
struct NextcloudPoll {
    status: String,
    #[serde(default)]
    account_id: Option<String>,
}

/// Cada cuánto se le pregunta al servicio si la persona ya terminó.
///
/// Dos segundos: bastante seguido para que la ventana reaccione en cuanto se
/// aprueba, y bastante espaciado para no golpear el servidor de alguien con
/// decenas de peticiones por minuto.
const INTERVALO_DE_SONDEO: std::time::Duration = std::time::Duration::from_secs(2);

/// Sondea hasta que el servidor entregue las credenciales.
///
/// El tope es el mismo que el del servicio, que descarta el flujo a los cinco
/// minutos. Esperar más sería sondear contra un `request_id` que ya no existe, y
/// el error diría «autorización desconocida» en vez de «se te fue el tiempo».
async fn poll_until_done(connection: &Connection, request_id: &str) -> Result<String, String> {
    let limite = std::time::Instant::now() + ESPERA_DEL_CALLBACK;

    while std::time::Instant::now() < limite {
        tokio::time::sleep(INTERVALO_DE_SONDEO).await;

        let reply = connection
            .call_method(
                Some(ACCOUNTS_SERVICE),
                ACCOUNTS_PATH,
                Some(ACCOUNTS_INTERFACE),
                "PollNextcloudLogin",
                &(request_id,),
            )
            .await
            .map_err(|e| format!("Falló el sondeo: {e}"))?;

        let raw: String = reply
            .body()
            .deserialize()
            .map_err(|e| format!("Respuesta inválida del gestor de cuentas: {e}"))?;
        let estado: NextcloudPoll = serde_json::from_str(&raw)
            .map_err(|e| format!("No se pudo interpretar el sondeo: {e}"))?;

        if estado.status == "done" {
            let account_id = estado
                .account_id
                .ok_or_else(|| "el servicio dijo «listo» sin dar la cuenta".to_string())?;
            log_debug(&format!("Cuenta de Nextcloud conectada (id: {account_id})"));
            return Ok(account_id);
        }
    }

    Err("se agotó el tiempo esperando que apruebes el acceso en el navegador".into())
}

/// Cuánto se espera a que la persona termine en el navegador.
///
/// El mismo tiempo que el servicio le da al flujo. Si acá se esperara más, la
/// espera terminaría contra un `request_id` que ya venció y el error diría
/// «autorización desconocida» en vez de «se te fue el tiempo».
const ESPERA_DEL_CALLBACK: std::time::Duration = std::time::Duration::from_secs(300);

/// Espera la vuelta del navegador y devuelve `(code, state)`.
async fn wait_for_callback(listener: tokio::net::TcpListener) -> Result<(String, String), String> {
    let (mut stream, _) = tokio::time::timeout(ESPERA_DEL_CALLBACK, listener.accept())
        .await
        .map_err(|_| {
            "se agotó el tiempo esperando la respuesta del navegador".to_string()
        })?
        .map_err(|e| format!("falló la conexión de retorno: {e}"))?;

    let mut buffer = vec![0u8; 8192];
    let leidos = stream
        .read(&mut buffer)
        .await
        .map_err(|e| format!("no se pudo leer la respuesta: {e}"))?;
    let pedido = String::from_utf8_lossy(&buffer[..leidos]);

    let resultado = parse_callback(&pedido);

    // Se le contesta al navegador en los dos casos: si no, la pestaña queda
    // colgada y la persona no sabe si puede cerrarla.
    let cuerpo = match &resultado {
        Ok(_) => pagina(
            "✓ Cuenta conectada",
            "Ya podés cerrar esta pestaña y volver a Configuración.",
        ),
        Err(motivo) => pagina("No se pudo conectar la cuenta", motivo),
    };
    let respuesta = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\
         Content-Length: {}\r\nConnection: close\r\n\r\n{}",
        cuerpo.len(),
        cuerpo,
    );
    let _ = stream.write_all(respuesta.as_bytes()).await;

    resultado
}

/// Saca `code` y `state` de la primera línea del pedido HTTP.
///
/// La versión anterior de esto tenía dos problemas que este parseo evita. No
/// miraba el parámetro `error`, así que cuando la persona apretaba «cancelar» en
/// la pantalla del proveedor el mensaje era «no se encontró el código de
/// autorización» — cierto y completamente inútil. Y no devolvía el `state`, que
/// es lo que permite comprobar que la vuelta corresponde al flujo que se empezó.
fn parse_callback(pedido: &str) -> Result<(String, String), String> {
    let linea = pedido.lines().next().unwrap_or_default();
    let ruta = linea
        .split_whitespace()
        .nth(1)
        .ok_or_else(|| "el navegador mandó algo que no es un pedido HTTP".to_string())?;

    let consulta = ruta.split_once('?').map(|(_, q)| q).unwrap_or("");
    let mut code = None;
    let mut state = None;
    let mut error = None;
    let mut descripcion = None;

    for (clave, valor) in url::form_urlencoded::parse(consulta.as_bytes()) {
        match clave.as_ref() {
            "code" => code = Some(valor.into_owned()),
            "state" => state = Some(valor.into_owned()),
            "error" => error = Some(valor.into_owned()),
            "error_description" => descripcion = Some(valor.into_owned()),
            _ => {}
        }
    }

    if let Some(error) = error {
        // `access_denied` es lo que manda el proveedor cuando la persona dice
        // que no. No es un fallo y no tiene que sonar como uno.
        if error == "access_denied" {
            return Err("no se autorizó el acceso a la cuenta".into());
        }
        return Err(match descripcion {
            Some(detalle) => format!("el proveedor rechazó la autorización: {error} ({detalle})"),
            None => format!("el proveedor rechazó la autorización: {error}"),
        });
    }

    match (code, state) {
        (Some(code), Some(state)) => Ok((code, state)),
        (None, _) => Err("la respuesta del navegador no trae el código de autorización".into()),
        (_, None) => Err("la respuesta del navegador no trae el state".into()),
    }
}

/// La página que ve la persona en la pestaña del navegador.
///
/// El mensaje se escapa: llega del proveedor por la URL, así que meterlo crudo
/// en el HTML sería dejar que el texto de un parámetro de consulta escriba
/// etiquetas en una página servida desde 127.0.0.1.
fn pagina(titulo: &str, mensaje: &str) -> String {
    format!(
        "<!DOCTYPE html>\n<html lang=\"es\"><head><meta charset=\"utf-8\">\
         <title>{titulo}</title></head>\
         <body style=\"display:flex;align-items:center;justify-content:center;\
         height:100vh;margin:0;font-family:sans-serif;background:#1a1a2e;color:#e0e0e0;\">\
         <div style=\"text-align:center;max-width:32rem;padding:1rem;\">\
         <h1>{titulo}</h1><p>{mensaje}</p></div></body></html>\n",
        titulo = escapar(titulo),
        mensaje = escapar(mensaje),
    )
}

fn escapar(texto: &str) -> String {
    texto
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
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

#[cfg(test)]
mod tests {
    use super::*;

    fn pedido(consulta: &str) -> String {
        format!("GET /callback?{consulta} HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n")
    }

    #[test]
    fn se_saca_el_codigo_y_el_state() {
        let (code, state) = parse_callback(&pedido("code=abc123&state=xyz789")).unwrap();
        assert_eq!(code, "abc123");
        assert_eq!(state, "xyz789");
    }

    /// El `state` es lo que permite comprobar que la vuelta corresponde al flujo
    /// que se empezó. La versión anterior de este parseo no lo devolvía, así que
    /// no había con qué comprobarlo.
    #[test]
    fn sin_state_no_se_acepta() {
        let error = parse_callback(&pedido("code=abc123")).unwrap_err();
        assert!(error.contains("state"), "{error}");
    }

    #[test]
    fn sin_codigo_no_se_acepta() {
        let error = parse_callback(&pedido("state=xyz")).unwrap_err();
        assert!(error.contains("código"), "{error}");
    }

    /// Antes, apretar «cancelar» en la pantalla del proveedor daba «no se
    /// encontró el código de autorización»: cierto y completamente inútil.
    #[test]
    fn cancelar_en_el_proveedor_no_suena_a_fallo() {
        let error = parse_callback(&pedido("error=access_denied&state=xyz")).unwrap_err();
        assert_eq!(error, "no se autorizó el acceso a la cuenta");
        assert!(!error.contains("código"), "no es un problema del código: {error}");
    }

    #[test]
    fn otro_error_del_proveedor_se_cuenta_con_su_detalle() {
        let error = parse_callback(&pedido(
            "error=invalid_scope&error_description=Some+scope+is+invalid",
        ))
        .unwrap_err();
        assert!(error.contains("invalid_scope"), "{error}");
        assert!(error.contains("Some scope is invalid"), "{error}");
    }

    /// El código viene percent-encoded: Google usa `/` en los suyos y llegan
    /// como `%2F`. Sin decodificar, el canje falla con `invalid_grant` y parece
    /// que la autorización se revocó.
    #[test]
    fn el_codigo_llega_decodificado() {
        let (code, _) = parse_callback(&pedido("code=4%2F0Ab_5q&state=xyz")).unwrap();
        assert_eq!(code, "4/0Ab_5q");
    }

    #[test]
    fn un_pedido_que_no_es_http_se_rechaza() {
        for basura in ["", "\r\n\r\n", "basura"] {
            assert!(parse_callback(basura).is_err(), "{basura:?} tenía que rechazarse");
        }
    }

    /// El mensaje de error llega del proveedor por la URL. Sin escapar, el texto
    /// de un parámetro de consulta escribiría etiquetas en una página servida
    /// desde 127.0.0.1.
    #[test]
    fn el_mensaje_del_proveedor_no_puede_escribir_html() {
        let html = pagina("Título", "<script>alert(1)</script>");
        assert!(!html.contains("<script>"), "{html}");
        assert!(html.contains("&lt;script&gt;"), "{html}");
    }

    #[test]
    fn la_espera_coincide_con_la_del_servicio() {
        // El servicio le da cinco minutos al flujo. Esperar más acá terminaría
        // contra un request_id vencido, y el error diría «autorización
        // desconocida» en vez de «se te fue el tiempo».
        assert_eq!(ESPERA_DEL_CALLBACK, std::time::Duration::from_secs(300));
    }
}

#[cfg(test)]
mod tests_nextcloud {
    use super::*;

    #[test]
    fn se_interpreta_el_inicio_de_sesion() {
        let inicio: NextcloudLoginStart = serde_json::from_str(
            r#"{"request_id":"abc","login_url":"https://nube.ejemplo.com/index.php/login/v2/flow/xyz"}"#,
        )
        .unwrap();
        assert_eq!(inicio.request_id, "abc");
        assert!(inicio.login_url.starts_with("https://"));
    }

    /// El caso normal de los primeros sondeos. Si `account_id` no fuera
    /// opcional, la respuesta «pendiente» no se podría interpretar y el bucle
    /// cortaría con un error en el primer intento.
    #[test]
    fn un_sondeo_pendiente_no_trae_cuenta_y_esta_bien() {
        let estado: NextcloudPoll = serde_json::from_str(r#"{"status":"pending"}"#).unwrap();
        assert_eq!(estado.status, "pending");
        assert_eq!(estado.account_id, None);
    }

    #[test]
    fn un_sondeo_terminado_trae_la_cuenta() {
        let estado: NextcloudPoll =
            serde_json::from_str(r#"{"status":"done","account_id":"la-cuenta"}"#).unwrap();
        assert_eq!(estado.status, "done");
        assert_eq!(estado.account_id.as_deref(), Some("la-cuenta"));
    }

    /// El tope del bucle es el mismo que el del servicio, que descarta el flujo
    /// a los cinco minutos. Sondear más allá sería preguntar por un
    /// `request_id` que ya no existe, y el error diría «autorización
    /// desconocida» en vez de «se te fue el tiempo».
    #[test]
    fn el_bucle_no_sondea_mas_alla_de_lo_que_el_servicio_recuerda() {
        assert_eq!(ESPERA_DEL_CALLBACK, std::time::Duration::from_secs(300));
        assert!(
            INTERVALO_DE_SONDEO < ESPERA_DEL_CALLBACK,
            "el intervalo tiene que caber en la espera"
        );
        // Y bastante espaciado para no golpear el servidor de alguien con
        // decenas de peticiones por minuto.
        assert!(INTERVALO_DE_SONDEO >= std::time::Duration::from_secs(1));
    }
}

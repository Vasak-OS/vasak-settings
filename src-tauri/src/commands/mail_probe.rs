//! Probar que una cuenta de correo funciona **antes** de guardarla.
//!
//! Hasta acá el formulario del servidor personalizado guardaba a ciegas: sólo
//! comprobaba que los campos no estuvieran vacíos y que el puerto fuera un
//! número. Un servidor mal tipeado, un puerto cambiado o una contraseña vieja se
//! descubrían mucho después, cuando alguna aplicación pedía el token y fallaba
//! con un error que no señalaba a la pantalla donde se había cometido el error.
//!
//! ── Por qué esto corre acá y no en el servicio de cuentas ───────────────────
//!
//! Porque la contraseña ya está en este proceso: la persona la acaba de
//! escribir. Probarla desde acá no la expone a nada nuevo. En cambio meter un
//! cliente de IMAP y otro de SMTP dentro de `vasak-accounts` —que corre como
//! root— significaría parsear la respuesta de un servidor cualquiera con los
//! permisos más altos del sistema, y por exactamente esa razón el bucle de
//! sincronización también va a vivir fuera de root.
//!
//! ── Lo que esta prueba **no** es ────────────────────────────────────────────
//!
//! No es un control de seguridad. El servicio de cuentas no puede verificar que
//! un cliente haya probado nada, y no le pide que lo haga: guardar una cuenta
//! que no anda sólo te perjudica a vos. Esto es una ayuda para encontrar el
//! error de tipeo en el momento en que se puede corregir.

use std::sync::Arc;
use std::time::Duration;

use base64::Engine;
use serde::Serialize;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;
use tokio_rustls::rustls::pki_types::ServerName;
use tokio_rustls::rustls::{ClientConfig, RootCertStore};
use tokio_rustls::TlsConnector;

/// Tope de toda la prueba de un protocolo.
///
/// Un puerto que traga los paquetes sin contestar no da error: se queda
/// esperando. Sin este tope, escribir el puerto de al lado dejaría la ventana
/// colgada sin decir nada.
const TIMEOUT: Duration = Duration::from_secs(15);

/// Tope de una línea de respuesta.
///
/// Los dos protocolos son de líneas cortas. Sin tope, un servidor que manda
/// bytes sin cortar nunca hace crecer la memoria de la ventana sin límite.
const MAX_LINEA: u64 = 8 * 1024;

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct ProbeOutcome {
    pub ok: bool,
    /// Qué pasó, en términos de lo que la persona puede arreglar.
    pub detail: String,
}

impl ProbeOutcome {
    fn ok() -> Self {
        Self { ok: true, detail: String::new() }
    }
    fn fallo(detalle: impl Into<String>) -> Self {
        Self { ok: false, detail: detalle.into() }
    }
}

/// Los dos por separado, y eso importa: es muy común que el de entrada funcione
/// y el de salida no —puertos distintos, y muchos proveedores exigen
/// autenticación sólo en uno—. Un resultado único diría «no anda» sin decir
/// cuál de los dos campos hay que mirar.
#[derive(Debug, Serialize)]
pub struct MailProbe {
    pub imap: ProbeOutcome,
    pub smtp: ProbeOutcome,
}

// ---------------------------------------------------------------------------
// Lo que se puede probar sin red
// ---------------------------------------------------------------------------

/// Si el puerto implica TLS desde el primer byte o hay que negociarlo después.
///
/// 993 y 465 son los puertos de TLS implícito; en 143 y 587 se arranca en claro
/// y se sube con STARTTLS. Elegir mal no da un error de red sino un cuelgue o
/// basura ilegible, así que se decide por el puerto y no probando.
pub fn tls_implicito(puerto: u16, protocolo: Protocolo) -> bool {
    match protocolo {
        Protocolo::Imap => puerto == 993,
        Protocolo::Smtp => puerto == 465,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Protocolo {
    Imap,
    Smtp,
}

/// Escapa un texto para meterlo entre comillas en un comando IMAP.
///
/// Devuelve `None` si no se puede: un salto de línea partiría el comando en dos
/// y lo que siga se interpretaría como un comando nuevo. Es la inyección clásica
/// de este protocolo, y una contraseña con un salto de línea no es algo que haya
/// que aceptar y arreglar — es algo que hay que rechazar.
pub fn comillas_imap(texto: &str) -> Option<String> {
    if texto.contains(['\r', '\n', '\0']) {
        return None;
    }
    let escapado = texto.replace('\\', "\\\\").replace('"', "\\\"");
    Some(format!("\"{escapado}\""))
}

/// El estado de una respuesta con etiqueta de IMAP.
#[derive(Debug, PartialEq, Eq)]
pub enum EstadoImap {
    Ok,
    /// El servidor entendió y dijo que no: contraseña equivocada, casi siempre.
    No(String),
    /// El servidor no entendió: es un problema del comando, no de la cuenta.
    Bad(String),
}

/// Interpreta una línea de IMAP contra la etiqueta que se mandó.
///
/// Devuelve `None` para las líneas que no son la respuesta final —las que
/// empiezan con `*` son datos sin pedir, y el servidor puede mandar varias antes
/// de contestar—. Confundirlas con la respuesta haría que la prueba diera por
/// buena una sesión que todavía no se autenticó.
pub fn estado_imap(linea: &str, etiqueta: &str) -> Option<EstadoImap> {
    let resto = linea.strip_prefix(etiqueta)?.strip_prefix(' ')?;
    let (estado, detalle) = resto.split_once(' ').unwrap_or((resto, ""));
    match estado.to_ascii_uppercase().as_str() {
        "OK" => Some(EstadoImap::Ok),
        "NO" => Some(EstadoImap::No(detalle.trim().to_string())),
        "BAD" => Some(EstadoImap::Bad(detalle.trim().to_string())),
        _ => None,
    }
}

/// El código de una línea de SMTP, y si la respuesta sigue.
///
/// En una respuesta de varias líneas todas llevan el código y un `-`; la última
/// lleva un espacio. Leer sólo la primera dejaría el resto en el búfer y la
/// respuesta siguiente empezaría desalineada.
pub fn linea_smtp(linea: &str) -> Option<(u16, bool, String)> {
    if linea.len() < 4 {
        return None;
    }
    let codigo: u16 = linea.get(..3)?.parse().ok()?;
    let separador = linea.as_bytes()[3];
    let sigue = match separador {
        b'-' => true,
        b' ' => false,
        _ => return None,
    };
    Some((codigo, sigue, linea[4..].trim_end().to_string()))
}

/// Los mecanismos de autenticación que anuncia un EHLO.
///
/// Hace falta porque no todos los servidores aceptan los mismos: elegir uno a
/// ciegas haría que la prueba fallara sobre una cuenta que anda, que es el peor
/// resultado posible — le diría a la persona que se equivocó cuando no.
pub fn mecanismos_de_auth(ehlo: &str) -> Vec<String> {
    ehlo.lines()
        .filter_map(|linea| {
            let sin_codigo = linea.get(4..).unwrap_or(linea).trim();
            let resto = sin_codigo
                .strip_prefix("AUTH ")
                .or_else(|| sin_codigo.strip_prefix("auth "))?;
            Some(resto.split_whitespace().map(str::to_uppercase).collect::<Vec<_>>())
        })
        .flatten()
        .collect()
}

/// El cuerpo de un `AUTH PLAIN`: usuario y contraseña separados por bytes nulos.
pub fn carga_auth_plain(usuario: &str, contrasena: &str) -> String {
    let crudo = format!("\0{usuario}\0{contrasena}");
    base64::engine::general_purpose::STANDARD.encode(crudo)
}

/// Traduce el fallo a algo sobre lo que se pueda actuar.
///
/// Es la mitad del valor de toda la prueba. «Error de conexión» manda a mirar
/// los cuatro campos; «el certificado del servidor no es de confianza» manda
/// directo al que corresponde.
pub fn explicar(error: &std::io::Error, host: &str, puerto: u16) -> String {
    use std::io::ErrorKind;
    let texto = error.to_string();

    // El certificado se comprueba contra las CA del sistema, así que este caso
    // es habitual en un servidor casero — y no tiene nada que ver con la
    // contraseña, que es adonde la gente mira primero.
    if texto.contains("certificate") || texto.contains("CertificateError") || texto.contains("UnknownIssuer") {
        return format!(
            "el certificado de {host} no es de confianza para este equipo ({texto}). \
             No es un problema de tu contraseña"
        );
    }
    if texto.contains("NotValidForName") {
        return format!("el certificado de {host} es de otro dominio ({texto})");
    }

    match error.kind() {
        ErrorKind::ConnectionRefused => format!(
            "{host} rechazó la conexión en el puerto {puerto}. \
             ¿Es el puerto correcto?"
        ),
        ErrorKind::TimedOut => format!(
            "{host}:{puerto} no contestó a tiempo. Un puerto equivocado suele \
             quedarse callado en vez de dar error"
        ),
        _ => format!("no se pudo conectar a {host}:{puerto}: {texto}"),
    }
}

// ---------------------------------------------------------------------------
// La parte que habla por la red
// ---------------------------------------------------------------------------

trait Flujo: tokio::io::AsyncRead + AsyncWrite + Unpin + Send {}
impl<T: tokio::io::AsyncRead + AsyncWrite + Unpin + Send> Flujo for T {}

fn tls() -> std::io::Result<TlsConnector> {
    let mut raices = RootCertStore::empty();
    let cargadas = rustls_native_certs::load_native_certs();
    for certificado in cargadas.certs {
        let _ = raices.add(certificado);
    }
    if raices.is_empty() {
        return Err(std::io::Error::other(
            "no hay certificados de confianza instalados en el equipo",
        ));
    }

    let config = ClientConfig::builder()
        .with_root_certificates(raices)
        .with_no_client_auth();
    Ok(TlsConnector::from(Arc::new(config)))
}

async fn cifrar(tcp: TcpStream, host: &str) -> std::io::Result<Box<dyn Flujo>> {
    let nombre = ServerName::try_from(host.to_string())
        .map_err(|e| std::io::Error::other(format!("«{host}» no es un nombre de servidor: {e}")))?;
    Ok(Box::new(tls()?.connect(nombre, tcp).await?))
}

async fn escribir(flujo: &mut (impl AsyncWrite + Unpin), linea: &str) -> std::io::Result<()> {
    flujo.write_all(linea.as_bytes()).await?;
    flujo.write_all(b"\r\n").await?;
    flujo.flush().await
}

/// Lee una línea **sin leer de más**.
///
/// Es lo que hace posible STARTTLS. Un lector con búfer se adelanta y se queda
/// con bytes que todavía no le tocan; si eso pasa justo antes de subir a TLS,
/// esos bytes quedan atrapados fuera del flujo cifrado y el saludo siguiente se
/// lee corrido. Durante la parte en claro se lee de a un byte —son cuatro líneas
/// cortas— y recién después se pone el búfer.
async fn leer_linea_cruda(flujo: &mut TcpStream) -> std::io::Result<String> {
    let mut linea = Vec::new();
    let mut byte = [0u8; 1];
    loop {
        if flujo.read_exact(&mut byte).await.is_err() {
            return Err(std::io::Error::other("el servidor cortó la conexión"));
        }
        if byte[0] == b'\n' {
            break;
        }
        linea.push(byte[0]);
        if linea.len() as u64 > MAX_LINEA {
            return Err(std::io::Error::other("el servidor mandó una línea sin fin"));
        }
    }
    Ok(String::from_utf8_lossy(&linea).trim_end().to_string())
}

async fn leer_linea(lector: &mut BufReader<Box<dyn Flujo>>) -> std::io::Result<String> {
    let mut linea = String::new();
    let leidos = tokio::io::AsyncReadExt::take(&mut *lector, MAX_LINEA)
        .read_line(&mut linea)
        .await?;
    if leidos == 0 {
        return Err(std::io::Error::other("el servidor cortó la conexión"));
    }
    Ok(linea.trim_end().to_string())
}

/// Lee una respuesta de SMTP completa, incluidas las de varias líneas.
async fn leer_respuesta_smtp(
    lector: &mut BufReader<Box<dyn Flujo>>,
) -> std::io::Result<(u16, String)> {
    let mut texto = String::new();
    loop {
        let linea = leer_linea(lector).await?;
        let Some((codigo, sigue, _)) = linea_smtp(&linea) else {
            return Err(std::io::Error::other(format!(
                "el servidor contestó algo que no es SMTP: {linea}"
            )));
        };
        texto.push_str(&linea);
        texto.push('\n');
        if !sigue {
            return Ok((codigo, texto));
        }
    }
}

/// La versión sin búfer, para la parte en claro previa a STARTTLS.
async fn leer_respuesta_smtp_cruda(flujo: &mut TcpStream) -> std::io::Result<(u16, String)> {
    let mut texto = String::new();
    loop {
        let linea = leer_linea_cruda(flujo).await?;
        let Some((codigo, sigue, _)) = linea_smtp(&linea) else {
            return Err(std::io::Error::other(format!(
                "el servidor contestó algo que no es SMTP: {linea}"
            )));
        };
        texto.push_str(&linea);
        texto.push('\n');
        if !sigue {
            return Ok((codigo, texto));
        }
    }
}

/// Abre la conexión y la deja cifrada, negociando STARTTLS si hace falta.
///
/// **Siempre termina en TLS.** Un servidor que no ofrece STARTTLS en un puerto
/// en claro no es un servidor con el que se pueda probar una contraseña: se
/// mandaría en claro por la red. Se falla y se dice qué puerto usar en su lugar.
async fn abrir_imap(host: &str, puerto: u16) -> std::io::Result<BufReader<Box<dyn Flujo>>> {
    let mut tcp = TcpStream::connect((host, puerto)).await?;

    if tls_implicito(puerto, Protocolo::Imap) {
        let cifrado = cifrar(tcp, host).await?;
        let mut lector = BufReader::new(cifrado);
        saludo_imap(&mut lector).await?;
        return Ok(lector);
    }

    // En claro: saludo, STARTTLS, y recién ahí se cifra.
    let saludo = leer_linea_cruda(&mut tcp).await?;
    rechazar_bye(&saludo)?;

    escribir(&mut tcp, "a0 STARTTLS").await?;
    loop {
        let linea = leer_linea_cruda(&mut tcp).await?;
        match estado_imap(&linea, "a0") {
            Some(EstadoImap::Ok) => break,
            Some(_) => {
                return Err(std::io::Error::other(format!(
                    "{host} no acepta STARTTLS en el puerto {puerto}, así que la \
                     contraseña viajaría sin cifrar. Probá con el 993"
                )))
            }
            None => continue,
        }
    }

    // El saludo ya se leyó del lado en claro, así que después de cifrar se va
    // derecho al LOGIN: el servidor no vuelve a saludar.
    Ok(BufReader::new(cifrar(tcp, host).await?))
}

async fn saludo_imap(lector: &mut BufReader<Box<dyn Flujo>>) -> std::io::Result<()> {
    let saludo = leer_linea(lector).await?;
    rechazar_bye(&saludo)
}

/// Un `* BYE` de entrada es el servidor rechazando al cliente antes de que diga
/// nada — suele ser un bloqueo por dirección IP, no un problema de la cuenta.
fn rechazar_bye(saludo: &str) -> std::io::Result<()> {
    if saludo.starts_with("* BYE") {
        return Err(std::io::Error::other(format!(
            "el servidor cerró la conexión de entrada: {saludo}"
        )));
    }
    Ok(())
}

/// Lo mismo para SMTP: siempre termina cifrado.
async fn abrir_smtp(host: &str, puerto: u16) -> std::io::Result<(BufReader<Box<dyn Flujo>>, String)> {
    let mut tcp = TcpStream::connect((host, puerto)).await?;

    if tls_implicito(puerto, Protocolo::Smtp) {
        let mut lector = BufReader::new(cifrar(tcp, host).await?);
        esperar_saludo_smtp(&mut lector).await?;
        let ehlo = ehlo(&mut lector).await?;
        return Ok((lector, ehlo));
    }

    let (codigo, texto) = leer_respuesta_smtp_cruda(&mut tcp).await?;
    if codigo != 220 {
        return Err(std::io::Error::other(format!(
            "el servidor saludó con {codigo}: {texto}"
        )));
    }

    escribir(&mut tcp, "EHLO localhost").await?;
    let (codigo, primer_ehlo) = leer_respuesta_smtp_cruda(&mut tcp).await?;
    if codigo != 250 {
        return Err(std::io::Error::other(format!(
            "el servidor rechazó el saludo con {codigo}: {primer_ehlo}"
        )));
    }

    if !primer_ehlo.to_uppercase().contains("STARTTLS") {
        return Err(std::io::Error::other(format!(
            "{host} no ofrece STARTTLS en el puerto {puerto}, así que la \
             contraseña viajaría sin cifrar. Probá con el 465"
        )));
    }

    escribir(&mut tcp, "STARTTLS").await?;
    let (codigo, texto) = leer_respuesta_smtp_cruda(&mut tcp).await?;
    if codigo != 220 {
        return Err(std::io::Error::other(format!(
            "el servidor rechazó STARTTLS con {codigo}: {texto}"
        )));
    }

    // El EHLO se repite sobre el canal cifrado, y **no es una formalidad**: la
    // lista de mecanismos de autenticación cambia — muchos servidores no
    // ofrecen ninguno hasta que la conexión está cifrada, con toda razón.
    let mut lector = BufReader::new(cifrar(tcp, host).await?);
    let ehlo = ehlo(&mut lector).await?;
    Ok((lector, ehlo))
}

async fn esperar_saludo_smtp(lector: &mut BufReader<Box<dyn Flujo>>) -> std::io::Result<()> {
    let (codigo, texto) = leer_respuesta_smtp(lector).await?;
    if codigo != 220 {
        return Err(std::io::Error::other(format!(
            "el servidor saludó con {codigo}: {texto}"
        )));
    }
    Ok(())
}

async fn ehlo(lector: &mut BufReader<Box<dyn Flujo>>) -> std::io::Result<String> {
    escribir(lector.get_mut(), "EHLO localhost").await?;
    let (codigo, texto) = leer_respuesta_smtp(lector).await?;
    if codigo != 250 {
        return Err(std::io::Error::other(format!(
            "el servidor rechazó el saludo con {codigo}: {texto}"
        )));
    }
    Ok(texto)
}

async fn probar_imap(host: &str, puerto: u16, usuario: &str, contrasena: &str) -> ProbeOutcome {
    let (Some(usuario_citado), Some(contrasena_citada)) =
        (comillas_imap(usuario), comillas_imap(contrasena))
    else {
        return ProbeOutcome::fallo(
            "el usuario o la contraseña tienen un salto de línea, y eso no se \
             puede mandar por IMAP",
        );
    };

    let resultado = tokio::time::timeout(TIMEOUT, async {
        let mut lector = abrir_imap(host, puerto).await?;

        escribir(
            lector.get_mut(),
            &format!("a1 LOGIN {usuario_citado} {contrasena_citada}"),
        )
        .await?;

        let estado = loop {
            let linea = leer_linea(&mut lector).await?;
            if let Some(estado) = estado_imap(&linea, "a1") {
                break estado;
            }
        };

        let _ = escribir(lector.get_mut(), "a2 LOGOUT").await;
        Ok::<_, std::io::Error>(estado)
    })
    .await;

    match resultado {
        Err(_) => ProbeOutcome::fallo(format!(
            "{host}:{puerto} no contestó en {} segundos",
            TIMEOUT.as_secs()
        )),
        Ok(Err(e)) => ProbeOutcome::fallo(explicar(&e, host, puerto)),
        Ok(Ok(EstadoImap::Ok)) => ProbeOutcome::ok(),
        Ok(Ok(EstadoImap::No(detalle))) => ProbeOutcome::fallo(format!(
            "el servidor rechazó el usuario o la contraseña ({detalle}). \
             Si tenés verificación en dos pasos, hace falta una contraseña de aplicación"
        )),
        Ok(Ok(EstadoImap::Bad(detalle))) => {
            ProbeOutcome::fallo(format!("el servidor no entendió el pedido: {detalle}"))
        }
    }
}

async fn probar_smtp(host: &str, puerto: u16, usuario: &str, contrasena: &str) -> ProbeOutcome {
    let resultado = tokio::time::timeout(TIMEOUT, async {
        let (mut lector, saludo) = abrir_smtp(host, puerto).await?;

        let mecanismos = mecanismos_de_auth(&saludo);
        if mecanismos.is_empty() {
            return Err(std::io::Error::other(
                "el servidor no ofrece ninguna forma de autenticarse en este puerto",
            ));
        }

        // PLAIN primero por ser el más difundido; LOGIN como respaldo, porque
        // hay servidores que sólo ofrecen ése y fallar ahí diría «tu cuenta
        // está mal» sobre una cuenta que anda.
        let (codigo, respuesta) = if mecanismos.iter().any(|m| m == "PLAIN") {
            escribir(
                lector.get_mut(),
                &format!("AUTH PLAIN {}", carga_auth_plain(usuario, contrasena)),
            )
            .await?;
            leer_respuesta_smtp(&mut lector).await?
        } else if mecanismos.iter().any(|m| m == "LOGIN") {
            let b64 = base64::engine::general_purpose::STANDARD;
            escribir(lector.get_mut(), "AUTH LOGIN").await?;
            leer_respuesta_smtp(&mut lector).await?;
            escribir(lector.get_mut(), &b64.encode(usuario)).await?;
            leer_respuesta_smtp(&mut lector).await?;
            escribir(lector.get_mut(), &b64.encode(contrasena)).await?;
            leer_respuesta_smtp(&mut lector).await?
        } else {
            return Err(std::io::Error::other(format!(
                "el servidor sólo acepta {} para autenticarse, y este equipo no \
                 sabe ninguno de ésos",
                mecanismos.join(", "),
            )));
        };

        let _ = escribir(lector.get_mut(), "QUIT").await;
        Ok::<_, std::io::Error>((codigo, respuesta))
    })
    .await;

    match resultado {
        Err(_) => ProbeOutcome::fallo(format!(
            "{host}:{puerto} no contestó en {} segundos",
            TIMEOUT.as_secs()
        )),
        Ok(Err(e)) => ProbeOutcome::fallo(explicar(&e, host, puerto)),
        Ok(Ok((235, _))) => ProbeOutcome::ok(),
        Ok(Ok((535, detalle))) => ProbeOutcome::fallo(format!(
            "el servidor rechazó el usuario o la contraseña ({}). \
             Si tenés verificación en dos pasos, hace falta una contraseña de aplicación",
            detalle.trim(),
        )),
        Ok(Ok((codigo, detalle))) => ProbeOutcome::fallo(format!(
            "el servidor respondió {codigo} al autenticarse: {}",
            detalle.trim()
        )),
    }
}

/// Prueba las dos puntas de una cuenta de correo.
///
/// Nunca devuelve `Err`: los dos resultados son parte de la respuesta. Un fallo
/// de la prueba no es un fallo del comando — es su resultado, y la pantalla lo
/// tiene que poder mostrar campo por campo.
#[tauri::command]
pub async fn test_mail_connection(
    imap_server: String,
    imap_port: u16,
    smtp_server: String,
    smtp_port: u16,
    username: String,
    password: String,
) -> Result<MailProbe, String> {
    // Las dos a la vez: son independientes, y en serie la prueba tardaría el
    // doble justo cuando alguien está esperando frente a un formulario.
    let (imap, smtp) = tokio::join!(
        probar_imap(&imap_server, imap_port, &username, &password),
        probar_smtp(&smtp_server, smtp_port, &username, &password),
    );
    Ok(MailProbe { imap, smtp })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn los_puertos_de_tls_implicito_son_los_de_siempre() {
        assert!(tls_implicito(993, Protocolo::Imap));
        assert!(!tls_implicito(143, Protocolo::Imap));
        assert!(tls_implicito(465, Protocolo::Smtp));
        assert!(!tls_implicito(587, Protocolo::Smtp));
        // Y no se cruzan: 993 en SMTP no es TLS implícito.
        assert!(!tls_implicito(993, Protocolo::Smtp));
        assert!(!tls_implicito(465, Protocolo::Imap));
    }

    /// Un salto de línea en la contraseña partiría el comando IMAP en dos y lo
    /// que siguiera se leería como un comando nuevo. Es la inyección clásica de
    /// este protocolo.
    #[test]
    fn una_contrasena_con_salto_de_linea_no_se_manda() {
        for veneno in ["a\r\nA1 LOGOUT", "a\nb", "a\rb", "a\0b"] {
            assert_eq!(comillas_imap(veneno), None, "{veneno:?} tenía que rechazarse");
        }
    }

    #[test]
    fn las_comillas_y_las_barras_se_escapan() {
        assert_eq!(comillas_imap("simple").unwrap(), "\"simple\"");
        assert_eq!(comillas_imap(r#"con"comilla"#).unwrap(), r#""con\"comilla""#);
        assert_eq!(comillas_imap(r"con\barra").unwrap(), r#""con\\barra""#);
        // El orden importa: escapar la comilla primero dejaría la barra que
        // acaba de agregarse sin escapar.
        assert_eq!(comillas_imap(r#"\""#).unwrap(), r#""\\\"""#);
    }

    #[test]
    fn se_reconoce_la_respuesta_con_etiqueta() {
        assert_eq!(estado_imap("a1 OK LOGIN completed", "a1"), Some(EstadoImap::Ok));
        assert_eq!(
            estado_imap("a1 NO [AUTHENTICATIONFAILED] mal", "a1"),
            Some(EstadoImap::No("[AUTHENTICATIONFAILED] mal".into()))
        );
        assert_eq!(
            estado_imap("a1 BAD sintaxis", "a1"),
            Some(EstadoImap::Bad("sintaxis".into()))
        );
        // Minúsculas: el protocolo no distingue.
        assert_eq!(estado_imap("a1 ok listo", "a1"), Some(EstadoImap::Ok));
    }

    /// Las líneas que empiezan con `*` son datos que el servidor manda sin que
    /// se los pidan, y puede mandar varias antes de contestar. Tomarlas por la
    /// respuesta daría por buena una sesión que todavía no se autenticó.
    #[test]
    fn las_lineas_sin_etiqueta_no_son_la_respuesta() {
        for suelta in [
            "* OK [CAPABILITY IMAP4rev1] listo",
            "* 3 EXISTS",
            "+ continuá",
            "a2 OK otra etiqueta",
            "",
        ] {
            assert_eq!(estado_imap(suelta, "a1"), None, "{suelta:?} no es la respuesta de a1");
        }
    }

    /// Una etiqueta que es prefijo de otra no puede confundirse: `a1` no tiene
    /// que emparejar con `a10`.
    #[test]
    fn una_etiqueta_no_empareja_con_otra_mas_larga() {
        assert_eq!(estado_imap("a10 OK listo", "a1"), None);
    }

    #[test]
    fn se_lee_el_codigo_y_si_la_respuesta_sigue() {
        assert_eq!(linea_smtp("250 OK"), Some((250, false, "OK".into())));
        assert_eq!(
            linea_smtp("250-PIPELINING"),
            Some((250, true, "PIPELINING".into()))
        );
        assert_eq!(linea_smtp("535 5.7.8 mal"), Some((535, false, "5.7.8 mal".into())));
    }

    /// Sin distinguir el `-` del espacio, la lectura cortaría en la primera
    /// línea del EHLO y la respuesta siguiente empezaría desalineada — todo lo
    /// que viniera después se leería corrido.
    #[test]
    fn lo_que_no_es_una_linea_de_smtp_se_rechaza() {
        for basura in ["", "25", "250", "250x OK", "abc OK", "2x0 OK"] {
            assert_eq!(linea_smtp(basura), None, "{basura:?} tenía que rechazarse");
        }
    }

    /// Elegir un mecanismo a ciegas haría que la prueba fallara sobre una
    /// cuenta que anda, que es el peor resultado posible: le diría a la persona
    /// que se equivocó cuando no.
    #[test]
    fn se_leen_los_mecanismos_del_ehlo() {
        let ehlo = "250-correo.ejemplo.com\n250-PIPELINING\n250-AUTH PLAIN LOGIN\n250 8BITMIME\n";
        let mecanismos = mecanismos_de_auth(ehlo);
        assert!(mecanismos.contains(&"PLAIN".to_string()));
        assert!(mecanismos.contains(&"LOGIN".to_string()));
        assert!(!mecanismos.contains(&"8BITMIME".to_string()));
    }

    #[test]
    fn los_mecanismos_se_leen_sin_importar_las_mayusculas() {
        let ehlo = "250-auth plain cram-md5\n250 OK\n";
        let mecanismos = mecanismos_de_auth(ehlo);
        assert!(mecanismos.contains(&"PLAIN".to_string()));
        assert!(mecanismos.contains(&"CRAM-MD5".to_string()));
    }

    #[test]
    fn un_ehlo_sin_auth_no_ofrece_mecanismos() {
        assert!(mecanismos_de_auth("250-PIPELINING\n250 8BITMIME\n").is_empty());
        assert!(mecanismos_de_auth("").is_empty());
    }

    /// `AUTH PLAIN` es un usuario y una contraseña separados por bytes nulos, no
    /// por dos puntos. Con el separador equivocado el servidor rechaza una
    /// cuenta perfecta.
    #[test]
    fn la_carga_de_auth_plain_lleva_bytes_nulos() {
        let carga = carga_auth_plain("ana", "secreto");
        let crudo = base64::engine::general_purpose::STANDARD.decode(&carga).unwrap();
        assert_eq!(crudo, b"\0ana\0secreto");
    }

    /// El mensaje es la mitad del valor de toda la prueba: «error de conexión»
    /// manda a mirar los cuatro campos, y esto manda al que corresponde.
    #[test]
    fn un_certificado_que_no_es_de_confianza_se_distingue_de_una_contrasena_mala() {
        let error = std::io::Error::other("invalid peer certificate: UnknownIssuer");
        let mensaje = explicar(&error, "correo.ejemplo.com", 993);

        assert!(mensaje.contains("certificado"), "{mensaje}");
        assert!(
            mensaje.contains("No es un problema de tu contraseña"),
            "tiene que descartar lo que la gente mira primero: {mensaje}"
        );
    }

    #[test]
    fn un_puerto_cerrado_apunta_al_puerto() {
        let error = std::io::Error::from(std::io::ErrorKind::ConnectionRefused);
        let mensaje = explicar(&error, "correo.ejemplo.com", 994);
        assert!(mensaje.contains("994"), "{mensaje}");
        assert!(mensaje.contains("puerto"), "{mensaje}");
    }

    /// La prueba de verdad: TLS, saludo y respuesta con etiqueta contra un
    /// servidor real.
    ///
    /// Ningún test de los de arriba prueba que el camino de red funcione —
    /// prueban el parseo, que es lo que se puede probar sin salir del equipo—.
    /// Éste sí, y por eso necesita internet: va marcado `ignore` para que no
    /// rompa la compilación de alguien sin conexión ni en un chroot de
    /// `makepkg`.
    ///
    /// Se corre a mano cuando se toca esta parte:
    ///
    /// ```text
    /// cargo test --lib mail_probe -- --ignored --nocapture
    /// ```
    ///
    /// Las credenciales son deliberadamente falsas: lo que se comprueba es que
    /// el servidor conteste **NO** —o sea que se llegó a hablar IMAP sobre TLS y
    /// se leyó su respuesta—, no que la cuenta exista.
    #[tokio::test]
    #[ignore = "necesita internet"]
    async fn contra_un_servidor_real_se_llega_a_hablar_imap() {
        let resultado = probar_imap(
            "imap.gmail.com",
            993,
            "no-existe@vasak.net.ar",
            "esta-contrasena-no-es-de-nadie",
        )
        .await;

        assert!(!resultado.ok, "no tenía que autenticarse: {resultado:?}");
        // Y el detalle tiene que ser el rechazo del servidor, no un fallo de
        // conexión ni de certificado: eso es lo que prueba que el camino anduvo.
        assert!(
            resultado.detail.contains("rechazó el usuario"),
            "no se llegó a hablar IMAP: {}",
            resultado.detail
        );
    }

    /// La otra prueba de verdad: **STARTTLS**, que es la que más fácil sale mal.
    ///
    /// Subir a TLS sobre un socket que ya se usó en claro sólo funciona si nada
    /// leyó de más: un lector con búfer se adelanta y se queda con bytes que
    /// pertenecen al canal cifrado, y ahí el saludo siguiente se lee corrido.
    /// Eso no lo detecta ningún test de parseo — hay que hablar con un servidor.
    ///
    /// El 587 importa además porque es el puerto que el formulario propone por
    /// omisión: si este camino no anduviera, la prueba fallaría sobre la
    /// configuración que la pantalla sugiere.
    #[tokio::test]
    #[ignore = "necesita internet"]
    async fn contra_un_servidor_real_se_negocia_starttls() {
        let resultado = probar_smtp(
            "smtp.gmail.com",
            587,
            "no-existe@vasak.net.ar",
            "esta-contrasena-no-es-de-nadie",
        )
        .await;

        assert!(!resultado.ok, "no tenía que autenticarse: {resultado:?}");
        assert!(
            resultado.detail.contains("rechazó el usuario")
                || resultado.detail.contains("respondió"),
            "no se llegó a autenticar sobre STARTTLS: {}",
            resultado.detail
        );
        // Lo que **no** puede decir: que no se pudo negociar. Eso sería el
        // camino roto y no una credencial rechazada.
        assert!(
            !resultado.detail.contains("STARTTLS"),
            "falló la negociación: {}",
            resultado.detail
        );
    }

    /// Un puerto que traga los paquetes no da error: se queda callado. El
    /// mensaje tiene que decirlo, o la persona busca el problema en otro lado.
    #[test]
    fn un_puerto_que_no_contesta_lo_dice() {
        let error = std::io::Error::from(std::io::ErrorKind::TimedOut);
        let mensaje = explicar(&error, "correo.ejemplo.com", 9999);
        assert!(mensaje.contains("callado") || mensaje.contains("contestó"), "{mensaje}");
    }
}

//! Encontrar el calendario y los contactos sin que nadie escriba una URL.
//!
//! Una cuenta CalDAV o CardDAV se configura, en la práctica, pegando una
//! dirección como
//! `https://correo.ejemplo.com/remote.php/dav/calendars/ana/` que nadie sabe de
//! memoria y que cada servidor arma distinto. El estándar prevé justamente eso
//! (RFC 6764): del dominio se llega al servidor, del servidor al «principal» de
//! la persona, y del principal a dónde viven sus calendarios y sus libretas.
//!
//! Acá se hace ese recorrido:
//!
//!   1. `PROPFIND` sobre `https://<dominio>/.well-known/caldav`, siguiendo la
//!      redirección hasta donde el servidor de verdad atiende, y preguntando de
//!      paso `current-user-principal` — quién sos para ese servidor.
//!   2. `PROPFIND calendar-home-set` / `addressbook-home-set` sobre el principal
//!      — dónde están tus colecciones.
//!
//! ── Por qué corre acá y no en el servicio de cuentas ────────────────────────
//!
//! Por lo mismo que la prueba de correo: la contraseña ya está en este proceso,
//! y esto además **parsea XML de un servidor cualquiera**. Hacerlo con los
//! permisos de root sería exactamente lo que se evitó al dejar el bucle de
//! sincronización fuera del servicio.
//!
//! ── La regla de las redirecciones ───────────────────────────────────────────
//!
//! El `.well-known` existe para que el servidor mande a otro lado, y ese «otro
//! lado» puede ser un subdominio: `ejemplo.com` → `dav.ejemplo.com` es el caso
//! normal y hay que seguirlo. Pero el pedido lleva la contraseña, así que seguir
//! una redirección a cualquier parte sería entregársela a quien el servidor
//! nombre.
//!
//! Se siguen sólo dentro del mismo dominio. Si un servidor manda afuera, se
//! corta y se dice la dirección encontrada sin autenticarse contra ella: quien
//! quiera puede configurarla a mano, sabiendo adónde va su contraseña.

use std::time::Duration;

use base64::Engine;
use serde::Serialize;

/// Tope de cada petición.
const TIMEOUT: Duration = Duration::from_secs(15);

/// Tope de lo que se lee de una respuesta.
///
/// Las respuestas de PROPFIND son XML de unos pocos kilobytes. Sin tope, un
/// servidor que devuelve una página de error enorme —o que lo hace a propósito—
/// hace crecer la memoria de la ventana sin límite.
const MAX_CUERPO: usize = 512 * 1024;

const NS_DAV: &str = "DAV:";
const NS_CALDAV: &str = "urn:ietf:params:xml:ns:caldav";
const NS_CARDDAV: &str = "urn:ietf:params:xml:ns:carddav";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tipo {
    Calendario,
    Contactos,
}

impl Tipo {
    fn well_known(&self) -> &'static str {
        match self {
            Tipo::Calendario => "/.well-known/caldav",
            Tipo::Contactos => "/.well-known/carddav",
        }
    }

    /// El elemento que nombra dónde viven las colecciones de la persona, y en
    /// qué espacio de nombres vive ese elemento.
    fn home_set(&self) -> (&'static str, &'static str) {
        match self {
            Tipo::Calendario => (NS_CALDAV, "calendar-home-set"),
            Tipo::Contactos => (NS_CARDDAV, "addressbook-home-set"),
        }
    }
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct Hallazgo {
    /// La dirección encontrada, o `None` si no se llegó.
    pub url: Option<String>,
    /// Qué pasó, en términos de lo que la persona puede hacer.
    pub detail: String,
}

#[derive(Debug, Serialize)]
pub struct DavDiscovery {
    pub calendar: Hallazgo,
    pub contacts: Hallazgo,
}

// ---------------------------------------------------------------------------
// Lo que se puede probar sin red
// ---------------------------------------------------------------------------

/// El dominio contra el que buscar.
///
/// Se acepta un correo —que es lo que la persona sabe de memoria— o una
/// dirección de servidor. De `ana@ejemplo.com` sale `ejemplo.com`, que es donde
/// el estándar dice que hay que preguntar.
pub fn dominio_de(entrada: &str) -> Option<String> {
    let texto = entrada.trim();
    if texto.is_empty() {
        return None;
    }

    // Un correo: lo que va después de la última arroba. La última y no la
    // primera, porque la parte local puede llevar arrobas entre comillas.
    if let Some((_, dominio)) = texto.rsplit_once('@') {
        return limpiar_dominio(dominio);
    }

    // Una URL o un nombre de servidor pelado.
    if let Ok(url) = url::Url::parse(texto) {
        if let Some(host) = url.host_str() {
            return limpiar_dominio(host);
        }
    }
    limpiar_dominio(texto)
}

fn limpiar_dominio(texto: &str) -> Option<String> {
    let limpio = texto.trim().trim_matches('/').to_ascii_lowercase();
    if limpio.is_empty() || limpio.contains('/') || limpio.contains(' ') {
        return None;
    }
    // Tiene que parecer un nombre de dominio y no una palabra suelta: sin un
    // punto, `https://localhost/.well-known/caldav` no lleva a ninguna parte y
    // el error sería un tiempo de espera en vez de «eso no es un dominio».
    if !limpio.contains('.') {
        return None;
    }
    Some(limpio)
}

/// Si una redirección se puede seguir llevando la contraseña.
///
/// Mismo host, o un subdominio del original. Cubre el caso normal
/// —`ejemplo.com` → `dav.ejemplo.com`— y corta el que importa: que el servidor
/// de alguien mande la contraseña a un tercero.
///
/// La comparación es por sufijo **con el punto incluido**. Sin el punto,
/// `ejemplo.com` emparejaría con `malejemplo.com`, que es de otra persona.
pub fn redireccion_segura(dominio_original: &str, destino: &str) -> bool {
    let Ok(url) = url::Url::parse(destino) else {
        return false;
    };
    if url.scheme() != "https" {
        return false;
    }
    let Some(host) = url.host_str() else {
        return false;
    };
    let host = host.to_ascii_lowercase();
    let original = dominio_original.to_ascii_lowercase();

    host == original || host.ends_with(&format!(".{original}"))
}

/// Resuelve el `href` que devuelve el servidor contra la dirección consultada.
///
/// Los servidores contestan casi siempre con una ruta absoluta —`/dav/ana/`— y
/// a veces con una URL entera. Tratar la primera como si fuera completa daría
/// una dirección sin servidor, y pegarlas a mano rompería la segunda.
pub fn resolver_href(base: &str, href: &str) -> Option<String> {
    let base = url::Url::parse(base).ok()?;
    base.join(href.trim()).ok().map(|u| u.to_string())
}

/// Saca el `<href>` de un `current-user-principal` de una respuesta PROPFIND.
pub fn principal_de(xml: &str) -> Option<String> {
    href_dentro_de(xml, NS_DAV, "current-user-principal")
}

/// Saca el `<href>` del home-set que corresponda.
pub fn home_set_de(xml: &str, tipo: Tipo) -> Option<String> {
    let (ns, elemento) = tipo.home_set();
    href_dentro_de(xml, ns, elemento)
}

/// El primer `<href>` que cuelgue del elemento pedido.
///
/// Se busca por espacio de nombres y nombre, no por el texto de la etiqueta:
/// los servidores usan prefijos distintos —`d:`, `D:`, ninguno— y emparejar por
/// texto haría que el descubrimiento funcionara contra unos y no contra otros
/// sin ninguna razón visible.
fn href_dentro_de(xml: &str, ns: &str, elemento: &str) -> Option<String> {
    let documento = roxmltree::Document::parse(xml).ok()?;
    documento
        .descendants()
        .find(|n| n.has_tag_name((ns, elemento)))?
        .descendants()
        .find(|n| n.has_tag_name((NS_DAV, "href")))?
        .text()
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
}

/// El cuerpo de un PROPFIND que pide una sola propiedad.
pub fn cuerpo_propfind(ns: &str, propiedad: &str) -> String {
    // Con el espacio de nombres declarado en la raíz y un prefijo propio, en
    // vez de confiar en que el servidor adivine: hay implementaciones que
    // rechazan un PROPFIND sin declarar.
    if ns == NS_DAV {
        format!(
            r#"<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:"><d:prop><d:{propiedad}/></d:prop></d:propfind>"#
        )
    } else {
        format!(
            r#"<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:x="{ns}"><d:prop><x:{propiedad}/></d:prop></d:propfind>"#
        )
    }
}

/// La cabecera `Authorization` de autenticación básica.
pub fn cabecera_basica(usuario: &str, contrasena: &str) -> String {
    let credenciales = format!("{usuario}:{contrasena}");
    format!(
        "Basic {}",
        base64::engine::general_purpose::STANDARD.encode(credenciales)
    )
}

// ---------------------------------------------------------------------------
// La parte que habla por la red
// ---------------------------------------------------------------------------

fn cliente(dominio: String) -> Result<reqwest::Client, String> {
    // La política de redirección es la defensa principal de este módulo, así
    // que vive en el cliente y no en cada llamada: así no hay forma de hacer
    // una petición que se la saltee por olvido.
    let politica = reqwest::redirect::Policy::custom(move |intento| {
        if intento.previous().len() >= 5 {
            return intento.error("demasiadas redirecciones");
        }
        if redireccion_segura(&dominio, intento.url().as_str()) {
            intento.follow()
        } else {
            intento.stop()
        }
    });

    reqwest::Client::builder()
        .timeout(TIMEOUT)
        .redirect(politica)
        .user_agent("VasakOS")
        .build()
        .map_err(|e| format!("no se pudo crear el cliente HTTP: {e}"))
}

async fn cuerpo_con_tope(respuesta: reqwest::Response) -> Result<String, String> {
    let bytes = respuesta
        .bytes()
        .await
        .map_err(|e| format!("no se pudo leer la respuesta: {e}"))?;
    if bytes.len() > MAX_CUERPO {
        return Err(format!(
            "el servidor devolvió {} bytes, más de los {MAX_CUERPO} que se leen",
            bytes.len()
        ));
    }
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// Un PROPFIND de profundidad 0 que pide una propiedad.
/// Un PROPFIND de profundidad 0 que pide una propiedad.
///
/// Devuelve también la URL en la que terminó, que no siempre es la que se pidió:
/// el `.well-known` redirige, y los `href` de la respuesta se resuelven contra
/// el lugar donde de verdad contestó el servidor.
async fn propfind(
    cliente: &reqwest::Client,
    url: &str,
    auth: &str,
    ns: &str,
    propiedad: &str,
) -> Result<(String, String), String> {
    let metodo = reqwest::Method::from_bytes(b"PROPFIND").expect("PROPFIND es un método válido");

    let respuesta = cliente
        .request(metodo, url)
        .header("Authorization", auth)
        // 0: sólo el recurso pedido. Sin esto algunos servidores devuelven el
        // árbol entero, que puede ser enorme y no aporta nada acá.
        .header("Depth", "0")
        .header("Content-Type", "application/xml; charset=utf-8")
        .body(cuerpo_propfind(ns, propiedad))
        .send()
        .await
        .map_err(|e| format!("no se pudo consultar {url}: {e}"))?;

    let estado = respuesta.status();
    let final_url = respuesta.url().to_string();

    if estado == reqwest::StatusCode::UNAUTHORIZED {
        return Err("el servidor rechazó el usuario o la contraseña".into());
    }

    // Una redirección que llega hasta acá es una que la política no siguió:
    // salía del dominio. Se dice adónde iba, porque la persona puede confiar en
    // esa dirección y ponerla a mano — lo que no se hace es mandarle su
    // contraseña sin que lo sepa.
    if estado.is_redirection() {
        let destino = respuesta
            .headers()
            .get(reqwest::header::LOCATION)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("otro servidor");
        return Err(format!(
            "el servidor manda a {destino}, que está fuera de su dominio. No se \
             sigue para no mandarle tu contraseña a un tercero: si confiás en esa \
             dirección, configurala a mano"
        ));
    }

    // 405 y 404 son la respuesta de un servidor que existe y **no hace**
    // autodescubrimiento. Es el caso más común de los que fallan —muchos
    // proveedores redirigen su dominio a una página web que no habla DAV— y
    // merece un mensaje que diga qué hacer, no un código.
    if estado == reqwest::StatusCode::METHOD_NOT_ALLOWED
        || estado == reqwest::StatusCode::NOT_FOUND
    {
        return Err(format!(
            "{final_url} no ofrece búsqueda automática. Tu proveedor puede tener \
             la dirección publicada en su ayuda; se puede poner a mano"
        ));
    }

    // 207 Multi-Status es la respuesta normal de PROPFIND; 200 también aparece.
    if !estado.is_success() {
        return Err(format!("el servidor respondió {estado} a la consulta"));
    }

    Ok((final_url, cuerpo_con_tope(respuesta).await?))
}

async fn descubrir(
    cliente: &reqwest::Client,
    dominio: &str,
    tipo: Tipo,
    usuario: &str,
    contrasena: &str,
) -> Result<String, String> {
    let auth = cabecera_basica(usuario, contrasena);

    // El PROPFIND va **directo** a la dirección bien conocida, que es lo que
    // dice el estándar, y la redirección la sigue el propio pedido.
    //
    // Se probó primero con un GET previo para averiguar adónde redirige, y no
    // sirve: hay servidores donde el GET y el PROPFIND terminan en lugares
    // distintos —fastmail manda el GET a su página web, que devuelve 404— así
    // que lo que se descubría no era el endpoint DAV.
    //
    // Que el pedido lleve la contraseña desde el principio no la expone: la
    // política de redirección no deja salir del dominio, así que sólo la
    // reciben hosts de quien la persona ya nombró.
    let bienconocida = format!("https://{dominio}{}", tipo.well_known());

    let (entrada, xml) = propfind(
        cliente,
        &bienconocida,
        &auth,
        NS_DAV,
        "current-user-principal",
    )
    .await?;

    let principal_href = principal_de(&xml)
        .ok_or_else(|| format!("{dominio} no dijo cuál es tu cuenta en ese servidor"))?;
    let principal = resolver_href(&entrada, &principal_href).ok_or_else(|| {
        format!("la dirección que devolvió el servidor no es válida: {principal_href}")
    })?;

    let (ns, elemento) = tipo.home_set();
    let (base, xml) = propfind(cliente, &principal, &auth, ns, elemento).await?;
    let home_href = home_set_de(&xml, tipo)
        .ok_or_else(|| "el servidor no dijo dónde están tus colecciones".to_string())?;

    resolver_href(&base, &home_href)
        .ok_or_else(|| format!("la dirección que devolvió el servidor no es válida: {home_href}"))
}

async fn hallazgo(
    cliente: &reqwest::Client,
    dominio: &str,
    tipo: Tipo,
    usuario: &str,
    contrasena: &str,
) -> Hallazgo {
    match descubrir(cliente, dominio, tipo, usuario, contrasena).await {
        Ok(url) => Hallazgo { url: Some(url), detail: String::new() },
        Err(detalle) => Hallazgo { url: None, detail: detalle },
    }
}

/// Busca el calendario y los contactos de una cuenta.
///
/// Nunca devuelve `Err` por no encontrar: los dos resultados son parte de la
/// respuesta. Es muy común que un servidor tenga uno y no el otro, y un error
/// único diría «no se encontró nada» sobre un servidor que sí tiene calendario.
#[tauri::command]
pub async fn discover_dav(
    account: String,
    username: String,
    password: String,
) -> Result<DavDiscovery, String> {
    let dominio = dominio_de(&account).ok_or_else(|| {
        format!("«{account}» no parece un correo ni la dirección de un servidor")
    })?;

    let cliente = cliente(dominio.clone())?;

    // Los dos a la vez: son independientes, y en serie la búsqueda tardaría el
    // doble con alguien esperando frente a un formulario.
    let (calendar, contacts) = tokio::join!(
        hallazgo(&cliente, &dominio, Tipo::Calendario, &username, &password),
        hallazgo(&cliente, &dominio, Tipo::Contactos, &username, &password),
    );

    Ok(DavDiscovery { calendar, contacts })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn de_un_correo_sale_su_dominio() {
        assert_eq!(dominio_de("ana@ejemplo.com").as_deref(), Some("ejemplo.com"));
        assert_eq!(dominio_de("  Ana@Ejemplo.COM  ").as_deref(), Some("ejemplo.com"));
    }

    /// La parte local de un correo puede llevar arrobas entre comillas, así que
    /// el dominio es lo que va después de la **última**. Cortando por la primera,
    /// `"a@b"@ejemplo.com` daría `b"@ejemplo.com`.
    #[test]
    fn el_dominio_se_corta_por_la_ultima_arroba() {
        assert_eq!(dominio_de(r#""a@b"@ejemplo.com"#).as_deref(), Some("ejemplo.com"));
    }

    #[test]
    fn tambien_se_acepta_un_servidor() {
        assert_eq!(dominio_de("ejemplo.com").as_deref(), Some("ejemplo.com"));
        assert_eq!(
            dominio_de("https://dav.ejemplo.com/algo").as_deref(),
            Some("dav.ejemplo.com")
        );
        assert_eq!(dominio_de("ejemplo.com/").as_deref(), Some("ejemplo.com"));
    }

    /// Sin un punto no es un dominio, y buscar igual daría un tiempo de espera
    /// en vez de «eso no es un dominio», que es lo que la persona necesita leer.
    #[test]
    fn lo_que_no_es_un_dominio_se_rechaza() {
        for malo in ["", "   ", "ana", "ana@", "@ejemplo", "localhost", "con espacio.com"] {
            assert_eq!(dominio_de(malo), None, "{malo:?} tenía que rechazarse");
        }
    }

    /// El caso normal del estándar: el dominio manda a un subdominio suyo.
    #[test]
    fn se_sigue_una_redireccion_dentro_del_mismo_dominio() {
        assert!(redireccion_segura("ejemplo.com", "https://ejemplo.com/dav/"));
        assert!(redireccion_segura("ejemplo.com", "https://dav.ejemplo.com/dav/"));
        assert!(redireccion_segura("ejemplo.com", "https://a.b.ejemplo.com/x"));
    }

    /// Y el que importa: después de este paso se manda la contraseña, así que
    /// una redirección afuera la estaría entregando a quien el servidor nombre.
    #[test]
    fn no_se_sigue_una_redireccion_que_sale_del_dominio() {
        for ajeno in [
            "https://atacante.com/dav/",
            // Sin el punto en la comparación, éste pasaría por subdominio.
            "https://malejemplo.com/dav/",
            "https://ejemplo.com.atacante.com/dav/",
            // Sin cifrar, la contraseña iría en claro aunque el host sea el suyo.
            "http://ejemplo.com/dav/",
            "no es una url",
            "",
        ] {
            assert!(
                !redireccion_segura("ejemplo.com", ajeno),
                "{ajeno} no tenía que seguirse"
            );
        }
    }

    #[test]
    fn una_ruta_absoluta_se_resuelve_contra_el_servidor() {
        assert_eq!(
            resolver_href("https://ejemplo.com/.well-known/caldav", "/dav/principals/ana/").as_deref(),
            Some("https://ejemplo.com/dav/principals/ana/")
        );
    }

    /// Algunos servidores contestan con la URL entera. Pegarla a mano daría
    /// `https://ejemplo.com/https://ejemplo.com/...`.
    #[test]
    fn una_url_entera_se_deja_como_esta() {
        assert_eq!(
            resolver_href("https://ejemplo.com/dav/", "https://dav.ejemplo.com/x/").as_deref(),
            Some("https://dav.ejemplo.com/x/")
        );
    }

    const PRINCIPAL: &str = r#"<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>/.well-known/caldav</d:href>
    <d:propstat>
      <d:prop><d:current-user-principal><d:href>/dav/principals/ana/</d:href></d:current-user-principal></d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>"#;

    #[test]
    fn se_encuentra_el_principal() {
        assert_eq!(principal_de(PRINCIPAL).as_deref(), Some("/dav/principals/ana/"));
    }

    /// Los servidores usan prefijos distintos —`d:`, `D:`, ninguno— y emparejar
    /// por el texto de la etiqueta haría que esto anduviera contra unos y no
    /// contra otros sin ninguna razón visible.
    #[test]
    fn el_prefijo_del_espacio_de_nombres_no_importa() {
        // Escrito a mano y no derivado del otro con un `replace`: cambiar el
        // prefijo sin cambiar su declaración deja un XML inválido, y el test
        // pasaría por la razón equivocada — o fallaría, como pasó al escribirlo.
        let con_otro_prefijo = r#"<D:multistatus xmlns:D="DAV:"><D:response><D:propstat><D:prop>
            <D:current-user-principal><D:href>/dav/principals/ana/</D:href></D:current-user-principal>
        </D:prop></D:propstat></D:response></D:multistatus>"#;
        assert_eq!(
            principal_de(con_otro_prefijo).as_deref(),
            Some("/dav/principals/ana/")
        );

        let sin_prefijo = r#"<multistatus xmlns="DAV:"><response>
            <prop><current-user-principal><href>/p/ana/</href></current-user-principal></prop>
        </response></multistatus>"#;
        assert_eq!(principal_de(sin_prefijo).as_deref(), Some("/p/ana/"));
    }

    #[test]
    fn se_encuentra_donde_viven_los_calendarios() {
        let xml = r#"<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
          <d:response><d:propstat><d:prop>
            <c:calendar-home-set><d:href>/dav/calendars/ana/</d:href></c:calendar-home-set>
          </d:prop></d:propstat></d:response>
        </d:multistatus>"#;

        assert_eq!(
            home_set_de(xml, Tipo::Calendario).as_deref(),
            Some("/dav/calendars/ana/")
        );
        // Y no confunde uno con el otro: son espacios de nombres distintos.
        assert_eq!(home_set_de(xml, Tipo::Contactos), None);
    }

    #[test]
    fn se_encuentra_donde_viven_las_libretas() {
        let xml = r#"<d:multistatus xmlns:d="DAV:" xmlns:a="urn:ietf:params:xml:ns:carddav">
          <d:response><d:propstat><d:prop>
            <a:addressbook-home-set><d:href>/dav/addressbooks/ana/</d:href></a:addressbook-home-set>
          </d:prop></d:propstat></d:response>
        </d:multistatus>"#;

        assert_eq!(
            home_set_de(xml, Tipo::Contactos).as_deref(),
            Some("/dav/addressbooks/ana/")
        );
        assert_eq!(home_set_de(xml, Tipo::Calendario), None);
    }

    /// Un XML roto, o uno que no trae lo que se pidió, no puede hacer caer la
    /// ventana: viene de un servidor que no controlamos.
    #[test]
    fn un_xml_que_no_sirve_no_devuelve_nada() {
        for basura in [
            "",
            "no es xml",
            "<abierto>",
            "<d:multistatus xmlns:d=\"DAV:\"></d:multistatus>",
            // El elemento está pero vacío: tampoco hay dirección.
            "<d:multistatus xmlns:d=\"DAV:\"><d:current-user-principal/></d:multistatus>",
            "<d:multistatus xmlns:d=\"DAV:\"><d:current-user-principal><d:href>  </d:href></d:current-user-principal></d:multistatus>",
        ] {
            assert_eq!(principal_de(basura), None, "{basura:?}");
        }
    }

    #[test]
    fn el_cuerpo_del_propfind_declara_su_espacio_de_nombres() {
        let dav = cuerpo_propfind(NS_DAV, "current-user-principal");
        assert!(dav.contains(r#"xmlns:d="DAV:""#), "{dav}");
        assert!(dav.contains("<d:current-user-principal/>"), "{dav}");

        let caldav = cuerpo_propfind(NS_CALDAV, "calendar-home-set");
        assert!(caldav.contains(NS_CALDAV), "{caldav}");
        assert!(caldav.contains("<x:calendar-home-set/>"), "{caldav}");
        // El de DAV también, porque `propfind` y `prop` viven ahí.
        assert!(caldav.contains(r#"xmlns:d="DAV:""#), "{caldav}");
    }

    /// Y que el cuerpo que se manda sea XML válido, que es lo que un servidor
    /// va a exigir antes de contestar nada.
    #[test]
    fn el_cuerpo_del_propfind_es_xml_valido() {
        for (ns, propiedad) in [
            (NS_DAV, "current-user-principal"),
            (NS_CALDAV, "calendar-home-set"),
            (NS_CARDDAV, "addressbook-home-set"),
        ] {
            let cuerpo = cuerpo_propfind(ns, propiedad);
            assert!(
                roxmltree::Document::parse(&cuerpo).is_ok(),
                "el PROPFIND de {propiedad} no es XML válido:\n{cuerpo}"
            );
        }
    }

    #[test]
    fn la_cabecera_basica_es_usuario_dos_puntos_contrasena() {
        let cabecera = cabecera_basica("ana", "secreto");
        let codificado = cabecera.strip_prefix("Basic ").expect("tiene que decir Basic");
        let crudo = base64::engine::general_purpose::STANDARD
            .decode(codificado)
            .unwrap();
        assert_eq!(crudo, b"ana:secreto");
    }

    /// El recorrido real contra un servidor de verdad.
    ///
    /// Ningún test de los de arriba prueba el camino de red: prueban el parseo,
    /// que es lo que se puede probar sin salir del equipo. Éste va hasta el
    /// `.well-known` de un servidor público y comprueba que **se llegue a
    /// autenticar** — o sea, que la redirección se siguió, que el PROPFIND salió
    /// y que la respuesta se entendió. Las credenciales son falsas a propósito:
    /// lo que se espera es un rechazo del servidor, no un fallo de conexión.
    ///
    /// Marcado `ignore` para no romper la compilación de alguien sin conexión ni
    /// en un chroot de `makepkg`. Se corre a mano al tocar esta parte:
    ///
    /// ```text
    /// cargo test --lib dav_discover -- --ignored --nocapture
    /// ```
    #[tokio::test]
    #[ignore = "necesita internet"]
    async fn contra_un_servidor_real_se_llega_al_propfind() {
        // caldav.fastmail.com y no fastmail.com: el dominio a secas redirige a
        // su página web, que no habla DAV. Es justamente el caso que el
        // mensaje de «no ofrece búsqueda automática» cubre.
        let dominio = "caldav.fastmail.com";
        let cliente = cliente(dominio.to_string()).unwrap();

        let resultado = descubrir(
            &cliente,
            dominio,
            Tipo::Calendario,
            "no-existe@vasak.net.ar",
            "esta-contrasena-no-es-de-nadie",
        )
        .await;

        let error = resultado.expect_err("no tenía que autenticarse");
        println!("respuesta del servidor: {error}");

        // Lo que prueba que el camino anduvo: el servidor llegó a decir que no
        // a las credenciales. Un fallo de conexión, de redirección o de parseo
        // daría otro mensaje.
        assert!(
            error.contains("rechazó el usuario") || error.contains("respondió 401"),
            "no se llegó al PROPFIND autenticado: {error}"
        );
    }

    /// El fallo más común, también contra un servidor real.
    ///
    /// Muchos proveedores redirigen su dominio a la página web comercial, que
    /// contesta 404 o 405 a un PROPFIND. Es lo que hacen hoy fastmail,
    /// mailbox.org y posteo — medido con curl al escribir esto—, así que no es
    /// un caso raro: es el que más gente va a ver.
    ///
    /// El mensaje tiene que decir qué hacer, no un código HTTP.
    #[tokio::test]
    #[ignore = "necesita internet"]
    async fn un_servidor_sin_autodescubrimiento_dice_que_hacer() {
        let dominio = "fastmail.com";
        let cliente = cliente(dominio.to_string()).unwrap();

        let error = descubrir(&cliente, dominio, Tipo::Calendario, "quien@sea", "loquesea")
            .await
            .expect_err("el dominio a secas no hace autodescubrimiento");
        println!("respuesta del servidor: {error}");

        assert!(
            error.contains("no ofrece búsqueda automática") || error.contains("a mano"),
            "el mensaje no dice qué hacer: {error}"
        );
    }

    /// Los dos tipos apuntan a rutas distintas: cruzarlas buscaría el calendario
    /// donde están los contactos y no encontraría nada, sin decir por qué.
    #[test]
    fn cada_tipo_busca_en_su_propia_ruta() {
        assert_eq!(Tipo::Calendario.well_known(), "/.well-known/caldav");
        assert_eq!(Tipo::Contactos.well_known(), "/.well-known/carddav");
        assert_ne!(Tipo::Calendario.home_set(), Tipo::Contactos.home_set());
    }
}

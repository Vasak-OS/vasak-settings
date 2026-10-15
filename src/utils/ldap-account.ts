/**
 * Lo que necesita el formulario «LDAP / Active Directory» para dar de alta una
 * cuenta de directorio, separado del `.vue` para poder probarlo.
 *
 * Es el gemelo del alta «Otro servidor (CalDAV/CardDAV)» (`dav-account.ts`): un
 * alta manual, sin flujo de navegador ni nada que registrar. La persona escribe
 * los datos de su directorio y la cuenta se registra por el mismo camino que
 * IMAP/SMTP y DAV (`register_password_account`): el servicio guarda las
 * capacidades tal como se arman acá, y la contraseña aparte, cifrada en el
 * llavero bajo la clave `access`.
 *
 * ── La forma de la capacidad ─────────────────────────────────────────────────
 *
 * Un LDAP sólo trae contactos: es una libreta de empresa de sólo lectura. La
 * capacidad se llama `contacts`, y su configuración lleva las claves que el
 * sincronizador espera (`sync/src/contacts_sync/ldap.rs`): `ldap_url`,
 * `ldap_bind_dn`, `ldap_search_base` y las opcionales `ldap_search_filter`,
 * `ldap_attributes` (una lista) y `ldap_allow_insecure` (un booleano). La
 * contraseña **no** va en la configuración: viaja aparte y el servicio la cifra.
 *
 * ── La seguridad del canal ───────────────────────────────────────────────────
 *
 * El bind simple manda la contraseña al servidor, así que el canal va cifrado:
 * `ldaps://` usa TLS directo, `ldap://` sube a TLS con StartTLS antes del bind, y
 * `ldapi://` es un socket local sin red. Sólo `ldap://` puede ir en claro, y sólo
 * si la cuenta pone `ldap_allow_insecure` a propósito —para un servidor de
 * laboratorio que no sabe StartTLS—. Por eso la advertencia de abajo depende del
 * esquema.
 */

/**
 * La forma en que se guarda la configuración de contactos de un LDAP.
 *
 * Es un alias de tipo y no una interfaz a propósito, igual que en DAV: así tiene
 * índice implícito y encaja en el `Record<string, Record<string, unknown>>` que
 * pide `register_password_account`, sin castear.
 */
export type LdapCapabilityConfig = {
	ldap_url: string;
	ldap_bind_dn: string;
	ldap_search_base: string;
	ldap_search_filter?: string;
	ldap_attributes?: string[];
	ldap_allow_insecure?: boolean;
};

/**
 * Las capacidades que declara una cuenta LDAP, por su nombre. Un LDAP sólo trae
 * `contacts`. Un `Record` para que sea asignable al parámetro del comando sin
 * castear.
 */
export type LdapCapabilities = Record<string, LdapCapabilityConfig>;

/** Lo que el formulario sabe de la cuenta LDAP. */
export interface LdapForm {
	url: string;
	bindDn: string;
	searchBase: string;
	searchFilter: string;
	attributes: string;
	allowInsecure: boolean;
}

/** Los esquemas de URL que el servidor LDAP entiende. */
const LDAP_SCHEMES = ['ldap:', 'ldaps:', 'ldapi:'] as const;

/**
 * El esquema de una URL LDAP (`ldap`, `ldaps`, `ldapi`), o `null` si no es una
 * dirección LDAP válida.
 *
 * Se mira el esquema y no sólo el prefijo porque de él depende todo lo demás: si
 * el canal va cifrado, y si tiene sentido ofrecer «permitir sin cifrar».
 */
export function ldapUrlScheme(url: string): 'ldap' | 'ldaps' | 'ldapi' | null {
	const trimmed = url.trim();
	if (!trimmed) return null;
	try {
		const protocol = new URL(trimmed).protocol;
		if (!LDAP_SCHEMES.includes(protocol as (typeof LDAP_SCHEMES)[number])) return null;
		return protocol.slice(0, -1) as 'ldap' | 'ldaps' | 'ldapi';
	} catch {
		return null;
	}
}

/** Si la dirección es un LDAP válido: alcanza con que tenga uno de los esquemas. */
export function isValidLdapUrl(url: string): boolean {
	return ldapUrlScheme(url) !== null;
}

/**
 * Si una dirección puede llevar la contraseña en claro.
 *
 * Sólo `ldap://` puede: `ldaps://` cifra siempre y `ldapi://` es un socket local
 * sin red. La casilla «permitir sin cifrar» sólo tiene efecto con `ldap://`, así
 * que la advertencia se muestra únicamente ahí.
 */
export function ldapUrlCanBePlaintext(url: string): boolean {
	return ldapUrlScheme(url) === 'ldap';
}

/**
 * Parte la lista de atributos que escribe la persona en un arreglo.
 *
 * El sincronizador espera una lista (`ldap_attributes` es un arreglo), no una
 * cadena. Se acepta separar por comas o por espacios —es lo que la gente
 * escribe— y se descartan los huecos y los repetidos, que un atributo pedido dos
 * veces no cambia nada.
 */
export function parseLdapAttributes(raw: string): string[] {
	const seen = new Set<string>();
	for (const part of raw.split(/[\s,]+/)) {
		const attribute = part.trim();
		if (attribute) seen.add(attribute);
	}
	return [...seen];
}

/** Si el formulario tiene lo mínimo para dar de alta la cuenta. */
export function canBuildLdap(form: Pick<LdapForm, 'url' | 'bindDn' | 'searchBase'>): boolean {
	return (
		isValidLdapUrl(form.url) && form.bindDn.trim().length > 0 && form.searchBase.trim().length > 0
	);
}

/**
 * Arma las capacidades desde lo que hay en el formulario.
 *
 * Un LDAP declara una sola capacidad, `contacts`. Las claves opcionales se
 * omiten cuando están vacías: así el config queda con lo justo y el
 * sincronizador cae en sus valores por defecto (el filtro `(objectClass=person)`
 * y la lista de atributos estándar). `ldap_allow_insecure` sólo se escribe
 * cuando está marcada y la dirección es `ldap://`: para `ldaps://` o `ldapi://`
 * no tendría efecto y sólo ensuciaría el config.
 */
export function buildLdapCapabilities(form: LdapForm): LdapCapabilities {
	const config: LdapCapabilityConfig = {
		ldap_url: form.url.trim(),
		ldap_bind_dn: form.bindDn.trim(),
		ldap_search_base: form.searchBase.trim(),
	};

	const filter = form.searchFilter.trim();
	if (filter) config.ldap_search_filter = filter;

	const attributes = parseLdapAttributes(form.attributes);
	if (attributes.length) config.ldap_attributes = attributes;

	if (form.allowInsecure && ldapUrlCanBePlaintext(form.url)) {
		config.ldap_allow_insecure = true;
	}

	return { contacts: config };
}

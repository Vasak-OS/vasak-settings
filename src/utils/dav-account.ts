/**
 * Lo que necesita el formulario «Otro servidor (CalDAV/CardDAV)» para armar una
 * cuenta de contraseña, separado del `.vue` para poder probarlo.
 *
 * Una cuenta DAV se registra con el mismo camino que IMAP/SMTP
 * (`register_password_account`): el servicio guarda las capacidades tal como se
 * las arma acá, y la contraseña aparte, cifrada. La forma de cada capacidad es
 * la misma que guarda Nextcloud al conectar —`url`, `username`, `auth: "basic"`—
 * para que el sincronizador no tenga que distinguir de dónde salió la cuenta.
 *
 * ── Por qué hay presets ──────────────────────────────────────────────────────
 *
 * iCloud, Yahoo y Fastmail hablan CalDAV/CardDAV estándar, pero reparten el
 * calendario y los contactos en hosts distintos y en una ruta propia de cada
 * persona, con un identificador que sólo se conoce después de autenticarse. Una
 * URL fija no serviría: hay que preguntarle al servidor dónde viven las
 * colecciones (RFC 6764). Cada preset trae el **dominio** contra el que hacer esa
 * búsqueda para cada capacidad; el recorrido lo hace `discover_dav`, que ya
 * existe y usa el formulario de correo. «Otro servidor» no trae dominios: la
 * búsqueda sale del correo que escribe la persona, o escribe la URL a mano.
 */

import type { DavDiscovery } from '@/services/accounts.service';

/**
 * La forma en que se guarda una capacidad DAV, igual que la de Nextcloud.
 *
 * Es un alias de tipo y no una interfaz a propósito: así tiene índice implícito
 * y encaja en el `Record<string, Record<string, unknown>>` que pide
 * `register_password_account`, sin castear.
 */
export type DavCapabilityConfig = {
	url: string;
	username: string;
	auth: 'basic';
};

/**
 * Las capacidades DAV que una cuenta declara, por su nombre (`calendar`,
 * `contacts`). Un `Record` y no una forma con claves opcionales para que sea
 * asignable al parámetro del comando sin castear.
 */
export type DavCapabilities = Record<string, DavCapabilityConfig>;

/** Lo que el formulario sabe de las direcciones y el usuario. */
export interface DavFormUrls {
	calendarUrl: string;
	contactsUrl: string;
	username: string;
}

/**
 * Un proveedor DAV con la dirección conocida.
 *
 * `providerType` es lo que se guarda en la cuenta y lo que el servicio busca en
 * su catálogo para el resumen: tiene que coincidir con el `id` del `.toml` de
 * `vasak-accounts` (`icloud`, `yahoo`, `fastmail`). «Otro servidor» usa
 * `carddav`, el genérico.
 */
export interface DavPreset {
	providerType: string;
	/** El sufijo de la clave de i18n: `views.onlineAccounts.dav.presets.<labelKey>`. */
	labelKey: string;
	/** El dominio contra el que buscar el calendario, o `undefined` para «Otro». */
	calendarDomain?: string;
	/** El dominio contra el que buscar los contactos, o `undefined` para «Otro». */
	contactsDomain?: string;
	/** Si el proveedor exige una contraseña específica de aplicación. */
	appPassword: boolean;
}

/**
 * Los proveedores que ofrece el selector, en orden. «Otro» primero: es el
 * genérico y el que no depende de ningún host en particular.
 */
export const DAV_PRESETS: DavPreset[] = [
	{ providerType: 'carddav', labelKey: 'other', appPassword: false },
	{
		providerType: 'icloud',
		labelKey: 'icloud',
		calendarDomain: 'caldav.icloud.com',
		contactsDomain: 'contacts.icloud.com',
		appPassword: true,
	},
	{
		providerType: 'yahoo',
		labelKey: 'yahoo',
		calendarDomain: 'caldav.calendar.yahoo.com',
		contactsDomain: 'carddav.address.yahoo.com',
		appPassword: true,
	},
	{
		providerType: 'fastmail',
		labelKey: 'fastmail',
		calendarDomain: 'caldav.fastmail.com',
		contactsDomain: 'carddav.fastmail.com',
		appPassword: true,
	},
];

/** El preset de un `providerType`, o el genérico «Otro» si no se reconoce. */
export function getDavPreset(providerType: string): DavPreset {
	return DAV_PRESETS.find((preset) => preset.providerType === providerType) ?? DAV_PRESETS[0];
}

/**
 * Una dirección es usable sólo si es HTTPS.
 *
 * La contraseña de aplicación viaja en cada pedido por autenticación básica: sin
 * cifrado iría a la vista de cualquiera en la red. El servicio la rechaza, pero
 * decirlo acá evita guardar una cuenta que no va a sincronizar nunca.
 */
export function isSecureDavUrl(url: string): boolean {
	const trimmed = url.trim();
	if (!trimmed) return false;
	try {
		return new URL(trimmed).protocol === 'https:';
	} catch {
		return false;
	}
}

/** Si hay al menos una dirección escrita: sin ninguna no hay nada que conectar. */
export function hasAnyDavUrl(urls: Pick<DavFormUrls, 'calendarUrl' | 'contactsUrl'>): boolean {
	return urls.calendarUrl.trim().length > 0 || urls.contactsUrl.trim().length > 0;
}

/**
 * Arma las capacidades desde lo que hay en el formulario.
 *
 * Sólo las que tienen dirección: una capacidad sin URL no se declara, porque la
 * cuenta la ofrecería y ninguna aplicación tendría adónde ir. La dirección se
 * recorta, que es lo que el servicio espera.
 */
export function buildDavCapabilities(urls: DavFormUrls): DavCapabilities {
	const capabilities: DavCapabilities = {};
	const username = urls.username.trim();
	const calendarUrl = urls.calendarUrl.trim();
	const contactsUrl = urls.contactsUrl.trim();

	if (calendarUrl) {
		capabilities.calendar = { url: calendarUrl, username, auth: 'basic' };
	}
	if (contactsUrl) {
		capabilities.contacts = { url: contactsUrl, username, auth: 'basic' };
	}
	return capabilities;
}

/** La firma de `discoverDav`, para poder inyectar un doble en las pruebas. */
export type DavDiscoverFn = (
	account: string,
	username: string,
	password: string
) => Promise<DavDiscovery>;

/**
 * Busca las direcciones de un preset, cada capacidad contra su propio dominio.
 *
 * iCloud y Yahoo tienen el calendario y los contactos en hosts distintos, así
 * que se pregunta una vez por cada uno y se toma de cada respuesta la mitad que
 * corresponde. Cuando los dos dominios coinciden —o cuando no hay ninguno y sale
 * del correo— alcanza con una sola consulta.
 */
export async function discoverPresetDav(
	preset: DavPreset,
	username: string,
	password: string,
	discover: DavDiscoverFn
): Promise<DavDiscovery> {
	const calendarAccount = preset.calendarDomain ?? username;
	const contactsAccount = preset.contactsDomain ?? username;

	if (calendarAccount === contactsAccount) {
		return discover(calendarAccount, username, password);
	}

	const [calendarResult, contactsResult] = await Promise.all([
		discover(calendarAccount, username, password),
		discover(contactsAccount, username, password),
	]);

	return {
		calendar: calendarResult.calendar,
		contacts: contactsResult.contacts,
	};
}

/**
 * Del `Icon` que informa BlueZ a la clave i18n de qué es el dispositivo.
 *
 * `Icon` es el **nombre de un icono del tema** —`audio-headset`, `input-mouse`—,
 * que BlueZ deriva de la clase del dispositivo o, para los de baja energía,
 * de su `Appearance`. Sirve para dibujar el icono, no para leerlo: la fila lo
 * mostraba tal cual y decía `audio-headset` donde tenía que decir «Auricular».
 * Acá cada nombre se traduce a una clave, y el `t()` de la vista la vuelve
 * una palabra en el idioma del escritorio.
 */

/**
 * Los dieciocho nombres que `Icon` puede tomar, con su clave.
 *
 * Salen de `src/dbus-common.c` de BlueZ, de `class_to_icon` (por la clase del
 * dispositivo) y `gap_appearance_to_icon` (por la apariencia GAP). Son todos
 * los que hay: cualquier otro valor es un BlueZ más nuevo que este mapa, y cae
 * en `unknown` en vez de romper nada.
 *
 * La clave va en camelCase porque así están las demás del yml; el nombre del
 * icono queda como lo da BlueZ, con guiones.
 */
export const DEVICE_KINDS: Readonly<Record<string, string>> = {
	'audio-card': 'audioCard',
	'audio-headphones': 'audioHeadphones',
	'audio-headset': 'audioHeadset',
	'camera-photo': 'cameraPhoto',
	'camera-video': 'cameraVideo',
	computer: 'computer',
	'input-gaming': 'inputGaming',
	'input-keyboard': 'inputKeyboard',
	'input-mouse': 'inputMouse',
	'input-tablet': 'inputTablet',
	modem: 'modem',
	'multimedia-player': 'multimediaPlayer',
	'network-wireless': 'networkWireless',
	phone: 'phone',
	printer: 'printer',
	scanner: 'scanner',
	'video-display': 'videoDisplay',
	unknown: 'unknown',
};

/** El prefijo de todas las claves del tipo en los yml. */
export const DEVICE_KIND_KEY_PREFIX = 'views.networkBluetooth.kinds.';

/**
 * La clave i18n para el `Icon` de un dispositivo.
 *
 * Sin icono, vacío o con un nombre que el mapa no conoce, es «dispositivo
 * Bluetooth» a secas: mejor un genérico verdadero que un nombre técnico o el
 * alias repetido, que ya es el título de la fila.
 *
 * Va `Object.hasOwn` y no un acceso directo: el mapa es un objeto, y un
 * `Icon` que se llame `constructor` o `toString` encontraría lo heredado.
 */
export function deviceKindKey(icon?: string | null): string {
	const kind = icon && Object.hasOwn(DEVICE_KINDS, icon) ? DEVICE_KINDS[icon] : 'unknown';
	return `${DEVICE_KIND_KEY_PREFIX}${kind}`;
}

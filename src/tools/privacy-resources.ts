/**
 * Los recursos que lista «Privacidad y seguridad», con su nombre y su icono.
 *
 * Vive aparte de la vista para poder probarlo sin montarla: montar la vista
 * pide doblar el i18n, y la suite ya tiene un `mock.module` de ese módulo en
 * otro archivo —dos del mismo dan verde o rojo según el orden en que Bun evalúe
 * los archivos—. Y lo que se rompe acá se rompe callado: un recurso nuevo sin
 * su entrada en el mapa se dibuja con la clave cruda o con el candado genérico,
 * y la pantalla sigue viéndose bien.
 */

import { ICONO_DE_CAPACIDAD } from '@/tools/icono-de-proveedor';

/**
 * Lo que se puede decidir desde esta pantalla, en el orden en que se muestra.
 *
 * Las credenciales van primero a propósito. Es lo que más daño hace si se
 * pierde —una clave de SSH sin frase abre servidores, un token abre la cuenta
 * sin segundo factor— y lo que la persona menos espera que una aplicación
 * cualquiera pueda leer.
 */
export const PRIVACY_RESOURCES = [
	'credentials',
	// Las cuentas van acá y no en su propia pantalla: son lo único de esta lista
	// que se hace cumplir de verdad —`vasak-accounts` le pregunta a este
	// servicio por cada acceso, así que negar acá niega—, y quien abre
	// «Privacidad» viene justamente a preguntar quién puede leer su correo.
	'account.email',
	'account.calendar',
	'account.contacts',
	'account.chat',
	'account.drive',
	'account.tasks',
	// Leer lo que el sincronizador de cuentas ya guardó en el almacén local
	// cifrado. Es otra cosa que `account.*`: aquello llega a la credencial y
	// habla con el servidor; esto sólo lee lo que ya está en el equipo. Van
	// justo debajo de las cuentas porque es el mismo dato visto desde el disco,
	// y quien busca «quién lee mi correo» tiene que encontrar las dos puertas
	// juntas. Uno solo por área, de lectura: dos diálogos casi iguales por área
	// confunden más de lo que protegen (supuesto 4 de `vasak-accounts#23`).
	'store.email',
	'store.calendar',
	'store.contacts',
	'camera',
	'microphone',
	// Compartir la pantalla llega sólo por el portal, así que sus entradas son
	// las únicas de esta lista identificadas por un nombre que declara la propia
	// aplicación. Va acá igual: el criterio de esta pantalla es que todo lo que
	// se concede se tiene que poder retirar, y antes esto no se podía.
	'screen-capture',
] as const;

export type PrivacyResource = (typeof PRIVACY_RESOURCES)[number];

/**
 * La clave de traducción de cada recurso, bajo `views.privacySecurity.resources`.
 *
 * Aparte del id porque los de cuenta y los del almacén llevan un punto
 * (`account.email`, `store.email`) y las claves se resuelven partiendo por
 * punto: usar el id tal cual bajaría a una clave que no existe y se dibujaría
 * cruda. Ya había costado eso una vez.
 */
export const RESOURCE_LABEL_KEYS: Readonly<Record<string, string>> = {
	'account.email': 'accountEmail',
	'account.calendar': 'accountCalendar',
	'account.contacts': 'accountContacts',
	'account.chat': 'accountChat',
	'account.drive': 'accountDrive',
	'account.tasks': 'accountTasks',
	'store.email': 'storeEmail',
	'store.calendar': 'storeCalendar',
	'store.contacts': 'storeContacts',
	// Sin punto, pero con guion: la clave iría a `resources.screen-capture`, que
	// existiría si se escribiera así en el catálogo. Se mapea igual para que las
	// claves de traducción sigan todas la misma forma y no haya que recordar
	// cuál de ellas lleva guion.
	'screen-capture': 'screenCapture',
};

/** La clave completa del nombre de un recurso, lista para `t()`. */
export const resourceLabelKey = (id: string): string =>
	`views.privacySecurity.resources.${RESOURCE_LABEL_KEYS[id] ?? id}`;

/**
 * El icono de cada recurso en la lista.
 *
 * Del tema, no dibujados acá: son los nombres que el escritorio ya usa para
 * esas mismas cosas —el sobre del correo, la cámara web, el micrófono—, así que
 * siguen la variante clara u oscura y cambian con el pack de iconos.
 *
 * Ninguno es el logo de un proveedor: acá el permiso es sobre *el tipo de
 * dato*, no sobre una cuenta. «Correo de tus cuentas» vale para todas las que
 * haya conectadas.
 */
export const RESOURCE_ICONS: Readonly<Record<string, string>> = {
	credentials: 'dialog-password',
	camera: 'camera-web',
	microphone: 'audio-input-microphone',
	'screen-capture': 'video-display',
	// Los de cuenta y los del almacén salen de la misma tabla que usa «Cuentas
	// en Línea», con el prefijo del recurso: el id de capacidad `email` es el
	// recurso `account.email` y también `store.email`, porque es el mismo tipo
	// de dato. Lo que los distingue en la lista es el nombre, que dice si se
	// llega a la cuenta o se lee lo guardado en el equipo. Dos tablas se separan
	// y la misma cosa termina dibujada distinta según por dónde se entre.
	...Object.fromEntries(
		Object.entries(ICONO_DE_CAPACIDAD).map(([capability, icon]) => [`account.${capability}`, icon])
	),
	...Object.fromEntries(
		(['email', 'calendar', 'contacts'] as const).map((capability) => [
			`store.${capability}`,
			ICONO_DE_CAPACIDAD[capability],
		])
	),
};

/** El nombre del icono de un recurso, con el genérico de respaldo. */
export const resourceIcon = (id: string): string => RESOURCE_ICONS[id] ?? 'security-high';

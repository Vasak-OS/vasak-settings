/**
 * El esquema «Personalizado»: cómo se crea y cómo se le cambia un color.
 *
 * Todo lo de acá es puro —no toca Tauri ni Vue— para poder probarlo sin
 * montar la vista. Lo que escribe en disco vive en `useCustomScheme`.
 */

import { contraste, MINIMO_TEXTO } from '@vasakgroup/plugin-config-manager';
import type {
	AnsiColorName,
	SchemeColorPatch,
	SchemeFile,
	SchemeVariantColors,
	SchemeVariantName,
} from '@/types/scheme';

/** El id del esquema del usuario. Es también el nombre del archivo: `custom.json`. */
export const CUSTOM_SCHEME_ID = 'custom';

/** Las dos variantes, en el orden en que las muestra el editor. */
export const SCHEME_VARIANTS: readonly SchemeVariantName[] = ['dark', 'light'];

/** Los 16 colores ANSI de la terminal, en el orden de la paleta. */
export const ANSI_COLOR_NAMES: readonly AnsiColorName[] = [
	'black',
	'red',
	'green',
	'yellow',
	'blue',
	'magenta',
	'cyan',
	'white',
	'brightBlack',
	'brightRed',
	'brightGreen',
	'brightYellow',
	'brightBlue',
	'brightMagenta',
	'brightCyan',
	'brightWhite',
];

/**
 * Una copia profunda de un esquema.
 *
 * Por JSON y no con `structuredClone`: el esquema suele llegar desde el estado
 * de Vue, envuelto en un `Proxy` reactivo, y `structuredClone` no copia un
 * `Proxy` —tira `DataCloneError`—. El esquema es un JSON, así que ida y vuelta
 * por JSON no pierde nada.
 */
export function cloneScheme<T>(scheme: T): T {
	return JSON.parse(JSON.stringify(scheme)) as T;
}

/** Lo que cambia al clonar: todo lo demás sale igual que en el esquema base. */
export type CloneIdentity = {
	name: string;
	author: string;
	description: string;
};

/**
 * Una copia del esquema base, entera, que pasa a ser el «Personalizado».
 *
 * Se copia **todo** el archivo —las dos variantes, la terminal con sus 16
 * ANSI, y cualquier clave que el modelo no conozca— y sólo se reemplazan el
 * id, el nombre, el autor y la descripción. Así el punto de partida es un
 * esquema que ya funciona, no uno armado de cero.
 *
 * La copia es profunda: editar el «Personalizado» no puede tocar el esquema
 * del sistema que quedó en la lista.
 */
export function cloneAsCustom(base: SchemeFile, identity: CloneIdentity): SchemeFile {
	const copy = cloneScheme(base);
	copy.id = CUSTOM_SCHEME_ID;
	copy.name = identity.name;
	copy.author = identity.author;
	copy.description = identity.description;
	return copy;
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Si el valor es un color que el esquema acepta: `#rgb` o `#rrggbb`. */
export function isHexColor(value: unknown): value is string {
	return typeof value === 'string' && HEX_COLOR.test(value.trim());
}

/**
 * El color en `#rrggbb` minúscula, o `null` si no es un color.
 *
 * `<input type="color">` sólo acepta la forma larga: con `#abc` se queda en
 * negro sin avisar.
 */
export function toLongHex(value: string): string | null {
	const trimmed = value.trim();
	if (!isHexColor(trimmed)) return null;
	const digits = trimmed.slice(1).toLowerCase();
	if (digits.length === 6) return `#${digits}`;
	return `#${[...digits].map((digit) => digit + digit).join('')}`;
}

/**
 * Copia en `target` los colores de `patch` que sean colores de verdad.
 *
 * Lo que no pasa `isHexColor` se descarta: un campo a medio escribir no puede
 * llegar al archivo y dejar a todo el escritorio sin un color. Las claves que
 * `target` ya tiene y el cambio no nombra quedan como estaban.
 */
function mergeColors(target: Record<string, unknown>, patch: Record<string, unknown>): void {
	for (const [key, value] of Object.entries(patch)) {
		if (value === undefined) continue;
		if (value !== null && typeof value === 'object') {
			const current = target[key];
			const nested =
				current !== null && typeof current === 'object' ? (current as Record<string, unknown>) : {};
			mergeColors(nested, value as Record<string, unknown>);
			target[key] = nested;
		} else if (isHexColor(value)) {
			target[key] = value.trim();
		}
	}
}

/**
 * El esquema con los colores del cambio aplicados sobre una variante.
 *
 * Devuelve un esquema nuevo y deja el recibido intacto, para que quien lo
 * tenga guardado —el estado de Vue, una prueba— no lo vea cambiar por debajo.
 */
export function applyColorPatch(
	scheme: SchemeFile,
	variant: SchemeVariantName,
	patch: SchemeColorPatch
): SchemeFile {
	const next = cloneScheme(scheme);
	mergeColors(
		next.colors[variant] as unknown as Record<string, unknown>,
		patch as Record<string, unknown>
	);
	return next;
}

/** Un par texto/fondo cuyo contraste se muestra al lado de sus colores. */
export type ContrastPair = {
	id: string;
	text: (colors: SchemeVariantColors) => string | undefined;
	background: (colors: SchemeVariantColors) => string | undefined;
};

/**
 * Los pares que se miden. Son los que la interfaz dibuja de verdad: el texto
 * sobre la ventana, sobre las tarjetas, y sobre los dos colores de marca.
 */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
	{ id: 'mainOnBackground', text: (c) => c.ui.text.main, background: (c) => c.ui.background },
	{ id: 'mutedOnBackground', text: (c) => c.ui.text.muted, background: (c) => c.ui.background },
	{ id: 'mainOnSurface', text: (c) => c.ui.text.main, background: (c) => c.ui.surface },
	{
		id: 'onPrimary',
		text: (c) => c.ui.text['on-primary'],
		background: (c) => c.ui.color.primary,
	},
	{
		id: 'onSecondary',
		text: (c) => c.ui.text['on-secondary'],
		background: (c) => c.ui.color.secondary,
	},
];

/** El mínimo de WCAG 1.4.3 para texto. Por debajo se avisa, no se prohíbe. */
export const MINIMUM_TEXT_CONTRAST = MINIMO_TEXTO;

export type ContrastResult = {
	id: string;
	ratio: number;
	passes: boolean;
};

/**
 * El contraste de cada par de la variante.
 *
 * El cálculo es el del plugin (`contraste`), el mismo que usa el escritorio
 * para corregir el texto sobre el primario: si acá se midiera distinto, la
 * pantalla podría avisar de un par que el escritorio da por bueno.
 *
 * Un par cuyo texto no está en el esquema —`on-secondary` en uno que no lo
 * trae— no se mide: no hay nada que mostrar.
 */
export function measureContrast(colors: SchemeVariantColors): ContrastResult[] {
	const results: ContrastResult[] = [];
	for (const pair of CONTRAST_PAIRS) {
		const text = pair.text(colors);
		const background = pair.background(colors);
		if (!text || !background) continue;
		const ratio = contraste(text, background);
		results.push({ id: pair.id, ratio, passes: ratio >= MINIMUM_TEXT_CONTRAST });
	}
	return results;
}

/** La razón como se muestra: dos decimales y `:1`. */
export function formatContrast(ratio: number): string {
	return `${ratio.toFixed(2)}:1`;
}

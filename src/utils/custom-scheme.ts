/**
 * El esquema «Personalizado»: cómo se crea y cómo se le cambia un color.
 *
 * Todo lo de acá es puro —no toca Tauri ni Vue— para poder probarlo sin
 * montar la vista. Lo que escribe en disco vive en `useCustomScheme`.
 */

import {
	applyColorPatch,
	cloneScheme,
	contrastRatio,
	isHexColor,
	MIN_TEXT_CONTRAST,
	SCHEME_VARIANTS,
} from '@vasakgroup/plugin-config-manager';
import type { AnsiColorName, SchemeFile, SchemeVariantColors } from '@/types/scheme';

/*
 * Copiar, validar un color y aplicar un cambio parcial están en el plugin desde
 * la 2.10.0: el escritorio escribe el mismo esquema cuando sigue al fondo, y
 * tiene que hacerlo con la misma regla. Se reexportan para que el editor los
 * siga encontrando acá.
 */
export { applyColorPatch, cloneScheme, isHexColor, SCHEME_VARIANTS };

/** El id del esquema del usuario. Es también el nombre del archivo: `custom.json`. */
export const CUSTOM_SCHEME_ID = 'custom';

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
export const MINIMUM_TEXT_CONTRAST = MIN_TEXT_CONTRAST;

export type ContrastResult = {
	id: string;
	ratio: number;
	passes: boolean;
};

/**
 * El contraste de cada par de la variante.
 *
 * El cálculo es el del plugin (`contrastRatio`), el mismo que usa el escritorio
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
		const ratio = contrastRatio(text, background);
		results.push({ id: pair.id, ratio, passes: ratio >= MINIMUM_TEXT_CONTRAST });
	}
	return results;
}

/** La razón como se muestra: dos decimales y `:1`. */
export function formatContrast(ratio: number): string {
	return `${ratio.toFixed(2)}:1`;
}

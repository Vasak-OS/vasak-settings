/**
 * El emblema de fastfetch, del lado de la ventana.
 *
 * Aparte de la vista para poder probarlo: la regla de qué campo aplica a qué
 * tipo de emblema, y cómo se normaliza antes de mandarla al backend, es corta
 * pero se equivoca callada —un `source` que viaja con el tipo `none`, o un ancho
 * en cero— y eso no se nota mirando la ventana.
 */

/** Los tipos que entiende fastfetch, más `none`. */
export type LogoKind = 'image' | 'builtin' | 'ascii' | 'none';

export interface FastfetchLogo {
	kind: LogoKind;
	source: string | null;
	width: number | null;
	height: number | null;
	padding: number | null;
}

/** `image` y `ascii` se leen de un archivo; `builtin` de un nombre. `none` no. */
export function usesSource(kind: LogoKind): boolean {
	return kind === 'image' || kind === 'ascii' || kind === 'builtin';
}

/** El tamaño sólo tiene sentido con un emblema que se dibuja. */
export function usesSize(kind: LogoKind): boolean {
	return kind !== 'none';
}

/** Un entero positivo, o `null` si no es válido: fastfetch ignora el campo. */
export function cleanSize(value: number | null | undefined): number | null {
	if (value == null || !Number.isFinite(value)) return null;
	const n = Math.floor(value);
	return n > 0 ? n : null;
}

/**
 * Normaliza lo que la ventana va a mandar: saca los campos que no aplican al
 * tipo elegido, para no escribir un `source` sobre un `none` ni un tamaño en
 * cero que fastfetch leería como un campo presente.
 */
export function normalizeLogo(logo: FastfetchLogo): FastfetchLogo {
	const kind = logo.kind;
	const source = usesSource(kind) && logo.source ? logo.source.trim() || null : null;
	return {
		kind,
		source,
		width: usesSize(kind) ? cleanSize(logo.width) : null,
		height: usesSize(kind) ? cleanSize(logo.height) : null,
		padding: usesSize(kind) ? cleanSize(logo.padding) : null,
	};
}

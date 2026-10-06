/**
 * Las coordenadas de la luz nocturna van como números al plugin, que las
 * valida antes de escribirlas en la unidad de systemd. El formulario las edita
 * como texto: esto traduce en los dos sentidos.
 */

/** `''` es «sin coordenada»; un texto que no es número, `undefined` (inválido). */
export function parseCoordinate(text: string): number | null | undefined {
	const trimmed = text.trim().replace(',', '.');
	if (trimmed === '') return null;
	const value = Number(trimmed);
	return Number.isFinite(value) ? value : undefined;
}

export function formatCoordinate(value: number | null): string {
	return value === null ? '' : String(value);
}

/**
 * El arreglo `modules` de fastfetch, de ida y de vuelta.
 *
 * En el config, un módulo es **una cadena** (correr con sus valores por omisión)
 * o **un objeto** `{ "type": "cpu", ...opciones }`. El editor trabaja con una
 * lista uniforme de `{ name, options }` ordenada; al guardar, un módulo sin
 * opciones vuelve a ser una cadena —más limpio y es lo que fastfetch espera—.
 *
 * Aparte del componente para poder probarlo.
 */

export interface ModuleEntry {
	name: string;
	options: Record<string, unknown>;
}

/** Los módulos que tiene sentido repetir: estructura de la lectura, no un dato.
 *  fastfetch corre cada aparición, así que varios separadores o saltos de línea
 *  son válidos; el selector de «agregar» los ofrece aunque ya estén. */
export const REPEATABLE_MODULES = new Set(['separator', 'break', 'custom', 'command']);

/** Qué módulos ofrecer para agregar: los que no están, más los repetibles aunque
 *  estén. */
export function availableModules<T extends { name: string }>(
	variants: readonly T[],
	enabled: ReadonlySet<string>,
	repeatable: ReadonlySet<string> = REPEATABLE_MODULES
): T[] {
	return variants.filter((v) => !enabled.has(v.name) || repeatable.has(v.name));
}

/** Lee el arreglo `modules` del config a la lista editable, en orden. Descarta lo
 *  que no sea ni cadena ni objeto con `type`. */
export function parseModules(configModules: unknown): ModuleEntry[] {
	if (!Array.isArray(configModules)) return [];
	const entries: ModuleEntry[] = [];
	for (const item of configModules) {
		if (typeof item === 'string') {
			entries.push({ name: item, options: {} });
		} else if (item && typeof item === 'object') {
			const obj = item as Record<string, unknown>;
			if (typeof obj.type === 'string') {
				const { type, ...options } = obj;
				entries.push({ name: type as string, options });
			}
		}
	}
	return entries;
}

/** Devuelve el arreglo `modules` listo para el config: cadena si no hay opciones,
 *  objeto `{ type, ...opciones }` si las hay. */
export function serializeModules(entries: ModuleEntry[]): unknown[] {
	return entries.map((entry) => {
		const keys = Object.keys(entry.options);
		if (keys.length === 0) return entry.name;
		return { type: entry.name, ...entry.options };
	});
}

/** Mueve un elemento de `from` a `to` (clamp), devolviendo una lista nueva. */
export function moveEntry<T>(list: T[], from: number, to: number): T[] {
	if (from < 0 || from >= list.length) return list;
	const target = Math.max(0, Math.min(list.length - 1, to));
	if (target === from) return list;
	const next = [...list];
	const [item] = next.splice(from, 1);
	next.splice(target, 0, item);
	return next;
}

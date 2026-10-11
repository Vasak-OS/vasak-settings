/**
 * Carga el schema empaquetado. Aparte de `fastfetch-schema.ts` para que las
 * funciones puras se puedan probar sin arrastrar los 280 KB del JSON, y para que
 * el parseo se haga una sola vez.
 *
 * Se importa como `?raw` —texto— a propósito: importar el `.json` directo haría
 * que el compilador infiera el tipo literal de todo el archivo, que es enorme y
 * vuelve lentísimo a `vue-tsc`.
 */

import raw from '@/assets/fastfetch-schema.json?raw';
import type { RootSchema } from './fastfetch-schema';

let cached: RootSchema | null = null;

export function loadFastfetchSchema(): RootSchema {
	cached ??= JSON.parse(raw) as RootSchema;
	return cached;
}

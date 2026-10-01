/**
 * Que los atributos que se le pasan a un componente propio sean props suyas.
 *
 * Vue no se queja de un atributo que el componente no declara: lo deja caer
 * sobre el elemento raíz como atributo HTML. `vue-tsc` tampoco, porque eso es
 * legal —así funciona el paso de atributos— y sólo marca las props
 * **obligatorias** que faltan.
 *
 * Así que un `type="error"` donde el componente espera `tone` no falla en
 * ningún lado: el mensaje se dibuja con el estilo por omisión y nadie se
 * entera. Pasó tres veces en este repositorio, dos de ellas con mensajes de
 * error dibujados como notas informativas — que es exactamente al revés de lo
 * que hace falta.
 *
 * Se lee el código, no se monta nada.
 */

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

/**
 * Lo que puede ir en cualquier componente sin ser una prop suya.
 *
 * Son los atributos que Vue pasa al elemento raíz a propósito, más los que el
 * propio Vue interpreta. Todo lo demás tiene que estar declarado.
 */
const ALWAYS_VALID = /^(class|style|id|key|ref|slot|is|title|role|tabindex)$/;
const VALID_PREFIXES = /^(v-|@|:|#|aria-|data-)/;

/** `is-on` → `isOn`. */
function toCamel(name: string): string {
	return name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/** Todos los `.vue` del proyecto. */
function vueFiles(dir: string): string[] {
	const output: string[] = [];
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) output.push(...vueFiles(path));
		else if (entry.endsWith('.vue')) output.push(path);
	}
	return output;
}

/**
 * Las props que declara un componente, de su `interface Props`.
 *
 * Se lee la interfaz y no `defineProps` con argumentos, que este repositorio
 * no usa. Un componente sin `interface Props` no declara ninguna, y entonces
 * cualquier atributo que reciba es paso al elemento raíz — no hay nada que
 * comprobar y se lo saltea.
 */
function propsOf(source: string): Set<string> | null {
	const m = source.match(/interface\s+Props\s*\{([\s\S]*?)\n\}/);
	if (!m) return null;
	const props = new Set<string>();
	for (const line of m[1].split('\n')) {
		const p = line.match(/^\s*(\w+)\??\s*:/);
		if (p) props.add(p[1]);
	}
	return props;
}

/**
 * Los atributos con los que se usa un componente en una plantilla.
 *
 * Se recorre la etiqueta respetando las comillas, no con un regex sobre el
 * texto: la primera versión partía por espacios y se llevaba las palabras de
 * adentro de los valores —`v-if="move.error.value"` daba un atributo llamado
 * `move.error.value`—, y además cortaba la etiqueta en el primer `>`, que
 * puede estar adentro de una expresión (`:x="a > b"`).
 */
function usages(source: string, componente: string): string[][] {
	const output: string[][] = [];
	const opening = new RegExp(`<${componente}(?=[\\s/>])`, 'g');

	for (const m of source.matchAll(opening)) {
		let i = m.index + m[0].length;
		const attributes: string[] = [];
		let token = '';
		let quote: string | null = null;

		for (; i < source.length; i++) {
			const c = source[i];
			if (quote) {
				if (c === quote) quote = null;
				continue;
			}
			if (c === '"' || c === "'") {
				quote = c;
				// Lo que había antes del `=` era el nombre; el valor se salta.
				token = '';
				continue;
			}
			if (c === '>') break;
			if (c === '=' || /\s/.test(c) || c === '/') {
				const name = token.trim();
				if (name) attributes.push(name);
				token = '';
				continue;
			}
			token += c;
		}
		const last = token.trim();
		if (last) attributes.push(last);
		output.push(attributes);
	}
	return output;
}

const components = new Map<string, Set<string>>();
for (const path of vueFiles('src/components')) {
	const props = propsOf(readFileSync(path, 'utf8'));
	if (props) components.set(basename(path, '.vue'), props);
}

describe('las props de los componentes propios', () => {
	test('hay componentes con props que revisar', () => {
		expect(components.size).toBeGreaterThan(5);
	});

	test('todo atributo que se les pasa es una prop suya', () => {
		const problems: string[] = [];
		for (const file of vueFiles('src')) {
			const source = readFileSync(file, 'utf8');
			for (const [name, props] of components) {
				for (const attributes of usages(source, name)) {
					for (const raw of attributes) {
						// `:cosa` ata la misma prop que `cosa`, y en la plantilla
						// las props en camelCase se escriben con guiones:
						// `is-on` es `isOn`. Es la forma normal de Vue, y sin
						// convertirla el test acusaba ciento veintiocho usos
						// perfectamente correctos.
						const attribute = toCamel(raw.replace(/^:/, ''));
						if (VALID_PREFIXES.test(raw) && !raw.startsWith(':')) continue;
						if (ALWAYS_VALID.test(attribute)) continue;
						if (props.has(attribute)) continue;
						problems.push(`${archivo}: <${nombre}> no tiene «${atributo}»`);
					}
				}
			}
		}
		expect(problems).toEqual([]);
	});
});

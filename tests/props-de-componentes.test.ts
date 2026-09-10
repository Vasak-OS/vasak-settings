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
const SIEMPRE_VALE = /^(class|style|id|key|ref|slot|is|title|role|tabindex)$/;
const PREFIJOS_VALIDOS = /^(v-|@|:|#|aria-|data-)/;

/** `is-on` → `isOn`. */
function aCamello(nombre: string): string {
	return nombre.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/** Todos los `.vue` del proyecto. */
function archivosVue(dir: string): string[] {
	const salida: string[] = [];
	for (const entrada of readdirSync(dir)) {
		const ruta = join(dir, entrada);
		if (statSync(ruta).isDirectory()) salida.push(...archivosVue(ruta));
		else if (entrada.endsWith('.vue')) salida.push(ruta);
	}
	return salida;
}

/**
 * Las props que declara un componente, de su `interface Props`.
 *
 * Se lee la interfaz y no `defineProps` con argumentos, que este repositorio
 * no usa. Un componente sin `interface Props` no declara ninguna, y entonces
 * cualquier atributo que reciba es paso al elemento raíz — no hay nada que
 * comprobar y se lo saltea.
 */
function propsDe(fuente: string): Set<string> | null {
	const m = fuente.match(/interface\s+Props\s*\{([\s\S]*?)\n\}/);
	if (!m) return null;
	const props = new Set<string>();
	for (const linea of m[1].split('\n')) {
		const p = linea.match(/^\s*(\w+)\??\s*:/);
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
function usos(fuente: string, componente: string): string[][] {
	const salida: string[][] = [];
	const apertura = new RegExp(`<${componente}(?=[\\s/>])`, 'g');

	for (const m of fuente.matchAll(apertura)) {
		let i = m.index + m[0].length;
		const atributos: string[] = [];
		let token = '';
		let comilla: string | null = null;

		for (; i < fuente.length; i++) {
			const c = fuente[i];
			if (comilla) {
				if (c === comilla) comilla = null;
				continue;
			}
			if (c === '"' || c === "'") {
				comilla = c;
				// Lo que había antes del `=` era el nombre; el valor se salta.
				token = '';
				continue;
			}
			if (c === '>') break;
			if (c === '=' || /\s/.test(c) || c === '/') {
				const nombre = token.trim();
				if (nombre) atributos.push(nombre);
				token = '';
				continue;
			}
			token += c;
		}
		const ultimo = token.trim();
		if (ultimo) atributos.push(ultimo);
		salida.push(atributos);
	}
	return salida;
}

const componentes = new Map<string, Set<string>>();
for (const ruta of archivosVue('src/components/ui')) {
	const props = propsDe(readFileSync(ruta, 'utf8'));
	if (props) componentes.set(basename(ruta, '.vue'), props);
}

describe('las props de los componentes propios', () => {
	test('hay componentes con props que revisar', () => {
		expect(componentes.size).toBeGreaterThan(5);
	});

	test('todo atributo que se les pasa es una prop suya', () => {
		const problemas: string[] = [];
		for (const archivo of archivosVue('src')) {
			const fuente = readFileSync(archivo, 'utf8');
			for (const [nombre, props] of componentes) {
				for (const atributos of usos(fuente, nombre)) {
					for (const bruto of atributos) {
						// `:cosa` ata la misma prop que `cosa`, y en la plantilla
						// las props en camelCase se escriben con guiones:
						// `is-on` es `isOn`. Es la forma normal de Vue, y sin
						// convertirla el test acusaba ciento veintiocho usos
						// perfectamente correctos.
						const atributo = aCamello(bruto.replace(/^:/, ''));
						if (PREFIJOS_VALIDOS.test(bruto) && !bruto.startsWith(':')) continue;
						if (SIEMPRE_VALE.test(atributo)) continue;
						if (props.has(atributo)) continue;
						problemas.push(`${archivo}: <${nombre}> no tiene «${atributo}»`);
					}
				}
			}
		}
		expect(problemas).toEqual([]);
	});
});

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
	CATEGORIAS,
	TERMINAL,
	tipoPrincipal,
	tiposQueIdentifican,
} from '../src/composables/categorias-de-aplicaciones';

/**
 * Que la pantalla de aplicaciones por defecto decida sobre tipos que existen.
 *
 * Una lista de tipos MIME no falla cuando está mal: un `x-scheme-handler/htps`
 * se escribe en `mimeapps.list` igual que uno bueno, `xdg-mime` lo acepta, la
 * pantalla dice que guardó — y el navegador sigue siendo el de antes, porque
 * nadie abre nunca un enlace de ese tipo. El error sólo aparece usando el
 * sistema, y ahí ya no se parece a un error de tipeo.
 *
 * La otra mitad es el catálogo de traducciones. Las etiquetas de las categorías
 * se piden con una clave armada —`views.defaultApps.categorias.${id}`— y por eso
 * `catalogos.test.ts` no las ve: busca `t('...')` literales. Una categoría nueva
 * sin su texto mostraría la clave cruda en la pantalla sin que nada falle, así
 * que se comprueba acá.
 */

const CATALOGOS = ['es', 'en'].map((idioma) => ({
	idioma,
	texto: readFileSync(
		fileURLToPath(new URL(`../src-tauri/locales/${idioma}.yml`, import.meta.url)),
		'utf8'
	),
}));

describe('las categorías', () => {
	test('cada una tiene identificador e icono', () => {
		for (const categoria of CATEGORIAS) {
			expect(categoria.id).toMatch(/^[a-z]+$/);
			expect(categoria.icono.length).toBeGreaterThan(0);
		}
	});

	test('no hay dos con el mismo identificador', () => {
		const ids = CATEGORIAS.map((c) => c.id);

		expect(new Set(ids).size).toBe(ids.length);
	});

	test('la única sin tipos MIME es la terminal', () => {
		// Es la excepción de la pantalla: no hay un tipo de archivo que se abra
		// «con una terminal», así que se escribe en otro lado. Si mañana otra
		// categoría queda sin tipos, va a ser por un descuido y no a propósito:
		// la vista la trataría como una categoría común y no guardaría nada.
		const sinTipos = CATEGORIAS.filter((c) => c.tipos.length === 0).map((c) => c.id);

		expect(sinTipos).toEqual([TERMINAL]);
	});

	test('los tipos MIME están bien escritos', () => {
		for (const categoria of CATEGORIAS) {
			for (const tipo of categoria.tipos) {
				expect(tipo).toMatch(/^[a-z-]+\/[a-z0-9.+-]+$/);
			}
		}
	});

	test('ningún tipo lo deciden dos categorías', () => {
		// Dos categorías sobre el mismo tipo se pisan: elegir en una cambia lo
		// que la otra muestra, y gana la última que alguien tocó.
		const todos = CATEGORIAS.flatMap((c) => c.tipos);

		expect(new Set(todos).size).toBe(todos.length);
	});

	test('el navegador decide los tres tipos y no sólo uno', () => {
		// Con sólo `https`, un enlace `http` de un correo sigue abriendo el
		// navegador anterior — y quien lo eligió no tiene forma de saber por qué.
		const navegador = CATEGORIAS.find((c) => c.id === 'navegador');

		expect(navegador?.tipos).toEqual([
			'x-scheme-handler/http',
			'x-scheme-handler/https',
			'text/html',
		]);
	});

	test('el navegador no se reconoce por text/html', () => {
		// Medido contra el equipo: listando por los tres tipos, «Navegador»
		// ofrecía el editor de texto de VasakOS, que declara `text/html` entre
		// sus veinte tipos y no maneja ningún enlace. Lo que distingue a un
		// navegador de un editor que abre HTML es el esquema.
		const navegador = CATEGORIAS.find((c) => c.id === 'navegador');

		expect(navegador && tiposQueIdentifican(navegador)).not.toContain('text/html');
		expect(navegador?.tipos).toContain('text/html');
	});

	test('las que no lo aclaran se reconocen por lo que escriben', () => {
		for (const categoria of CATEGORIAS) {
			if (categoria.identifican) continue;

			expect(tiposQueIdentifican(categoria)).toEqual(categoria.tipos);
		}
	});

	test('lo que identifica siempre es parte de lo que se escribe', () => {
		// Al revés se reconocería a una candidata por un tipo que después no se
		// le escribe: la pantalla la ofrece, alguien la elige, y el sistema no
		// la usa para eso.
		for (const categoria of CATEGORIAS) {
			for (const tipo of tiposQueIdentifican(categoria)) {
				expect(categoria.tipos).toContain(tipo);
			}
		}
	});

	test('el tipo principal es el primero, y la terminal no tiene', () => {
		for (const categoria of CATEGORIAS) {
			if (categoria.id === TERMINAL) {
				expect(tipoPrincipal(categoria)).toBeNull();
			} else {
				expect(tipoPrincipal(categoria)).toBe(categoria.tipos[0]);
			}
		}
	});
});

describe('las etiquetas', () => {
	test('cada categoría tiene su texto en los dos idiomas', () => {
		for (const { idioma, texto } of CATALOGOS) {
			for (const categoria of CATEGORIAS) {
				expect(texto, `falta ${categoria.id} en ${idioma}.yml`).toContain(`      ${categoria.id}:`);
			}
		}
	});
});

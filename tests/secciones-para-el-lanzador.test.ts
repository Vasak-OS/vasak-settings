/**
 * El catálogo de secciones que se instala para el lanzador.
 *
 * `vasak-prism` lo lee para ofrecer «Wi-Fi» o «Pantallas» como resultados que
 * abren esta ventana en esa sección. El archivo está generado —`bun run
 * secciones`— y committeado, así que lo que hay que cuidar es que no se separe
 * de la fuente: alguien agrega una pantalla, no regenera, y el lanzador sigue
 * ofreciendo la lista de antes sin que nada falle.
 *
 * Es el mismo motivo por el que existe `menu.test.ts`, un escalón más afuera:
 * ahí se cuida que ninguna pantalla quede sin entrada en el menú, y acá que
 * ninguna entrada del menú quede fuera de lo que se instala.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { comoSeEscribe, DESTINO, IDIOMAS, PALABRAS, type secciones } from '../scripts/secciones';
import { categoriasDelMenu } from '../src/composables/menu';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));

const escrito = readFileSync(DESTINO, 'utf8');
const leidas = JSON.parse(escrito) as ReturnType<typeof secciones>;

describe('el archivo que se instala', () => {
	test('es exactamente lo que genera el guion', () => {
		// Si esto falla, alguien tocó el menú o un catálogo y no corrió
		// `bun run secciones`. El lanzador seguiría con la lista de antes.
		expect(escrito).toBe(comoSeEscribe());
	});

	test('tiene todas las pantallas del menú y ninguna de más', () => {
		const delMenu = categoriasDelMenu((clave) => clave)
			.flatMap((categoria) => categoria.items ?? [])
			.map((item) => item.id);

		expect(leidas.map((una) => una.id).sort()).toEqual([...delMenu].sort());
	});

	test('cada una se puede abrir', () => {
		// El identificador es lo que se le pasa al programa —`vasak-settings
		// network-wifi`— y lo resuelve el router. Uno que el router no conozca
		// abre la portada, que para quien lo eligió es lo mismo que no hacer nada.
		const rutas = readFileSync(join(RAIZ, 'src/routes/index.ts'), 'utf8');

		for (const seccion of leidas) {
			expect(rutas, `${seccion.id} no está en el router`).toContain(`name: '${seccion.id}'`);
		}
	});

	test('está en los dos idiomas y sin textos vacíos', () => {
		// Un nombre vacío es una fila invisible en la lista del lanzador.
		for (const seccion of leidas) {
			for (const idioma of IDIOMAS) {
				expect(seccion.nombres[idioma]?.trim(), `${seccion.id} en ${idioma}`).toBeTruthy();
			}
		}
	});

	test('y los nombres no son las claves del catálogo', () => {
		// Si el parser del YAML dejara de encontrar el texto, lo que se
		// instalaría son claves crudas: «sidebar.items.home» como nombre de
		// sección, que es peor que no tener la sección.
		for (const seccion of leidas) {
			for (const idioma of IDIOMAS) {
				expect(seccion.nombres[idioma]).not.toContain('sidebar.items.');
			}
		}
	});

	test('cada una trae su icono', () => {
		// El lanzador lo pide por nombre al tema, igual que el menú de acá.
		for (const seccion of leidas) {
			expect(seccion.icono, `${seccion.id} sin icono`).toBeTruthy();
			expect(seccion.icono).not.toContain('/');
		}
	});
});

describe('las palabras con las que se busca cada sección', () => {
	test('están puestas sobre secciones que existen', () => {
		// Una clave mal escrita no rompe nada: la sección se genera sin palabras
		// y la tabla queda con una entrada que no se usa nunca. Es el error que
		// más fácil se cuela y el que menos se nota.
		const ids = new Set(leidas.map((una) => una.id));

		for (const id of Object.keys(PALABRAS)) {
			expect(ids.has(id), `«${id}» no es ninguna sección`).toBe(true);
		}
	});

	test('vienen en los dos idiomas', () => {
		// En uno solo es peor que en ninguno: la sesión en inglés encuentra menos
		// que la sesión en español y nadie sabe por qué.
		for (const seccion of leidas) {
			if (!seccion.palabras) continue;

			for (const idioma of IDIOMAS) {
				const suyas = seccion.palabras[idioma];
				expect(suyas, `${seccion.id} sin palabras en ${idioma}`).toBeDefined();
				expect(suyas?.length, `${seccion.id} con la lista vacía en ${idioma}`).toBeGreaterThan(0);
			}
		}
	});

	test('no están vacías ni repetidas ni en mayúsculas', () => {
		// En minúsculas porque lo que se escribe en el buscador también lo está,
		// y una mayúscula acá es una diferencia que no significa nada.
		for (const seccion of leidas) {
			for (const idioma of IDIOMAS) {
				const suyas = seccion.palabras?.[idioma] ?? [];

				for (const palabra of suyas) {
					expect(palabra.trim(), `${seccion.id}/${idioma}: palabra vacía`).toBeTruthy();
					expect(palabra, `${seccion.id}/${idioma}: «${palabra}»`).toBe(palabra.toLowerCase());
				}

				expect(new Set(suyas).size, `${seccion.id}/${idioma} con repetidas`).toBe(suyas.length);
			}
		}
	});

	test('y ninguna repite el nombre de su propia sección', () => {
		// El buscador ya mira el nombre. Una palabra que dice lo mismo no agrega
		// una forma de encontrar la sección: agrega una fila más que puntuar.
		for (const seccion of leidas) {
			for (const idioma of IDIOMAS) {
				const nombre = seccion.nombres[idioma]?.toLowerCase() ?? '';

				for (const palabra of seccion.palabras?.[idioma] ?? []) {
					expect(
						nombre.includes(palabra),
						`${seccion.id}/${idioma}: «${palabra}» ya está en «${nombre}»`
					).toBe(false);
				}
			}
		}
	});
});

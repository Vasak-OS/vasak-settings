/**
 * El catálogo de secciones que lee el lanzador, armado desde el menú.
 *
 * `vasak-prism` ofrece «Wi-Fi» o «Pantallas» como resultados que abren la
 * configuración en esa sección. Para eso necesita la lista, y la lista ya
 * existe: es el menú lateral de esta ventana. Lo que no puede hacer el lanzador
 * es leerla de acá —está en TypeScript, adentro de un `.vue` compilado— ni
 * copiarla, que es como se terminan dos listas que se separan.
 *
 * Así que se genera un archivo de datos que el paquete instala, y una prueba
 * comprueba que el archivo committeado es exactamente lo que sale de acá. Si
 * alguien agrega una pantalla y no regenera, la prueba lo dice.
 *
 *     bun run secciones
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { categoriasDelMenu } from '../src/composables/menu';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));

/** Los idiomas que la aplicación trae. */
export const IDIOMAS = ['es', 'en'] as const;

export interface Seccion {
	/** Lo que se le pasa al programa: `vasak-settings network-wifi`. */
	id: string;
	/** El icono del tema, el mismo que muestra el menú. */
	icono: string;
	/** El nombre en cada idioma, ya resuelto. */
	nombres: Record<string, string>;
}

/**
 * Los textos de un catálogo, aplanados como `sidebar.items.home`.
 *
 * Parser de andar por casa, como el de `catalogos.test.ts`: los catálogos son
 * planos por indentación y no hace falta más. Lo único que se le pide es leer
 * el valor, que aquél no necesitaba.
 */
function textosDe(yaml: string): Map<string, string> {
	const salida = new Map<string, string>();
	const camino: string[] = [];

	for (const linea of yaml.split('\n')) {
		if (!linea.trim() || linea.trim().startsWith('#')) continue;

		const sangria = linea.length - linea.trimStart().length;
		const contenido = linea.trim();
		const corte = contenido.indexOf(':');
		if (corte < 0) continue;

		const clave = contenido.slice(0, corte).trim();
		const valor = contenido.slice(corte + 1).trim();

		camino.length = sangria / 2;
		camino.push(clave);

		if (valor) {
			// Las comillas son del YAML, no del texto.
			salida.set(camino.join('.'), valor.replace(/^["']|["']$/g, ''));
		}
	}

	return salida;
}

/** Las secciones, con sus nombres resueltos en cada idioma. */
export function secciones(): Seccion[] {
	// El `t` devuelve la clave: lo que hace falta acá son los identificadores,
	// no los textos, y los textos salen del catálogo de cada idioma.
	const categorias = categoriasDelMenu((clave) => clave);

	const catalogos = new Map(
		IDIOMAS.map((idioma) => [
			idioma,
			textosDe(readFileSync(join(RAIZ, `src-tauri/locales/${idioma}.yml`), 'utf8')),
		])
	);

	const salida: Seccion[] = [];

	for (const categoria of categorias) {
		for (const item of categoria.items ?? []) {
			const nombres: Record<string, string> = {};

			for (const idioma of IDIOMAS) {
				const texto = catalogos.get(idioma)?.get(item.label);
				if (!texto) {
					throw new Error(`falta ${item.label} en ${idioma}.yml`);
				}
				nombres[idioma] = texto;
			}

			salida.push({ id: item.id, icono: item.icon ?? '', nombres });
		}
	}

	return salida;
}

export const DESTINO = join(RAIZ, 'packaging/secciones.json');

export function comoSeEscribe(): string {
	return `${JSON.stringify(secciones(), null, '\t')}\n`;
}

if (import.meta.main) {
	writeFileSync(DESTINO, comoSeEscribe());
	console.log(`${DESTINO}: ${secciones().length} secciones`);
}

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Que ningún texto de la interfaz quede fuera de los catálogos.
 *
 * La pantalla de inicio mostraba «Rendimiento», «CPU y RAM», «Procesador» y
 * once textos más escritos dentro del componente: en una sesión en inglés
 * salían igual en español, y nadie se enteraba porque la aplicación no falla
 * por eso. Estas dos pruebas lo hacen fallar acá.
 *
 * No se comprueba que los `.vue` no tengan texto suelto —hay ejemplos
 * legítimos, como el `placeholder` con la sintaxis de una regla de Wayfire—,
 * sino lo que sí es siempre un error: una clave que se usa y no existe, y una
 * clave que existe en un idioma y no en el otro.
 */

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const CATALOGOS = join(RAIZ, 'src-tauri/locales');

/** Las claves de un `.yml` plano por indentación, como `views.home.title`. */
function clavesDe(yaml: string): Set<string> {
	const claves = new Set<string>();
	const pila: string[] = [];

	for (const linea of yaml.split('\n')) {
		if (!linea.trim() || linea.trimStart().startsWith('#')) continue;
		const sangria = linea.length - linea.trimStart().length;
		const nivel = sangria / 2;
		// La clave puede venir entrecomillada, con comilla simple o doble: es como
		// el YAML escribe `'0_env'`, que empieza con un dígito, y `"on"`/`"off"`,
		// que sin comillas serían booleanos.
		const match = linea.trim().match(/^["']?([A-Za-z0-9_.-]+)["']?:(.*)$/);
		if (!match) continue;

		pila.length = nivel;
		pila[nivel] = match[1];
		// Con valor es una hoja; sin valor, un grupo que sólo abre camino.
		if (match[2].trim()) claves.add(pila.slice(0, nivel + 1).join('.'));
	}

	return claves;
}

function archivosDeCodigo(dir: string): string[] {
	const encontrados: string[] = [];
	for (const entrada of readdirSync(dir)) {
		const ruta = join(dir, entrada);
		if (statSync(ruta).isDirectory()) {
			encontrados.push(...archivosDeCodigo(ruta));
		} else if (/\.(vue|ts)$/.test(entrada)) {
			encontrados.push(ruta);
		}
	}
	return encontrados;
}

const es = clavesDe(readFileSync(join(CATALOGOS, 'es.yml'), 'utf8'));
const en = clavesDe(readFileSync(join(CATALOGOS, 'en.yml'), 'utf8'));

describe('catálogos de idioma', () => {
	test('los dos idiomas tienen las mismas claves', () => {
		const soloEnEspanol = [...es].filter((clave) => !en.has(clave)).sort();
		const soloEnIngles = [...en].filter((clave) => !es.has(clave)).sort();

		expect({ soloEnEspanol, soloEnIngles }).toEqual({ soloEnEspanol: [], soloEnIngles: [] });
	});

	test('cada clave que usa la interfaz existe', () => {
		// Sólo las literales: `t(\`views.${x}\`)` no se puede resolver acá y no
		// tiene sentido adivinarlo.
		const usoLiteral = /\bt\(\s*'([A-Za-z0-9_.-]+)'\s*[,)]/g;
		const faltantes: string[] = [];

		for (const archivo of archivosDeCodigo(join(RAIZ, 'src'))) {
			const texto = readFileSync(archivo, 'utf8');
			for (const uso of texto.matchAll(usoLiteral)) {
				const clave = uso[1];
				if (!es.has(clave)) {
					faltantes.push(`${archivo.slice(RAIZ.length)}: ${clave}`);
				}
			}
		}

		expect(faltantes.sort()).toEqual([]);
	});

	test('el catálogo se lee de verdad', () => {
		// Si el analizador de arriba se rompe, las dos pruebas anteriores pasan
		// con dos conjuntos vacíos y no protegen nada.
		expect(es.size).toBeGreaterThan(200);
		expect(es.has('views.home.title')).toBe(true);
		expect(es.has('windowControls.close')).toBe(true);
	});
});

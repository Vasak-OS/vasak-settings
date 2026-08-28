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

const MARCA = '<SwitchToggle';

/**
 * La etiqueta de apertura que arranca en `desde`. No sirve una expresión
 * regular: los atributos llevan valores con `>` adentro —`(v) => algo`— y
 * cortar en el primer `>` parte la etiqueta al medio.
 */
function etiquetaDeApertura(texto: string, desde: number): string {
	let comilla = '';
	for (let i = desde; i < texto.length; i++) {
		const caracter = texto[i];
		if (comilla) {
			if (caracter === comilla) comilla = '';
		} else if (caracter === '"' || caracter === "'") {
			comilla = caracter;
		} else if (caracter === '>') {
			return texto.slice(desde, i + 1);
		}
	}
	return texto.slice(desde);
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

	test('ninguna etiqueta visible va escrita en el componente', () => {
		// El caso que se escapó la primera vez: `label="Uso de CPU"` no es un
		// nodo de texto ni un atributo del documento, es una prop, y por eso
		// pasaba desapercibido. En una sesión en inglés la tarjeta salía mitad y
		// mitad.
		//
		// Se permiten los nombres propios y los términos que no se traducen: una
		// lista corta y explícita es mejor que dejar la comprobación afuera.
		const SIN_TRADUCIR = new Set(['Wi-Fi', 'Ethernet', 'Shell', 'GPU', 'CPU', 'RAM', 'VPN', 'IP']);
		const literal = /\s(?:label|hint)="([A-ZÁÉÍÓÚ][^"]{1,60})"/g;
		const encontradas: string[] = [];

		for (const archivo of archivosDeCodigo(join(RAIZ, 'src'))) {
			if (!archivo.endsWith('.vue')) continue;
			const texto = readFileSync(archivo, 'utf8');
			for (const uso of texto.matchAll(literal)) {
				if (!SIN_TRADUCIR.has(uso[1])) {
					encontradas.push(`${archivo.slice(RAIZ.length)}: ${uso[1]}`);
				}
			}
		}

		expect(encontradas.sort()).toEqual([]);
	});

	test('cada control sin texto propio recibe su etiqueta', () => {
		// `SwitchToggle` no tiene contenido: sólo la pista y el pulgar. El texto
		// que lo nombra está al lado, en un `<label>` o un `<h4>` que el
		// interruptor no referencia, así que un lector de pantalla anunciaba
		// «interruptor, activado» y nada más. La prop `label` lo resuelve, y el
		// typecheck lo exige — pero sólo mientras siga siendo obligatoria: alcanza
		// con darle un valor por omisión para «desbloquear» una vista y los
		// controles se quedan sin nombre otra vez, en silencio.
		const sinEtiqueta: string[] = [];

		for (const archivo of archivosDeCodigo(join(RAIZ, 'src'))) {
			if (!archivo.endsWith('.vue')) continue;
			const texto = readFileSync(archivo, 'utf8');
			for (let i = texto.indexOf(MARCA); i !== -1; i = texto.indexOf(MARCA, i + 1)) {
				if (/[\w-]/.test(texto[i + MARCA.length] ?? '')) continue;
				if (!/[\s:]label\s*=/.test(etiquetaDeApertura(texto, i))) {
					sinEtiqueta.push(archivo.slice(RAIZ.length));
				}
			}
		}

		expect(sinEtiqueta.sort()).toEqual([]);
	});

	test('el control se sigue llamando igual', () => {
		// Si se renombra `SwitchToggle`, la prueba de arriba pasa sin revisar nada.
		const usos = archivosDeCodigo(join(RAIZ, 'src'))
			.filter((archivo) => archivo.endsWith('.vue'))
			.flatMap((archivo) => readFileSync(archivo, 'utf8').split(MARCA).slice(1));

		expect(usos.length).toBeGreaterThan(30);
	});

	test('el catálogo se lee de verdad', () => {
		// Si el analizador de arriba se rompe, las dos pruebas anteriores pasan
		// con dos conjuntos vacíos y no protegen nada.
		expect(es.size).toBeGreaterThan(200);
		expect(es.has('views.home.title')).toBe(true);
		expect(es.has('windowControls.close')).toBe(true);
	});
});

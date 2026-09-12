import { describe, expect, test } from 'bun:test';
import { categoriasDelMenu } from '../src/composables/menu';

/**
 * Que ninguna pantalla quede sin forma de llegar.
 *
 * «Cuentas en Línea» estuvo cuatro meses así: la vista escrita y terminada, la
 * ruta declarada, el catálogo traducido — y ninguna entrada del menú que la
 * nombrara. Se había sacado del menú a propósito cuando estaba a medias, y al
 * terminarla nadie se acordó de devolverla. Nada falla cuando eso pasa: la
 * aplicación compila, los tests pasan y la pantalla sencillamente no existe
 * para quien usa el sistema.
 *
 * Las rutas se leen del archivo como texto. Importarlo levantaría `vue-router`
 * y, con él, las vistas: no hace falta ejecutar nada para saber qué pantallas
 * hay declaradas.
 */

/** Los identificadores del menú, sin traducir: el `t` devuelve la clave. */
const idsDelMenu = (): string[] =>
	categoriasDelMenu((clave) => clave).flatMap((categoria) => categoria.items.map((i) => i.id));

const nombresDeRuta = async (): Promise<string[]> => {
	const fuente = await Bun.file(new URL('../src/routes/index.ts', import.meta.url)).text();

	// Se mira **sólo el arreglo `routes`**, no el archivo entero. Más abajo hay
	// un `beforeEach` que redirige con `{ name: 'home' }`, y ese `name:` no es
	// una pantalla: es a dónde mandar a alguien que quiso entrar a una sección
	// cuyo hardware no está. Hoy no molesta porque `home` también es una ruta de
	// verdad, así que el duplicado no se nota; el día que esa redirección apunte
	// a otro lado, esto inventaría una pantalla huérfana que no existe —o, peor,
	// daría por buena una entrada del menú sin ruta—.
	const desde = fuente.indexOf('const routes = [');
	expect(desde).toBeGreaterThanOrEqual(0);
	// El arreglo cierra con `];` al principio de una línea. Si algún día se
	// escribe de otra forma, esto falla en vez de leer el archivo entero.
	const hasta = fuente.indexOf('\n];', desde);
	expect(hasta).toBeGreaterThan(desde);
	const registro = fuente.slice(desde, hasta);

	// `name:` y no `path:`: la ruta de la portada es `/` y su nombre es `home`,
	// que es lo que usa el menú. Y va sin anclar al principio de la línea porque
	// las rutas cortas se declaran enteras en un renglón.
	//
	// Las dos comillas y el espacio flexible no son por gusto: leyendo sólo
	// `name: '…'`, una ruta escrita con comillas dobles no la ve **ninguna** de
	// las dos comprobaciones, así que quedaría fuera del menú sin que esto
	// dijera nada — que es exactamente el descuido que esta prueba existe para
	// encontrar.
	//
	// La comilla de cierre es la misma que la de apertura —de ahí la
	// retrorreferencia— para no dar por buena una mezcla de las dos. Una así no
	// compila, pero si aparece conviene que caiga en el recuento de abajo y no
	// que pase como un nombre leído.
	const nombres = [...registro.matchAll(/\bname\s*:\s*(['"])([^'"]+)\1/g)].map((m) => m[2]);

	// Y si algún día se declaran de una forma que esto no sabe leer, que falle
	// acá en vez de comprobar de menos en silencio.
	const cuantos = [...registro.matchAll(/\bname\s*:/g)].length;
	expect(nombres.length).toBe(cuantos);

	return nombres;
};

/**
 * Las pantallas que a propósito no están en el menú.
 *
 * Tiene que quedar **vacía** salvo que haya un motivo escrito al lado. Una
 * pantalla que se esconde mientras se termina se anota acá, y así devolverla al
 * menú es parte de terminarla y no algo que se pueda olvidar.
 */
const FUERA_DEL_MENU = new Set<string>([]);

describe('el menú ofrece todas las pantallas', () => {
	test('cada ruta tiene su entrada', async () => {
		const enElMenu = new Set(idsDelMenu());
		const huerfanas = (await nombresDeRuta()).filter(
			(nombre) => !enElMenu.has(nombre) && !FUERA_DEL_MENU.has(nombre)
		);

		expect(huerfanas).toEqual([]);
	});

	test('y ninguna entrada apunta a una pantalla que no existe', async () => {
		// El otro lado del mismo descuido: una entrada que quedó cuando la vista
		// se renombró lleva a una pantalla en blanco.
		const rutas = new Set(await nombresDeRuta());
		expect(idsDelMenu().filter((id) => !rutas.has(id))).toEqual([]);
	});

	test('no hay dos entradas con el mismo identificador', () => {
		const ids = idsDelMenu();
		expect(ids.length).toBe(new Set(ids).size);
	});

	test('«Cuentas en Línea» está', () => {
		// Explícito además del recuento, porque es el caso que originó todo esto.
		expect(idsDelMenu()).toContain('online-accounts');
	});
});

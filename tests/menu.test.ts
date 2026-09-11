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
	// `name:` y no `path:`: la ruta de la portada es `/` y su nombre es `home`,
	// que es lo que usa el menú. Y va sin anclar al principio de la línea porque
	// las rutas cortas se declaran enteras en un renglón.
	return [...fuente.matchAll(/\bname: '([^']+)'/g)].map((m) => m[1]);
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

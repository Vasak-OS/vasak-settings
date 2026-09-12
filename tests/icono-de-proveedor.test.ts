import { describe, expect, test } from 'bun:test';
import {
	elegirIcono,
	ICONO_GENERICO,
	ICONO_ROTO,
	iconoDe,
	resolverIconosDeProveedores,
} from '../src/tools/icono-de-proveedor';

/**
 * Que la tarjeta de un proveedor nunca muestre el cuadrito de imagen rota.
 *
 * Es lo que pasaba con Google, Microsoft y Nextcloud: la vista pedía
 * `google-symbolic` y compañía, el tema no los tenía, y el plugin de iconos
 * —que resuelve con `FORCE_SYMBOLIC`— devolvía `image-missing` como si fuera el
 * icono pedido. La vista lo dibujaba sin enterarse: para ella era un `data:`
 * como cualquier otro.
 *
 * El arreglo de fondo fue sumar los iconos al pack. Esto es lo otro: que
 * mañana, cuando el catálogo de proveedores sume uno que el tema no conoce
 * —crece solo, con un `.toml` en `providers.d`—, no vuelva el cuadrito.
 *
 * Los valores son `data:` en la aplicación real; acá alcanza con que sean
 * distinguibles entre sí, porque lo único que se compara es la igualdad.
 */

const PROVEEDOR = 'data:image/svg+xml;base64,ELDELPROVEEDOR';
const GENERICO = 'data:image/svg+xml;base64,ELGENERICO';
const ROTO = 'data:image/svg+xml;base64,ELCUADRITO';

describe('iconoDe', () => {
	test('el nombre sale del id que da el servicio de cuentas', () => {
		expect(iconoDe('google')).toBe('google-symbolic');
		expect(iconoDe('microsoft')).toBe('microsoft-symbolic');
		expect(iconoDe('nextcloud')).toBe('nextcloud-symbolic');
	});

	test('los nombres de referencia son los del tema', () => {
		expect(ICONO_GENERICO).toBe('goa-account-symbolic');
		expect(ICONO_ROTO).toBe('image-missing');
	});
});

describe('elegirIcono', () => {
	test('si el proveedor tiene el suyo, ése', () => {
		expect(elegirIcono(PROVEEDOR, GENERICO, ROTO)).toBe(PROVEEDOR);
	});

	test('si el tema no lo tiene, el genérico en vez del cuadrito', () => {
		expect(elegirIcono(ROTO, GENERICO, ROTO)).toBe(GENERICO);
	});

	test('si el tema tampoco tiene el genérico, ninguno', () => {
		// Un tema sin `goa-account-symbolic` contesta el cuadrito a las dos
		// preguntas. Dibujarlo sería volver al síntoma por el otro camino.
		expect(elegirIcono(ROTO, ROTO, ROTO)).toBe('');
	});

	test('si la llamada al plugin falla, el genérico', () => {
		// El plugin devuelve `''` cuando la llamada falla, no cuando el icono no
		// existe. Es otro problema, pero la tarjeta se dibuja igual.
		expect(elegirIcono('', GENERICO, ROTO)).toBe(GENERICO);
	});

	test('sin referencia del cuadrito, lo que haya venido', () => {
		// Si ni siquiera `image-missing` se pudo resolver no hay con qué comparar,
		// y descartar el icono del proveedor por las dudas sería peor: es el caso
		// en el que probablemente esté bien.
		expect(elegirIcono(PROVEEDOR, GENERICO, '')).toBe(PROVEEDOR);
		expect(elegirIcono('', '', '')).toBe('');
	});
});

describe('resolverIconosDeProveedores', () => {
	/**
	 * Un tema que tiene todo lo que se le pida menos lo que diga `faltan`.
	 *
	 * Lo que falta contesta el cuadrito, que es lo que hace el plugin de iconos:
	 * no falla ni devuelve vacío, devuelve `image-missing` como si fuera el icono
	 * pedido. También lo contesta al preguntar por el cuadrito mismo, que es de
	 * dónde sale la referencia con la que se lo reconoce.
	 */
	const temaSin = (faltan: string[]) => {
		const pedidos: string[] = [];
		const pedir = async (nombre: string) => {
			pedidos.push(nombre);
			return `data:${faltan.includes(nombre) ? ICONO_ROTO : nombre}`;
		};
		return { pedir, pedidos };
	};

	test('un icono por proveedor', async () => {
		const { pedir } = temaSin([]);
		expect(await resolverIconosDeProveedores(['google', 'nextcloud'], pedir)).toEqual({
			google: 'data:google-symbolic',
			nextcloud: 'data:nextcloud-symbolic',
		});
	});

	test('el que el tema no tiene cae al genérico, y el resto no se entera', async () => {
		const { pedir } = temaSin(['proton-symbolic']);
		expect(await resolverIconosDeProveedores(['google', 'proton'], pedir)).toEqual({
			google: 'data:google-symbolic',
			proton: `data:${ICONO_GENERICO}`,
		});
	});

	test('el proveedor sin icono ni genérico no entra en el objeto', async () => {
		// La vista dibuja el icono sólo si el proveedor está, así que una entrada
		// vacía y una ausente dicen lo mismo: que quede una sola forma de decirlo.
		const { pedir } = temaSin(['proton-symbolic', ICONO_GENERICO]);
		expect(await resolverIconosDeProveedores(['proton'], pedir)).toEqual({});
	});

	test('los nombres de referencia se piden una vez, no una por proveedor', async () => {
		// Es la mitad del arreglo: antes cada tarjeta resolvía por su cuenta el
		// genérico y el cuadrito, o sea dos llamadas de más por proveedor.
		const { pedir, pedidos } = temaSin([]);
		await resolverIconosDeProveedores(['google', 'microsoft', 'nextcloud'], pedir);

		expect(pedidos.filter((n) => n === ICONO_ROTO)).toHaveLength(1);
		expect(pedidos.filter((n) => n === ICONO_GENERICO)).toHaveLength(1);
		expect(pedidos).toHaveLength(5);
	});

	test('sin proveedores, ningún icono', async () => {
		// El catálogo puede venir vacío si el servicio no está: la pantalla se
		// dibuja igual, con la tarjeta del servidor personalizado.
		const { pedir } = temaSin([]);
		expect(await resolverIconosDeProveedores([], pedir)).toEqual({});
	});
});

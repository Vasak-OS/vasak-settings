import { describe, expect, test } from 'bun:test';
import {
	ICONO_GENERICO,
	iconoDe,
	nombresDeIconos,
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

describe('iconoDe', () => {
	test('el nombre sale del id que da el servicio de cuentas', () => {
		expect(iconoDe('google')).toBe('google-symbolic');
		expect(iconoDe('microsoft')).toBe('microsoft-symbolic');
		expect(iconoDe('nextcloud')).toBe('nextcloud-symbolic');
	});

	test('el genérico es el que el tema trae para «una cuenta»', () => {
		expect(ICONO_GENERICO).toBe('goa-account-symbolic');
	});
});

describe('nombresDeIconos', () => {
	/** Un tema que tiene exactamente estos nombres, y anota qué se le preguntó. */
	const temaCon = (...nombres: string[]) => {
		const preguntas: string[] = [];
		const existe = async (nombre: string) => {
			preguntas.push(nombre);
			return nombres.includes(nombre);
		};
		return { existe, preguntas };
	};

	test('si el proveedor tiene el suyo, ése', async () => {
		const { existe } = temaCon('google-symbolic');
		expect(await nombresDeIconos(['google'], existe)).toEqual({ google: 'google-symbolic' });
	});

	test('si el tema no lo tiene, el genérico', async () => {
		const { existe } = temaCon(ICONO_GENERICO);
		expect(await nombresDeIconos(['proton'], existe)).toEqual({ proton: ICONO_GENERICO });
	});

	test('si el tema tampoco tiene el genérico, ninguno', async () => {
		const { existe } = temaCon();
		expect(await nombresDeIconos(['proton'], existe)).toEqual({});
	});

	test('con el tema completo no se pregunta por el genérico', async () => {
		// Es el caso normal desde que el pack tiene los tres iconos, y era una
		// llamada al plugin por pantalla que no hacía falta.
		const { existe, preguntas } = temaCon('google-symbolic', 'nextcloud-symbolic');
		await nombresDeIconos(['google', 'nextcloud'], existe);
		expect(preguntas).toEqual(['google-symbolic', 'nextcloud-symbolic']);
	});

	test('y si falta más de uno, se pregunta una sola vez', async () => {
		const { existe, preguntas } = temaCon(ICONO_GENERICO);
		await nombresDeIconos(['uno', 'otro', 'tercero'], existe);
		expect(preguntas.filter((n) => n === ICONO_GENERICO)).toHaveLength(1);
	});

	test('sin proveedores no se le pregunta nada al tema', async () => {
		const { existe, preguntas } = temaCon(ICONO_GENERICO);
		expect(await nombresDeIconos([], existe)).toEqual({});
		expect(preguntas).toEqual([]);
	});
});

describe('resolverIconosDeProveedores', () => {
	/**
	 * Un tema que tiene todo menos lo que diga `faltan`.
	 *
	 * `existe` es lo que ahora decide —`hasSymbol` en la aplicación— y `pedir`
	 * sólo trae lo ya elegido. Se anota lo que se pide para poder comprobar que
	 * no se pida de más: traer un icono es leer un archivo y codificarlo en
	 * base64.
	 */
	const temaSin = (faltan: string[]) => {
		const pedidos: string[] = [];
		const existe = async (nombre: string) => !faltan.includes(nombre);
		const pedir = async (nombre: string) => {
			pedidos.push(nombre);
			return `data:${nombre}`;
		};
		return { pedir, existe, pedidos };
	};

	test('un icono por proveedor', async () => {
		const { pedir, existe } = temaSin([]);
		expect(await resolverIconosDeProveedores(['google', 'nextcloud'], pedir, existe)).toEqual({
			google: 'data:google-symbolic',
			nextcloud: 'data:nextcloud-symbolic',
		});
	});

	test('el que el tema no tiene cae al genérico, y el resto no se entera', async () => {
		const { pedir, existe } = temaSin(['proton-symbolic']);
		expect(await resolverIconosDeProveedores(['google', 'proton'], pedir, existe)).toEqual({
			google: 'data:google-symbolic',
			proton: `data:${ICONO_GENERICO}`,
		});
	});

	test('el proveedor sin icono ni genérico no entra en el objeto', async () => {
		// La vista dibuja el icono sólo si el proveedor está, así que una entrada
		// vacía y una ausente dicen lo mismo: que quede una sola forma de decirlo.
		const { pedir, existe } = temaSin(['proton-symbolic', ICONO_GENERICO]);
		expect(await resolverIconosDeProveedores(['proton'], pedir, existe)).toEqual({});
	});

	test('sólo se pide lo que se va a dibujar', async () => {
		// Antes se pedían además el genérico y el cuadrito en cada tanda, siempre,
		// aunque el tema tuviera todo. Ahora eso se pregunta, que es más barato, y
		// el genérico ni se pregunta si no falta ninguno.
		const { pedir, existe, pedidos } = temaSin([]);
		await resolverIconosDeProveedores(['google', 'microsoft', 'nextcloud'], pedir, existe);

		expect(pedidos.toSorted()).toEqual([
			'google-symbolic',
			'microsoft-symbolic',
			'nextcloud-symbolic',
		]);
	});

	test('sin proveedores, ningún icono', async () => {
		// El catálogo puede venir vacío si el servicio no está: la pantalla se
		// dibuja igual, con la tarjeta del servidor personalizado.
		const { pedir, existe } = temaSin([]);
		expect(await resolverIconosDeProveedores([], pedir, existe)).toEqual({});
	});
});

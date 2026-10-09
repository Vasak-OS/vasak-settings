import { describe, expect, test } from 'bun:test';
import {
	GENERIC_ICON,
	pickIconNames,
	resolveProviderIcons,
	symbolNameFor,
} from '../src/utils/provider-icon';

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

describe('symbolNameFor', () => {
	test('el nombre sale del id que da el servicio de cuentas', () => {
		expect(symbolNameFor('google')).toBe('google-symbolic');
		expect(symbolNameFor('microsoft')).toBe('microsoft-symbolic');
		expect(symbolNameFor('nextcloud')).toBe('nextcloud-symbolic');
	});

	test('el genérico es el que el tema trae para «una cuenta»', () => {
		expect(GENERIC_ICON).toBe('goa-account-symbolic');
	});
});

describe('pickIconNames', () => {
	/** Un tema que tiene exactamente estos nombres, y anota qué se le preguntó. */
	const themeWith = (...names: string[]) => {
		const queries: string[] = [];
		const exists = async (name: string) => {
			queries.push(name);
			return names.includes(name);
		};
		return { exists, queries };
	};

	test('si el proveedor tiene el suyo, ése', async () => {
		const { exists } = themeWith('google-symbolic');
		expect(await pickIconNames(['google'], exists)).toEqual({ google: 'google-symbolic' });
	});

	test('si el tema no lo tiene, el genérico', async () => {
		const { exists } = themeWith(GENERIC_ICON);
		expect(await pickIconNames(['proton'], exists)).toEqual({ proton: GENERIC_ICON });
	});

	test('si el tema tampoco tiene el genérico, ninguno', async () => {
		const { exists } = themeWith();
		expect(await pickIconNames(['proton'], exists)).toEqual({});
	});

	test('con el tema completo no se pregunta por el genérico', async () => {
		// Es el caso normal desde que el pack tiene los tres iconos, y era una
		// llamada al plugin por pantalla que no hacía falta.
		const { exists, queries } = themeWith('google-symbolic', 'nextcloud-symbolic');
		await pickIconNames(['google', 'nextcloud'], exists);
		expect(queries).toEqual(['google-symbolic', 'nextcloud-symbolic']);
	});

	test('y si falta más de uno, se pregunta una sola vez', async () => {
		const { exists, queries } = themeWith(GENERIC_ICON);
		await pickIconNames(['uno', 'otro', 'tercero'], exists);
		expect(queries.filter((n) => n === GENERIC_ICON)).toHaveLength(1);
	});

	test('sin proveedores no se le pregunta nada al tema', async () => {
		const { exists, queries } = themeWith(GENERIC_ICON);
		expect(await pickIconNames([], exists)).toEqual({});
		expect(queries).toEqual([]);
	});
});

describe('resolveProviderIcons', () => {
	/**
	 * Un tema que tiene todo menos lo que diga `missing`.
	 *
	 * `exists` es lo que ahora decide —`hasSymbol` en la aplicación— y `fetchSymbol`
	 * sólo trae lo ya elegido. Se anota lo que se pide para poder comprobar que
	 * no se pida de más: traer un icono es leer un archivo y codificarlo en
	 * base64.
	 */
	const themeWithout = (missing: string[]) => {
		const fetched: string[] = [];
		const exists = async (name: string) => !missing.includes(name);
		const fetchSymbol = async (name: string) => {
			fetched.push(name);
			return `data:${name}`;
		};
		return { fetchSymbol, exists, fetched };
	};

	test('un icono por proveedor', async () => {
		const { fetchSymbol, exists } = themeWithout([]);
		expect(await resolveProviderIcons(['google', 'nextcloud'], fetchSymbol, exists)).toEqual({
			google: 'data:google-symbolic',
			nextcloud: 'data:nextcloud-symbolic',
		});
	});

	test('el que el tema no tiene cae al genérico, y el resto no se entera', async () => {
		const { fetchSymbol, exists } = themeWithout(['proton-symbolic']);
		expect(await resolveProviderIcons(['google', 'proton'], fetchSymbol, exists)).toEqual({
			google: 'data:google-symbolic',
			proton: `data:${GENERIC_ICON}`,
		});
	});

	test('el proveedor sin icono ni genérico no entra en el objeto', async () => {
		// La vista dibuja el icono sólo si el proveedor está, así que una entrada
		// vacía y una ausente dicen lo mismo: que quede una sola forma de decirlo.
		const { fetchSymbol, exists } = themeWithout(['proton-symbolic', GENERIC_ICON]);
		expect(await resolveProviderIcons(['proton'], fetchSymbol, exists)).toEqual({});
	});

	test('sólo se pide lo que se va a dibujar', async () => {
		// Antes se pedían además el genérico y el cuadrito en cada tanda, siempre,
		// aunque el tema tuviera todo. Ahora eso se pregunta, que es más barato, y
		// el genérico ni se pregunta si no falta ninguno.
		const { fetchSymbol, exists, fetched } = themeWithout([]);
		await resolveProviderIcons(['google', 'microsoft', 'nextcloud'], fetchSymbol, exists);

		expect(fetched.toSorted()).toEqual([
			'google-symbolic',
			'microsoft-symbolic',
			'nextcloud-symbolic',
		]);
	});

	test('sin proveedores, ningún icono', async () => {
		// El catálogo puede venir vacío si el servicio no está: la pantalla se
		// dibuja igual, con la tarjeta del servidor personalizado.
		const { fetchSymbol, exists } = themeWithout([]);
		expect(await resolveProviderIcons([], fetchSymbol, exists)).toEqual({});
	});
});

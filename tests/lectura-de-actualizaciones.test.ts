import { describe, expect, test } from 'bun:test';
import { leer } from '../src/services/actualizaciones.service';

/**
 * Que lo que contesta `vasak-update` se compruebe antes de dibujarlo.
 *
 * `informe_de_actualizaciones` devuelve el JSON del otro programa tal cual,
 * sin modelarlo: del lado de Rust es un valor cualquiera y las interfaces del
 * servicio son una promesa que TypeScript no puede comprobar. Son dos paquetes
 * que se versionan por separado —`vasak-settings` sólo lo recomienda—, así que
 * la promesa se puede romper sin que nadie toque el código.
 *
 * Importa más en la rama del fallo que en ninguna otra, porque esa rama sólo
 * se dibuja cuando algo ya falló: un error de tipos ahí deja la pantalla en
 * blanco justo cuando tenía que explicar el problema.
 */

const FALLO_COMPLETO = {
	que: { causa: 'firma' },
	explicacion: 'Una clave de firma está vencida.',
	arreglo: 'sudo pacman -Sy archlinux-keyring vasakos-keyring',
};

describe('leer', () => {
	test('deja pasar lo que vasak-update emite hoy', () => {
		const lectura = leer({
			pendientes: [{ nombre: 'linux', version_vieja: '6.1', version_nueva: '6.2' }],
			preflight: {
				paquetes: 1,
				kernels: ['linux'],
				pacnew: ['/etc/pacman.conf.pacnew'],
				boot_disponible_bytes: 100,
				boot_necesario_bytes: 50,
				hay_lugar_con_red: true,
				pide_reinicio: true,
			},
			fallo: null,
			// biome-ignore lint/suspicious/noExplicitAny: fixture sin tipar a propósito
		} as any);

		expect(lectura.pendientes).toHaveLength(1);
		expect(lectura.pendientes[0].nombre).toBe('linux');
		expect(lectura.preflight?.kernels).toEqual(['linux']);
		expect(lectura.preflight?.pide_reinicio).toBe(true);
		expect(lectura.fallo).toBeNull();
	});

	test('un fallo completo llega entero', () => {
		// biome-ignore lint/suspicious/noExplicitAny: fixture sin tipar a propósito
		const lectura = leer({ fallo: FALLO_COMPLETO } as any);
		expect(lectura.fallo?.que.causa).toBe('firma');
		expect(lectura.fallo?.arreglo).toContain('archlinux-keyring');
	});

	test('el detalle sólo queda si es texto', () => {
		const lectura = leer({
			fallo: { que: { causa: 'desconocido', detalle: 'error: algo' } },
			// biome-ignore lint/suspicious/noExplicitAny: fixture sin tipar a propósito
		} as any);
		expect(lectura.fallo?.que.detalle).toBe('error: algo');

		const roto = leer({
			fallo: { que: { causa: 'desconocido', detalle: { a: 1 } } },
			// biome-ignore lint/suspicious/noExplicitAny: fixture sin tipar a propósito
		} as any);
		expect(roto.fallo?.que.detalle).toBeUndefined();
	});

	/**
	 * Lo importante de todo el archivo. Un fallo mal formado no se descarta:
	 * descartarlo devolvería la pantalla a decir «el sistema está al día»
	 * cuando en realidad no se pudo averiguar, que es el error que esta rama
	 * existe para no cometer.
	 */
	test('un fallo sin «que» sigue siendo un fallo', () => {
		for (const roto of [{}, { que: null }, { que: 'firma' }, 'firma', 7]) {
			// biome-ignore lint/suspicious/noExplicitAny: fixture sin tipar a propósito
			const lectura = leer({ fallo: roto } as any);
			expect(lectura.fallo).not.toBeNull();
			expect(lectura.fallo?.que.causa).toBe('desconocido');
		}
	});

	test('sin fallo no se inventa uno', () => {
		// biome-ignore lint/suspicious/noExplicitAny: fixture sin tipar a propósito
		expect(leer({ pendientes: [] } as any).fallo).toBeNull();
		// biome-ignore lint/suspicious/noExplicitAny: fixture sin tipar a propósito
		expect(leer({ fallo: null } as any).fallo).toBeNull();
	});

	test('datos que no son un objeto no rompen nada', () => {
		for (const nada of [null, undefined, 'texto', 7, []]) {
			// biome-ignore lint/suspicious/noExplicitAny: fixture sin tipar a propósito
			const lectura = leer(nada as any);
			expect(lectura.pendientes).toEqual([]);
			expect(lectura.preflight).toBeNull();
			expect(lectura.fallo).toBeNull();
		}
	});

	test('las listas del preflight siempre son listas de texto', () => {
		const lectura = leer({
			preflight: { kernels: ['linux', 3, null], pacnew: 'no es una lista' },
			// biome-ignore lint/suspicious/noExplicitAny: fixture sin tipar a propósito
		} as any);
		expect(lectura.preflight?.kernels).toEqual(['linux']);
		expect(lectura.preflight?.pacnew).toEqual([]);
	});

	/**
	 * Si no se sabe, se asume que hay lugar. Al revés, un campo que falta
	 * pintaría un aviso de «/boot sin espacio» en un equipo sano, y esa alarma
	 * falsa enseña a ignorar la de verdad.
	 */
	test('hay_lugar_con_red sólo es falso si vino falso', () => {
		// biome-ignore lint/suspicious/noExplicitAny: fixture sin tipar a propósito
		expect(leer({ preflight: {} } as any).preflight?.hay_lugar_con_red).toBe(true);
		expect(
			// biome-ignore lint/suspicious/noExplicitAny: fixture sin tipar a propósito
			leer({ preflight: { hay_lugar_con_red: false } } as any).preflight?.hay_lugar_con_red
		).toBe(false);
	});

	test('una actualización sin nombre se descarta', () => {
		const lectura = leer({
			pendientes: [{ version_nueva: '6.2' }, { nombre: 'linux' }, null],
			// biome-ignore lint/suspicious/noExplicitAny: fixture sin tipar a propósito
		} as any);
		expect(lectura.pendientes).toHaveLength(1);
		expect(lectura.pendientes[0].version_vieja).toBe('');
	});
});

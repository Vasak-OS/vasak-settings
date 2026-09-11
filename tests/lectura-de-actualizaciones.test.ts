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
 *
 * Los fixtures se pasan con `as any` a propósito: son la respuesta cruda del
 * otro programa, y tiparlos sería afirmar la forma que estos tests existen para
 * comprobar. No llevan `biome-ignore` porque `noExplicitAny` está en `off` en
 * `biome.json`, así que suprimirla no hacía nada — y biome avisa de la
 * supresión inútil, que era lo que trababa el empaquetado.
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
		} as any);

		expect(lectura.pendientes).toHaveLength(1);
		expect(lectura.pendientes[0].nombre).toBe('linux');
		expect(lectura.preflight?.kernels).toEqual(['linux']);
		expect(lectura.preflight?.pide_reinicio).toBe(true);
		expect(lectura.fallo).toBeNull();
	});

	test('un fallo completo llega entero', () => {
		const lectura = leer({ fallo: FALLO_COMPLETO } as any);
		expect(lectura.fallo?.que.causa).toBe('firma');
		expect(lectura.fallo?.arreglo).toContain('archlinux-keyring');
	});

	test('el detalle sólo queda si es texto', () => {
		const lectura = leer({
			fallo: { que: { causa: 'desconocido', detalle: 'error: algo' } },
		} as any);
		expect(lectura.fallo?.que.detalle).toBe('error: algo');

		const roto = leer({
			fallo: { que: { causa: 'desconocido', detalle: { a: 1 } } },
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
			const lectura = leer({ fallo: roto } as any);
			expect(lectura.fallo).not.toBeNull();
			expect(lectura.fallo?.que.causa).toBe('desconocido');
		}
	});

	test('sin fallo no se inventa uno', () => {
		expect(leer({ pendientes: [] } as any).fallo).toBeNull();
		expect(leer({ fallo: null } as any).fallo).toBeNull();
	});

	test('datos que no son un objeto no rompen nada', () => {
		for (const nada of [null, undefined, 'texto', 7, []]) {
			const lectura = leer(nada as any);
			expect(lectura.pendientes).toEqual([]);
			expect(lectura.preflight).toBeNull();
			expect(lectura.fallo).toBeNull();
		}
	});

	test('las listas del preflight siempre son listas de texto', () => {
		const lectura = leer({
			preflight: { kernels: ['linux', 3, null], pacnew: 'no es una lista' },
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
		expect(leer({ preflight: {} } as any).preflight?.hay_lugar_con_red).toBe(true);
		expect(
			leer({ preflight: { hay_lugar_con_red: false } } as any).preflight?.hay_lugar_con_red
		).toBe(false);
	});

	test('una actualización sin nombre se descarta', () => {
		const lectura = leer({
			pendientes: [{ version_nueva: '6.2' }, { nombre: 'linux' }, null],
		} as any);
		expect(lectura.pendientes).toHaveLength(1);
		expect(lectura.pendientes[0].version_vieja).toBe('');
	});

	/**
	 * Al revés que con el fallo, un motivo desconocido sí se descarta: la
	 * pantalla le pone a cada motivo su explicación, y para uno que no conoce
	 * no tiene ninguna. Una lista de paquetes sin decir qué les pasa no es
	 * información. Lo que decide —`pide_reinicio`— no depende de esto.
	 */
	test('un motivo que la pantalla no conoce se descarta', () => {
		const lectura = leer({
			preflight: {
				pide_reinicio: true,
				razones: [
					{ motivo: 'kernel', paquetes: ['linux'] },
					{ motivo: 'lo-que-venga', paquetes: ['algo'] },
					{ paquetes: ['sin motivo'] },
				],
			},
		} as any);

		expect(lectura.preflight?.razones).toHaveLength(1);
		expect(lectura.preflight?.razones[0].motivo).toBe('kernel');
		expect(lectura.preflight?.pide_reinicio).toBe(true);
	});

	test('los cuatro motivos de vasak-update pasan', () => {
		for (const motivo of ['kernel', 'systemd', 'modulo', 'sesion']) {
			const lectura = leer({
				preflight: { razones: [{ motivo, paquetes: ['p'] }] },
			} as any);
			expect(lectura.preflight?.razones[0].motivo).toBe(motivo);
		}
	});

	/**
	 * Reiniciar y volver a entrar son consejos distintos, y los dos se asumen
	 * innecesarios si no vinieron: pedir un reinicio que no hace falta enseña a
	 * ignorar el aviso.
	 */
	test('reiniciar y volver a entrar sólo si vinieron', () => {
		const vacio = leer({ preflight: {} } as any).preflight;
		expect(vacio?.pide_reinicio).toBe(false);
		expect(vacio?.pide_volver_a_entrar).toBe(false);
		expect(vacio?.razones).toEqual([]);

		const sesion = leer({
			preflight: { pide_volver_a_entrar: true },
		} as any).preflight;
		expect(sesion?.pide_reinicio).toBe(false);
		expect(sesion?.pide_volver_a_entrar).toBe(true);
	});

	/**
	 * El campo sale del `URL` de la base de paquetes, o sea que lo escribe quien
	 * empaqueta y de ahí iría derecho al programa que el sistema tenga asociado
	 * a ese esquema. Sólo `http` y `https`.
	 */
	test('sólo se guardan direcciones web', () => {
		const buenas = ['https://github.com/Vasak-OS/x', 'http://ejemplo.org/a?b=1'];
		for (const url of buenas) {
			const lectura = leer({
				pendientes: [{ nombre: 'p', donde_mirar: url }],
			} as any);
			expect(lectura.pendientes[0].donde_mirar).toBe(url);
		}

		const malas = [
			'file:///etc/shadow',
			'javascript:alert(1)',
			'no-es-una-url',
			'',
			42,
			null,
			{ href: 'https://ejemplo/' },
		];
		for (const url of malas) {
			const lectura = leer({
				pendientes: [{ nombre: 'p', donde_mirar: url }],
			} as any);
			expect(lectura.pendientes[0].donde_mirar).toBeUndefined();
		}
	});

	test('un paquete sin página sigue estando en la lista', () => {
		// Descartar el paquete entero por no tener adónde enlazar sería esconder
		// una actualización que igual se va a aplicar.
		const lectura = leer({
			pendientes: [{ nombre: 'p', version_nueva: '2' }],
		} as any);
		expect(lectura.pendientes).toHaveLength(1);
		expect(lectura.pendientes[0].donde_mirar).toBeUndefined();
	});
});

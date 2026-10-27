/**
 * La pantalla de bloqueo: lectura y escritura de la sección `lock` de `vasak.conf`.
 *
 * `vasak-session-manager` lee estas mismas claves (vasak-session-manager#43) con el
 * mismo criterio tolerante, así que lo que se prueba acá es el contrato: qué se
 * lee cuando el archivo está vacío o mal editado a mano, qué se escribe, y que lo
 * que la pantalla no edita sobreviva al guardado. Al final se monta la vista
 * para comprobar que está cableada a esos ayudantes.
 *
 * Del plugin de configuración se espían `readConfig`, `writeConfig` y
 * `useConfigStore` sobre el módulo y no con `mock.module`: otro doble del mismo
 * módulo da verde o rojo según el orden de la corrida.
 */

import { afterEach, beforeEach, describe, expect, type Mock, spyOn, test } from 'bun:test';
import * as plugin from '@vasakgroup/plugin-config-manager';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import {
	DEFAULT_LOCK_BACKGROUND_SOURCE,
	DEFAULT_LOCK_CLOCK_FORMAT,
	DEFAULT_LOCK_CLOCK_SIZE,
	type LockSettings,
	readLockSettings,
	writeLockSettings,
} from '../src/utils/config-values';
import LockScreenView from '../src/views/LockScreenView.vue';

const DEFAULTS: LockSettings = {
	clockFormat: 'auto',
	showDate: true,
	clockSize: 'lg',
	backgroundSource: 'desktop',
	backgroundImage: '',
	dimBackground: true,
	showMedia: true,
	showNotifications: true,
};

const CUSTOM: LockSettings = {
	clockFormat: '12',
	showDate: false,
	clockSize: 'md',
	backgroundSource: 'image',
	backgroundImage: '/fondos/noche.jpg',
	dimBackground: false,
	showMedia: false,
	showNotifications: false,
};

describe('readLockSettings', () => {
	test('sin sección `lock` devuelve el aspecto de hoy', () => {
		expect(readLockSettings({})).toEqual(DEFAULTS);
		expect(readLockSettings({ lock: {} })).toEqual(DEFAULTS);
		expect(readLockSettings(null)).toEqual(DEFAULTS);
		expect(readLockSettings(undefined)).toEqual(DEFAULTS);
		expect(DEFAULT_LOCK_CLOCK_FORMAT).toBe('auto');
		expect(DEFAULT_LOCK_CLOCK_SIZE).toBe('lg');
		expect(DEFAULT_LOCK_BACKGROUND_SOURCE).toBe('desktop');
	});

	test('una sección `lock` que no es un objeto no rompe', () => {
		expect(readLockSettings({ lock: 'bloqueo' })).toEqual(DEFAULTS);
		expect(readLockSettings({ lock: 3 })).toEqual(DEFAULTS);
		expect(readLockSettings({ lock: null })).toEqual(DEFAULTS);
	});

	test('`clock` y `background` que no son objetos valen por vacíos', () => {
		expect(readLockSettings({ lock: { clock: 'hola', background: 5 } })).toEqual(DEFAULTS);
		expect(readLockSettings({ lock: { clock: null, background: null } })).toEqual(DEFAULTS);
	});

	test('cada clave bien tipada se lee, incluso la que no es la de fábrica', () => {
		const leido = readLockSettings({
			lock: {
				clock: { hour12: true, date: false, size: 'md' },
				background: { source: 'image', image: '/fondos/noche.jpg', dim: false },
				media: false,
				notifications: false,
			},
		});
		expect(leido).toEqual(CUSTOM);
	});

	test('`hour12` ausente es «según el idioma»; true fuerza 12 h y false 24 h', () => {
		expect(readLockSettings({ lock: { clock: {} } }).clockFormat).toBe('auto');
		expect(readLockSettings({ lock: { clock: { hour12: true } } }).clockFormat).toBe('12');
		expect(readLockSettings({ lock: { clock: { hour12: false } } }).clockFormat).toBe('24');
	});

	test('el origen del fondo acepta los tres valores conocidos', () => {
		for (const source of ['desktop', 'image', 'color'] as const) {
			expect(readLockSettings({ lock: { background: { source } } }).backgroundSource).toBe(source);
		}
	});

	test('un valor inválido cae al de fábrica en cada clave', () => {
		const leido = readLockSettings({
			lock: {
				clock: { hour12: 'si', date: 0, size: 'xl' },
				background: { source: 'otro', image: 7, dim: null },
				media: 'no',
				notifications: 1,
			},
		});
		expect(leido).toEqual(DEFAULTS);
	});
});

describe('writeLockSettings', () => {
	test('escribe las ocho claves que edita la pantalla', () => {
		const config: Record<string, unknown> = {};
		writeLockSettings(config, CUSTOM);
		expect(config.lock).toEqual({
			clock: { hour12: true, date: false, size: 'md' },
			background: { source: 'image', image: '/fondos/noche.jpg', dim: false },
			media: false,
			notifications: false,
		});
	});

	test('lo que se escribe se vuelve a leer igual', () => {
		for (const settings of [DEFAULTS, CUSTOM, { ...CUSTOM, clockFormat: '24' as const }]) {
			const config: Record<string, unknown> = {};
			writeLockSettings(config, settings);
			expect(readLockSettings(config)).toEqual(settings);
		}
	});

	test('el formato «auto» borra `clock.hour12` en lugar de dejar un booleano', () => {
		const config: Record<string, unknown> = { lock: { clock: { hour12: true } } };
		writeLockSettings(config, { ...DEFAULTS, clockFormat: 'auto' });
		const clock = (config.lock as Record<string, Record<string, unknown>>).clock;
		expect('hour12' in clock).toBe(false);
		expect(readLockSettings(config).clockFormat).toBe('auto');
	});

	test('los formatos 12 y 24 dejan `clock.hour12` en true y false', () => {
		const doce: Record<string, unknown> = {};
		writeLockSettings(doce, { ...DEFAULTS, clockFormat: '12' });
		expect((doce.lock as Record<string, Record<string, unknown>>).clock.hour12).toBe(true);

		const veinticuatro: Record<string, unknown> = { lock: { clock: { hour12: true } } };
		writeLockSettings(veinticuatro, { ...DEFAULTS, clockFormat: '24' });
		expect((veinticuatro.lock as Record<string, Record<string, unknown>>).clock.hour12).toBe(false);
	});

	test('conserva lo que la pantalla no edita en cada nivel de la sección', () => {
		// Claves de una versión futura del bloqueo: guardar el aspecto no las borra.
		const config: Record<string, unknown> = {
			otra: { intacta: true },
			lock: {
				futuro: { clima: true },
				clock: { segundos: true, hour12: false },
				background: { blur: 12 },
			},
		};
		writeLockSettings(config, CUSTOM);

		const lock = config.lock as Record<string, Record<string, unknown>>;
		expect(lock.futuro).toEqual({ clima: true });
		expect(lock.clock.segundos).toBe(true);
		expect(lock.background.blur).toBe(12);
		// Y lo editado sí cambió.
		expect(lock.clock.hour12).toBe(true);
		expect(lock.background.source).toBe('image');
		// Ni las demás secciones del archivo.
		expect(config.otra).toEqual({ intacta: true });
	});

	test('con `clock` o `background` que no son objetos escribe igual', () => {
		const config: Record<string, unknown> = { lock: { clock: 'roto', background: 3 } };
		writeLockSettings(config, CUSTOM);
		expect(readLockSettings(config)).toEqual(CUSTOM);
	});
});

describe('la vista de la pantalla de bloqueo', () => {
	let view: VueWrapper | null = null;
	let stored: Record<string, unknown> = {};
	let readSpy: Mock<typeof plugin.readConfig>;
	let writeSpy: Mock<typeof plugin.writeConfig>;
	let storeSpy: Mock<typeof plugin.useConfigStore>;

	beforeEach(() => {
		stored = {};
		readSpy = spyOn(plugin, 'readConfig').mockImplementation(
			async () => structuredClone(stored) as unknown as plugin.VSKConfig
		);
		writeSpy = spyOn(plugin, 'writeConfig').mockImplementation(async () => {});
		storeSpy = spyOn(plugin, 'useConfigStore').mockImplementation(
			() => ({ loadConfig: async () => {} }) as unknown as ReturnType<typeof plugin.useConfigStore>
		);
	});

	afterEach(() => {
		view?.unmount();
		view = null;
		readSpy.mockRestore();
		writeSpy.mockRestore();
		storeSpy.mockRestore();
	});

	async function mountView() {
		view = mount(LockScreenView, { global: { stubs: { ThemeIcon: true } } });
		await flushPromises();
		return view;
	}

	const saveButton = (wrapper: VueWrapper) => {
		const button = wrapper
			.findAll('button')
			.find((b) => b.text().includes('applyChanges') || b.text() === 'Aplicar Cambios');
		if (!button) throw new Error('no está el botón de aplicar');
		return button;
	};

	test('con `lock` ausente los controles arrancan en los valores de fábrica', async () => {
		const wrapper = await mountView();
		// Reloj «auto» y grande, origen «desktop» marcados; los tres interruptores visibles
		// (fecha, medios, notificaciones) encendidos; la atenuación no se ofrece.
		const marcados = wrapper.findAll('[role="radio"][aria-checked="true"]');
		expect(marcados).toHaveLength(3);
		const interruptores = wrapper.findAll('[role="switch"]');
		expect(interruptores).toHaveLength(3);
		for (const interruptor of interruptores) {
			expect(interruptor.attributes('aria-checked')).toBe('true');
		}
	});

	test('«Imagen» y la atenuación sólo aparecen con el origen `image`', async () => {
		stored = { lock: { background: { source: 'desktop' } } };
		const sinImagen = await mountView();
		expect(sinImagen.findAll('[role="switch"]')).toHaveLength(3);
		expect(sinImagen.text()).not.toContain('backgroundImageChoose');
		view?.unmount();

		stored = { lock: { background: { source: 'image', image: '/fondos/noche.jpg' } } };
		const conImagen = await mountView();
		// Fecha, atenuación, medios y notificaciones.
		expect(conImagen.findAll('[role="switch"]')).toHaveLength(4);
		expect(conImagen.text()).toContain('noche.jpg');
	});

	test('guardar escribe el aspecto sobre una copia fresca y conserva lo ajeno', async () => {
		stored = { lock: { futuro: { clima: true } }, otra: 1 };
		const wrapper = await mountView();
		// Entre abrir la pantalla y guardar, otra clave del archivo cambió.
		stored = { lock: { futuro: { clima: true } }, otra: 2 };
		await saveButton(wrapper).trigger('click');
		await flushPromises();

		expect(writeSpy).toHaveBeenCalledTimes(1);
		const escrito = writeSpy.mock.calls[0][0] as unknown as Record<string, unknown>;
		expect(escrito.otra).toBe(2);
		expect((escrito.lock as Record<string, unknown>).futuro).toEqual({ clima: true });
		expect(readLockSettings(escrito)).toEqual(DEFAULTS);
	});
});

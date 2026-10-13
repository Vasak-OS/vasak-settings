/**
 * El interruptor y el borrado del tiempo de pantalla (vasak-settings#145), que
 * comparten «Tiempo de pantalla» y «Privacidad y seguridad».
 *
 * El composable recibe sus dependencias por parámetro, como
 * `useGameModeSettings`: acá son dobles que anotan lo que reciben, sin Tauri ni
 * `mock.module`.
 */

import { describe, expect, test } from 'bun:test';
import type { VSKConfig } from '@vasakgroup/plugin-config-manager';
import {
	type ScreenTimeDeps,
	type ScreenTimeHooks,
	useScreenTimeSettings,
} from '../src/composables/useScreenTimeSettings';
import { deferred } from './screen-time-backend';

const MESSAGES = {
	saved: () => 'guardado',
	errorSaving: (reason: string) => `no se guardó: ${reason}`,
	errorClearing: (reason: string) => `no se borró: ${reason}`,
};

/** Un `vasak.conf` con otras secciones y una clave ajena dentro de `screen_time`. */
function storedConfig(enabled: boolean): Record<string, unknown> {
	return {
		style: { darkmode: true, 'color-scheme': 'nord', radius: 12 },
		window: { barPosition: 'left' },
		screen_time: { enabled, retention_days: 30 },
		'x-puesto-a-mano': { nota: 'no se toca' },
	};
}

interface Fake {
	deps: ScreenTimeDeps;
	log: string[];
	/** Lo que se escribió en cada `write`, en orden. */
	writes: Record<string, unknown>[];
	/** Lo que se le pasó a `setEnabled`, en orden. */
	setCalls: boolean[];
	file: () => Record<string, unknown>;
}

function fake(overrides: Partial<ScreenTimeDeps> = {}, enabled = false): Fake {
	let file = storedConfig(enabled);
	const log: string[] = [];
	const writes: Record<string, unknown>[] = [];
	const setCalls: boolean[] = [];
	const deps: ScreenTimeDeps = {
		read: async () => {
			log.push('read');
			return structuredClone(file) as unknown as VSKConfig;
		},
		write: async (config) => {
			log.push('write');
			file = structuredClone(config) as unknown as Record<string, unknown>;
			writes.push(structuredClone(file));
		},
		setEnabled: async (value) => {
			log.push(`setEnabled:${value}`);
			setCalls.push(value);
		},
		isEnabled: async () => {
			log.push('isEnabled');
			return enabled;
		},
		clear: async () => {
			log.push('clear');
		},
		...overrides,
	};
	return { deps, log, writes, setCalls, file: () => file };
}

describe('useScreenTimeSettings: el interruptor', () => {
	test('prenderlo escribe screen_time.enabled sin tocar el resto de vasak.conf y avisa al servicio', async () => {
		const backend = fake();
		const settings = useScreenTimeSettings(MESSAGES, {}, backend.deps);

		await settings.toggle(true);

		expect(backend.log).toEqual(['read', 'write', 'setEnabled:true']);
		expect(backend.file()).toEqual({
			...storedConfig(false),
			screen_time: { enabled: true, retention_days: 30 },
		});
		expect(backend.setCalls).toEqual([true]);
		expect(settings.enabled.value).toBe(true);
		expect(settings.error.value).toBe('');
		expect(settings.successMessage.value).toBe('guardado');
		expect(settings.busy.value).toBe(false);
	});

	test('si el servicio rechaza el cambio, vuelven el interruptor y el archivo, y queda el error', async () => {
		const backend = fake({
			setEnabled: async () => {
				throw new Error('sin servicio de salud');
			},
		});
		const settings = useScreenTimeSettings(MESSAGES, {}, backend.deps);

		await settings.toggle(true);

		expect(settings.enabled.value).toBe(false);
		// Se escribió el cambio y después se deshizo: el archivo termina como estaba.
		expect(
			backend.writes.map((config) => (config.screen_time as { enabled: boolean }).enabled)
		).toEqual([true, false]);
		expect(backend.file()).toEqual(storedConfig(false));
		expect(settings.error.value).toBe('no se guardó: Error: sin servicio de salud');
		expect(settings.successMessage.value).toBe('');
		expect(settings.busy.value).toBe(false);
	});

	test('si no se puede escribir el archivo, no se avisa al servicio y el interruptor vuelve', async () => {
		const backend = fake({
			write: async () => {
				throw new Error('disco lleno');
			},
		});
		const settings = useScreenTimeSettings(MESSAGES, {}, backend.deps);

		await settings.toggle(true);

		expect(backend.setCalls).toEqual([]);
		expect(settings.enabled.value).toBe(false);
		expect(settings.error.value).toBe('no se guardó: Error: disco lleno');
	});

	test('los ganchos se llaman antes y después, y el de después dice si el cambio salió', async () => {
		const order: string[] = [];
		let fail = false;
		const backend = fake({
			setEnabled: async (value) => {
				order.push(`setEnabled:${value}`);
				if (fail) throw new Error('no');
			},
		});
		const hooks: ScreenTimeHooks = {
			onBeforeChange: () => order.push('before'),
			onAfterChange: (succeeded) => {
				order.push(`after:${succeeded}`);
			},
		};
		const settings = useScreenTimeSettings(MESSAGES, hooks, backend.deps);

		await settings.toggle(true);
		fail = true;
		await settings.toggle(false);

		expect(order).toEqual([
			'before',
			'setEnabled:true',
			'after:true',
			'before',
			'setEnabled:false',
			'after:false',
		]);
	});

	test('el gancho de después ve el cambio ya terminado', async () => {
		// La vista recarga el informe ahí: si `togglePending` siguiera en `true`,
		// esa recarga no podría adoptar el estado real del servicio.
		let seen: { pending: boolean; busy: boolean } | null = null;
		const backend = fake();
		const settings = useScreenTimeSettings(
			MESSAGES,
			{
				onAfterChange: () => {
					seen = { pending: settings.togglePending.value, busy: settings.busy.value };
				},
			},
			backend.deps
		);

		await settings.toggle(true);

		expect(seen).toEqual({ pending: false, busy: false });
	});

	test('togglePending vale true mientras dura el cambio, y false al terminar', async () => {
		const gate = deferred();
		const backend = fake({ setEnabled: () => gate.promise });
		const settings = useScreenTimeSettings(MESSAGES, {}, backend.deps);

		expect(settings.togglePending.value).toBe(false);
		const running = settings.toggle(true);
		expect(settings.togglePending.value).toBe(true);
		expect(settings.busy.value).toBe(true);
		// El interruptor ya muestra lo elegido mientras tanto.
		expect(settings.enabled.value).toBe(true);

		gate.resolve();
		await running;

		expect(settings.togglePending.value).toBe(false);
		expect(settings.busy.value).toBe(false);
	});

	test('togglePending vuelve a false también cuando el cambio falla', async () => {
		const gate = deferred();
		const backend = fake({ setEnabled: () => gate.promise });
		const settings = useScreenTimeSettings(MESSAGES, {}, backend.deps);

		const running = settings.toggle(true);
		expect(settings.togglePending.value).toBe(true);
		gate.reject(new Error('no'));
		await running;

		expect(settings.togglePending.value).toBe(false);
		expect(settings.enabled.value).toBe(false);
	});
});

describe('useScreenTimeSettings: borrar el historial', () => {
	test('borra, llama al gancho de después y cierra la confirmación', async () => {
		const order: string[] = [];
		const backend = fake({
			clear: async () => {
				order.push('clear');
			},
		});
		const settings = useScreenTimeSettings(
			MESSAGES,
			{
				onBeforeClear: () => order.push('before'),
				onAfterClear: () => {
					order.push('after');
				},
			},
			backend.deps
		);
		settings.confirmingClear.value = true;

		await settings.clear();

		expect(order).toEqual(['before', 'clear', 'after']);
		expect(settings.confirmingClear.value).toBe(false);
		expect(settings.error.value).toBe('');
		expect(settings.busy.value).toBe(false);
	});

	test('si el borrado falla, deja el error, no llama al gancho de después y sigue confirmando', async () => {
		let after = 0;
		const backend = fake({
			clear: async () => {
				throw new Error('permiso denegado');
			},
		});
		const settings = useScreenTimeSettings(
			MESSAGES,
			{
				onAfterClear: () => {
					after++;
				},
			},
			backend.deps
		);
		settings.confirmingClear.value = true;

		await settings.clear();

		expect(settings.error.value).toBe('no se borró: Error: permiso denegado');
		expect(after).toBe(0);
		expect(settings.confirmingClear.value).toBe(true);
		expect(settings.busy.value).toBe(false);
	});
});

describe('useScreenTimeSettings: leer el estado', () => {
	test('lee el archivo y después manda lo que diga el servicio', async () => {
		// El archivo dice apagado y el servicio, prendido: gana el servicio, que
		// es lo que está pasando ahora.
		const backend = fake({ isEnabled: async () => true }, false);
		const settings = useScreenTimeSettings(MESSAGES, {}, backend.deps);

		await settings.refresh();

		expect(settings.enabled.value).toBe(true);
	});

	test('sin servicio queda lo que dice el archivo', async () => {
		const backend = fake(
			{
				isEnabled: async () => {
					throw new Error('sin servicio');
				},
			},
			true
		);
		const settings = useScreenTimeSettings(MESSAGES, {}, backend.deps);

		await settings.refresh();

		expect(settings.enabled.value).toBe(true);
		expect(settings.error.value).toBe('');
	});

	test('lo que contesta el servicio durante un cambio no lo pisa', async () => {
		const reported = deferred<boolean>();
		const change = deferred();
		let asked = 0;
		const backend = fake({
			isEnabled: () => {
				asked++;
				return reported.promise;
			},
			setEnabled: () => change.promise,
		});
		const settings = useScreenTimeSettings(MESSAGES, {}, backend.deps);

		const reading = settings.refresh();
		// Esperar a que la lectura llegue a preguntarle al servicio (unas pocas
		// vueltas de microtareas; con tope, para no colgar la corrida).
		for (let turn = 0; asked === 0 && turn < 50; turn++) await Promise.resolve();
		expect(asked).toBe(1);
		// Mientras el servicio no contesta, alguien prende el interruptor.
		const toggling = settings.toggle(true);
		// Y el servicio contesta lo de antes del cambio.
		reported.resolve(false);
		await reading;

		expect(settings.enabled.value).toBe(true);

		change.resolve();
		await toggling;
		expect(settings.enabled.value).toBe(true);
	});

	test('lo que se lee del archivo durante un cambio tampoco lo pisa', async () => {
		// Es la carrera de abrir «Privacidad y seguridad» y tocar el interruptor
		// antes de que termine la primera lectura: el archivo leído es el de
		// antes del cambio.
		const firstRead = deferred<VSKConfig | null>();
		const change = deferred();
		let reads = 0;
		const backend = fake({ setEnabled: () => change.promise, isEnabled: async () => true });
		const plainRead = backend.deps.read;
		backend.deps.read = () => (reads++ === 0 ? firstRead.promise : plainRead());
		const settings = useScreenTimeSettings(MESSAGES, {}, backend.deps);

		const reading = settings.refresh();
		const toggling = settings.toggle(true);
		firstRead.resolve(storedConfig(false) as unknown as VSKConfig);
		await reading;

		expect(settings.enabled.value).toBe(true);

		change.resolve();
		await toggling;
		expect(settings.enabled.value).toBe(true);
	});
});

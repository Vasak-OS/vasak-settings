import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { saveUserScheme } from '@/services/scheme.service';
import type { SchemeEntry, SchemeFile } from '@/types/scheme';
import vasakDefault from './fixtures/scheme-vasak-default.json';

/**
 * `saveUserScheme` pasó de un `invoke` escrito a mano al ayudante del plugin
 * (la 2.9 admite pinia 3). Lo que no puede cambiar con eso es el contrato: el
 * nombre del comando, la forma del argumento, y que las claves que el modelo
 * del paquete no nombra lleguen enteras al archivo.
 *
 * Se reemplaza el `invoke` de `__TAURI_INTERNALS__` y no se simula el módulo:
 * dos `mock.module` del mismo módulo en archivos distintos se pisan en el CI.
 */
type Call = { cmd: string; args: unknown };
let calls: Call[] = [];

const g = globalThis as Record<string, unknown>;

beforeEach(() => {
	calls = [];
	g.__TAURI_INTERNALS__ = {
		invoke: async (cmd: string, args: unknown): Promise<SchemeEntry> => {
			calls.push({ cmd, args });
			return {
				path: '/home/alguien/.config/vasak/schemes/custom.json',
				scheme: (args as { scheme: SchemeFile }).scheme,
			};
		},
		transformCallback: () => 0,
	};
});

afterEach(() => {
	delete g.__TAURI_INTERNALS__;
});

describe('saveUserScheme', () => {
	test('llama al comando del plugin con el esquema en `scheme`', async () => {
		const scheme = { ...(vasakDefault as SchemeFile), id: 'custom' };

		await saveUserScheme(scheme);

		expect(calls).toHaveLength(1);
		expect(calls[0].cmd).toBe('plugin:config-manager|save_user_scheme');
		expect(calls[0].args).toEqual({ scheme });
	});

	test('las claves que el paquete no nombra viajan enteras', async () => {
		const scheme = {
			...(vasakDefault as SchemeFile),
			id: 'custom',
			'x-puesto-a-mano': { nota: 'lo escribió alguien con un editor' },
		} as SchemeFile;

		const entry = await saveUserScheme(scheme);

		expect((calls[0].args as { scheme: SchemeFile }).scheme['x-puesto-a-mano']).toEqual({
			nota: 'lo escribió alguien con un editor',
		});
		expect(entry.path).toBe('/home/alguien/.config/vasak/schemes/custom.json');
	});
});

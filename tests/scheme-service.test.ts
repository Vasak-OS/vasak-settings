import { afterEach, beforeEach, describe, expect, type Mock, spyOn, test } from 'bun:test';
import * as plugin from '@vasakgroup/plugin-config-manager';
import { saveUserScheme } from '@/services/scheme.service';
import type { SchemeFile } from '@/types/scheme';
import vasakDefault from './fixtures/scheme-vasak-default.json';

/**
 * `saveUserScheme` pasó de un `invoke` escrito a mano al ayudante del plugin
 * (la 2.9 admite pinia 3). Lo que no puede cambiar con eso es que el esquema
 * llegue entero —con las claves que el modelo del paquete no nombra— y que lo
 * que vuelve sea lo que devolvió el plugin.
 *
 * El nombre del comando y la forma del argumento los prueba el propio plugin
 * (`guest-js/save-user-scheme.test.ts`). Acá se espía su `saveUserScheme` y no
 * el `invoke`: `iconos-reactivos.test.ts` simula `@tauri-apps/api/core` para
 * toda la corrida, y un segundo `mock.module` del mismo módulo se pisa con ése
 * según el orden. El espía se restaura después de cada prueba.
 */
let spy: Mock<typeof plugin.saveUserScheme>;

beforeEach(() => {
	spy = spyOn(plugin, 'saveUserScheme').mockImplementation(async (scheme) => ({
		path: `/home/alguien/.config/vasak/schemes/${scheme.id}.json`,
		scheme,
	}));
});

afterEach(() => {
	spy.mockRestore();
});

describe('saveUserScheme', () => {
	test('le pasa el esquema al plugin y devuelve lo que contestó', async () => {
		const scheme = { ...(vasakDefault as SchemeFile), id: 'custom' };

		const entry = await saveUserScheme(scheme);

		expect(spy).toHaveBeenCalledTimes(1);
		expect(spy.mock.calls[0][0]).toEqual(scheme);
		expect(entry.path).toBe('/home/alguien/.config/vasak/schemes/custom.json');
	});

	test('las claves que el paquete no nombra viajan enteras', async () => {
		const scheme = {
			...(vasakDefault as SchemeFile),
			id: 'custom',
			'x-puesto-a-mano': { nota: 'lo escribió alguien con un editor' },
		} as SchemeFile;

		await saveUserScheme(scheme);

		expect((spy.mock.calls[0][0] as SchemeFile)['x-puesto-a-mano']).toEqual({
			nota: 'lo escribió alguien con un editor',
		});
	});
});

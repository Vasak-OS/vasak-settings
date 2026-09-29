import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { reactive } from 'vue';
import { useCustomScheme } from '@/composables/useCustomScheme';
import {
	ANSI_COLOR_NAMES,
	applyColorPatch,
	CUSTOM_SCHEME_ID,
	cloneAsCustom,
	formatContrast,
	isHexColor,
	measureContrast,
	toLongHex,
} from '@/tools/custom-scheme';
import type { SchemeEntry, SchemeFile } from '@/types/scheme';

/**
 * El esquema «Personalizado» (Vasak-OS/vasak-settings#135): cómo se clona, cómo
 * se le cambia un color y cuándo se escribe en disco.
 *
 * El guardado de verdad es un comando del plugin; acá se reemplaza por una
 * función que anota lo que recibe, pasada por parámetro al composable. Así no
 * hace falta un `mock.module` de `@tauri-apps/api/core`, que ya tiene otro
 * archivo de la suite y dos del mismo módulo se pisan según el orden.
 */

const FIXTURE = new URL('./fixtures/scheme-vasak-default.json', import.meta.url);

/** El esquema de fábrica, con una clave que el modelo no conoce en cada nivel. */
function baseScheme(): SchemeFile {
	const scheme = JSON.parse(readFileSync(FIXTURE, 'utf8')) as SchemeFile;
	scheme['x-origin'] = 'a mano';
	scheme.colors.dark['x-note'] = 'nivel variante';
	scheme.colors.dark.ui['x-accent'] = '#123456';
	scheme.colors.dark.terminal.ansi['x-extra'] = '#abcdef';
	return scheme;
}

const IDENTITY = {
	name: 'Personalizado',
	author: 'Pato',
	description: 'Basado en Vasak Default',
};

type Recorder = {
	calls: SchemeFile[];
	save: (scheme: SchemeFile) => Promise<SchemeEntry>;
};

function recorder(): Recorder {
	const calls: SchemeFile[] = [];
	return {
		calls,
		save: async (scheme) => {
			// Se guarda una copia: lo que llega al disco es lo de ese momento, no
			// lo que el objeto sea después.
			calls.push(structuredClone(scheme));
			return { path: `/home/u/.config/vasak/schemes/${scheme.id}.json`, scheme };
		},
	};
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('clonar el esquema en uso', () => {
	test('sale idéntico salvo id, nombre, autor y descripción', () => {
		const base = baseScheme();
		const clone = cloneAsCustom(base, IDENTITY);

		expect(clone.id).toBe(CUSTOM_SCHEME_ID);
		expect(clone.name).toBe(IDENTITY.name);
		expect(clone.author).toBe(IDENTITY.author);
		expect(clone.description).toBe(IDENTITY.description);

		const { id: _a, name: _b, author: _c, description: _d, ...restOfClone } = clone;
		const { id: _e, name: _f, author: _g, description: _h, ...restOfBase } = base;
		expect(restOfClone).toEqual(restOfBase);
	});

	test('la terminal queda intacta, con los 16 ANSI', () => {
		const base = baseScheme();
		const clone = cloneAsCustom(base, IDENTITY);

		for (const variant of ['dark', 'light'] as const) {
			expect(clone.colors[variant].terminal).toEqual(base.colors[variant].terminal);
			for (const name of ANSI_COLOR_NAMES) {
				expect(isHexColor(clone.colors[variant].terminal.ansi[name])).toBe(true);
			}
		}
	});

	test('es una copia profunda: editar el clon no toca el esquema del sistema', () => {
		const base = baseScheme();
		const clone = cloneAsCustom(base, IDENTITY);
		clone.colors.dark.ui.color.primary = '#000000';
		clone.colors.light.terminal.ansi.red = '#000000';

		expect(base.colors.dark.ui.color.primary).toBe('#eba0ac');
		expect(base.colors.light.terminal.ansi.red).toBe('#d20f39');
	});

	test('clona un esquema que viene del estado reactivo de Vue', () => {
		// La lista de esquemas de la vista es un `ref`, así que lo que sale de
		// ahí es un `Proxy`. Con `structuredClone` esto tiraba `DataCloneError` y
		// el editor no aparecía al volver a abrir la pantalla.
		const fromState = reactive({ list: [baseScheme()] }).list[0] as SchemeFile;

		const clone = cloneAsCustom(fromState, IDENTITY);
		expect(clone.colors.dark.ui.color.primary).toBe('#eba0ac');
		expect(applyColorPatch(fromState, 'dark', { ui: { border: '#000000' } }).id).toBe(
			'vasak-default'
		);

		const custom = useCustomScheme({ save: recorder().save });
		custom.load(fromState);
		expect(custom.scheme.value?.id).toBe('vasak-default');
	});

	test('on-secondary y las claves desconocidas sobreviven al clonado', () => {
		const clone = cloneAsCustom(baseScheme(), IDENTITY);

		expect(clone.colors.dark.ui.text['on-secondary']).toBe('#1e1e2e');
		expect(clone.colors.light.ui.text['on-secondary']).toBe('#eff1f5');
		expect(clone['x-origin']).toBe('a mano');
		expect(clone.colors.dark['x-note']).toBe('nivel variante');
		expect(clone.colors.dark.ui['x-accent']).toBe('#123456');
		expect(clone.colors.dark.terminal.ansi['x-extra']).toBe('#abcdef');
	});
});

describe('cambiar colores', () => {
	test('cambia sólo lo que nombra el parche, en la variante pedida', () => {
		const base = cloneAsCustom(baseScheme(), IDENTITY);
		const next = applyColorPatch(base, 'dark', {
			ui: { color: { primary: '#ff0000' } },
			terminal: { ansi: { brightCyan: '#00ffff' } },
		});

		expect(next.colors.dark.ui.color.primary).toBe('#ff0000');
		expect(next.colors.dark.terminal.ansi.brightCyan).toBe('#00ffff');
		// Lo vecino no se mueve.
		expect(next.colors.dark.ui.color.secondary).toBe(base.colors.dark.ui.color.secondary);
		expect(next.colors.dark.terminal.ansi.cyan).toBe(base.colors.dark.terminal.ansi.cyan);
		// La otra variante tampoco.
		expect(next.colors.light).toEqual(base.colors.light);
		// Y el esquema recibido queda como estaba.
		expect(base.colors.dark.ui.color.primary).toBe('#eba0ac');
	});

	test('on-secondary y las claves desconocidas sobreviven a una edición', () => {
		const base = cloneAsCustom(baseScheme(), IDENTITY);
		const next = applyColorPatch(base, 'dark', { ui: { text: { main: '#ffffff' } } });

		expect(next.colors.dark.ui.text['on-secondary']).toBe('#1e1e2e');
		expect(next['x-origin']).toBe('a mano');
		expect(next.colors.dark.ui['x-accent']).toBe('#123456');
		expect(next.colors.dark.terminal.ansi['x-extra']).toBe('#abcdef');
	});

	test('un hex inválido no entra al esquema', () => {
		const base = cloneAsCustom(baseScheme(), IDENTITY);
		for (const bad of ['', '#', '#12', '#12345', '#1234567', 'eba0ac', '#gggggg', 'red']) {
			const next = applyColorPatch(base, 'dark', { ui: { background: bad } });
			expect(next.colors.dark.ui.background).toBe(base.colors.dark.ui.background);
		}
	});

	test('las dos formas de hex valen, y la corta se expande para el selector', () => {
		expect(isHexColor('#abc')).toBe(true);
		expect(isHexColor('#AABBCC')).toBe(true);
		expect(toLongHex('#AbC')).toBe('#aabbcc');
		expect(toLongHex('#112233')).toBe('#112233');
		expect(toLongHex('#1122')).toBeNull();
	});
});

describe('contraste', () => {
	test('mide los cinco pares con el cálculo de WCAG', () => {
		const scheme = baseScheme();
		const results = measureContrast(scheme.colors.dark);

		expect(results.map((result) => result.id)).toEqual([
			'mainOnBackground',
			'mutedOnBackground',
			'mainOnSurface',
			'onPrimary',
			'onSecondary',
		]);
		// #cdd6f4 sobre #1e1e2e, el texto de Catppuccin Mocha: 11.34:1.
		expect(results[0].ratio).toBeCloseTo(11.34, 1);
		expect(results.every((result) => result.passes)).toBe(true);
	});

	test('blanco sobre negro da 21:1 y un par igual da 1:1', () => {
		const scheme = baseScheme();
		scheme.colors.dark.ui.text.main = '#ffffff';
		scheme.colors.dark.ui.background = '#000000';
		scheme.colors.dark.ui.surface = '#ffffff';

		const [onBackground, , onSurface] = measureContrast(scheme.colors.dark);
		expect(formatContrast(onBackground.ratio)).toBe('21.00:1');
		expect(onSurface.ratio).toBeCloseTo(1, 5);
	});

	test('por debajo de 4.5:1 avisa, sin impedir nada', () => {
		const scheme = baseScheme();
		scheme.colors.dark.ui.text['on-primary'] = '#cdd6f4';

		const onPrimary = measureContrast(scheme.colors.dark).find((r) => r.id === 'onPrimary');
		// El caso real del esquema de fábrica de antes: 1.43:1.
		expect(onPrimary?.ratio).toBeCloseTo(1.43, 1);
		expect(onPrimary?.passes).toBe(false);
	});

	test('un esquema sin on-secondary no mide ese par', () => {
		const scheme = baseScheme();
		delete scheme.colors.dark.ui.text['on-secondary'];

		const ids = measureContrast(scheme.colors.dark).map((result) => result.id);
		expect(ids).not.toContain('onSecondary');
		expect(ids).toHaveLength(4);
	});
});

describe('useCustomScheme', () => {
	test('crear guarda en el acto el clon entero', async () => {
		const disk = recorder();
		const custom = useCustomScheme({ save: disk.save, delay: 10 });

		await custom.createFrom(baseScheme(), IDENTITY);

		expect(disk.calls).toHaveLength(1);
		expect(disk.calls[0]).toEqual(cloneAsCustom(baseScheme(), IDENTITY));
	});

	test('la segunda vez no se vuelve a clonar', async () => {
		const disk = recorder();
		const custom = useCustomScheme({ save: disk.save, delay: 10 });
		const existing = cloneAsCustom(baseScheme(), IDENTITY);
		existing.colors.dark.ui.color.primary = '#010203';
		let askedForBase = false;

		const { created } = await custom.ensureCustom(existing, async () => {
			askedForBase = true;
			return { base: baseScheme(), identity: IDENTITY };
		});

		expect(created).toBe(false);
		expect(askedForBase).toBe(false);
		expect(disk.calls).toHaveLength(0);
		// Lo editado por el usuario sigue ahí.
		expect(custom.scheme.value?.colors.dark.ui.color.primary).toBe('#010203');
	});

	test('y la primera sí clona y guarda', async () => {
		const disk = recorder();
		const custom = useCustomScheme({ save: disk.save, delay: 10 });

		const { created } = await custom.ensureCustom(null, async () => ({
			base: baseScheme(),
			identity: IDENTITY,
		}));

		expect(created).toBe(true);
		expect(disk.calls).toHaveLength(1);
		expect(disk.calls[0].id).toBe(CUSTOM_SCHEME_ID);
	});

	test('el antirrebote junta varios cambios seguidos en un solo guardado', async () => {
		const disk = recorder();
		const custom = useCustomScheme({ save: disk.save, delay: 30 });
		custom.load(cloneAsCustom(baseScheme(), IDENTITY));

		custom.updateColors('dark', { ui: { color: { primary: '#111111' } } });
		custom.updateColors('dark', { ui: { color: { primary: '#222222' } } });
		custom.updateColors('light', { terminal: { ansi: { red: '#333333' } } });

		expect(disk.calls).toHaveLength(0);
		await wait(60);

		expect(disk.calls).toHaveLength(1);
		expect(disk.calls[0].colors.dark.ui.color.primary).toBe('#222222');
		expect(disk.calls[0].colors.light.terminal.ansi.red).toBe('#333333');
	});

	test('cada cambio se ve en el acto, antes de guardarse', () => {
		const disk = recorder();
		const custom = useCustomScheme({ save: disk.save, delay: 1000 });
		custom.load(cloneAsCustom(baseScheme(), IDENTITY));

		custom.updateColors('dark', { ui: { surface: '#444444' } });

		expect(custom.scheme.value?.colors.dark.ui.surface).toBe('#444444');
		expect(disk.calls).toHaveLength(0);
	});

	test('un hex inválido no se guarda', async () => {
		const disk = recorder();
		const custom = useCustomScheme({ save: disk.save, delay: 10 });
		custom.load(cloneAsCustom(baseScheme(), IDENTITY));

		custom.updateColors('dark', { ui: { background: '#12' } });
		await wait(40);

		expect(disk.calls).toHaveLength(0);
		expect(custom.scheme.value?.colors.dark.ui.background).toBe('#1e1e2e');
	});

	test('flush guarda ya lo pendiente, y sin nada pendiente no escribe', async () => {
		const disk = recorder();
		const custom = useCustomScheme({ save: disk.save, delay: 10_000 });
		custom.load(cloneAsCustom(baseScheme(), IDENTITY));

		await custom.flush();
		expect(disk.calls).toHaveLength(0);

		custom.updateColors('dark', { ui: { border: '#555555' } });
		await custom.flush();
		expect(disk.calls).toHaveLength(1);
		expect(disk.calls[0].colors.dark.ui.border).toBe('#555555');
	});

	test('reclonar descarta un cambio que estaba por guardarse', async () => {
		const disk = recorder();
		const custom = useCustomScheme({ save: disk.save, delay: 30 });
		custom.load(cloneAsCustom(baseScheme(), IDENTITY));

		custom.updateColors('dark', { ui: { color: { primary: '#999999' } } });
		await custom.createFrom(baseScheme(), IDENTITY);
		await wait(60);

		expect(disk.calls).toHaveLength(1);
		expect(disk.calls[0].colors.dark.ui.color.primary).toBe('#eba0ac');
	});

	test('un error al guardar queda a la vista y el siguiente guardado bueno lo limpia', async () => {
		let fail = true;
		const custom = useCustomScheme({
			delay: 5,
			save: async (scheme) => {
				if (fail) throw new Error('disco lleno');
				return { path: 'x', scheme };
			},
		});
		custom.load(cloneAsCustom(baseScheme(), IDENTITY));

		custom.updateColors('dark', { ui: { border: '#010101' } });
		await wait(30);
		expect(String(custom.error.value)).toContain('disco lleno');

		fail = false;
		custom.updateColors('dark', { ui: { border: '#020202' } });
		await wait(30);
		expect(custom.error.value).toBeNull();
	});

	test('después de cada guardado avisa con lo que devolvió el plugin', async () => {
		const disk = recorder();
		const saved: SchemeEntry[] = [];
		const custom = useCustomScheme({
			save: disk.save,
			delay: 5,
			onSaved: (entry) => {
				saved.push(entry);
			},
		});

		await custom.createFrom(baseScheme(), IDENTITY);
		expect(saved).toHaveLength(1);
		expect(saved[0].path).toEndWith('/schemes/custom.json');
	});

	test('los guardados van en fila: uno lento no termina después del siguiente', async () => {
		// El primero tarda más que el segundo. Sin fila, el segundo terminaría
		// primero y `onSaved` publicaría al final el esquema viejo.
		const started: string[] = [];
		const saved: string[] = [];
		const custom = useCustomScheme({
			delay: 5,
			save: async (scheme) => {
				const border = scheme.colors.dark.ui.border as string;
				started.push(border);
				await wait(border === '#010101' ? 60 : 5);
				return { path: 'x', scheme };
			},
			onSaved: (entry) => {
				saved.push(entry.scheme.colors.dark.ui.border as string);
			},
		});
		custom.load(cloneAsCustom(baseScheme(), IDENTITY));

		custom.updateColors('dark', { ui: { border: '#010101' } });
		await wait(20);
		expect(custom.saving.value).toBe(true);
		custom.updateColors('dark', { ui: { border: '#020202' } });
		await wait(20);
		// El segundo ya está agendado y el primero sigue: todavía se está guardando.
		expect(custom.saving.value).toBe(true);
		expect(started).toEqual(['#010101']);

		await wait(120);
		expect(started).toEqual(['#010101', '#020202']);
		expect(saved).toEqual(['#010101', '#020202']);
		expect(custom.saving.value).toBe(false);
	});

	test('un guardado que falla no frena al siguiente de la fila', async () => {
		const disk = recorder();
		let fail = true;
		const custom = useCustomScheme({
			delay: 5,
			save: async (scheme) => {
				if (fail) {
					fail = false;
					throw new Error('disco lleno');
				}
				return disk.save(scheme);
			},
		});
		custom.load(cloneAsCustom(baseScheme(), IDENTITY));

		custom.updateColors('dark', { ui: { border: '#010101' } });
		await wait(30);
		custom.updateColors('dark', { ui: { border: '#020202' } });
		await wait(30);

		expect(disk.calls).toHaveLength(1);
		expect(disk.calls[0].colors.dark.ui.border).toBe('#020202');
		expect(custom.error.value).toBeNull();
	});

	test('si reclonar falla, el editor vuelve a lo que está guardado', async () => {
		// «Empezar de nuevo desde…» pone el clon en el editor y lo guarda. Si el
		// guardado falla, el archivo sigue teniendo el anterior, y el editor no
		// puede quedarse mostrando como propio algo que no está en disco.
		const custom = useCustomScheme({
			delay: 5,
			save: async () => {
				throw new Error('disco lleno');
			},
		});
		const onDisk = cloneAsCustom(baseScheme(), IDENTITY);
		onDisk.colors.dark.ui.color.primary = '#123123';
		custom.load(onDisk);

		const other = baseScheme();
		other.colors.dark.ui.color.primary = '#abcabc';
		await expect(custom.createFrom(other, IDENTITY)).rejects.toThrow('disco lleno');

		expect(custom.scheme.value?.colors.dark.ui.color.primary).toBe('#123123');
		expect(String(custom.error.value)).toContain('disco lleno');
	});
});

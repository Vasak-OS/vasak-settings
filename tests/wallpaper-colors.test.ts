import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import type { VSKConfig } from '@vasakgroup/plugin-config-manager';
import { useCustomScheme } from '@/composables/useCustomScheme';
import { createWallpaperColors } from '@/composables/useWallpaperColors';
import type { SchemeEntry, SchemeFile } from '@/types/scheme';
import { cloneAsCustom } from '@/utils/custom-scheme';
import type { WallpaperPixels } from '@/utils/wallpaper-palette';
import {
	readWallpaperState,
	WALLPAPER_STATE_KEY,
	withWallpaperState,
} from '@/utils/wallpaper-scheme';

/**
 * «Seguir al fondo» de punta a punta, sin Tauri: la lectura del fondo, la
 * configuración y el guardado son dobles pasados por parámetro. El guardado de
 * verdad es `saveUserScheme` del plugin; acá se anota lo que recibe, así que
 * ninguna prueba escribe en `~/.config` ni en el `vasak.conf` de nadie.
 */

const FIXTURE = new URL('./fixtures/scheme-vasak-default.json', import.meta.url);
const IDENTITY = { name: 'Personalizado', author: 'Pato', description: 'Basado en Vasak Default' };

const customScheme = (state?: Parameters<typeof withWallpaperState>[1]): SchemeFile => {
	const base = cloneAsCustom(JSON.parse(readFileSync(FIXTURE, 'utf8')) as SchemeFile, IDENTITY);
	return state ? withWallpaperState(base, state) : base;
};

const solid = (r: number, g: number, b: number): WallpaperPixels => {
	const data = new Uint8Array(96 * 54 * 3);
	for (let i = 0; i < data.length; i += 3) {
		data[i] = r;
		data[i + 1] = g;
		data[i + 2] = b;
	}
	return { width: 96, height: 54, data };
};

const WALLPAPERS: Record<string, WallpaperPixels> = {
	'/fondos/bosque.jpg': solid(30, 120, 110),
	'/fondos/rojo.jpg': solid(190, 30, 40),
	'/fondos/video.mp4': solid(240, 140, 40),
};

type Harness = ReturnType<typeof harness>;

function harness(options: { scheme: SchemeFile | null; wallpaper: string; colorScheme?: string }) {
	const saved: SchemeFile[] = [];
	const read: string[] = [];
	let config: VSKConfig = {
		style: { darkmode: true, 'color-scheme': options.colorScheme ?? 'custom', radius: 8 },
		desktop: {
			wallpaper: [options.wallpaper],
			iconsize: 48,
			showfiles: true,
			showhiddenfiles: false,
		},
	} as unknown as VSKConfig;
	let onDisk = options.scheme;

	const custom = useCustomScheme({
		delay: 5,
		save: async (scheme): Promise<SchemeEntry> => {
			saved.push(structuredClone(scheme));
			onDisk = scheme;
			return { path: '/home/u/.config/vasak/schemes/custom.json', scheme };
		},
	});
	const colors = createWallpaperColors({
		custom,
		readConfig: async () => config,
		loadCustom: async () => (onDisk ? structuredClone(onDisk) : null),
		readPixels: async (path) => {
			read.push(path);
			const pixels = WALLPAPERS[path];
			if (!pixels) throw new Error('no decodifica');
			return pixels;
		},
	});
	return {
		colors,
		custom,
		saved,
		read,
		setWallpaper: (path: string) => {
			config = { ...config, desktop: { ...config.desktop, wallpaper: [path] } } as VSKConfig;
		},
	};
}

const lastSaved = (h: Harness) => h.saved[h.saved.length - 1] as SchemeFile;
const following = { follow: true, source: '', pinned: { dark: [], light: [] } };

describe('Seguir al fondo', () => {
	test('apagado, un cambio de fondo no toca nada', async () => {
		const h = harness({ scheme: customScheme(), wallpaper: '/fondos/rojo.jpg' });
		expect(await h.colors.syncWithConfig()).toBe(false);
		expect(h.saved).toHaveLength(0);
		expect(h.read).toHaveLength(0);
	});

	test('con otro esquema en uso tampoco, aunque el Personalizado lo tenga prendido', async () => {
		const h = harness({
			scheme: customScheme(following),
			wallpaper: '/fondos/rojo.jpg',
			colorScheme: 'vasak-default',
		});
		expect(await h.colors.syncWithConfig()).toBe(false);
		expect(h.saved).toHaveLength(0);
	});

	test('prendido, el fondo nuevo cambia el acento al instante y sólo los colores de ui', async () => {
		const before = customScheme(following);
		const h = harness({ scheme: before, wallpaper: '/fondos/bosque.jpg' });

		expect(await h.colors.syncWithConfig()).toBe(true);

		// Se guardó en el acto, sin esperar el antirrebote.
		expect(h.saved).toHaveLength(1);
		const after = lastSaved(h);
		expect(after.colors.dark.ui.color.primary).not.toBe(before.colors.dark.ui.color.primary);
		expect(after.colors.light.ui.color.primary).not.toBe(before.colors.light.ui.color.primary);
		expect(after.colors.dark.terminal).toEqual(before.colors.dark.terminal);
		expect(after.colors.light.terminal).toEqual(before.colors.light.terminal);
		expect(after.id).toBe('custom');
		expect(readWallpaperState(after).source).toBe('/fondos/bosque.jpg');
	});

	test('el mismo fondo no se vuelve a leer: guardar el esquema no entra en un bucle', async () => {
		const h = harness({ scheme: customScheme(following), wallpaper: '/fondos/bosque.jpg' });
		await h.colors.syncWithConfig();
		// El guardado dispara otro `config-changed`; el fondo es el mismo.
		expect(await h.colors.syncWithConfig()).toBe(false);
		expect(h.saved).toHaveLength(1);
		expect(h.read).toEqual(['/fondos/bosque.jpg']);
	});

	test('un fondo que cambia otra vez vuelve a cambiar los colores', async () => {
		const h = harness({ scheme: customScheme(following), wallpaper: '/fondos/bosque.jpg' });
		await h.colors.syncWithConfig();
		const forest = lastSaved(h).colors.dark.ui.color.primary;
		h.setWallpaper('/fondos/rojo.jpg');
		await h.colors.syncWithConfig();
		expect(lastSaved(h).colors.dark.ui.color.primary).not.toBe(forest);
	});

	test('un fondo de video se lee por su cuadro, como cualquier imagen', async () => {
		const h = harness({ scheme: customScheme(following), wallpaper: '/fondos/video.mp4' });
		expect(await h.colors.syncWithConfig()).toBe(true);
		expect(h.read).toEqual(['/fondos/video.mp4']);
	});

	test('un fondo que no se puede leer deja los colores como estaban y lo avisa', async () => {
		const before = customScheme(following);
		const h = harness({ scheme: before, wallpaper: '/fondos/roto.mp4' });
		expect(await h.colors.syncWithConfig()).toBe(false);
		expect(h.saved).toHaveLength(0);
		expect(h.colors.error.value).toBe('unreadable');
		expect(h.custom.scheme.value?.colors).toEqual(before.colors);
	});

	test('sin Personalizado todavía no se crea nada por un cambio de fondo', async () => {
		const h = harness({ scheme: null, wallpaper: '/fondos/rojo.jpg' });
		expect(await h.colors.syncWithConfig()).toBe(false);
		expect(h.saved).toHaveLength(0);
	});

	test('dos pedidos del mismo fondo a la vez leen el fondo una sola vez', async () => {
		const h = harness({ scheme: customScheme(following), wallpaper: '/fondos/rojo.jpg' });
		await Promise.all([
			h.colors.regenerate('/fondos/rojo.jpg'),
			h.colors.regenerate('/fondos/rojo.jpg'),
		]);
		expect(h.read).toEqual(['/fondos/rojo.jpg']);
	});
});

describe('los colores editados a mano', () => {
	test('quedan fijados y sobreviven a un cambio de fondo', async () => {
		const h = harness({ scheme: customScheme(following), wallpaper: '/fondos/bosque.jpg' });
		await h.colors.syncWithConfig();

		h.custom.updateColors('dark', { ui: { color: { primary: '#ffd700' } } });
		await h.custom.flush();
		expect(readWallpaperState(lastSaved(h)).pinned.dark).toEqual(['ui.color.primary']);

		h.setWallpaper('/fondos/rojo.jpg');
		await h.colors.syncWithConfig();

		const after = lastSaved(h);
		expect(after.colors.dark.ui.color.primary).toBe('#ffd700');
		// Lo que no estaba fijado sí siguió al fondo nuevo.
		expect(readWallpaperState(after).source).toBe('/fondos/rojo.jpg');
		expect(after.colors.light.ui.color.primary).not.toBe('#ffd700');
	});

	test('un valor inválido no fija nada', async () => {
		const h = harness({ scheme: customScheme(following), wallpaper: '/fondos/bosque.jpg' });
		await h.colors.syncWithConfig();
		h.custom.updateColors('dark', { ui: { color: { primary: '#12' } } });
		await h.custom.flush();
		expect(readWallpaperState(h.custom.scheme.value).pinned.dark).toEqual([]);
	});

	test('soltar un color hace que el próximo recálculo lo vuelva a sacar del fondo', async () => {
		const h = harness({
			scheme: customScheme({ ...following, pinned: { dark: ['ui.color.primary'], light: [] } }),
			wallpaper: '/fondos/bosque.jpg',
		});
		await h.colors.preview('/fondos/bosque.jpg');
		const pinnedValue = h.custom.scheme.value?.colors.dark.ui.color.primary;
		expect(pinnedValue).toBe('#eba0ac');
		await h.colors.regenerate('/fondos/bosque.jpg');
		expect(h.custom.scheme.value?.colors.dark.ui.color.primary).toBe(pinnedValue);

		await h.custom.updateWallpaperState(
			(state) => ({ ...state, pinned: { ...state.pinned, dark: [] } }),
			{ immediate: true }
		);
		await h.colors.regenerate('/fondos/rojo.jpg');
		expect(h.custom.scheme.value?.colors.dark.ui.color.primary).not.toBe(pinnedValue);
	});

	test('el estado se guarda en custom.json, al lado de los colores', async () => {
		const h = harness({ scheme: customScheme(), wallpaper: '/fondos/bosque.jpg' });
		await h.colors.preview('/fondos/bosque.jpg');
		await h.custom.updateWallpaperState((state) => ({ ...state, follow: true }), {
			immediate: true,
		});
		expect(lastSaved(h)[WALLPAPER_STATE_KEY]).toEqual({
			follow: true,
			source: '',
			pinned: { dark: [], light: [] },
		});
	});
});

describe('la vista previa', () => {
	test('lee la paleta sin escribir el esquema', async () => {
		const h = harness({ scheme: customScheme(), wallpaper: '/fondos/rojo.jpg' });
		expect(await h.colors.preview('/fondos/rojo.jpg')).toBe(true);
		expect(h.saved).toHaveLength(0);
		expect(h.colors.palette.value.length).toBeGreaterThan(0);
		expect(h.colors.palettePath.value).toBe('/fondos/rojo.jpg');
	});
});

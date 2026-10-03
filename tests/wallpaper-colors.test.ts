import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
	readWallpaperState,
	WALLPAPER_STATE_KEY,
	type WallpaperPixels,
	withWallpaperState,
} from '@vasakgroup/plugin-config-manager';
import { useCustomScheme } from '@/composables/useCustomScheme';
import { createWallpaperColors } from '@/composables/useWallpaperColors';
import type { SchemeEntry, SchemeFile } from '@/types/scheme';
import { cloneAsCustom } from '@/utils/custom-scheme';

/**
 * Lo que queda en Configuración de «Seguir al fondo»: el recálculo a mano, los
 * colores fijados desde el editor y tomar lo que el escritorio escribió.
 * Seguir el fondo en cada cambio lo hace vasak-desktop con `followWallpaper`
 * del plugin, que se prueba allá.
 *
 * La lectura del fondo y el guardado son dobles pasados por parámetro: ninguna
 * prueba escribe en `~/.config` ni en el `vasak.conf` de nadie.
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

function harness(scheme: SchemeFile | null) {
	const saved: SchemeFile[] = [];
	const read: string[] = [];
	const disk = { scheme };

	const custom = useCustomScheme({
		delay: 5,
		save: async (next): Promise<SchemeEntry> => {
			saved.push(structuredClone(next));
			disk.scheme = next;
			return { path: '/home/u/.config/vasak/schemes/custom.json', scheme: next };
		},
	});
	const colors = createWallpaperColors({
		custom,
		loadCustom: async () => (disk.scheme ? structuredClone(disk.scheme) : null),
		readPixels: async (path) => {
			read.push(path);
			const pixels = WALLPAPERS[path];
			if (!pixels) throw new Error('no decodifica');
			return pixels;
		},
	});
	return { colors, custom, saved, read, disk };
}

type Harness = ReturnType<typeof harness>;
const lastSaved = (h: Harness) => h.saved[h.saved.length - 1] as SchemeFile;
const following = { follow: true, source: '', pinned: { dark: [], light: [] } };

describe('Volver a sacar del fondo', () => {
	test('cambia sólo los colores de ui y guarda en el acto', async () => {
		const before = customScheme(following);
		const h = harness(before);
		expect(await h.colors.regenerate('/fondos/bosque.jpg')).toBe(true);

		expect(h.saved).toHaveLength(1);
		const after = lastSaved(h);
		expect(after.colors.dark.ui.color.primary).not.toBe(before.colors.dark.ui.color.primary);
		expect(after.colors.light.ui.color.primary).not.toBe(before.colors.light.ui.color.primary);
		expect(after.colors.dark.terminal).toEqual(before.colors.dark.terminal);
		expect(after.id).toBe('custom');
		expect(readWallpaperState(after).source).toBe('/fondos/bosque.jpg');
	});

	test('un fondo de video se lee por su cuadro, como cualquier imagen', async () => {
		const h = harness(customScheme(following));
		expect(await h.colors.regenerate('/fondos/video.mp4')).toBe(true);
		expect(h.read).toEqual(['/fondos/video.mp4']);
	});

	test('un fondo que no se puede leer deja los colores como estaban y lo avisa', async () => {
		const before = customScheme(following);
		const h = harness(before);
		expect(await h.colors.regenerate('/fondos/roto.mp4')).toBe(false);
		expect(h.saved).toHaveLength(0);
		expect(h.colors.error.value).toBe('unreadable');
		expect(h.custom.scheme.value?.colors).toEqual(before.colors);
	});

	test('sin Personalizado no se crea nada', async () => {
		const h = harness(null);
		expect(await h.colors.regenerate('/fondos/rojo.jpg')).toBe(false);
		expect(h.saved).toHaveLength(0);
	});

	test('dos pedidos del mismo fondo a la vez leen el fondo una sola vez', async () => {
		const h = harness(customScheme(following));
		await Promise.all([
			h.colors.regenerate('/fondos/rojo.jpg'),
			h.colors.regenerate('/fondos/rojo.jpg'),
		]);
		expect(h.read).toEqual(['/fondos/rojo.jpg']);
	});
});

describe('lo que escribe el escritorio', () => {
	test('el editor toma el custom.json nuevo', async () => {
		const h = harness(customScheme(following));
		await h.colors.preview('/fondos/bosque.jpg');
		const fromDesktop = customScheme({ ...following, source: '/fondos/rojo.jpg' });
		fromDesktop.colors.dark.ui.color.primary = '#ffa098';
		h.disk.scheme = fromDesktop;

		expect(await h.colors.refreshFromDisk()).toBe(true);
		expect(h.custom.scheme.value?.colors.dark.ui.color.primary).toBe('#ffa098');
		// Releer no escribe nada.
		expect(h.saved).toHaveLength(0);
	});

	test('un cambio a mano todavía sin guardar no se pisa', async () => {
		const h = harness(customScheme(following));
		await h.colors.preview('/fondos/bosque.jpg');
		h.custom.updateColors('dark', { ui: { color: { primary: '#ffd700' } } });

		const fromDesktop = customScheme(following);
		fromDesktop.colors.dark.ui.color.primary = '#ffa098';
		h.disk.scheme = fromDesktop;

		expect(await h.colors.refreshFromDisk()).toBe(false);
		expect(h.custom.scheme.value?.colors.dark.ui.color.primary).toBe('#ffd700');
		await h.custom.flush();
		expect(lastSaved(h).colors.dark.ui.color.primary).toBe('#ffd700');
	});

	test('lo leído antes de un cambio de acá se descarta, aunque el cambio ya se guardó', async () => {
		const h = harness(customScheme(following));
		await h.colors.preview('/fondos/bosque.jpg');
		const stale = customScheme(following);
		stale.colors.dark.ui.color.primary = '#010101';
		// El disco contesta tarde, con una foto de antes del cambio.
		let answer: (scheme: SchemeFile) => void = () => {};
		const slow = new Promise<SchemeFile>((resolve) => {
			answer = resolve;
		});
		const colors = createWallpaperColors({
			custom: h.custom,
			loadCustom: () => slow,
			readPixels: async () => solid(1, 2, 3),
		});
		const refreshing = colors.refreshFromDisk();
		h.custom.updateColors('dark', { ui: { color: { primary: '#ffd700' } } });
		await h.custom.flush();
		answer(stale);

		expect(await refreshing).toBe(false);
		expect(h.custom.scheme.value?.colors.dark.ui.color.primary).toBe('#ffd700');
	});

	test('sin editar el Personalizado, no se lee nada', async () => {
		const h = harness(customScheme(following));
		expect(await h.colors.refreshFromDisk()).toBe(false);
		expect(h.custom.scheme.value).toBeNull();
	});
});

describe('los colores editados a mano', () => {
	test('quedan fijados y sobreviven a un recálculo', async () => {
		const h = harness(customScheme(following));
		await h.colors.regenerate('/fondos/bosque.jpg');

		h.custom.updateColors('dark', { ui: { color: { primary: '#ffd700' } } });
		await h.custom.flush();
		expect(readWallpaperState(lastSaved(h)).pinned.dark).toEqual(['ui.color.primary']);

		await h.colors.regenerate('/fondos/rojo.jpg');
		const after = lastSaved(h);
		expect(after.colors.dark.ui.color.primary).toBe('#ffd700');
		expect(readWallpaperState(after).source).toBe('/fondos/rojo.jpg');
		expect(after.colors.light.ui.color.primary).not.toBe('#ffd700');
	});

	test('un valor inválido no fija nada', async () => {
		const h = harness(customScheme(following));
		await h.colors.regenerate('/fondos/bosque.jpg');
		h.custom.updateColors('dark', { ui: { color: { primary: '#12' } } });
		await h.custom.flush();
		expect(readWallpaperState(h.custom.scheme.value).pinned.dark).toEqual([]);
	});

	test('soltar un color hace que el próximo recálculo lo vuelva a sacar del fondo', async () => {
		const h = harness(
			customScheme({ ...following, pinned: { dark: ['ui.color.primary'], light: [] } })
		);
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
		const h = harness(customScheme());
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
		const h = harness(customScheme());
		expect(await h.colors.preview('/fondos/rojo.jpg')).toBe(true);
		expect(h.saved).toHaveLength(0);
		expect(h.colors.palette.value.length).toBeGreaterThan(0);
		expect(h.colors.palettePath.value).toBe('/fondos/rojo.jpg');
	});
});

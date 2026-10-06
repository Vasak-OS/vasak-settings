/**
 * El servicio de fondos: la carpeta propia (vasak-settings#148) y el acceso a
 * cualquier imagen del hogar (vasak-settings#163).
 *
 * Se prueba con dependencias inyectadas, sin tocar el backend: así no hace falta
 * doblar `invoke`, que en este repositorio ya está doblado con `mock.module`
 * desde otro archivo —y dos dobles del mismo módulo se pelean entre archivos y
 * pasan en local pero fallan en CI—.
 */

import { describe, expect, test } from 'bun:test';
import type { VSKConfig } from '@vasakgroup/plugin-config-manager';
import {
	persistWallpaperFolder,
	wallpaperThumbnailUrl,
} from '../src/services/style.service';

const CONFIG: VSKConfig = {
	style: { darkmode: true, 'color-scheme': 'vasak-default', radius: 12 },
	desktop: {
		wallpaper: ['/usr/share/backgrounds/vasakos/wallpaper-1.jpg'],
		iconsize: 48,
		showfiles: true,
		showhiddenfiles: false,
		pausevideoonbattery: false,
	},
	fonts: { terminal: 'mono', title: 'sans', apps: 'sans' },
	icons: { dark: 'Vasak', light: 'Vasak' },
};

describe('wallpaperThumbnailUrl', () => {
	test('autoriza el original y devuelve la URL de la miniatura', async () => {
		const url = await wallpaperThumbnailUrl('/home/pato/foto.jpg', {
			allow: async (p) => `/canon${p}`,
			thumbnail: async (p) => `${p}.thumb`,
			toUrl: (p) => `asset://localhost${p}`,
		});
		expect(url).toBe('asset://localhost/canon/home/pato/foto.jpg.thumb');
	});

	test('si no se pudo autorizar, sigue con la ruta tal cual', async () => {
		const url = await wallpaperThumbnailUrl('/home/pato/foto.jpg', {
			allow: async () => {
				throw new Error('todavía no existe');
			},
			thumbnail: async (p) => `${p}.thumb`,
			toUrl: (p) => `asset://localhost${p}`,
		});
		expect(url).toBe('asset://localhost/home/pato/foto.jpg.thumb');
	});

	test('si la miniatura falla, muestra el original autorizado', async () => {
		const url = await wallpaperThumbnailUrl('/home/pato/foto.jpg', {
			allow: async (p) => `/canon${p}`,
			thumbnail: async () => {
				throw new Error('ffmpeg no está');
			},
			toUrl: (p) => `asset://localhost${p}`,
		});
		expect(url).toBe('asset://localhost/canon/home/pato/foto.jpg');
	});
});

describe('persistWallpaperFolder', () => {
	test('guarda la carpeta en desktop.wallpaperfolder sin pisar el resto', async () => {
		let written: VSKConfig | null = null;
		const result = await persistWallpaperFolder('/mnt/fotos', {
			read: async () => structuredClone(CONFIG),
			write: async (config) => {
				written = config;
			},
		});

		expect(result.desktop.wallpaperfolder).toBe('/mnt/fotos');
		expect(result.desktop.wallpaper).toEqual(CONFIG.desktop.wallpaper);
		expect(result.style).toEqual(CONFIG.style);
		expect(written).toEqual(result);
	});

	test('cadena vacía olvida la carpeta', async () => {
		const result = await persistWallpaperFolder('', {
			read: async () => structuredClone(CONFIG),
			write: async () => {},
		});
		expect(result.desktop.wallpaperfolder).toBe('');
	});

	test('sin configuración que leer es un error', async () => {
		await expect(
			persistWallpaperFolder('/mnt/fotos', { read: async () => null, write: async () => {} })
		).rejects.toThrow();
	});
});

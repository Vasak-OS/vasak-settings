/**
 * «Seguir al fondo»: los colores del esquema «Personalizado» sacados del fondo
 * de pantalla (Vasak-OS/vasak-settings#134).
 *
 * Hay **una sola** instancia para toda la aplicación, igual que hay un solo
 * esquema «Personalizado» en edición: la usan `App.vue`, que mira cada cambio
 * de configuración —el fondo puede cambiar desde esta ventana o desde el
 * escritorio—, y Apariencia, que muestra la paleta y el interruptor. Si cada
 * una tuviera la suya, la de Apariencia guardaría encima de lo que acababa de
 * escribir la otra con los colores viejos.
 *
 * El camino de escritura es el del editor: `useCustomScheme` →
 * `saveUserScheme` del plugin, que escribe `~/.config/vasak/schemes/custom.json`
 * y hace que el vigilante de cada aplicación abierta reaplique el esquema. Acá
 * no se escribe ningún archivo a mano.
 */

import { invoke } from '@tauri-apps/api/core';
import { getSchemeById, readConfig, type VSKConfig } from '@vasakgroup/plugin-config-manager';
import { type Ref, ref, shallowRef } from 'vue';
import { type CustomScheme, useCustomScheme } from '@/composables/useCustomScheme';
import type { SchemeEntry, SchemeFile } from '@/types/scheme';
import { SCHEME_KEY } from '@/utils/config-values';
import { CUSTOM_SCHEME_ID } from '@/utils/custom-scheme';
import { extractPalette, type PaletteColor, type WallpaperPixels } from '@/utils/wallpaper-palette';
import { buildWallpaperPatches, readWallpaperState } from '@/utils/wallpaper-scheme';

/** Por qué no se pudieron sacar los colores. La vista lo traduce. */
export type WallpaperColorsError = 'unreadable' | 'save' | null;

export type WallpaperColorsDeps = {
	readPixels: (path: string) => Promise<WallpaperPixels>;
	readConfig: () => Promise<VSKConfig | null>;
	loadCustom: () => Promise<SchemeFile | null>;
	custom: CustomScheme;
};

export type WallpaperColors = {
	custom: CustomScheme;
	/** La paleta del último fondo leído, para la vista previa. */
	palette: Ref<PaletteColor[]>;
	/** El color del fondo del que salió el acento. */
	accentSource: Ref<PaletteColor | null>;
	/** El fondo de la paleta que se está mostrando. */
	palettePath: Ref<string>;
	busy: Ref<boolean>;
	error: Ref<WallpaperColorsError>;
	/** Lee el fondo y deja su paleta para la vista previa, sin tocar el esquema. */
	preview: (path: string) => Promise<boolean>;
	/** Saca los colores del fondo y los guarda en el «Personalizado». */
	regenerate: (path: string) => Promise<boolean>;
	/**
	 * Lo que hace `App.vue` en cada `config-changed`: si el «Personalizado» está
	 * en uso, sigue al fondo, y el fondo cambió desde la última vez, recalcula.
	 */
	syncWithConfig: () => Promise<boolean>;
};

const wallpaperOf = (config: VSKConfig | null) => config?.desktop?.wallpaper?.[0] ?? '';

export function createWallpaperColors(deps: WallpaperColorsDeps): WallpaperColors {
	const { custom } = deps;
	const palette = shallowRef<PaletteColor[]>([]);
	const accentSource = shallowRef<PaletteColor | null>(null);
	const palettePath = ref('');
	const busy = ref(false);
	const error = ref<WallpaperColorsError>(null);

	/** El recálculo en curso: uno a la vez, y el mismo fondo no se lee dos veces. */
	let running: Promise<boolean> | null = null;
	let runningPath = '';

	const ensureLoaded = async () => {
		if (custom.scheme.value) return true;
		const loaded = await deps.loadCustom();
		if (!loaded) return false;
		custom.load(loaded);
		return true;
	};

	const readPalette = async (path: string) => {
		try {
			const pixels = await deps.readPixels(path);
			const colors = extractPalette(pixels);
			if (colors.length === 0) throw new Error('paleta vacía');
			return colors;
		} catch (err) {
			// Se queda con los colores que había: es mejor que inventar unos.
			console.warn('No se pudieron sacar los colores del fondo:', err);
			error.value = 'unreadable';
			return null;
		}
	};

	const preview: WallpaperColors['preview'] = async (path) => {
		if (!path) return false;
		await ensureLoaded();
		const colors = await readPalette(path);
		if (!colors) return false;
		palette.value = colors;
		palettePath.value = path;
		const scheme = custom.scheme.value;
		accentSource.value = scheme
			? (buildWallpaperPatches(scheme, colors)?.accents.source ?? null)
			: null;
		return true;
	};

	const run = async (path: string) => {
		busy.value = true;
		error.value = null;
		try {
			if (!(await ensureLoaded())) return false;
			const colors = await readPalette(path);
			const scheme = custom.scheme.value;
			if (!colors || !scheme) return false;
			const built = buildWallpaperPatches(scheme, colors, readWallpaperState(scheme).pinned);
			if (!built) return false;
			palette.value = colors;
			palettePath.value = path;
			accentSource.value = built.accents.source;
			try {
				await custom.applyWallpaper(built.patches, path);
			} catch {
				error.value = 'save';
				return false;
			}
			return true;
		} finally {
			busy.value = false;
		}
	};

	const regenerate: WallpaperColors['regenerate'] = (path) => {
		if (!path) return Promise.resolve(false);
		if (running && runningPath === path) return running;
		const previous = running ?? Promise.resolve(false);
		const next = previous
			.catch(() => false)
			.then(() => run(path))
			.finally(() => {
				if (running === next) {
					running = null;
					runningPath = '';
				}
			});
		running = next;
		runningPath = path;
		return next;
	};

	const syncWithConfig: WallpaperColors['syncWithConfig'] = async () => {
		const config = await deps.readConfig();
		if (config?.style?.[SCHEME_KEY] !== CUSTOM_SCHEME_ID) return false;
		const path = wallpaperOf(config);
		if (!path) return false;
		if (!(await ensureLoaded())) return false;
		const state = readWallpaperState(custom.scheme.value);
		if (!state.follow || state.source === path) return false;
		return regenerate(path);
	};

	return {
		custom,
		palette,
		accentSource,
		palettePath,
		busy,
		error,
		preview,
		regenerate,
		syncWithConfig,
	};
}

/** Quién se entera de cada guardado del «Personalizado»: la lista de Apariencia. */
const savedListeners = new Set<(entry: SchemeEntry) => void>();

export function onCustomSchemeSaved(listener: (entry: SchemeEntry) => void): () => void {
	savedListeners.add(listener);
	return () => savedListeners.delete(listener);
}

let shared: WallpaperColors | null = null;

/** La instancia de la aplicación, con el plugin y el comando de verdad. */
export function useWallpaperColors(): WallpaperColors {
	if (!shared) {
		const custom = useCustomScheme({
			onSaved: (entry) => {
				for (const listener of savedListeners) listener(entry);
			},
		});
		shared = createWallpaperColors({
			custom,
			readPixels: (path) => invoke<WallpaperPixels>('wallpaper_pixels', { path }),
			readConfig,
			loadCustom: async () => {
				try {
					const entry = await getSchemeById(CUSTOM_SCHEME_ID);
					return (entry?.scheme as SchemeFile | undefined) ?? null;
				} catch {
					return null;
				}
			},
		});
	}
	return shared;
}

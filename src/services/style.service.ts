import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import {
	getSchemeById as pluginGetSchemeById,
	getSchemes as pluginGetSchemes,
	readConfig,
	type VSKConfig,
	writeConfig,
} from '@vasakgroup/plugin-config-manager';
import { WALLPAPER_FOLDER_KEY } from '@/utils/config-values';

export type SystemFontItem = {
	id: string;
	name: string;
	fontName: string;
	path: string;
	weight: number;
	style: 'Normal' | 'Italic' | 'Oblique';
	monospaced: boolean;
};

export const getGtkThemes = <T = any>(args?: any): Promise<T> => {
	return invoke<T>('get_gtk_themes', args);
};

export const getCursorThemes = <T = any>(args?: any): Promise<T> => {
	return invoke<T>('get_cursor_themes', args);
};

export const getIconPacks = <T = any>(args?: any): Promise<T> => {
	return invoke<T>('get_icon_packs', args);
};

export const getIconPackIcons = <T = any>(packName: string): Promise<T> => {
	return invoke<T>('get_icon_pack_icons', { iconPack: packName });
};

export const getSchemes = pluginGetSchemes;

export const getSchemeById = pluginGetSchemeById;

export const getSystemFonts = <T = SystemFontItem[]>(args?: any): Promise<T> => {
	return invoke<T>('plugin:system-fonts|get_system_fonts', args);
};

export const getCurrentSystemState = <T = any>(args?: any): Promise<T> => {
	return invoke<T>('get_current_system_state', args);
};

export const setSystemConfig = <T = any>(args: any): Promise<T> => {
	return invoke<T>('set_system_config', args);
};

export const getOfficialWallpapers = <T = string[]>(args?: any): Promise<T> => {
	return invoke<T>('get_official_wallpapers', args);
};

/** Los fondos de una carpeta propia (vasak-settings#148): imágenes y videos. */
export const getCustomWallpapers = (folder: string): Promise<string[]> => {
	return invoke<string[]>('get_custom_wallpapers', { folder });
};

/**
 * Da acceso del protocolo de assets a un archivo de fondo y devuelve su ruta
 * canónica, la que hay que usar con `convertFileSrc`. El mismo contrato que el
 * escritorio: una imagen de cualquier carpeta del hogar o de una carpeta propia
 * se puede mostrar, sin depender de los globs del alcance (vasak-settings#163).
 */
export const allowWallpaperAsset = (path: string): Promise<string> => {
	return invoke<string>('allow_wallpaper_asset', { path });
};

/** Las dependencias de `wallpaperThumbnailUrl`, inyectables para probarlo. */
export interface ThumbnailDeps {
	allow?: (path: string) => Promise<string>;
	thumbnail?: (path: string) => Promise<string>;
	toUrl?: (path: string) => string;
}

/**
 * La URL de la miniatura de un fondo, lista para `<img>`.
 *
 * Primero autoriza el original y toma su ruta canónica: así una imagen de
 * cualquier carpeta del hogar o de una carpeta propia se puede mostrar sin
 * depender de los globs del alcance (vasak-settings#163). Después pide la
 * miniatura chica —los fondos del sistema son de 4K y 5K— y, si no se pudo
 * generar, muestra el original autorizado en lugar de un recuadro roto.
 *
 * Las dependencias se inyectan para poder probarlo sin el backend de Tauri.
 */
export async function wallpaperThumbnailUrl(
	path: string,
	deps: ThumbnailDeps = {}
): Promise<string> {
	const allow = deps.allow ?? allowWallpaperAsset;
	const thumbnail =
		deps.thumbnail ?? ((p: string) => invoke<string>('wallpaper_thumbnail', { path: p }));
	const toUrl = deps.toUrl ?? convertFileSrc;

	let assetPath = path;
	try {
		assetPath = await allow(path);
	} catch {
		assetPath = path;
	}

	try {
		return toUrl(await thumbnail(assetPath));
	} catch {
		return toUrl(assetPath);
	}
}

/** Las dependencias de `persistWallpaperFolder`, inyectables para probarlo. */
export interface PersistFolderDeps {
	read?: () => Promise<VSKConfig | null>;
	write?: (config: VSKConfig) => Promise<void>;
}

/**
 * Guarda la carpeta propia de fondos en `desktop.wallpaperfolder` y devuelve la
 * configuración escrita.
 *
 * Relee la configuración justo antes de escribirla para no pisar otra cosa que
 * haya cambiado (el tema, un widget), y conserva el resto de la sección
 * `desktop`. Cadena vacía olvida la carpeta.
 */
export async function persistWallpaperFolder(
	folder: string,
	deps: PersistFolderDeps = {}
): Promise<VSKConfig> {
	const read = deps.read ?? readConfig;
	const write = deps.write ?? writeConfig;

	const config = await read();
	if (!config) throw new Error('no se pudo leer la configuración');
	config.desktop = { ...config.desktop, [WALLPAPER_FOLDER_KEY]: folder };
	await write(config);
	return config;
}

import { invoke } from '@tauri-apps/api/core';
import {
	getSchemeById as pluginGetSchemeById,
	getSchemes as pluginGetSchemes,
} from '@vasakgroup/plugin-config-manager';

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

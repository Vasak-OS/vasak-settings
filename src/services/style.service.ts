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

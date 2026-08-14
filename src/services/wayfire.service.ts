import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export const readWayfireSection = (section: string): Promise<Record<string, string>> => {
	return invoke<Record<string, string>>('read_wayfire_section', { section });
};

export const writeWayfireSection = (
	section: string,
	values: Record<string, string>
): Promise<void> => {
	return invoke<void>('write_wayfire_section', { section, values });
};

/**
 * Replaces the section outright: keys missing from `values` are removed. Only
 * for sections the UI owns entirely, where deleting an entry has to stick.
 */
export const replaceWayfireSection = (
	section: string,
	values: Record<string, string>
): Promise<void> => {
	return invoke<void>('replace_wayfire_section', { section, values });
};

export const getAllWayfireSections = (): Promise<string[]> => {
	return invoke<string[]>('get_all_wayfire_sections');
};

/**
 * Fires when wayfire.ini changed outside the application — edited by hand, or
 * by another tool. Saves of our own do not fire it: the backend compares what
 * landed on disk with what it wrote, so a page is never told to reload over a
 * change it just made itself.
 */
export const onWayfireConfigChanged = (handler: () => void): Promise<UnlistenFn> => {
	return listen('wayfire-config-changed', () => handler());
};

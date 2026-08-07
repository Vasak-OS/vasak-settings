import { invoke } from '@tauri-apps/api/core';

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

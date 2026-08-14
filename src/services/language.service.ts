import { invoke } from '@tauri-apps/api/core';

export interface KeyboardLayout {
	code: string;
	description: string;
}

export interface KeyboardSettings {
	/** `xkb_layout`, verbatim: one code, or two separated by a comma. */
	layouts: string;
	variant: string;
	/** The `grp:` entry of `xkb_options`, empty when there is none. */
	switch_option: string;
}

export async function getAvailableLocales(): Promise<string[]> {
	return invoke<string[]>('get_available_locales');
}

export async function getCurrentLocale(): Promise<Record<string, string>> {
	return invoke<Record<string, string>>('get_current_locale');
}

export async function setSystemLocale(locale: string): Promise<void> {
	return invoke('set_system_locale', { locale });
}

export async function getAvailableKeyboardLayouts(): Promise<KeyboardLayout[]> {
	return invoke<KeyboardLayout[]>('get_available_keyboard_layouts');
}

/** Variants belong to a layout: asking without one lists every layout's. */
export async function getAvailableKeyboardVariants(layout: string): Promise<KeyboardLayout[]> {
	return invoke<KeyboardLayout[]>('get_available_keyboard_variants', { layout });
}

/** The `grp:` XKB options: the shortcuts that switch between two layouts. */
export async function getAvailableKeyboardSwitchOptions(): Promise<KeyboardLayout[]> {
	return invoke<KeyboardLayout[]>('get_available_keyboard_switch_options');
}

export async function setKeyboardLayouts(
	layouts: string,
	variant: string,
	switchOption: string
): Promise<void> {
	return invoke('set_keyboard_layouts', { layouts, variant, switchOption });
}

export async function getKeyboardLayoutsFromWayfire(): Promise<KeyboardSettings> {
	return invoke<KeyboardSettings>('get_keyboard_layouts_from_wayfire');
}

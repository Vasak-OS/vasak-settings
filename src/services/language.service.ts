import { invoke } from '@tauri-apps/api/core';

export interface KeyboardLayout {
	code: string;
	description: string;
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

export async function getAvailableKeyboardVariants(): Promise<KeyboardLayout[]> {
	return invoke<KeyboardLayout[]>('get_available_keyboard_variants');
}

export async function setKeyboardLayouts(layouts: string, variant: string): Promise<void> {
	return invoke('set_keyboard_layouts', { layouts, variant });
}

export async function getKeyboardLayoutsFromWayfire(): Promise<[string, string]> {
	return invoke<[string, string]>('get_keyboard_layouts_from_wayfire');
}

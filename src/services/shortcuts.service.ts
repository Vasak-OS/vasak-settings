import { invoke } from '@tauri-apps/api/core';
import type { ShortcutRule } from '@/types/shortcuts';

const KEY_ALIASES: Record<string, string> = {
	CTRL: 'CTRL',
	CONTROL: 'CTRL',
	KEY_LEFTCTRL: 'CTRL',
	KEY_RIGHTCTRL: 'CTRL',
	SHIFT: 'SHIFT',
	KEY_LEFTSHIFT: 'SHIFT',
	KEY_RIGHTSHIFT: 'SHIFT',
	ALT: 'ALT',
	KEY_LEFTALT: 'ALT',
	KEY_RIGHTALT: 'ALT',
	SUPER: 'SUPER',
	META: 'SUPER',
	WIN: 'SUPER',
	KEY_LEFTMETA: 'SUPER',
	KEY_RIGHTMETA: 'SUPER',
};

const canonicalKeyName = (raw: string): string => {
	const key = raw.trim().toUpperCase();
	return KEY_ALIASES[key] || key;
};

export const normalizeShortcutKeys = (combo: string): string => {
	const parts = combo
		.split('+')
		.map(canonicalKeyName)
		.filter((part) => part.length > 0);

	return Array.from(new Set(parts)).sort().join('+');
};

export const formatShortcutLabel = (shortcut: ShortcutRule): string => {
	return `${normalizeShortcutKeys(shortcut.keys)} → ${shortcut.target}`;
};

export const getShortcuts = (): Promise<ShortcutRule[]> => {
	return invoke<ShortcutRule[]>('get_shortcuts');
};

export const saveShortcuts = (shortcuts: ShortcutRule[]): Promise<ShortcutRule[]> => {
	return invoke<ShortcutRule[]>('save_shortcuts', { shortcuts });
};

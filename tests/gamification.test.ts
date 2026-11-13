import { describe, expect, test } from 'bun:test';
import { achievementIcon, achievementKey } from '../src/utils/gamification';

/** Los logros de la gamificación: icono del tema y clave de traducción por id. */
const KNOWN: [id: string, icon: string, key: string][] = [
	['xp-100', 'starred', 'xp100'],
	['xp-500', 'starred', 'xp500'],
	['xp-1000', 'emblem-favorite', 'xp1000'],
	['first-break', 'media-playback-pause', 'firstBreak'],
	['first-hydration', 'weather-showers', 'firstHydration'],
];

describe('achievementIcon', () => {
	for (const [id, icon] of KNOWN) {
		test(`el logro ${id} usa el icono ${icon}`, () => {
			expect(achievementIcon(id)).toBe(icon);
		});
	}

	test('xp-100 y xp-500 comparten icono pero no clave', () => {
		expect(achievementIcon('xp-100')).toBe(achievementIcon('xp-500'));
		expect(achievementKey('xp-100')).not.toBe(achievementKey('xp-500'));
	});

	test('un logro desconocido cae en el icono genérico', () => {
		expect(achievementIcon('inexistente')).toBe('emblem-default');
		expect(achievementIcon('')).toBe('emblem-default');
	});

	test('los ids del prototipo de Object no se toman por logros', () => {
		expect(achievementIcon('constructor')).toBe('emblem-default');
	});
});

describe('achievementKey', () => {
	for (const [id, , key] of KNOWN) {
		test(`el logro ${id} se traduce con la clave ${key}`, () => {
			expect(achievementKey(id)).toBe(key);
		});
	}

	test('un logro desconocido no tiene clave', () => {
		expect(achievementKey('inexistente')).toBeNull();
		expect(achievementKey('')).toBeNull();
	});
});

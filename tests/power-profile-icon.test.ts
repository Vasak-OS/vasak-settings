import { describe, expect, test } from 'bun:test';
import { powerProfileIcon } from '@/utils/power-profile-icon';

describe('el icono de cada perfil de energía', () => {
	test('los tres de power-profiles-daemon tienen el suyo', () => {
		expect(powerProfileIcon('performance')).toBe('battery-profile-performance');
		expect(powerProfileIcon('balanced')).toBe('battery-profile-balanced');
		expect(powerProfileIcon('power-saver')).toBe('battery-profile-powersave');
	});

	test('uno que no se conoce cae en el genérico y no pide un nombre inventado', () => {
		expect(powerProfileIcon('turbo')).toBe('preferences-other');
		expect(powerProfileIcon('')).toBe('preferences-other');
	});
});

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { ddcNotices } from '../src/utils/ddc-status';

describe('los avisos de los monitores externos', () => {
	test('mientras busca, lo dice y nada más', () => {
		expect(ddcNotices({ state: 'detecting', reason: null, unsupported: [] })).toEqual([
			{ key: 'views.monitors.ddcDetecting', args: [] },
		]);
	});

	test('cada razón de «no disponible» tiene su texto', () => {
		for (const [reason, key] of [
			['not-installed', 'views.monitors.ddcNotInstalled'],
			['no-i2c-dev', 'views.monitors.ddcNoI2cDev'],
			['no-permission', 'views.monitors.ddcNoPermission'],
		] as const) {
			expect(ddcNotices({ state: 'unavailable', reason, unsupported: [] })).toEqual([
				{ key, args: [] },
			]);
		}
	});

	test('un monitor que no contesta se nombra', () => {
		expect(ddcNotices({ state: 'ready', reason: null, unsupported: ['HDMI-A-1', 'DP-3'] })).toEqual(
			[
				{ key: 'views.monitors.ddcUnsupported', args: ['HDMI-A-1'] },
				{ key: 'views.monitors.ddcUnsupported', args: ['DP-3'] },
			]
		);
	});

	test('todo listo y sin problemas no dice nada', () => {
		expect(ddcNotices({ state: 'ready', reason: null, unsupported: [] })).toEqual([]);
	});

	test('las claves existen en los dos catálogos', () => {
		for (const lang of ['es', 'en']) {
			const catalog = readFileSync(`src-tauri/locales/${lang}.yml`, 'utf8');
			for (const key of [
				'ddcDetecting',
				'ddcNotInstalled',
				'ddcNoI2cDev',
				'ddcNoPermission',
				'ddcUnsupported',
			]) {
				expect(catalog).toContain(`    ${key}: `);
			}
		}
	});
});

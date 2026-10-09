import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	PANEL_INDICATORS,
	readPanelIndicators,
	writePanelIndicators,
} from '../src/utils/config-values';

/**
 * Los interruptores de «Indicadores», y el del indicador de cámara y micrófono
 * entre ellos.
 *
 * Esta pantalla y el panel leen el mismo archivo por separado, y ya se dejó
 * escrito por qué la clave ausente significa «mostralo»: si acá se leyera
 * `=== true`, el panel mostraría el indicador y esta pantalla diría que está
 * apagado, en cada instalación nueva. Se prueba porque son dos repositorios y
 * nada más que la disciplina los ata.
 */

const ROOT = join(import.meta.dir, '..');
const VIEW = readFileSync(join(ROOT, 'src', 'views', 'AppearancePanelView.vue'), 'utf8');

describe('leer los indicadores del panel', () => {
	test('sin sección `panel`, todo se muestra', () => {
		// Es el caso de cualquier instalación nueva: la sección no existe hasta
		// que alguien apaga algo.
		expect(readPanelIndicators({})).toEqual({
			weather: true,
			music: true,
			transfer: true,
			tray: true,
			privacy: true,
		});
	});

	test('un `false` explícito apaga, y sólo ése', () => {
		const indicators = readPanelIndicators({ panel: { privacy: false } });

		expect(indicators.privacy).toBe(false);
		expect(indicators.tray).toBe(true);
	});

	test('lo que no es booleano no apaga nada', () => {
		// El archivo se edita a mano: ahí un `"no"` no es `false`.
		expect(readPanelIndicators({ panel: { privacy: 'no' } }).privacy).toBe(true);
		expect(readPanelIndicators({ panel: { privacy: 0 } }).privacy).toBe(true);
	});

	test('una configuración que no es un objeto no rompe la pantalla', () => {
		for (const garbage of [null, undefined, 'panel', 42]) {
			expect(readPanelIndicators(garbage).privacy).toBe(true);
		}
	});
});

describe('guardar los indicadores del panel', () => {
	test('lo guardado es lo que se vuelve a leer', () => {
		const config: Record<string, unknown> = {};

		writePanelIndicators(config, {
			weather: true,
			music: true,
			transfer: true,
			tray: true,
			privacy: false,
		});

		expect(readPanelIndicators(config).privacy).toBe(false);
	});

	test('no borra las claves de la sección que no son interruptores', () => {
		const config: Record<string, unknown> = { panel: { height: 32 } };

		writePanelIndicators(config, {
			weather: true,
			music: true,
			transfer: true,
			tray: true,
			privacy: false,
		});

		expect((config.panel as Record<string, unknown>).height).toBe(32);
	});
});

describe('la pantalla usa ese camino', () => {
	test('lee y escribe con los mismos ayudantes que se prueban acá', () => {
		expect(VIEW).toContain('readPanelIndicators(vskConfig.value)');
		expect(VIEW).toContain('writePanelIndicators(');
	});

	test('los cinco interruptores arrancan encendidos y se guardan', () => {
		const initiallyOn = [...VIEW.matchAll(/const (\w+) = ref\(true\);/g)].map(([, n]) => n);

		for (const key of PANEL_INDICATORS) {
			expect(initiallyOn).toContain(key);
			expect(VIEW).toContain(`${key}: ${key}.value,`);
		}
	});

	test('tiene etiqueta y explicación en los dos idiomas', () => {
		for (const language of ['es', 'en']) {
			const yml = readFileSync(join(ROOT, 'src-tauri', 'locales', `${language}.yml`), 'utf8');

			expect(yml).toContain('    privacy: ');
			expect(yml).toContain('    privacyHint: ');
		}
	});
});

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	escribirIndicadoresDelPanel,
	INDICADORES_DEL_PANEL,
	indicadoresDelPanel,
} from '../src/tools/valores-de-config';

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

const RAIZ = join(import.meta.dir, '..');
const VISTA = readFileSync(join(RAIZ, 'src', 'views', 'AppearancePanelView.vue'), 'utf8');

describe('leer los indicadores del panel', () => {
	test('sin sección `panel`, todo se muestra', () => {
		// Es el caso de cualquier instalación nueva: la sección no existe hasta
		// que alguien apaga algo.
		expect(indicadoresDelPanel({})).toEqual({
			weather: true,
			music: true,
			transfer: true,
			tray: true,
			privacy: true,
		});
	});

	test('un `false` explícito apaga, y sólo ése', () => {
		const leidos = indicadoresDelPanel({ panel: { privacy: false } });

		expect(leidos.privacy).toBe(false);
		expect(leidos.tray).toBe(true);
	});

	test('lo que no es booleano no apaga nada', () => {
		// El archivo se edita a mano: ahí un `"no"` no es `false`.
		expect(indicadoresDelPanel({ panel: { privacy: 'no' } }).privacy).toBe(true);
		expect(indicadoresDelPanel({ panel: { privacy: 0 } }).privacy).toBe(true);
	});

	test('una configuración que no es un objeto no rompe la pantalla', () => {
		for (const basura of [null, undefined, 'panel', 42]) {
			expect(indicadoresDelPanel(basura).privacy).toBe(true);
		}
	});
});

describe('guardar los indicadores del panel', () => {
	test('lo guardado es lo que se vuelve a leer', () => {
		const config: Record<string, unknown> = {};

		escribirIndicadoresDelPanel(config, {
			weather: true,
			music: true,
			transfer: true,
			tray: true,
			privacy: false,
		});

		expect(indicadoresDelPanel(config).privacy).toBe(false);
	});

	test('no borra las claves de la sección que no son interruptores', () => {
		const config: Record<string, unknown> = { panel: { alto: 32 } };

		escribirIndicadoresDelPanel(config, {
			weather: true,
			music: true,
			transfer: true,
			tray: true,
			privacy: false,
		});

		expect((config.panel as Record<string, unknown>).alto).toBe(32);
	});
});

describe('la pantalla usa ese camino', () => {
	test('lee y escribe con los mismos ayudantes que se prueban acá', () => {
		expect(VISTA).toContain('indicadoresDelPanel(vskConfig.value)');
		expect(VISTA).toContain('escribirIndicadoresDelPanel(');
	});

	test('los cinco interruptores arrancan encendidos y se guardan', () => {
		const arranques = [...VISTA.matchAll(/const (\w+) = ref\(true\);/g)].map(([, n]) => n);

		for (const clave of INDICADORES_DEL_PANEL) {
			expect(arranques).toContain(clave);
			expect(VISTA).toContain(`${clave}: ${clave}.value,`);
		}
	});

	test('tiene etiqueta y explicación en los dos idiomas', () => {
		for (const idioma of ['es', 'en']) {
			const yml = readFileSync(join(RAIZ, 'src-tauri', 'locales', `${idioma}.yml`), 'utf8');

			expect(yml).toContain('    privacy: ');
			expect(yml).toContain('    privacyHint: ');
		}
	});
});

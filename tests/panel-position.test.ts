/**
 * La pantalla que elige de qué lado va el panel del escritorio.
 *
 * Se lee del fuente, como el resto de las pruebas de estructura de este
 * repositorio: lo que se afirma es que la pantalla está cableada al ayudante
 * que sí se prueba con valores —`config-values.test.ts`— y que los textos
 * existen en los dos idiomas. Lo que el panel hace con la clave se prueba en
 * `vasak-desktop`, que es quien la lee.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

const viewSource = read('src/views/AppearancePanelView.vue');
const es = read('src-tauri/locales/es.yml');
const en = read('src-tauri/locales/en.yml');

describe('la pantalla del panel', () => {
	test('escribe con el mismo ayudante que se prueba aparte', () => {
		// La lógica —qué se considera una posición válida, y no apagar los
		// indicadores que comparten la sección— vive en `utils/config-values`.
		expect(viewSource).toContain('writePanelPosition');
		expect(viewSource).toContain('readPanelPosition');
	});

	test('y sigue guardando los indicadores en el mismo viaje', () => {
		// Las dos cosas viven en la sección `panel` y se guardan con el mismo
		// botón: si una de las dos escrituras se perdiera, aplicar los cambios
		// devolvería la otra a como estaba.
		expect(viewSource).toContain('writePanelIndicators');
	});

	test('usa el `select` de la librería, con su etiqueta asociada', () => {
		// Un `<label>` suelto al lado no está asociado a nada: un lector de
		// pantalla anuncia un desplegable sin nombre.
		expect(viewSource).toContain('<SelectField');
		expect(viewSource).toContain(':label="t(\'views.appearancePanel.position\')"');
	});

	test('los cuatro lados salen de la lista y no escritos a mano', () => {
		// Desde vue-libvasak 2.19.0 `SelectField` recibe las opciones por
		// propiedad y no por una ranura de `<option>`: el desplegable las toma de
		// un computed armado desde `PANEL_POSITIONS`, así que siguen saliendo de la
		// lista y no escritas una por una.
		expect(viewSource).toContain('PANEL_POSITIONS.map(');
		expect(viewSource).toContain(':options="positionOptions"');
	});

	test('y los textos están en los dos idiomas', () => {
		for (const catalog of [es, en]) {
			expect(catalog).toContain('    position: ');
			expect(catalog).toContain('    positionHint: ');
			expect(catalog).toContain('    bar: ');
		}
	});
});

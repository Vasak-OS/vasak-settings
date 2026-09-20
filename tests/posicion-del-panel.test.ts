/**
 * La pantalla que elige de qué lado va el panel del escritorio.
 *
 * Se lee del fuente, como el resto de las pruebas de estructura de este
 * repositorio: lo que se afirma es que la pantalla está cableada al ayudante
 * que sí se prueba con valores —`valores-de-config.test.ts`— y que los textos
 * existen en los dos idiomas. Lo que el panel hace con la clave se prueba en
 * `vasak-desktop`, que es quien la lee.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');

const pantalla = leer('src/views/AppearancePanelView.vue');
const es = leer('src-tauri/locales/es.yml');
const en = leer('src-tauri/locales/en.yml');

describe('la pantalla del panel', () => {
	test('escribe con el mismo ayudante que se prueba aparte', () => {
		// La lógica —qué se considera una posición válida, y no apagar los
		// indicadores que comparten la sección— vive en `tools/valores-de-config`.
		expect(pantalla).toContain('escribirPosicionDelPanel');
		expect(pantalla).toContain('posicionDelPanel');
	});

	test('y sigue guardando los indicadores en el mismo viaje', () => {
		// Las dos cosas viven en la sección `panel` y se guardan con el mismo
		// botón: si una de las dos escrituras se perdiera, aplicar los cambios
		// devolvería la otra a como estaba.
		expect(pantalla).toContain('escribirIndicadoresDelPanel');
	});

	test('usa el `select` de la librería, con su etiqueta asociada', () => {
		// Un `<label>` suelto al lado no está asociado a nada: un lector de
		// pantalla anuncia un desplegable sin nombre.
		expect(pantalla).toContain('<SelectField');
		expect(pantalla).toContain(':label="t(\'views.appearancePanel.position\')"');
	});

	test('los cuatro lados salen de la lista y no escritos a mano', () => {
		expect(pantalla).toContain('v-for="lado in POSICIONES_DEL_PANEL"');
	});

	test('y los textos están en los dos idiomas', () => {
		for (const catalogo of [es, en]) {
			expect(catalogo).toContain('    position: ');
			expect(catalogo).toContain('    positionHint: ');
			expect(catalogo).toContain('    bar: ');
		}
	});
});

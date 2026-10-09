import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';

/**
 * El generador de colores desde el fondo vive en el plugin desde la 2.10.0, y
 * quien sigue al fondo es vasak-desktop. Esto vigila que no vuelva una copia
 * acá —dos generadores que se separan darían colores distintos según quién
 * escriba— ni un segundo vigilante que escriba a la vez que el escritorio.
 */

const SRC = new URL('../src/', import.meta.url);

describe('los colores del fondo salen del plugin', () => {
	test('no hay copia local de los tres módulos', () => {
		for (const file of ['color-space', 'wallpaper-palette', 'wallpaper-scheme']) {
			expect({ file, exists: existsSync(new URL(`utils/${file}.ts`, SRC)) }).toEqual({
				file,
				exists: false,
			});
		}
	});

	test('App.vue no sigue al fondo ni pone el fundido: lo hacen el escritorio y el store', () => {
		const app = readFileSync(new URL('App.vue', SRC), 'utf8');
		expect(app).not.toContain('syncWithConfig');
		expect(app).not.toContain("classList.add('scheme-transition')");
		expect(app).toContain('refreshFromDisk');
	});
});

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * El interruptor del indicador de cámara y micrófono.
 *
 * Esta pantalla y el panel leen el mismo archivo por separado, y ya se dejó
 * escrito por qué la clave ausente significa «mostralo»: si acá se leyera
 * `=== true`, el panel mostraría el indicador y esta pantalla diría que está
 * apagado, en cada instalación nueva. Se prueba porque son dos repositorios y
 * nada más que la disciplina los ata.
 */

const RAIZ = join(import.meta.dir, '..');
const VISTA = readFileSync(join(RAIZ, 'src', 'views', 'AppearancePanelView.vue'), 'utf8');

describe('cámara y micrófono en la configuración del panel', () => {
	test('se lee como el resto: ausente es mostrarlo', () => {
		expect(VISTA).toContain('privacy.value = panel.privacy !== false;');
	});

	test('se guarda con el mismo nombre que el panel lee', () => {
		expect(VISTA).toContain('privacy: privacy.value,');
	});

	test('los cinco interruptores del panel arrancan encendidos', () => {
		const arranques = [...VISTA.matchAll(/const (\w+) = ref\(true\);/g)].map(([, n]) => n);

		// Los cinco que guarda la sección `panel`, ni uno menos: un interruptor
		// que arranque apagado escondería algo que el panel sí muestra.
		for (const clave of ['weather', 'music', 'transfer', 'tray', 'privacy']) {
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

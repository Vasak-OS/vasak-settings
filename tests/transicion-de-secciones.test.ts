import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

/**
 * Cambiar de sección tiene que fundir una en otra con `RevealTransition` de la
 * biblioteca, no cortar en seco. Es una guarda estructural (como las vecinas):
 * montar `App.vue` pide el marco de ventana y Tauri, y lo que se vigila es que
 * la vista actual siga envuelta, no la animación en sí.
 */

const app = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8');

describe('el cambio de sección se anima', () => {
	test('la vista actual del RouterView queda envuelta por RevealTransition', () => {
		expect(app).toMatch(
			/<RouterView v-slot="\{ Component \}">\s*<RevealTransition mode="out-in">\s*<component :is="Component" \/>\s*<\/RevealTransition>\s*<\/RouterView>/
		);
	});

	test('RevealTransition sale de la biblioteca del sistema', () => {
		expect(app).toMatch(
			/import \{[^}]*\bRevealTransition\b[^}]*\} from '@vasakgroup\/vue-libvasak'/
		);
	});

	test('la transición no lleva :key: la ruta ya remonta la vista', () => {
		expect(app).not.toMatch(/<component :is="Component"[^>]*:key/);
	});
});

/**
 * La pantalla de fondos dibuja las miniaturas con la de la librería
 * (`WallpaperThumbnail`), la misma que usa el selector rápido del escritorio
 * (vasak-desktop#133): así los dos lugares muestran los fondos igual.
 *
 * Cómo se comporta la miniatura lo prueba la librería; acá, que la pantalla la
 * use y que la copia propia no vuelva.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

/**
 * Saca lo comentado cortando por los delimitadores, no con una expresión
 * regular: un reemplazo de una pasada deja `<!--` sueltos cuando los
 * comentarios se anidan o se pegan (CodeQL, js/incomplete-multi-character-sanitization).
 */
function stripComments(text: string, open: string, close: string): string {
	let out = '';
	let index = 0;
	while (index < text.length) {
		const start = text.indexOf(open, index);
		if (start === -1) return out + text.slice(index);
		out += text.slice(index, start);
		const end = text.indexOf(close, start + open.length);
		if (end === -1) return out;
		index = end + close.length;
	}
	return out;
}

// Sin comentarios: uno que nombrara el componente haría pasar la prueba sin él.
const source = stripComments(
	stripComments(
		readFileSync(new URL('../src/views/WallpaperView.vue', import.meta.url), 'utf8'),
		'<!--',
		'-->'
	),
	'/*',
	'*/'
);

describe('la miniatura de los fondos', () => {
	test('la grilla de oficiales usa la miniatura de la librería, importada', () => {
		expect(source).toMatch(
			/import \{[^}]*\bWallpaperThumbnail\b[^}]*\} from '@vasakgroup\/vue-libvasak'/
		);
		expect(source).toMatch(/<WallpaperThumbnail\b[^>]*\bfill\b/);
		// La copia propia —un <img> suelto con la miniatura— ya no está en la grilla.
		expect(source).not.toMatch(/<img v-if="thumbnailFor\(wallpaperPath\)"/);
	});
});

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Las etiquetas nombran a su control, y lo que se elige con el ratón se elige
 * también con el teclado.
 *
 * Un `<label>` sin `for` ni control adentro no nombra nada: el lector de
 * pantalla anuncia el campo sin nombre, y hacer clic en el texto no enfoca el
 * campo. El formulario de cuenta propia de Cuentas en línea tenía siete así.
 *
 * Quedan otros en archivos que no se tocaron todavía; están contados abajo y
 * la cuenta sólo puede bajar.
 */

const root = join(import.meta.dir, '..');

function vueFiles(dir: string): string[] {
	const found: string[] = [];
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) found.push(...vueFiles(path));
		else if (name.endsWith('.vue')) found.push(path);
	}
	return found;
}

function template(file: string): string {
	const source = readFileSync(file, 'utf8');
	return source.slice(source.indexOf('<template'));
}

/** `<label>` sin `for` que tampoco envuelve un control. */
function orphanLabels(html: string): number {
	let count = 0;
	for (const m of html.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/g)) {
		const [, attrs, body] = m;
		if (/(^|\s):?for=/.test(attrs)) continue;
		if (/<(input|select|textarea|[A-Z]\w*)\b/.test(body)) continue;
		count++;
	}
	return count;
}

/** Los que ya estaban; se arreglan cuando se toque cada archivo. */
const PENDING: Record<string, number> = {
	'src/views/AppearanceDesktopView.vue': 1,
	'src/views/AppearancePanelView.vue': 4,
	'src/views/AppearanceThemeView.vue': 1,
	'src/views/LoginScreenView.vue': 1,
};

const files = vueFiles(join(root, 'src'));

describe('etiquetas de formulario', () => {
	test('ningún archivo suma etiquetas que no nombran a un control', () => {
		const found: Record<string, number> = {};
		for (const file of files) {
			const n = orphanLabels(template(file));
			if (n > 0) found[relative(root, file)] = n;
		}
		for (const [file, n] of Object.entries(found)) {
			expect({ file, n }).toEqual({ file, n: Math.min(n, PENDING[file] ?? 0) });
		}
		// Y si alguno bajó, que baje también la cuenta.
		for (const [file, n] of Object.entries(PENDING)) {
			expect({ file, n: found[file] ?? 0 }).toEqual({ file, n });
		}
	});

	test('cada `for` estático apunta a un `id` del mismo archivo', () => {
		const broken: string[] = [];
		for (const file of files) {
			const html = template(file);
			const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
			for (const m of html.matchAll(/<label\b[^>]*\sfor="([^"]+)"/g)) {
				if (!ids.has(m[1])) broken.push(`${relative(root, file)}: ${m[1]}`);
			}
		}
		expect(broken).toEqual([]);
	});

	test('el formulario de cuenta propia asocia sus siete etiquetas', () => {
		const html = template(join(root, 'src/views/OnlineAccountsView.vue'));
		const custom = [...html.matchAll(/<label for="(custom-[a-z-]+)"/g)].map((m) => m[1]);
		expect(custom).toHaveLength(7);
		for (const id of custom) expect(html).toContain(`id="${id}"`);
	});

	// El sabotaje: sin esto, la primera prueba pasaría con un detector que no ve nada.
	test('el detector reconoce una etiqueta suelta y deja pasar las asociadas', () => {
		expect(orphanLabels('<label class="x">Nombre</label><input />')).toBe(1);
		expect(orphanLabels('<label for="a">Nombre</label>')).toBe(0);
		expect(orphanLabels('<label :for="idFor(n)">Nombre</label>')).toBe(0);
		expect(orphanLabels('<label>Nombre <input /></label>')).toBe(0);
	});
});

describe('selección de dispositivo de audio con el teclado', () => {
	test.each(['src/views/MultimediaAudioView.vue', 'src/views/MultimediaAudioInputView.vue'])(
		'%s: cada opción es un radio enfocable que responde a Enter y Espacio',
		(file) => {
			const html = template(join(root, file));
			expect(html).toContain('role="radiogroup"');
			const options = [...html.matchAll(/<li\b[^>]*role="radio"[^>]*>/g)].map((m) => m[0]);
			expect(options).toHaveLength(1);
			const [li] = options;
			expect(li).toContain('tabindex="0"');
			expect(li).toContain(':aria-checked=');
			const click = li.match(/@click="([^"]+)"/)?.[1];
			expect(click).toBeTruthy();
			expect(li).toContain(`@keydown.enter.prevent="${click}"`);
			expect(li).toContain(`@keydown.space.prevent="${click}"`);
		}
	);
});

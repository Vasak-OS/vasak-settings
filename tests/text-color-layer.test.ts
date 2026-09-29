import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * El color del texto no puede fijarse sobre `*` fuera de una capa.
 *
 * En Tailwind v4 las utilidades viven en `@layer utilities`, y una regla sin
 * capa le gana a todo lo que esté en una **sin importar la especificidad**. Un
 * `body * { color: … }` suelto deja muertas todas las utilidades de color de
 * texto: `text-tx-muted`, `text-white`, `text-status-error`… Esta aplicación
 * lo tuvo, y dibujaba todo el texto en `tx-main` —hasta el de los botones sobre
 * el primario, casi ilegible en oscuro— sin que nada fallara.
 *
 * La prueba lee los `.css` de `src` de verdad y busca reglas cuyo selector
 * tenga `*`, que no estén dentro de ningún `@layer` y que pongan color de texto,
 * sea con `color:` o con un `@apply text-…` que no sea de tamaño ni alineación.
 */

const root = join(import.meta.dir, '..');

/** `text-*` que no son de color: tamaño, alineación, desborde, ajuste. */
const NOT_COLOR =
	/^text-(xs|sm|base|lg|[2-9]?xl|left|center|right|justify|start|end|ellipsis|clip|wrap|nowrap|balance|pretty|shadow.*|\[length:.*\])$/;

function cssFiles(dir: string): string[] {
	const found: string[] = [];
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) found.push(...cssFiles(path));
		else if (name.endsWith('.css')) found.push(path);
	}
	return found;
}

type Rule = { selector: string; body: string; layers: string[] };

/** Las reglas de un CSS con los encabezados de bloque que las contienen. */
function rules(css: string): Rule[] {
	const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
	const found: Rule[] = [];
	const stack: { header: string; body: string }[] = [];
	let buffer = '';

	for (const ch of clean) {
		if (ch === '{') {
			stack.push({ header: buffer.trim(), body: '' });
			buffer = '';
		} else if (ch === '}') {
			const block = stack.pop();
			if (!block) continue;
			block.body += buffer;
			buffer = '';
			if (!block.header.startsWith('@')) {
				found.push({
					selector: block.header,
					body: block.body,
					layers: stack.map((b) => b.header).filter((h) => h.startsWith('@layer')),
				});
			}
		} else if (ch === ';' && stack.length > 0) {
			stack[stack.length - 1].body += `${buffer};`;
			buffer = '';
		} else {
			buffer += ch;
		}
	}
	return found;
}

function setsTextColor(body: string): boolean {
	if (/(^|[;\s])color\s*:/.test(body)) return true;
	for (const m of body.matchAll(/@apply\s+([^;]+)/g)) {
		const classes = m[1].split(/\s+/).map((c) => c.replace(/^[a-z-]+:/, ''));
		if (classes.some((c) => c.startsWith('text-') && !NOT_COLOR.test(c))) return true;
	}
	return false;
}

function offenders(css: string): string[] {
	return rules(css)
		.filter((r) => r.selector.includes('*') && r.layers.length === 0 && setsTextColor(r.body))
		.map((r) => r.selector);
}

describe('color de texto fuera de capa', () => {
	test('ningún CSS de la aplicación fija el color del texto sobre `*` fuera de un @layer', () => {
		const files = cssFiles(join(root, 'src'));
		expect(files.length).toBeGreaterThan(0);

		const found = files.flatMap((f) =>
			offenders(readFileSync(f, 'utf8')).map((s) => `${f.slice(root.length + 1)}: ${s}`)
		);
		expect(found).toEqual([]);
	});

	test('el color base del texto se hereda desde body, dentro de @layer base', () => {
		const css = readFileSync(join(root, 'src/assets/main.css'), 'utf8');
		const body = rules(css).find((r) => r.selector === 'body' && setsTextColor(r.body));
		expect(body?.layers).toEqual(['@layer base']);
	});

	// Sin esto, la primera prueba podría pasar porque el detector no ve nada.
	test('el detector reconoce la regla que dejaba muertas las utilidades', () => {
		expect(offenders('body * { @apply text-tx-main transition-colors duration-300; }')).toEqual([
			'body *',
		]);
		expect(offenders('* { color: red; }')).toEqual(['*']);
		expect(offenders('@media (x) { body * { color: red; } }')).toEqual(['body *']);
	});

	test('el detector deja pasar lo que no es color o ya está en una capa', () => {
		expect(offenders('@layer base { body * { @apply text-tx-main; } }')).toEqual([]);
		expect(offenders('body * { @apply transition-colors text-sm; }')).toEqual([]);
		expect(offenders('* { border-color: red; background-color: red; }')).toEqual([]);
		expect(offenders('body { color: red; }')).toEqual([]);
	});
});

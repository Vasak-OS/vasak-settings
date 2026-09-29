import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Los colores de acento usados como texto tienen que leerse en claro.
 *
 * El primario y los de estado son colores de fondo, y como letras sobre la
 * superficie clara daban entre 1.8 y 3.2. `main.css` los topa en luminosidad
 * con una regla por utilidad, sólo en claro (ver el comentario ahí). Esto
 * comprueba dos cosas:
 *
 * - que **cada** utilidad de acento que se escriba —en la aplicación o en la
 *   librería de componentes— tenga su regla: una clase nueva sin ella vuelve a
 *   salir ilegible sin que nada falle;
 * - que con la paleta por defecto el tope alcance 4.5:1 contra la superficie y
 *   el fondo, calculado con la misma conversión oklch que hace el navegador.
 */

const root = join(import.meta.dir, '..');
const css = readFileSync(join(root, 'src/assets/main.css'), 'utf8');

function files(dir: string, ext: string[]): string[] {
	const found: string[] = [];
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) found.push(...files(path, ext));
		else if (ext.some((e) => name.endsWith(e))) found.push(path);
	}
	return found;
}

const ACCENT =
	/(?<![\w:-])((?:[a-z-]+:)*text-(?:primary|secondary|status-(?:error|success|warning))(?:\/\d+)?)(?![\w/-])/g;

function accentClassesUsed(): Set<string> {
	const sources = [
		...files(join(root, 'src'), ['.vue', '.ts']),
		...files(join(root, 'node_modules/@vasakgroup/vue-libvasak/dist'), ['.js']),
	];
	const used = new Set<string>();
	for (const file of sources) {
		for (const m of readFileSync(file, 'utf8').matchAll(ACCENT)) used.add(m[1]);
	}
	return used;
}

/** El selector que tiene que aparecer en `main.css` para cubrir la clase. */
function expectedSelector(cls: string): string {
	const escaped = cls.replace(/[:/]/g, (c) => `\\${c}`);
	if (cls.startsWith('hover:')) return `.${escaped}:hover`;
	if (cls.startsWith('group-hover:')) return `.group:hover .${escaped}`;
	return `.${escaped}`;
}

// --- color: sRGB ↔ oklab, como lo define CSS Color 4 ---

type Rgb = [number, number, number];

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toGamma = (v: number) => {
	const c = Math.min(1, Math.max(0, v));
	return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
};

function hex(h: string): Rgb {
	const n = h.replace('#', '');
	return [0, 2, 4].map((i) => Number.parseInt(n.slice(i, i + 2), 16) / 255) as Rgb;
}

function toOklab([r, g, b]: Rgb): Rgb {
	const [lr, lg, lb] = [r, g, b].map(toLinear);
	const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
	const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
	const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
	];
}

function fromOklab([L, a, b]: Rgb): Rgb {
	const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
	return [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
	].map(toGamma) as Rgb;
}

/** `oklch(from <color> min(l, cap) c h)`: a igual croma y tono, cambia L. */
function capLightness(color: Rgb, cap: number): Rgb {
	const [L, a, b] = toOklab(color);
	return fromOklab([Math.min(L, cap), a, b]);
}

function luminance(c: Rgb): number {
	const [r, g, b] = c.map(toLinear);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(x: Rgb, y: Rgb): number {
	const [a, b] = [luminance(x), luminance(y)].sort((p, q) => q - p);
	return (a + 0.05) / (b + 0.05);
}

function lightToken(name: string): Rgb {
	const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
	if (!m) throw new Error(`--${name} no está en main.css`);
	return hex(m[1]);
}

/** El tope que `main.css` le pone a un color, leído de la regla de verdad. */
function capFor(variable: string): number {
	const m = css.match(
		new RegExp(`oklch\\(from var\\(--${variable}\\) min\\(l, ([0-9.]+)\\) c h\\)`)
	);
	if (!m) throw new Error(`no hay tope para --${variable}`);
	return Number(m[1]);
}

describe('texto de acento en claro', () => {
	test('cada utilidad de acento que se usa tiene su regla en main.css', () => {
		const used = accentClassesUsed();
		expect(used.size).toBeGreaterThan(0);

		const missing = [...used].filter(
			(cls) => !css.includes(`:where(:root:not(.dark)) ${expectedSelector(cls)}`)
		);
		expect(missing).toEqual([]);
	});

	test.each([
		['primary', 'color-primary'],
		['status-error', 'color-status-error'],
		['status-success', 'color-status-success'],
		['status-warning', 'color-status-warning'],
		['text-muted', 'text-muted'],
	])('--%s topado llega a 4.5:1 contra la superficie y el fondo', (token, variable) => {
		const text = capLightness(lightToken(token), capFor(variable));
		expect(contrast(text, lightToken('ui-surface'))).toBeGreaterThanOrEqual(4.5);
		expect(contrast(text, lightToken('ui-background'))).toBeGreaterThanOrEqual(4.5);
	});

	// El que corre de verdad no es el de `main.css`: el gestor de configuración
	// escribe el del esquema, y el Catppuccin Latte por defecto trae #6c6f85, que
	// sin tope daba 3.12 contra la superficie.
	test('el secundario del esquema por defecto también llega topado', () => {
		const muted = hex('#6c6f85');
		expect(contrast(muted, lightToken('ui-surface'))).toBeLessThan(4.5);
		const capped = capLightness(muted, capFor('text-muted'));
		expect(contrast(capped, lightToken('ui-surface'))).toBeGreaterThanOrEqual(4.5);
	});

	// Sin esto, la segunda prueba podría pasar porque el tope no hace nada.
	test('sin el tope, el primario no se lee sobre la superficie', () => {
		expect(contrast(lightToken('primary'), lightToken('ui-surface'))).toBeLessThan(3);
	});
});

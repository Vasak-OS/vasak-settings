import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyTheme, saveTheme, THEME_KEY } from '../src/utils/theme-cache';

/** Un `Storage` mínimo en memoria, para no tocar el global. */
function memoryStore(): Storage {
	const data = new Map<string, string>();
	return {
		get length() {
			return data.size;
		},
		clear: () => data.clear(),
		getItem: (key: string) => data.get(key) ?? null,
		key: (index: number) => Array.from(data.keys())[index] ?? null,
		removeItem: (key: string) => {
			data.delete(key);
		},
		setItem: (key: string, value: string) => {
			data.set(key, value);
		},
	};
}

/** Un `Storage` que tira en cada uso, como un `localStorage` bloqueado. */
function throwingStore(): Storage {
	const fail = () => {
		throw new Error('localStorage bloqueado');
	};
	return {
		length: 0,
		clear: fail,
		getItem: fail,
		key: fail,
		removeItem: fail,
		setItem: fail,
	};
}

describe('theme-cache', () => {
	test('la clave es la que lee el script del head', () => {
		expect(THEME_KEY).toBe('vsk-theme');
	});

	test('saveTheme guarda la clase oscura y sólo las variables --*', () => {
		const root = document.createElement('div');
		root.classList.add('dark');
		root.style.setProperty('--ui-background', '#101010');
		root.style.setProperty('--primary', '#ff6c0e');
		root.style.color = 'red';
		const store = memoryStore();

		saveTheme(root, store);

		const saved = JSON.parse(store.getItem(THEME_KEY) as string);
		expect(saved.dark).toBe(true);
		expect(saved.vars).toEqual({ '--ui-background': '#101010', '--primary': '#ff6c0e' });
	});

	test('saveTheme en un tema claro guarda dark en falso', () => {
		const store = memoryStore();
		saveTheme(document.createElement('div'), store);
		expect(JSON.parse(store.getItem(THEME_KEY) as string)).toEqual({ dark: false, vars: {} });
	});

	test('applyTheme reaplica la clase oscura y las variables', () => {
		const store = memoryStore();
		store.setItem(THEME_KEY, JSON.stringify({ dark: true, vars: { '--ui-line': '#333333' } }));
		const root = document.createElement('div');

		applyTheme(root, store);

		expect(root.classList.contains('dark')).toBe(true);
		expect(root.style.getPropertyValue('--ui-line')).toBe('#333333');
	});

	test('ida y vuelta: lo guardado se reaplica igual sobre otro elemento', () => {
		const source = document.createElement('div');
		source.classList.add('dark');
		source.style.setProperty('--ui-surface', '#222222');
		const store = memoryStore();
		saveTheme(source, store);

		const target = document.createElement('div');
		applyTheme(target, store);

		expect(target.classList.contains('dark')).toBe(true);
		expect(target.style.getPropertyValue('--ui-surface')).toBe('#222222');
	});

	test('sin clave guardada no hace nada', () => {
		const root = document.createElement('div');
		applyTheme(root, memoryStore());
		expect(root.classList.contains('dark')).toBe(false);
		expect(root.getAttribute('style')).toBeNull();
	});

	test('un JSON inválido no lanza ni toca el elemento', () => {
		const store = memoryStore();
		store.setItem(THEME_KEY, '{no es json');
		const root = document.createElement('div');

		expect(() => applyTheme(root, store)).not.toThrow();
		expect(root.classList.contains('dark')).toBe(false);
	});

	test('un Storage que tira no rompe ni al guardar ni al aplicar', () => {
		const root = document.createElement('div');
		expect(() => saveTheme(root, throwingStore())).not.toThrow();
		expect(() => applyTheme(root, throwingStore())).not.toThrow();
	});
});

/**
 * Guarda de cableado: la lógica de arriba no sirve de nada si nadie la llama o
 * si el `<head>` no reaplica el tema antes de montar. Se lee la fuente.
 */
describe('cableado del tema recordado', () => {
	const root = join(import.meta.dir, '..');

	test('index.html reaplica el tema antes del bundle', () => {
		const html = readFileSync(join(root, 'index.html'), 'utf8');
		const inline = html.indexOf('localStorage.getItem("vsk-theme"');
		expect(inline).toBeGreaterThan(-1);
		expect(html).toContain('classList.add("dark")');
		expect(html).toContain('setProperty');
		expect(inline).toBeLessThan(html.indexOf('type="module"'));
	});

	test('App.vue guarda el tema tras cada loadConfig', () => {
		const app = readFileSync(join(root, 'src/App.vue'), 'utf8');
		expect(app).toContain("from '@/utils/theme-cache'");
		const calls = app.match(/loadConfig\(\)\.then\(\(\) => saveTheme\(\)\)/g) ?? [];
		// la lectura inicial y la del listener de `config-changed`
		expect(calls.length).toBe(2);
	});
});

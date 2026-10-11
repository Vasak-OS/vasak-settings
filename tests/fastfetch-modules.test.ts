import { describe, expect, test } from 'bun:test';
import { moveEntry, parseModules, serializeModules } from '../src/utils/fastfetch-modules';

describe('parseModules', () => {
	test('cadenas y objetos con type, en orden', () => {
		const entries = parseModules(['title', { type: 'cpu', temp: true }, 'os']);
		expect(entries).toEqual([
			{ name: 'title', options: {} },
			{ name: 'cpu', options: { temp: true } },
			{ name: 'os', options: {} },
		]);
	});

	test('descarta lo que no es cadena ni objeto con type', () => {
		expect(parseModules(['os', 42, { foo: 1 }, null])).toEqual([{ name: 'os', options: {} }]);
	});

	test('algo que no es arreglo da lista vacía', () => {
		expect(parseModules(undefined)).toEqual([]);
		expect(parseModules({})).toEqual([]);
	});
});

describe('serializeModules', () => {
	test('sin opciones vuelve a ser cadena; con opciones, objeto con type', () => {
		expect(
			serializeModules([
				{ name: 'title', options: {} },
				{ name: 'cpu', options: { temp: true } },
			])
		).toEqual(['title', { type: 'cpu', temp: true }]);
	});

	test('ida y vuelta preserva el contenido', () => {
		const original = ['title', { type: 'cpu', temp: true, showPeCoreCount: false }, 'os'];
		expect(serializeModules(parseModules(original))).toEqual(original);
	});
});

describe('moveEntry', () => {
	test('mueve hacia arriba', () => {
		expect(moveEntry(['a', 'b', 'c'], 1, 0)).toEqual(['b', 'a', 'c']);
	});

	test('mueve hacia abajo', () => {
		expect(moveEntry(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
	});

	test('clamp en los bordes y no hace copia si no cambia', () => {
		const list = ['a', 'b'];
		expect(moveEntry(list, 0, -1)).toBe(list);
		expect(moveEntry(list, 1, 5)).toEqual(['a', 'b']);
	});
});

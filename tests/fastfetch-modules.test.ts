import { describe, expect, test } from 'bun:test';
import { availableModules, parseModules, serializeModules } from '../src/utils/fastfetch-modules';

describe('availableModules', () => {
	const variants = [{ name: 'os' }, { name: 'cpu' }, { name: 'separator' }, { name: 'break' }];

	test('excluye los normales ya activos', () => {
		const enabled = new Set(['os']);
		expect(availableModules(variants, enabled).map((v) => v.name)).toEqual([
			'cpu',
			'separator',
			'break',
		]);
	});

	test('los repetibles siguen disponibles aunque estén activos', () => {
		const enabled = new Set(['separator', 'break', 'cpu']);
		// separator y break siguen (repetibles); cpu no (ya está).
		expect(availableModules(variants, enabled).map((v) => v.name)).toEqual([
			'os',
			'separator',
			'break',
		]);
	});
});

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

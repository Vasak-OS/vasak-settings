import { describe, expect, test } from 'bun:test';
import {
	cleanSize,
	type FastfetchLogo,
	normalizeLogo,
	usesSize,
	usesSource,
} from '../src/utils/fastfetch-logo';

describe('qué campo aplica a qué emblema', () => {
	test('none no tiene origen ni tamaño', () => {
		expect(usesSource('none')).toBe(false);
		expect(usesSize('none')).toBe(false);
	});

	test('image, ascii y builtin tienen origen', () => {
		expect(usesSource('image')).toBe(true);
		expect(usesSource('ascii')).toBe(true);
		expect(usesSource('builtin')).toBe(true);
	});
});

describe('cleanSize', () => {
	test('cero y negativos quedan en null: fastfetch ignora el campo', () => {
		expect(cleanSize(0)).toBeNull();
		expect(cleanSize(-3)).toBeNull();
	});

	test('un positivo se trunca a entero', () => {
		expect(cleanSize(28.7)).toBe(28);
	});

	test('null, undefined y NaN quedan en null', () => {
		expect(cleanSize(null)).toBeNull();
		expect(cleanSize(undefined)).toBeNull();
		expect(cleanSize(Number.NaN)).toBeNull();
	});
});

describe('normalizeLogo', () => {
	test('none no arrastra el origen ni el tamaño que tenía antes', () => {
		const sucio: FastfetchLogo = {
			kind: 'none',
			source: 'l.png',
			width: 28,
			height: 12,
			padding: 3,
		};
		expect(normalizeLogo(sucio)).toEqual({
			kind: 'none',
			source: null,
			width: null,
			height: null,
			padding: null,
		});
	});

	test('un cero en el tamaño viaja como null, no como 0', () => {
		const logo: FastfetchLogo = {
			kind: 'image',
			source: 'l.png',
			width: 0,
			height: 0,
			padding: 2,
		};
		expect(normalizeLogo(logo)).toEqual({
			kind: 'image',
			source: 'l.png',
			width: null,
			height: null,
			padding: 2,
		});
	});

	test('un origen en blanco queda en null', () => {
		const logo: FastfetchLogo = {
			kind: 'builtin',
			source: '   ',
			width: null,
			height: null,
			padding: null,
		};
		expect(normalizeLogo(logo).source).toBeNull();
	});
});

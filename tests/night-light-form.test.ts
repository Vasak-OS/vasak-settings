import { describe, expect, test } from 'bun:test';
import { formatCoordinate, parseCoordinate } from '../src/utils/night-light-form';

describe('las coordenadas del formulario de luz nocturna', () => {
	test('un número, con punto o con coma', () => {
		expect(parseCoordinate('-34.6')).toBe(-34.6);
		expect(parseCoordinate(' -58,38 ')).toBe(-58.38);
		expect(parseCoordinate('0')).toBe(0);
	});

	test('vacío es «sin coordenada», no cero', () => {
		expect(parseCoordinate('')).toBeNull();
		expect(parseCoordinate('   ')).toBeNull();
	});

	test('un texto que no es número es inválido', () => {
		expect(parseCoordinate('norte')).toBeUndefined();
		expect(parseCoordinate('1e999')).toBeUndefined();
		expect(parseCoordinate('-34.6 -L 0')).toBeUndefined();
	});

	test('y de vuelta a texto', () => {
		expect(formatCoordinate(-34.6)).toBe('-34.6');
		expect(formatCoordinate(null)).toBe('');
	});
});

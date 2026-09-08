import { describe, expect, test } from 'bun:test';
import { booleanoDeConfig } from '../src/tools/valores-de-config';

/**
 * Las claves que el plugin de configuración transporta sin conocer llegan como
 * `unknown`, y antes se las afirmaba con `as any`. Lo que se prueba acá es lo
 * que esa aserción dejaba pasar: el valor no lo escribe nuestro código, sale de
 * un archivo que se puede editar a mano, así que puede ser cualquier cosa.
 */
describe('booleanoDeConfig', () => {
	test('un booleano de verdad se respeta, incluso el que no es el de fábrica', () => {
		expect(booleanoDeConfig(false, true)).toBe(false);
		expect(booleanoDeConfig(true, false)).toBe(true);
	});

	test('lo que no está usa el valor de fábrica', () => {
		expect(booleanoDeConfig(undefined, true)).toBe(true);
		expect(booleanoDeConfig(null, false)).toBe(false);
	});

	test('lo que no es booleano tampoco cuenta como uno', () => {
		// Con `as any` una cadena llegaba al interruptor y lo dejaba prendido por
		// ser una cadena no vacía, aunque dijera «no».
		expect(booleanoDeConfig('no', false)).toBe(false);
		expect(booleanoDeConfig('true', false)).toBe(false);
		expect(booleanoDeConfig(0, true)).toBe(true);
		expect(booleanoDeConfig(1, false)).toBe(false);
	});
});

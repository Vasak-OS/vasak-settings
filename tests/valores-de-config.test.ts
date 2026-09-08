import { describe, expect, test } from 'bun:test';
import { booleanoDeConfig, escribirEsquema, limpiarEstilo } from '../src/tools/valores-de-config';

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

/**
 * Elegir un esquema de color en Apariencia → Tema no cambiaba el esquema: la
 * vista guardaba `color_scheme`, con guión bajo, y la clave que todo el mundo
 * lee es `color-scheme`. O sea que se escribía una clave nueva que nadie mira y
 * la de verdad se quedaba con el valor viejo.
 */
describe('escribirEsquema', () => {
	test('deja el esquema en la clave que se lee', () => {
		const style: Record<string, unknown> = {
			darkmode: true,
			'color-scheme': 'vasak-default',
			radius: 10,
		};

		escribirEsquema(style, 'catppuccin');

		expect(style['color-scheme']).toBe('catppuccin');
	});

	test('no toca nada más de la sección', () => {
		const style: Record<string, unknown> = {
			darkmode: true,
			'color-scheme': 'vasak-default',
			radius: 10,
		};

		escribirEsquema(style, 'catppuccin');

		expect(style.darkmode).toBe(true);
		expect(style.radius).toBe(10);
	});
});

/**
 * Hasta la versión 2.6.0 del plugin de configuración, lo que su modelo no
 * conoce se borraba solo en cada lectura. Ahora se conserva —eso es lo que
 * salvó la disposición de los widgets—, así que lo que la interfaz dejó de
 * escribir hay que sacarlo a propósito o queda para siempre.
 */
describe('limpiarEstilo', () => {
	test('saca la clave del esquema mal escrita', () => {
		const style: Record<string, unknown> = {
			'color-scheme': 'catppuccin',
			color_scheme: 'lo-que-alguien-eligió-y-no-se-aplicó',
		};

		limpiarEstilo(style);

		expect('color_scheme' in style).toBe(false);
		expect(style['color-scheme']).toBe('catppuccin');
	});

	test('y el color primario del control que se sacó', () => {
		// Nadie leía esa clave: el color primario lo define el esquema. El control
		// existía y no hacía nada, así que su valor quedaba escrito para nada.
		const style: Record<string, unknown> = { primarycolor: '#0084FF', radius: 10 };

		limpiarEstilo(style);

		expect('primarycolor' in style).toBe(false);
		expect(style.radius).toBe(10);
	});

	test('con una sección que no las tiene no hace nada', () => {
		const style: Record<string, unknown> = { darkmode: true, 'color-scheme': 'x', radius: 8 };

		limpiarEstilo(style);

		expect(style).toEqual({ darkmode: true, 'color-scheme': 'x', radius: 8 });
	});
});

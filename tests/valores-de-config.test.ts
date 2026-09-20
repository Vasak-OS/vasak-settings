import { describe, expect, test } from 'bun:test';
import {
	booleanoDeConfig,
	escribirEsquema,
	escribirPosicionDeLaBarra,
	escribirPosicionDelPanel,
	limpiarEstilo,
	POSICIONES_DE_LA_BARRA,
	POSICIONES_DEL_PANEL,
	posicionDeLaBarra,
	posicionDelPanel,
} from '../src/tools/valores-de-config';

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

describe('posicionDeLaBarra', () => {
	test('sin nada puesto, la barra va arriba', () => {
		// Es donde estuvo siempre y donde la gente la busca.
		expect(posicionDeLaBarra({})).toBe('top');
		expect(posicionDeLaBarra(null)).toBe('top');
		expect(posicionDeLaBarra({ window: {} })).toBe('top');
	});

	test('los cuatro lados se leen', () => {
		for (const lado of POSICIONES_DE_LA_BARRA) {
			expect(posicionDeLaBarra({ window: { barPosition: lado } })).toBe(lado);
		}
	});

	test('cualquier otra cosa vale por arriba', () => {
		// El archivo se edita a mano. Con una aserción de tipo, un `"izquierda"`
		// llegaría hasta el marco y ahí no coincide con ninguna dirección: la
		// ventana quedaría sin acomodo.
		expect(posicionDeLaBarra({ window: { barPosition: 'izquierda' } })).toBe('top');
		expect(posicionDeLaBarra({ window: { barPosition: 3 } })).toBe('top');
		expect(posicionDeLaBarra({ window: 'left' })).toBe('top');
	});
});

describe('escribirPosicionDeLaBarra', () => {
	test('deja la posición elegida', () => {
		const config: Record<string, unknown> = {};

		escribirPosicionDeLaBarra(config, 'left');

		expect(config.window).toEqual({ barPosition: 'left' });
	});

	test('y no se lleva puesto lo que ya hubiera en la sección', () => {
		// `window` es una sección compartida con lo que venga después.
		const config: Record<string, unknown> = { window: { otraCosa: 1, barPosition: 'top' } };

		escribirPosicionDeLaBarra(config, 'bottom');

		expect(config.window).toEqual({ otraCosa: 1, barPosition: 'bottom' });
	});
});

describe('posicionDelPanel', () => {
	test('sin nada puesto, el panel va arriba', () => {
		// La sección `panel` existe desde antes que esta clave —lleva los
		// interruptores de los indicadores—, así que lo normal en una
		// instalación que viene de antes es que la sección esté y la clave no.
		expect(posicionDelPanel({})).toBe('top');
		expect(posicionDelPanel(null)).toBe('top');
		expect(posicionDelPanel({ panel: {} })).toBe('top');
		expect(posicionDelPanel({ panel: { weather: false } })).toBe('top');
	});

	test('los cuatro lados se leen', () => {
		for (const lado of POSICIONES_DEL_PANEL) {
			expect(posicionDelPanel({ panel: { position: lado } })).toBe(lado);
		}
	});

	test('cualquier otra cosa vale por arriba', () => {
		// El escritorio lee esta clave con el mismo criterio. Si acá se afirmara
		// el tipo, esta pantalla mostraría «izquierda» y el panel seguiría
		// arriba, que es la contradicción que ya pasó con el esquema de color.
		expect(posicionDelPanel({ panel: { position: 'izquierda' } })).toBe('top');
		expect(posicionDelPanel({ panel: { position: 3 } })).toBe('top');
		expect(posicionDelPanel({ panel: 'left' })).toBe('top');
	});
});

describe('escribirPosicionDelPanel', () => {
	test('deja la posición elegida', () => {
		const config: Record<string, unknown> = {};

		escribirPosicionDelPanel(config, 'bottom');

		expect(config.panel).toEqual({ position: 'bottom' });
	});

	test('y no apaga los indicadores que ya estaban', () => {
		// Los interruptores viven en la misma sección: reemplazarla entera los
		// dejaría todos en blanco, o sea todos encendidos, cada vez que alguien
		// mueve el panel.
		const config: Record<string, unknown> = {
			panel: { weather: false, tray: false, position: 'top' },
		};

		escribirPosicionDelPanel(config, 'left');

		expect(config.panel).toEqual({ weather: false, tray: false, position: 'left' });
	});
});

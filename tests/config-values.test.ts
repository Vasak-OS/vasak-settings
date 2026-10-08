import { describe, expect, test } from 'bun:test';
import {
	BAR_POSITIONS,
	clearStyle,
	configBoolean,
	DEFAULT_HEADER_STRENGTH,
	DEFAULT_MENU_SEARCH_POSITION,
	DEFAULT_MENU_VARIANT,
	DEFAULT_MENU_WIDGET,
	DEFAULT_PANEL_ANIMATION,
	DEFAULT_PANEL_LAYOUT,
	DEFAULT_PANEL_SIZE,
	DEFAULT_PANEL_STYLE,
	MAX_HEADER_STRENGTH,
	MAX_PANEL_SIZE,
	type MenuSettings,
	MIN_PANEL_SIZE,
	PANEL_ANIMATIONS,
	PANEL_LAYOUTS,
	PANEL_POSITIONS,
	PANEL_STYLES,
	readBarPosition,
	readMenuSettings,
	readPanelAnimation,
	readPanelAutohide,
	readPanelLayout,
	readPanelPosition,
	readPanelSize,
	readPanelStyle,
	readScreenTimeEnabled,
	readWallpaperFolder,
	writeBarPosition,
	writeMenuSettings,
	writePanelAppearance,
	writePanelPosition,
	writeScheme,
	writeScreenTimeEnabled,
} from '../src/utils/config-values';

/**
 * Las claves que el plugin de configuración transporta sin conocer llegan como
 * `unknown`, y antes se las afirmaba con `as any`. Lo que se prueba acá es lo
 * que esa aserción dejaba pasar: el valor no lo escribe nuestro código, sale de
 * un archivo que se puede editar a mano, así que puede ser cualquier cosa.
 */
describe('configBoolean', () => {
	test('un booleano de verdad se respeta, incluso el que no es el de fábrica', () => {
		expect(configBoolean(false, true)).toBe(false);
		expect(configBoolean(true, false)).toBe(true);
	});

	test('lo que no está usa el valor de fábrica', () => {
		expect(configBoolean(undefined, true)).toBe(true);
		expect(configBoolean(null, false)).toBe(false);
	});

	test('lo que no es booleano tampoco cuenta como uno', () => {
		// Con `as any` una cadena llegaba al interruptor y lo dejaba prendido por
		// ser una cadena no vacía, aunque dijera «no».
		expect(configBoolean('no', false)).toBe(false);
		expect(configBoolean('true', false)).toBe(false);
		expect(configBoolean(0, true)).toBe(true);
		expect(configBoolean(1, false)).toBe(false);
	});
});

/**
 * Elegir un esquema de color en Apariencia → Tema no cambiaba el esquema: la
 * vista guardaba `color_scheme`, con guión bajo, y la clave que todo el mundo
 * lee es `color-scheme`. O sea que se escribía una clave nueva que nadie mira y
 * la de verdad se quedaba con el valor viejo.
 */
describe('writeScheme', () => {
	test('deja el esquema en la clave que se lee', () => {
		const style: Record<string, unknown> = {
			darkmode: true,
			'color-scheme': 'vasak-default',
			radius: 10,
		};

		writeScheme(style, 'catppuccin');

		expect(style['color-scheme']).toBe('catppuccin');
	});

	test('no toca nada más de la sección', () => {
		const style: Record<string, unknown> = {
			darkmode: true,
			'color-scheme': 'vasak-default',
			radius: 10,
		};

		writeScheme(style, 'catppuccin');

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
describe('clearStyle', () => {
	test('saca la clave del esquema mal escrita', () => {
		const style: Record<string, unknown> = {
			'color-scheme': 'catppuccin',
			color_scheme: 'lo-que-alguien-eligió-y-no-se-aplicó',
		};

		clearStyle(style);

		expect('color_scheme' in style).toBe(false);
		expect(style['color-scheme']).toBe('catppuccin');
	});

	test('y el color primario del control que se sacó', () => {
		// Nadie leía esa clave: el color primario lo define el esquema. El control
		// existía y no hacía nada, así que su valor quedaba escrito para nada.
		const style: Record<string, unknown> = { primarycolor: '#0084FF', radius: 10 };

		clearStyle(style);

		expect('primarycolor' in style).toBe(false);
		expect(style.radius).toBe(10);
	});

	test('con una sección que no las tiene no hace nada', () => {
		const style: Record<string, unknown> = { darkmode: true, 'color-scheme': 'x', radius: 8 };

		clearStyle(style);

		expect(style).toEqual({ darkmode: true, 'color-scheme': 'x', radius: 8 });
	});
});

describe('readBarPosition', () => {
	test('sin nada puesto, la barra va arriba', () => {
		// Es donde estuvo siempre y donde la gente la busca.
		expect(readBarPosition({})).toBe('top');
		expect(readBarPosition(null)).toBe('top');
		expect(readBarPosition({ window: {} })).toBe('top');
	});

	test('los cuatro lados se leen', () => {
		for (const side of BAR_POSITIONS) {
			expect(readBarPosition({ window: { barPosition: side } })).toBe(side);
		}
	});

	test('cualquier otra cosa vale por arriba', () => {
		// El archivo se edita a mano. Con una aserción de tipo, un `"izquierda"`
		// llegaría hasta el marco y ahí no coincide con ninguna dirección: la
		// ventana quedaría sin acomodo.
		expect(readBarPosition({ window: { barPosition: 'izquierda' } })).toBe('top');
		expect(readBarPosition({ window: { barPosition: 3 } })).toBe('top');
		expect(readBarPosition({ window: 'left' })).toBe('top');
	});
});

describe('writeBarPosition', () => {
	test('deja la posición elegida', () => {
		const config: Record<string, unknown> = {};

		writeBarPosition(config, 'left');

		expect(config.window).toEqual({ barPosition: 'left' });
	});

	test('y no se lleva puesto lo que ya hubiera en la sección', () => {
		// `window` es una sección compartida con lo que venga después.
		const config: Record<string, unknown> = { window: { otherKey: 1, barPosition: 'top' } };

		writeBarPosition(config, 'bottom');

		expect(config.window).toEqual({ otherKey: 1, barPosition: 'bottom' });
	});
});

describe('readPanelPosition', () => {
	test('sin nada puesto, el panel va arriba', () => {
		// La sección `panel` existe desde antes que esta clave —lleva los
		// interruptores de los indicadores—, así que lo normal en una
		// instalación que viene de antes es que la sección esté y la clave no.
		expect(readPanelPosition({})).toBe('top');
		expect(readPanelPosition(null)).toBe('top');
		expect(readPanelPosition({ panel: {} })).toBe('top');
		expect(readPanelPosition({ panel: { weather: false } })).toBe('top');
	});

	test('los cuatro lados se leen', () => {
		for (const side of PANEL_POSITIONS) {
			expect(readPanelPosition({ panel: { position: side } })).toBe(side);
		}
	});

	test('cualquier otra cosa vale por arriba', () => {
		// El escritorio lee esta clave con el mismo criterio. Si acá se afirmara
		// el tipo, esta pantalla mostraría «izquierda» y el panel seguiría
		// arriba, que es la contradicción que ya pasó con el esquema de color.
		expect(readPanelPosition({ panel: { position: 'izquierda' } })).toBe('top');
		expect(readPanelPosition({ panel: { position: 3 } })).toBe('top');
		expect(readPanelPosition({ panel: 'left' })).toBe('top');
	});
});

describe('writePanelPosition', () => {
	test('deja la posición elegida', () => {
		const config: Record<string, unknown> = {};

		writePanelPosition(config, 'bottom');

		expect(config.panel).toEqual({ position: 'bottom' });
	});

	test('y no apaga los indicadores que ya estaban', () => {
		// Los interruptores viven en la misma sección: reemplazarla entera los
		// dejaría todos en blanco, o sea todos encendidos, cada vez que alguien
		// mueve el panel.
		const config: Record<string, unknown> = {
			panel: { weather: false, tray: false, position: 'top' },
		};

		writePanelPosition(config, 'left');

		expect(config.panel).toEqual({ weather: false, tray: false, position: 'left' });
	});
});

describe('el aspecto del panel: tipo, densidad, animación y tamaño', () => {
	test('sin nada puesto, los valores de fábrica', () => {
		// El contrato coincide con el que lee el escritorio (`panel-appearance.ts`):
		// mismos valores de fábrica. Una instalación vieja tiene la sección `panel`
		// con los indicadores y ninguna de estas claves.
		for (const config of [{}, null, { panel: {} }, { panel: { weather: false } }]) {
			expect(readPanelStyle(config)).toBe(DEFAULT_PANEL_STYLE);
			expect(readPanelLayout(config)).toBe(DEFAULT_PANEL_LAYOUT);
			expect(readPanelAnimation(config)).toBe(DEFAULT_PANEL_ANIMATION);
			expect(readPanelSize(config)).toBe(DEFAULT_PANEL_SIZE);
			expect(readPanelAutohide(config)).toBe(false);
		}
	});

	test('el auto-ocultar: sólo true lo prende', () => {
		// Mismo criterio que el escritorio: la clave ausente o cualquier cosa que
		// no sea `true` vale por apagado.
		expect(readPanelAutohide({ panel: { autohide: true } })).toBe(true);
		expect(readPanelAutohide({ panel: { autohide: false } })).toBe(false);
		expect(readPanelAutohide({ panel: { autohide: 'si' } })).toBe(false);
	});

	test('cada valor conocido se lee', () => {
		for (const style of PANEL_STYLES) expect(readPanelStyle({ panel: { style } })).toBe(style);
		for (const layout of PANEL_LAYOUTS) expect(readPanelLayout({ panel: { layout } })).toBe(layout);
		for (const animation of PANEL_ANIMATIONS)
			expect(readPanelAnimation({ panel: { animation } })).toBe(animation);
	});

	test('cualquier otra cosa cae al valor de fábrica', () => {
		expect(readPanelStyle({ panel: { style: 'isla' } })).toBe(DEFAULT_PANEL_STYLE);
		expect(readPanelLayout({ panel: { layout: 3 } })).toBe(DEFAULT_PANEL_LAYOUT);
		expect(readPanelAnimation({ panel: { animation: 'rayo' } })).toBe(DEFAULT_PANEL_ANIMATION);
		expect(readPanelStyle({ panel: 'bar' })).toBe(DEFAULT_PANEL_STYLE);
	});

	test('el tamaño se acota a [80, 120]; lo que no es número vale 100', () => {
		expect(readPanelSize({ panel: { size: 90 } })).toBe(90);
		expect(readPanelSize({ panel: { size: 500 } })).toBe(MAX_PANEL_SIZE);
		expect(readPanelSize({ panel: { size: 10 } })).toBe(MIN_PANEL_SIZE);
		expect(readPanelSize({ panel: { size: Number.NaN } })).toBe(DEFAULT_PANEL_SIZE);
		expect(readPanelSize({ panel: { size: '120' } })).toBe(DEFAULT_PANEL_SIZE);
	});

	test('escribir el aspecto conserva la posición y los indicadores', () => {
		// Todo vive en la misma sección `panel`: reemplazarla entera apagaría los
		// indicadores y movería el panel cada vez que alguien cambia el tipo.
		const config: Record<string, unknown> = {
			panel: { weather: false, position: 'bottom' },
		};

		writePanelAppearance(config, {
			style: 'dock',
			layout: 'compact',
			animation: 'reactor',
			size: 110,
			autohide: true,
		});

		expect(config.panel).toEqual({
			weather: false,
			position: 'bottom',
			style: 'dock',
			layout: 'compact',
			animation: 'reactor',
			size: 110,
			autohide: true,
		});
	});

	test('al escribir, el tamaño también se acota', () => {
		const config: Record<string, unknown> = {};

		writePanelAppearance(config, {
			style: 'bar',
			layout: 'distributed',
			animation: 'off',
			size: 999,
			autohide: false,
		});

		expect((config.panel as { size: number }).size).toBe(MAX_PANEL_SIZE);
	});
});

describe('readScreenTimeEnabled', () => {
	test('la clave ausente significa apagado', () => {
		// El registro de uso no se enciende solo: se elige. El servicio de salud
		// lee con este mismo criterio, así que leerlo al revés acá prendería la
		// medición en cada instalación nueva sin que nadie la pidiera.
		expect(readScreenTimeEnabled({})).toBe(false);
		expect(readScreenTimeEnabled({ screen_time: {} })).toBe(false);
	});

	test('toma el booleano cuando está', () => {
		expect(readScreenTimeEnabled({ screen_time: { enabled: true } })).toBe(true);
		expect(readScreenTimeEnabled({ screen_time: { enabled: false } })).toBe(false);
	});

	test('un valor que no es booleano cae en apagado', () => {
		// Sale de un archivo editable a mano: un `"si"` no es `true`.
		expect(readScreenTimeEnabled({ screen_time: { enabled: 'yes' } })).toBe(false);
		expect(readScreenTimeEnabled({ screen_time: 'on' })).toBe(false);
	});
});

describe('writeScreenTimeEnabled', () => {
	test('deja el interruptor puesto', () => {
		const config: Record<string, unknown> = {};

		writeScreenTimeEnabled(config, true);

		expect(config.screen_time).toEqual({ enabled: true });
	});

	test('y conserva lo que el servicio haya guardado en la sección', () => {
		// La sección es compartida con lo que el servicio escriba después;
		// reemplazarla entera le borraría esas claves.
		const config: Record<string, unknown> = {
			screen_time: { enabled: false, retention_days: 30 },
		};

		writeScreenTimeEnabled(config, true);

		expect(config.screen_time).toEqual({ enabled: true, retention_days: 30 });
	});
});

describe('readWallpaperFolder', () => {
	test('sin carpeta elegida da cadena vacía', () => {
		expect(readWallpaperFolder({})).toBe('');
		expect(readWallpaperFolder(null)).toBe('');
		expect(readWallpaperFolder({ desktop: {} })).toBe('');
	});

	test('devuelve la carpeta guardada, sin espacios a los costados', () => {
		expect(readWallpaperFolder({ desktop: { wallpaperfolder: '/mnt/fotos' } })).toBe('/mnt/fotos');
		expect(readWallpaperFolder({ desktop: { wallpaperfolder: '  /home/p/Fondos  ' } })).toBe(
			'/home/p/Fondos'
		);
	});

	test('una clave que no es una cadena vale por «sin carpeta»', () => {
		expect(readWallpaperFolder({ desktop: { wallpaperfolder: 42 } })).toBe('');
		expect(readWallpaperFolder({ desktop: { wallpaperfolder: ['/a'] } })).toBe('');
	});
});

describe('readMenuSettings', () => {
	test('sin sección `menu` devuelve los valores de fábrica', () => {
		const leido = readMenuSettings({});
		expect(leido).toEqual({
			variant: DEFAULT_MENU_VARIANT,
			widget: DEFAULT_MENU_WIDGET,
			showUser: true,
			showSessionActions: true,
			searchPosition: DEFAULT_MENU_SEARCH_POSITION,
			showPlaces: false,
			showFavorites: false,
			header: 'none',
			headerImage: '',
			headerStrength: DEFAULT_HEADER_STRENGTH,
			showGreeting: true,
			showWeather: true,
			favorites: [],
		});
		// Y tolera que no haya ni configuración.
		expect(readMenuSettings(null).variant).toBe(DEFAULT_MENU_VARIANT);
	});

	test('un valor que no es de los conocidos cae al de fábrica', () => {
		const leido = readMenuSettings({
			menu: { variant: 'espiral', widget: 'cohete', header: 'banner', searchPosition: 'middle' },
		});
		expect(leido.variant).toBe(DEFAULT_MENU_VARIANT);
		expect(leido.widget).toBe(DEFAULT_MENU_WIDGET);
		expect(leido.header).toBe('none');
		expect(leido.searchPosition).toBe(DEFAULT_MENU_SEARCH_POSITION);
	});

	test('respeta lo que sí es válido, incluso cuando no es el de fábrica', () => {
		const leido = readMenuSettings({
			menu: {
				variant: 'grid',
				widget: 'none',
				showUser: false,
				searchPosition: 'bottom',
				showPlaces: true,
				header: 'hero',
			},
		});
		expect(leido.variant).toBe('grid');
		expect(leido.widget).toBe('none');
		expect(leido.showUser).toBe(false);
		expect(leido.searchPosition).toBe('bottom');
		expect(leido.showPlaces).toBe(true);
		expect(leido.header).toBe('hero');
	});

	test('un interruptor que no es booleano vale por su valor de fábrica', () => {
		// El archivo se edita a mano: un `"si"` no es `true`.
		const leido = readMenuSettings({ menu: { showUser: 'si', showPlaces: 1 } });
		expect(leido.showUser).toBe(true);
		expect(leido.showPlaces).toBe(false);
	});

	test('la intensidad del hero se acota a [0, 100] y lo que no es número vale el de fábrica', () => {
		expect(readMenuSettings({ menu: { headerStrength: 150 } }).headerStrength).toBe(
			MAX_HEADER_STRENGTH
		);
		expect(readMenuSettings({ menu: { headerStrength: -5 } }).headerStrength).toBe(0);
		expect(readMenuSettings({ menu: { headerStrength: 42.6 } }).headerStrength).toBe(43);
		expect(readMenuSettings({ menu: { headerStrength: 'mucho' } }).headerStrength).toBe(
			DEFAULT_HEADER_STRENGTH
		);
	});

	test('la imagen del hero sólo vale si es una cadena', () => {
		expect(readMenuSettings({ menu: { headerImage: '/a/b.png' } }).headerImage).toBe('/a/b.png');
		expect(readMenuSettings({ menu: { headerImage: 7 } }).headerImage).toBe('');
	});

	test('los favoritos se leen quedándose sólo con las cadenas', () => {
		expect(
			readMenuSettings({ menu: { favorites: ['/a.desktop', 3, '/b.desktop'] } }).favorites
		).toEqual(['/a.desktop', '/b.desktop']);
		expect(readMenuSettings({ menu: { favorites: 'no-lista' } }).favorites).toEqual([]);
	});
});

describe('writeMenuSettings', () => {
	const base: MenuSettings = {
		variant: 'tiles',
		widget: 'clock',
		showUser: false,
		showSessionActions: false,
		searchPosition: 'bottom',
		showPlaces: true,
		showFavorites: true,
		header: 'hero',
		headerImage: '/fondos/hero.jpg',
		headerStrength: 80,
		showGreeting: false,
		showWeather: false,
		favorites: ['/x.desktop'],
	};

	test('escribe todas las claves del contrato', () => {
		const config: Record<string, unknown> = {};
		writeMenuSettings(config, base);
		expect(config.menu).toEqual({ ...base });
	});

	test('conserva las claves ajenas de la sección `menu`', () => {
		// En `menu` pueden vivir claves de otras partes (o de versiones futuras):
		// reemplazar la sección entera las borraría.
		const config: Record<string, unknown> = {
			menu: { favorites: ['/viejo.desktop'], claveAjena: 'no-tocar' },
		};
		writeMenuSettings(config, base);
		expect((config.menu as Record<string, unknown>).claveAjena).toBe('no-tocar');
		// Y los favoritos que trae el estado ganan, que es el ida y vuelta de la vista.
		expect((config.menu as Record<string, unknown>).favorites).toEqual(['/x.desktop']);
	});

	test('la intensidad se vuelve a acotar al guardar', () => {
		const config: Record<string, unknown> = {};
		writeMenuSettings(config, { ...base, headerStrength: 999 });
		expect((config.menu as Record<string, unknown>).headerStrength).toBe(MAX_HEADER_STRENGTH);
	});

	test('lo escrito se vuelve a leer igual (ida y vuelta)', () => {
		const config: Record<string, unknown> = {};
		writeMenuSettings(config, base);
		expect(readMenuSettings(config)).toEqual(base);
	});
});

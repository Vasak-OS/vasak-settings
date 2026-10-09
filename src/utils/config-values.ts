/**
 * Leer del archivo de configuración lo que el plugin no tipa.
 *
 * La sección del escritorio lleva claves que son de otras aplicaciones —la
 * disposición de los widgets, la pausa del fondo en video— y el plugin las
 * declara como `unknown`: las transporta, no las conoce. Acá se convierten en
 * el tipo que la interfaz necesita.
 *
 * Se comprueba el tipo en lugar de afirmarlo con una aserción, que es lo que
 * había antes. El valor no viene de nuestro código: viene de un archivo que se
 * puede editar a mano, y ahí un `"si"` no es `true`. Con `as any` eso llegaba
 * hasta el interruptor, que quedaba prendido por ser una cadena no vacía.
 *
 * Vive aparte de las vistas para poder probarlo: importar una vista arrastra
 * Vue, el enrutador y el backend de Tauri.
 */

/** El booleano de una clave, o el valor de fábrica si no hay uno de verdad. */
export function configBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === 'boolean' ? value : fallback;
}

/**
 * La clave donde vive la carpeta propia de fondos (vasak-settings#148).
 *
 * Está en la sección `desktop`, que ya lleva las claves del fondo
 * (`wallpaper`, `pausevideoonbattery`). El escritorio lee **esta misma** clave
 * para listar las imágenes de la carpeta en su selector rápido: un solo
 * contrato entre los dos repositorios.
 */
export const WALLPAPER_FOLDER_KEY = 'wallpaperfolder';

/**
 * La carpeta propia de fondos guardada, o cadena vacía si no hay ninguna.
 *
 * El archivo se puede editar a mano, así que se comprueba el tipo en lugar de
 * afirmarlo: una clave que no es una cadena vale por «sin carpeta».
 */
export function readWallpaperFolder(config: unknown): string {
	const section =
		config && typeof config === 'object'
			? ((config as Record<string, unknown>).desktop as Record<string, unknown> | undefined)
			: undefined;
	const stored = section?.[WALLPAPER_FOLDER_KEY];
	return typeof stored === 'string' ? stored.trim() : '';
}

/** La clave del esquema de color, tal como se llama en el archivo. */
export const SCHEME_KEY = 'color-scheme';

/**
 * Las claves de estilo que la interfaz ya no escribe y quedaron en los archivos.
 *
 * `color_scheme` —con guión bajo— era lo que guardaba la vista del tema, y por
 * eso **elegir un esquema no cambiaba el esquema**: se escribía una clave nueva
 * que nadie lee y `color-scheme` se quedaba con el valor viejo.
 *
 * `primarycolor` era un control de «Color primario» que no hacía nada: nadie
 * leía esa clave en ningún repositorio. El color primario lo define el esquema,
 * así que el control se sacó en lugar de implementarlo.
 *
 * Hasta la versión 2.6.0 del plugin de configuración, las claves que su modelo
 * no conoce se borraban solas en cada lectura, así que esta basura no duraba.
 * Ahora se conservan —que es lo que salvó la disposición de los widgets—, así
 * que hay que sacarlas a propósito. Si no, quedan para siempre en el archivo de
 * quien haya tocado el tema alguna vez: una diciendo un esquema distinto del
 * que vale, la otra un color que no se aplica en ninguna parte.
 */
const DEAD_KEYS = ['color_scheme', 'primarycolor'];

/**
 * Deja escrito el esquema elegido, en la clave que se lee.
 *
 * Modifica la sección en lugar de devolver una nueva porque es lo que hace el
 * resto de la vista, que guarda la configuración entera que tiene cargada.
 */
export function writeScheme(style: Record<string, unknown>, id: string): void {
	style[SCHEME_KEY] = id;
}

/** Saca de la sección de estilo lo que la interfaz ya no escribe. */
export function clearStyle(style: Record<string, unknown>): void {
	for (const key of DEAD_KEYS) {
		delete style[key];
	}
}

/**
 * Si el registro del tiempo de pantalla está prendido.
 *
 * La sección `screen_time` no existe en el archivo hasta que alguien toca el
 * interruptor, y la clave ausente significa **apagado**: el registro de uso no
 * se enciende solo, se elige. El servicio de salud lee `screen_time.enabled` con
 * este mismo criterio al arrancar.
 */
export function readScreenTimeEnabled(config: unknown): boolean {
	const section =
		config && typeof config === 'object'
			? ((config as Record<string, unknown>).screen_time as Record<string, unknown> | undefined)
			: undefined;
	return configBoolean(section?.enabled, false);
}

/**
 * Deja la sección `screen_time` con el interruptor puesto.
 *
 * Conserva lo que ya hubiera en la sección: es compartida con lo que el servicio
 * guarde después, y reemplazarla entera borraría claves ajenas.
 */
export function writeScreenTimeEnabled(config: Record<string, unknown>, enabled: boolean): void {
	const previous = (config.screen_time as Record<string, unknown> | undefined) ?? {};
	config.screen_time = { ...previous, enabled };
}

/** Lo que el panel muestra y se puede apagar, en el orden en que aparece. */
export const PANEL_INDICATORS = ['weather', 'music', 'transfer', 'tray', 'privacy'] as const;

export type PanelIndicator = (typeof PANEL_INDICATORS)[number];

export type PanelIndicators = Record<PanelIndicator, boolean>;

/**
 * Qué indicadores del panel están encendidos.
 *
 * La sección `panel` no existe en el archivo hasta que alguien apaga algo, así
 * que **la clave ausente significa «mostralo»**. El escritorio lee con este
 * mismo criterio; leerlo al revés haría que el panel muestre el indicador y la
 * pantalla de configuración diga que está apagado, en cada instalación nueva.
 */
export function readPanelIndicators(config: unknown): PanelIndicators {
	const section =
		config && typeof config === 'object'
			? ((config as Record<string, unknown>).panel as Record<string, unknown> | undefined)
			: undefined;

	const read = {} as PanelIndicators;
	for (const key of PANEL_INDICATORS) {
		read[key] = configBoolean(section?.[key], true);
	}
	return read;
}

/**
 * Deja la sección `panel` con los interruptores puestos.
 *
 * Conserva lo que no son interruptores: ahí viven claves de otras pantallas, y
 * reemplazar la sección entera las borraría.
 */
export function writePanelIndicators(
	config: Record<string, unknown>,
	values: PanelIndicators
): void {
	const previous = (config.panel as Record<string, unknown> | undefined) ?? {};
	config.panel = { ...previous, ...values };
}

/** Los cuatro lados donde puede quedar la barra de una ventana. */
export const BAR_POSITIONS = ['top', 'bottom', 'left', 'right'] as const;

export type BarPosition = (typeof BAR_POSITIONS)[number];

/** Arriba, que es donde estuvo siempre y donde la gente la busca. */
export const DEFAULT_BAR_POSITION: BarPosition = 'top';

/**
 * De qué lado va la barra de las ventanas, según `window.barPosition`.
 *
 * Lo lee el marco compartido de `@vasakgroup/vue-libvasak`, que es el que
 * dibuja la barra en todas las aplicaciones. Acá se lee con el **mismo**
 * criterio: cualquier cosa que no sea uno de los cuatro lados vale por arriba.
 * Leerlo distinto haría que esta pantalla diga una cosa y las ventanas hagan
 * otra, que es exactamente lo que pasó con el esquema de color.
 *
 * El archivo se puede editar a mano, así que el valor no viene de nuestro
 * código: se comprueba en lugar de afirmarlo con una aserción.
 */
export function readBarPosition(config: unknown): BarPosition {
	const section =
		config && typeof config === 'object'
			? ((config as Record<string, unknown>).window as Record<string, unknown> | undefined)
			: undefined;
	const stored = section?.barPosition;
	return BAR_POSITIONS.includes(stored as BarPosition)
		? (stored as BarPosition)
		: DEFAULT_BAR_POSITION;
}

/**
 * Deja la sección `window` con la posición elegida.
 *
 * Conserva lo que ya hubiera: es una sección compartida con lo que venga
 * después, y reemplazarla entera borraría claves ajenas. Lo mismo que hace
 * `writePanelIndicators`.
 */
export function writeBarPosition(config: Record<string, unknown>, position: BarPosition): void {
	const previous = (config.window as Record<string, unknown> | undefined) ?? {};
	config.window = { ...previous, barPosition: position };
}

/**
 * Cómo se dibujan los botones de ventana: los planos de siempre o los tres
 * círculos de macOS. Lo lee `WindowControls` de `@vasakgroup/vue-libvasak`
 * de `window.controlsStyle`.
 */
export const WINDOW_CONTROLS_STYLES = ['default', 'macos'] as const;

export type WindowControlsStyle = (typeof WINDOW_CONTROLS_STYLES)[number];

/**
 * De qué lado van: al final (minimizar, maximizar, cerrar) o invertidos al
 * principio como en macOS (cerrar, minimizar, maximizar). Lo lee
 * `WindowControls` de `window.controlsOrder`.
 */
export const WINDOW_CONTROLS_ORDERS = ['default', 'reversed'] as const;

export type WindowControlsOrder = (typeof WINDOW_CONTROLS_ORDERS)[number];

export interface WindowControlsPreference {
	style: WindowControlsStyle;
	order: WindowControlsOrder;
}

function windowSection(config: unknown): Record<string, unknown> | undefined {
	return config && typeof config === 'object'
		? ((config as Record<string, unknown>).window as Record<string, unknown> | undefined)
		: undefined;
}

/**
 * El estilo y el orden de los botones de ventana.
 *
 * Con el mismo criterio que la librería: lo que no sea uno de los valores
 * conocidos vale por el de siempre. Si esta pantalla leyera distinto, diría una
 * cosa y las ventanas harían otra.
 */
export function readWindowControls(config: unknown): WindowControlsPreference {
	const section = windowSection(config);
	const style = section?.controlsStyle;
	const order = section?.controlsOrder;
	return {
		style: WINDOW_CONTROLS_STYLES.includes(style as WindowControlsStyle)
			? (style as WindowControlsStyle)
			: 'default',
		order: WINDOW_CONTROLS_ORDERS.includes(order as WindowControlsOrder)
			? (order as WindowControlsOrder)
			: 'default',
	};
}

/** Deja la sección `window` con los botones elegidos, conservando lo demás. */
export function writeWindowControls(
	config: Record<string, unknown>,
	controls: WindowControlsPreference
): void {
	const previous = (config.window as Record<string, unknown> | undefined) ?? {};
	config.window = { ...previous, controlsStyle: controls.style, controlsOrder: controls.order };
}

/**
 * El grosor del borde de afuera —la ventana entera, el panel, el centro de
 * control y los emergentes del escritorio—: 1 px, 2 px o 3 px. Lo aplica el
 * config-manager desde `style.border.width`.
 */
export const WINDOW_BORDER_WIDTHS = ['normal', 'thick', 'heavy'] as const;

export type WindowBorderWidth = (typeof WINDOW_BORDER_WIDTHS)[number];

/** El color del borde de afuera: el del esquema o el de acento. */
export const WINDOW_BORDER_COLORS = ['scheme', 'accent'] as const;

export type WindowBorderColor = (typeof WINDOW_BORDER_COLORS)[number];

export interface WindowBorderPreference {
	width: WindowBorderWidth;
	color: WindowBorderColor;
}

/** El borde de afuera, con el mismo criterio que el config-manager. */
export function readWindowBorder(config: unknown): WindowBorderPreference {
	const style =
		config && typeof config === 'object'
			? ((config as Record<string, unknown>).style as Record<string, unknown> | undefined)
			: undefined;
	const border = style?.border as Record<string, unknown> | undefined;
	return {
		width: WINDOW_BORDER_WIDTHS.includes(border?.width as WindowBorderWidth)
			? (border?.width as WindowBorderWidth)
			: 'normal',
		color: border?.color === 'accent' ? 'accent' : 'scheme',
	};
}

/** Deja `style.border` con lo elegido, conservando lo demás de `style`. */
export function writeWindowBorder(
	config: Record<string, unknown>,
	border: WindowBorderPreference
): void {
	const style = (config.style as Record<string, unknown> | undefined) ?? {};
	const previous = (style.border as Record<string, unknown> | undefined) ?? {};
	config.style = { ...style, border: { ...previous, width: border.width, color: border.color } };
}

/**
 * Los cuatro lados donde puede quedar el panel del escritorio.
 *
 * Son los mismos que los de la barra de las ventanas, y por eso comparten el
 * tipo: son dos preferencias distintas —una mueve la barra de cada ventana, la
 * otra la barra del escritorio— con el mismo juego de valores.
 */
export const PANEL_POSITIONS = BAR_POSITIONS;

export type PanelPosition = BarPosition;

/** Arriba, que es donde el panel estuvo siempre y donde la gente lo busca. */
export const DEFAULT_PANEL_POSITION: PanelPosition = 'top';

/**
 * De qué lado va el panel, según `panel.position`.
 *
 * El escritorio lo lee dos veces con este mismo criterio —el backend para
 * anclar la superficie, la interfaz para acomodar los iconos—, y las dos
 * toleran que no diga nada. Leerlo distinto acá haría que esta pantalla muestre
 * un lado y el panel esté en otro.
 */
export function readPanelPosition(config: unknown): PanelPosition {
	const section =
		config && typeof config === 'object'
			? ((config as Record<string, unknown>).panel as Record<string, unknown> | undefined)
			: undefined;
	const stored = section?.position;
	return PANEL_POSITIONS.includes(stored as PanelPosition)
		? (stored as PanelPosition)
		: DEFAULT_PANEL_POSITION;
}

/**
 * Deja la sección `panel` con la posición elegida.
 *
 * Conserva lo que ya hubiera: en esa sección viven los interruptores de los
 * indicadores, y reemplazarla entera los apagaría todos.
 */
export function writePanelPosition(config: Record<string, unknown>, position: PanelPosition): void {
	const previous = (config.panel as Record<string, unknown> | undefined) ?? {};
	config.panel = { ...previous, position };
}

/**
 * El aspecto del panel: su tipo, su densidad y su animación.
 *
 * Son las claves que el escritorio lee en `panel-appearance.ts` (vasak-desktop):
 * el **contrato tiene que coincidir** —mismos valores, mismos nombres, mismos
 * valores de fábrica—, porque uno escribe y el otro dibuja. Se leen tolerante,
 * como la posición: un valor que no es de los conocidos cae al de fábrica, y la
 * escritura conserva el resto de la sección `panel` (posición e indicadores).
 */
export const PANEL_STYLES = ['pills', 'floating', 'bar', 'dock', 'trapezoid'] as const;

export type PanelStyle = (typeof PANEL_STYLES)[number];

/** Píldoras: es lo que el panel trae y lo que la gente ya conoce. */
export const DEFAULT_PANEL_STYLE: PanelStyle = 'pills';

export const PANEL_LAYOUTS = ['distributed', 'compact'] as const;

export type PanelLayout = (typeof PANEL_LAYOUTS)[number];

/** Distribuido, que es como estuvo la barra siempre. */
export const DEFAULT_PANEL_LAYOUT: PanelLayout = 'distributed';

export const PANEL_ANIMATIONS = ['off', 'stream', 'wave', 'sweep', 'reactor', 'beat'] as const;

export type PanelAnimation = (typeof PANEL_ANIMATIONS)[number];

/** Apagada: el panel no se mueve hasta que la persona lo pide. */
export const DEFAULT_PANEL_ANIMATION: PanelAnimation = 'off';

function panelSection(config: unknown): Record<string, unknown> | undefined {
	return config && typeof config === 'object'
		? ((config as Record<string, unknown>).panel as Record<string, unknown> | undefined)
		: undefined;
}

export function readPanelStyle(config: unknown): PanelStyle {
	const stored = panelSection(config)?.style;
	return PANEL_STYLES.includes(stored as PanelStyle) ? (stored as PanelStyle) : DEFAULT_PANEL_STYLE;
}

export function readPanelLayout(config: unknown): PanelLayout {
	const stored = panelSection(config)?.layout;
	return PANEL_LAYOUTS.includes(stored as PanelLayout)
		? (stored as PanelLayout)
		: DEFAULT_PANEL_LAYOUT;
}

export function readPanelAnimation(config: unknown): PanelAnimation {
	const stored = panelSection(config)?.animation;
	return PANEL_ANIMATIONS.includes(stored as PanelAnimation)
		? (stored as PanelAnimation)
		: DEFAULT_PANEL_ANIMATION;
}

/**
 * Si el panel se esconde solo y se revela al rozar el borde.
 *
 * La clave ausente vale por apagado: el panel no se esconde solo hasta que se
 * pide. El escritorio lee `panel.autohide` con este mismo criterio (sólo `true`
 * lo prende) para dejar la zona exclusiva en cero.
 */
export function readPanelAutohide(config: unknown): boolean {
	return panelSection(config)?.autohide === true;
}

/** El aspecto que esta pantalla guarda de una vez, conservando el resto de `panel`. */
export interface PanelAppearance {
	style: PanelStyle;
	layout: PanelLayout;
	animation: PanelAnimation;
	autohide: boolean;
}

/**
 * Deja la sección `panel` con el aspecto elegido.
 *
 * Conserva lo que ya hubiera —la posición, los interruptores de los indicadores
 * y cualquier otra clave viven en la misma sección—, igual que
 * `writePanelPosition`. Un `size` viejo que haya quedado de una versión anterior
 * se preserva tal cual: el escritorio lo ignora y esta pantalla ya no lo toca.
 */
export function writePanelAppearance(
	config: Record<string, unknown>,
	appearance: PanelAppearance
): void {
	const previous = (config.panel as Record<string, unknown> | undefined) ?? {};
	config.panel = {
		...previous,
		style: appearance.style,
		layout: appearance.layout,
		animation: appearance.animation,
		autohide: appearance.autohide,
	};
}

/**
 * El menú de inicio: su esqueleto y sus opciones.
 *
 * Son las claves que el escritorio lee para armar el menú (`vasak-desktop`): el
 * **contrato tiene que coincidir** —mismos valores, mismos nombres, mismos
 * valores de fábrica—, porque acá se escriben y allá se dibujan. Está escrito en
 * `menu-variants-spec.md`, que es la fuente de verdad de las dos puntas.
 *
 * Se lee tolerante, como el panel: un valor que no es de los conocidos cae al de
 * fábrica, y la escritura conserva el resto de la sección `menu` —entre otras,
 * `favorites`, que no se edita desde esta pantalla sino desde el menú contextual
 * de cada aplicación—. El archivo se puede editar a mano, así que el tipo se
 * comprueba en lugar de afirmarlo.
 */
export const MENU_VARIANTS = ['compact', 'classic', 'grid', 'favorites', 'tiles'] as const;

export type MenuVariant = (typeof MENU_VARIANTS)[number];

/** Compacto: es el menú que el escritorio trae y el que la gente ya conoce. */
export const DEFAULT_MENU_VARIANT: MenuVariant = 'compact';

export const MENU_WIDGETS = ['clock', 'music', 'weather', 'files', 'none'] as const;

export type MenuWidget = (typeof MENU_WIDGETS)[number];

/** El clima, que es lo que el hueco del menú mostró siempre. */
export const DEFAULT_MENU_WIDGET: MenuWidget = 'weather';

export const MENU_HEADERS = ['none', 'hero'] as const;

export type MenuHeader = (typeof MENU_HEADERS)[number];

/** Sin encabezado: el menú arranca por el buscador, como hasta ahora. */
export const DEFAULT_MENU_HEADER: MenuHeader = 'none';

export const MENU_SEARCH_POSITIONS = ['top', 'bottom'] as const;

export type MenuSearchPosition = (typeof MENU_SEARCH_POSITIONS)[number];

/** Arriba, que es donde el buscador estuvo siempre. */
export const DEFAULT_MENU_SEARCH_POSITION: MenuSearchPosition = 'top';

/**
 * El tamaño con que abre el menú: `normal` es el de hoy, `full` lo abre a
 * pantalla completa (overlay, estilo ChromeOS/Unity) y `compact` lo hace chico.
 * El tamaño real de la superficie lo fija el backend del applet (layer-shell);
 * acá sólo se guarda la elección. El contenido ya se adapta al tamaño recibido
 * con consultas de contenedor.
 */
export const MENU_DISPLAY_MODES = ['normal', 'full', 'compact'] as const;

export type MenuDisplayMode = (typeof MENU_DISPLAY_MODES)[number];

/** Normal: el tamaño con que el menú abrió siempre. */
export const DEFAULT_MENU_DISPLAY_MODE: MenuDisplayMode = 'normal';

/** La imagen del hero se ve entre el 0 y el 100 %. Sesenta por omisión: se nota sin tapar el texto. */
export const MIN_HEADER_STRENGTH = 0;
export const MAX_HEADER_STRENGTH = 100;
export const DEFAULT_HEADER_STRENGTH = 60;

/** Todo lo que esta pantalla lee y escribe del menú, de una vez. */
export interface MenuSettings {
	variant: MenuVariant;
	displayMode: MenuDisplayMode;
	widget: MenuWidget;
	showUser: boolean;
	showSessionActions: boolean;
	searchPosition: MenuSearchPosition;
	showPlaces: boolean;
	showFavorites: boolean;
	header: MenuHeader;
	headerImage: string;
	headerStrength: number;
	showGreeting: boolean;
	showWeather: boolean;
	/**
	 * Las rutas `.desktop` fijadas como favoritas. No se editan desde esta
	 * pantalla —se fijan y desfijan desde el menú contextual de cada aplicación—,
	 * pero se leen y se devuelven tal cual para no borrarlas al guardar el resto.
	 */
	favorites: string[];
}

function menuSection(config: unknown): Record<string, unknown> | undefined {
	return config && typeof config === 'object'
		? ((config as Record<string, unknown>).menu as Record<string, unknown> | undefined)
		: undefined;
}

/** La lista de favoritos del archivo, quedándose sólo con las cadenas. */
function readMenuFavorites(section: Record<string, unknown> | undefined): string[] {
	const stored = section?.favorites;
	return Array.isArray(stored)
		? stored.filter((item): item is string => typeof item === 'string')
		: [];
}

/** El porcentaje del hero acotado a [0, 100]; lo que no es número vale el de fábrica. */
function readHeaderStrength(section: Record<string, unknown> | undefined): number {
	const stored = section?.headerStrength;
	if (typeof stored !== 'number' || !Number.isFinite(stored)) return DEFAULT_HEADER_STRENGTH;
	return Math.min(MAX_HEADER_STRENGTH, Math.max(MIN_HEADER_STRENGTH, Math.round(stored)));
}

/**
 * Todo el aspecto del menú, leído tolerante.
 *
 * El escritorio lee cada clave con este mismo criterio. Leerlas distinto acá
 * haría que esta pantalla diga una cosa y el menú muestre otra.
 */
export function readMenuSettings(config: unknown): MenuSettings {
	const section = menuSection(config);
	const variant = section?.variant;
	const displayMode = section?.displayMode;
	const widget = section?.widget;
	const header = section?.header;
	const searchPosition = section?.searchPosition;
	const headerImage = section?.headerImage;

	return {
		variant: MENU_VARIANTS.includes(variant as MenuVariant)
			? (variant as MenuVariant)
			: DEFAULT_MENU_VARIANT,
		displayMode: MENU_DISPLAY_MODES.includes(displayMode as MenuDisplayMode)
			? (displayMode as MenuDisplayMode)
			: DEFAULT_MENU_DISPLAY_MODE,
		widget: MENU_WIDGETS.includes(widget as MenuWidget)
			? (widget as MenuWidget)
			: DEFAULT_MENU_WIDGET,
		showUser: configBoolean(section?.showUser, true),
		showSessionActions: configBoolean(section?.showSessionActions, true),
		searchPosition: MENU_SEARCH_POSITIONS.includes(searchPosition as MenuSearchPosition)
			? (searchPosition as MenuSearchPosition)
			: DEFAULT_MENU_SEARCH_POSITION,
		showPlaces: configBoolean(section?.showPlaces, false),
		showFavorites: configBoolean(section?.showFavorites, false),
		header: MENU_HEADERS.includes(header as MenuHeader)
			? (header as MenuHeader)
			: DEFAULT_MENU_HEADER,
		headerImage: typeof headerImage === 'string' ? headerImage : '',
		headerStrength: readHeaderStrength(section),
		showGreeting: configBoolean(section?.showGreeting, true),
		showWeather: configBoolean(section?.showWeather, true),
		favorites: readMenuFavorites(section),
	};
}

/**
 * Deja la sección `menu` con el aspecto elegido.
 *
 * Escribe **sólo las claves que esta pantalla edita** y conserva el resto de la
 * sección con `...previous`. En particular **no toca `favorites`**: se fija y
 * desfija desde el menú contextual de cada aplicación, no desde acá, así que
 * escribirlo desde el estado que esta pantalla leyó al abrir pisaría lo que se
 * haya fijado mientras tanto. Quien guarda debe pasar una configuración **recién
 * leída** (no la de la carga), porque `writeConfig` escribe el objeto tal cual,
 * sin releer ni fusionar el archivo.
 *
 * La intensidad del hero se vuelve a acotar al guardar: ni el control ni una
 * escritura a mano pueden dejar un valor fuera de rango en el archivo.
 */
export function writeMenuSettings(config: Record<string, unknown>, settings: MenuSettings): void {
	const previous = (config.menu as Record<string, unknown> | undefined) ?? {};
	config.menu = {
		...previous,
		variant: settings.variant,
		displayMode: settings.displayMode,
		widget: settings.widget,
		showUser: settings.showUser,
		showSessionActions: settings.showSessionActions,
		searchPosition: settings.searchPosition,
		showPlaces: settings.showPlaces,
		showFavorites: settings.showFavorites,
		header: settings.header,
		headerImage: settings.headerImage,
		headerStrength: Math.min(
			MAX_HEADER_STRENGTH,
			Math.max(MIN_HEADER_STRENGTH, Math.round(settings.headerStrength))
		),
		showGreeting: settings.showGreeting,
		showWeather: settings.showWeather,
	};
}

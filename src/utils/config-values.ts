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
 * El aspecto del panel: su tipo, su densidad, su animación y su tamaño.
 *
 * Son las claves que el escritorio lee en `panel-appearance.ts` (vasak-desktop):
 * el **contrato tiene que coincidir** —mismos valores, mismos nombres, mismos
 * valores de fábrica—, porque uno escribe y el otro dibuja. Se leen tolerante,
 * como la posición: un valor que no es de los conocidos cae al de fábrica, y la
 * escritura conserva el resto de la sección `panel` (posición e indicadores).
 */
export const PANEL_STYLES = ['pills', 'floating', 'bar', 'dock'] as const;

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

/** El tamaño va entre el 80 y el 120 %: más abajo no se lee, más arriba no entra en la franja. */
export const MIN_PANEL_SIZE = 80;
export const MAX_PANEL_SIZE = 120;
export const DEFAULT_PANEL_SIZE = 100;

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
 * El tamaño en porciento, acotado al rango que entra en la franja. El archivo
 * se edita a mano: un `150` o un `"grande"` no pueden estirar la barra fuera de
 * su lugar, así que todo se recorta a [80, 120] y lo que no es un número vale 100.
 */
export function readPanelSize(config: unknown): number {
	const stored = panelSection(config)?.size;
	if (typeof stored !== 'number' || !Number.isFinite(stored)) return DEFAULT_PANEL_SIZE;
	return Math.min(MAX_PANEL_SIZE, Math.max(MIN_PANEL_SIZE, Math.round(stored)));
}

/** El aspecto que esta pantalla guarda de una vez, conservando el resto de `panel`. */
export interface PanelAppearance {
	style: PanelStyle;
	layout: PanelLayout;
	animation: PanelAnimation;
	size: number;
}

/**
 * Deja la sección `panel` con el aspecto elegido.
 *
 * Conserva lo que ya hubiera —la posición y los interruptores de los
 * indicadores viven en la misma sección—, igual que `writePanelPosition`. El
 * tamaño se vuelve a acotar al guardar: ni el control ni una escritura a mano
 * pueden dejar un valor fuera de rango en el archivo.
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
		size: Math.min(MAX_PANEL_SIZE, Math.max(MIN_PANEL_SIZE, Math.round(appearance.size))),
	};
}

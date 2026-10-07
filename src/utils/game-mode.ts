/**
 * Qué hace el modo juego: el registro de acciones y su lugar en `vasak.conf`.
 *
 * El modo juego del centro de control (vasak-desktop#181) no hace una lista
 * fija de cosas: hace las que la persona dejó encendidas acá, en la sección
 * `game_mode` del archivo de configuración. El escritorio lee **esa misma**
 * sección una vez al activar el modo, así que el formato es un contrato entre
 * los dos repositorios:
 *
 *     "game_mode": { "do_not_disturb": true, "disable_animations": true, "gamemode": true }
 *
 * - una clave que falta vale su valor por omisión;
 * - un valor que no es booleano también vale el valor por omisión;
 * - una clave que esta versión no conoce se ignora en la interfaz, pero **se
 *   conserva al escribir**: puede ser de un escritorio más nuevo.
 *
 * Sumar una acción es sumar una entrada a `GAME_MODE_ACTIONS` (y sus textos):
 * la sección se dibuja recorriendo el registro, no fila por fila.
 *
 * Vive aparte de la vista para poder probarlo sin montar Vue ni Tauri.
 */

/** La sección de `vasak.conf` donde vive la configuración del modo juego. */
export const GAME_MODE_SECTION = 'game_mode';

/** Algo que la acción necesita instalado para poder ofrecerse. */
export type GameModeRequirement = 'gamemode';

export interface GameModeAction {
	/** La clave en la sección `game_mode`, la misma que lee el escritorio. */
	readonly key: string;
	/** Lo que vale si el archivo no dice nada (o dice algo que no es booleano). */
	readonly defaultValue: boolean;
	/** La clave de traducción del nombre de la acción. */
	readonly titleKey: string;
	/** La clave de traducción de la línea que explica qué hace. */
	readonly descriptionKey: string;
	/** El icono del tema, por nombre freedesktop. */
	readonly icon: string;
	/** Si sólo se puede ofrecer cuando algo está instalado. */
	readonly requires?: GameModeRequirement;
}

/** Lo que hace el modo juego, en el orden en que se muestra. */
export const GAME_MODE_ACTIONS = [
	{
		key: 'do_not_disturb',
		defaultValue: true,
		titleKey: 'views.gameMode.actions.doNotDisturb.title',
		descriptionKey: 'views.gameMode.actions.doNotDisturb.description',
		icon: 'notifications-disabled',
	},
	{
		key: 'disable_animations',
		defaultValue: true,
		titleKey: 'views.gameMode.actions.disableAnimations.title',
		descriptionKey: 'views.gameMode.actions.disableAnimations.description',
		icon: 'preferences-desktop-effects',
	},
	{
		key: 'gamemode',
		defaultValue: true,
		titleKey: 'views.gameMode.actions.gamemode.title',
		descriptionKey: 'views.gameMode.actions.gamemode.description',
		icon: 'applications-games',
		requires: 'gamemode',
	},
] as const satisfies readonly GameModeAction[];

/** Las claves conocidas por esta versión. */
export type GameModeActionKey = (typeof GAME_MODE_ACTIONS)[number]['key'];

/** Encendida o apagada, por acción conocida. */
export type GameModeSettings = Record<GameModeActionKey, boolean>;

/** Un objeto plano, o `undefined` si el valor es otra cosa. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

/**
 * Los valores de cada acción tal como quedan después de leer el archivo.
 *
 * Recibe la configuración entera (o `null`, si no se pudo leer). El archivo se
 * puede editar a mano, así que se comprueba el tipo en lugar de afirmarlo: un
 * `"no"` no es `false`, es «no dice nada» y vale el valor por omisión.
 */
export function readGameModeSettings(config: unknown): GameModeSettings {
	const section = asRecord(asRecord(config)?.[GAME_MODE_SECTION]);
	const settings = {} as GameModeSettings;
	for (const action of GAME_MODE_ACTIONS) {
		const stored = section?.[action.key];
		settings[action.key] = typeof stored === 'boolean' ? stored : action.defaultValue;
	}
	return settings;
}

/**
 * La configuración con una sola acción cambiada.
 *
 * Devuelve un objeto nuevo y no toca el que recibe. Lo demás del archivo —las
 * otras secciones, las otras acciones y las claves que esta versión no
 * conoce— queda exactamente como estaba: lo que no se tocó no se reescribe con
 * su valor por omisión.
 */
export function withGameModeAction<T extends object>(
	config: T,
	key: GameModeActionKey,
	enabled: boolean
): T {
	const section = asRecord((config as Record<string, unknown>)[GAME_MODE_SECTION]) ?? {};
	return { ...config, [GAME_MODE_SECTION]: { ...section, [key]: enabled } };
}

/** Si una acción se puede ofrecer con lo que hay instalado. */
export function isActionAvailable(
	action: GameModeAction,
	installed: Record<GameModeRequirement, boolean>
): boolean {
	return action.requires ? installed[action.requires] : true;
}

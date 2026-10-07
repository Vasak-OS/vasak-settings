/**
 * El estado de la sección «Modo juego»: qué acciones están encendidas y si
 * GameMode está instalado.
 *
 * **No vigila nada.** Lee una vez al abrirse la sección y escribe cuando se
 * toca un interruptor. El escritorio tampoco vigila: lee la sección una vez al
 * activar el modo, así que un cambio hecho acá vale para la próxima vez que se
 * active, no para una partida en curso.
 *
 * Las dependencias entran por parámetro para poder probarlo sin Tauri: en este
 * repositorio `invoke` ya está doblado por otras pruebas, y un segundo
 * `mock.module` del mismo módulo da verde o rojo según el orden de la corrida.
 */

import { invoke } from '@tauri-apps/api/core';
import { readConfig, type VSKConfig, writeConfig } from '@vasakgroup/plugin-config-manager';
import { ref } from 'vue';
import {
	GAME_MODE_ACTIONS,
	type GameModeActionKey,
	type GameModeRequirement,
	type GameModeSettings,
	readGameModeSettings,
	withGameModeAction,
} from '@/utils/game-mode';

export interface GameModeDeps {
	read: () => Promise<VSKConfig | null>;
	write: (config: VSKConfig) => Promise<void>;
	/** Una sola consulta, sin procesos: ver `src-tauri/src/commands/game_mode.rs`. */
	isGamemodeAvailable: () => Promise<boolean>;
}

const defaultDeps: GameModeDeps = {
	read: readConfig,
	write: writeConfig,
	isGamemodeAvailable: () => invoke<boolean>('is_gamemode_available'),
};

export function useGameModeSettings(deps: Partial<GameModeDeps> = {}) {
	const { read, write, isGamemodeAvailable } = { ...defaultDeps, ...deps };

	/** Antes de leer, los valores por omisión: nunca una fila sin estado. */
	const settings = ref<GameModeSettings>(readGameModeSettings(null));
	/** Hasta saberlo, nada se da por instalado. */
	const installed = ref<Record<GameModeRequirement, boolean>>({ gamemode: false });
	const loaded = ref(false);
	const saving = ref<GameModeActionKey | null>(null);
	const error = ref('');

	async function load(): Promise<void> {
		error.value = '';
		const [config, gamemode] = await Promise.allSettled([read(), isGamemodeAvailable()]);

		if (config.status === 'fulfilled') {
			settings.value = readGameModeSettings(config.value);
		} else {
			error.value = String(config.reason);
		}
		// Si la consulta falla, GameMode queda «no disponible»: es la forma
		// prudente de equivocarse, y la fila lo explica en vez de romperse.
		installed.value = { gamemode: gamemode.status === 'fulfilled' && gamemode.value === true };
		loaded.value = true;
	}

	/**
	 * Enciende o apaga una acción y lo deja escrito.
	 *
	 * Relee el archivo justo antes de escribir, para no pisar lo que otra
	 * aplicación haya cambiado desde que se abrió la sección (el tema, un
	 * widget), y cambia sólo la clave tocada. Si falla, el interruptor vuelve a
	 * donde estaba: no se muestra un valor que no quedó guardado.
	 */
	async function setAction(key: GameModeActionKey, enabled: boolean): Promise<void> {
		const previous = settings.value[key];
		settings.value = { ...settings.value, [key]: enabled };
		saving.value = key;
		error.value = '';

		try {
			const config = await read();
			if (!config) throw new Error('no se pudo leer la configuración');
			await write(withGameModeAction(config, key, enabled));
		} catch (err) {
			settings.value = { ...settings.value, [key]: previous };
			error.value = String(err);
		} finally {
			saving.value = null;
		}
	}

	return {
		actions: GAME_MODE_ACTIONS,
		settings,
		installed,
		loaded,
		saving,
		error,
		load,
		setAction,
	};
}

/**
 * El interruptor y el borrado del tiempo de pantalla, en un solo lugar.
 *
 * Los usan dos pantallas: «Tiempo de pantalla», que además muestra el informe, y
 * «Privacidad y seguridad», donde se buscan los ajustes de privacidad
 * (vasak-settings#145). Antes vivían adentro de la primera; copiarlos en la
 * segunda era tener dos interruptores que se podían desincronizar.
 *
 * El interruptor hace **dos** cosas: persiste `screen_time.enabled` en
 * `vasak.conf` —de donde el servicio de salud lo lee al arrancar— y llama a
 * `SetEnabled` para que el cambio sea inmediato. Si una de las dos falla, se
 * deshace la otra: el archivo y el servicio no pueden quedar diciendo cosas
 * distintas.
 *
 * Los ganchos (`onBeforeChange`, `onAfterChange`, `onBeforeClear`,
 * `onAfterClear`) son para quien además carga el informe: tiene que invalidar
 * sus cargas en vuelo antes del cambio y recargar después. `togglePending` le
 * dice si un cambio está en curso, para que una carga que resuelva en ese rato
 * no adopte el estado viejo que trae el servicio.
 *
 * Las dependencias entran por parámetro para poder probarlo sin Tauri, como en
 * `useGameModeSettings`.
 */

import { readConfig, type VSKConfig, writeConfig } from '@vasakgroup/plugin-config-manager';
import { type Ref, ref } from 'vue';
import {
	clearScreenTime,
	screenTimeEnabled,
	setScreenTimeEnabled,
} from '@/services/health.service';
import { readScreenTimeEnabled, writeScreenTimeEnabled } from '@/utils/config-values';

export interface ScreenTimeDeps {
	read: () => Promise<VSKConfig | null>;
	write: (config: VSKConfig) => Promise<void>;
	setEnabled: (enabled: boolean) => Promise<void>;
	isEnabled: () => Promise<boolean>;
	clear: () => Promise<void>;
}

const defaultDeps: ScreenTimeDeps = {
	read: readConfig,
	write: writeConfig,
	setEnabled: setScreenTimeEnabled,
	isEnabled: screenTimeEnabled,
	clear: clearScreenTime,
};

export interface ScreenTimeHooks {
	/** Antes de cambiar el interruptor: invalidar lo que esté cargando. */
	onBeforeChange?: () => void;
	/** Después, con si el cambio se aceptó. */
	onAfterChange?: (succeeded: boolean) => Promise<void> | void;
	/** Antes de borrar: invalidar lo que esté cargando. */
	onBeforeClear?: () => void;
	/** Después de un borrado que salió bien. */
	onAfterClear?: () => Promise<void> | void;
}

/** Los textos de los mensajes, ya traducidos: el composable no sabe de idiomas. */
export interface ScreenTimeMessages {
	saved: () => string;
	errorSaving: (reason: string) => string;
	errorClearing: (reason: string) => string;
}

export interface ScreenTimeSettings {
	enabled: Ref<boolean>;
	busy: Ref<boolean>;
	togglePending: Ref<boolean>;
	confirmingClear: Ref<boolean>;
	error: Ref<string>;
	successMessage: Ref<string>;
	/** Lee el estado: primero el archivo, y si el servicio contesta, el suyo. */
	refresh: () => Promise<void>;
	toggle: (value: boolean) => Promise<void>;
	clear: () => Promise<void>;
}

/** Cuánto queda a la vista el aviso de «guardado». */
const SAVED_MS = 3000;

export function useScreenTimeSettings(
	messages: ScreenTimeMessages,
	hooks: ScreenTimeHooks = {},
	deps: ScreenTimeDeps = defaultDeps
): ScreenTimeSettings {
	const enabled = ref(false);
	const busy = ref(false);
	const togglePending = ref(false);
	const confirmingClear = ref(false);
	const error = ref('');
	const successMessage = ref('');

	const persist = async (value: boolean) => {
		const config = await deps.read();
		if (config) {
			writeScreenTimeEnabled(config as unknown as Record<string, unknown>, value);
			await deps.write(config);
		}
	};

	const refresh = async () => {
		try {
			const fromFile = readScreenTimeEnabled(await deps.read());
			// Lo mismo que con el servicio: si mientras se leía el archivo alguien
			// tocó el interruptor, manda el cambio. En Privacidad no hay una carga
			// posterior que lo reconcilie, así que el archivo viejo lo dejaría mal.
			if (!togglePending.value) enabled.value = fromFile;
		} catch {
			// Sin archivo legible, lo que diga el servicio.
		}
		try {
			const reported = await deps.isEnabled();
			// Un cambio que se hizo mientras se leía manda sobre lo leído.
			if (!togglePending.value) enabled.value = reported;
		} catch {
			// Sin servicio, queda lo del archivo: es lo que va a leer al arrancar.
		}
	};

	const toggle = async (value: boolean) => {
		hooks.onBeforeChange?.();
		togglePending.value = true;
		busy.value = true;
		error.value = '';
		successMessage.value = '';
		const previous = enabled.value;
		enabled.value = value;
		let succeeded = false;
		try {
			await persist(value);
			await deps.setEnabled(value);
			succeeded = true;
			successMessage.value = messages.saved();
			setTimeout(() => {
				successMessage.value = '';
			}, SAVED_MS);
		} catch (err) {
			// Volver el interruptor a la verdad, y también el archivo: si la escritura
			// salió bien pero `SetEnabled` falló, el archivo quedó cambiado y el
			// servicio leería otra cosa al arrancar.
			enabled.value = previous;
			try {
				await persist(previous);
			} catch {
				// Si ni siquiera se pudo deshacer, el error de abajo ya avisa.
			}
			error.value = messages.errorSaving(String(err));
		} finally {
			togglePending.value = false;
			busy.value = false;
		}
		await hooks.onAfterChange?.(succeeded);
	};

	const clear = async () => {
		hooks.onBeforeClear?.();
		busy.value = true;
		error.value = '';
		try {
			await deps.clear();
			confirmingClear.value = false;
			await hooks.onAfterClear?.();
		} catch (err) {
			error.value = messages.errorClearing(String(err));
		} finally {
			busy.value = false;
		}
	};

	return {
		enabled,
		busy,
		togglePending,
		confirmingClear,
		error,
		successMessage,
		refresh,
		toggle,
		clear,
	};
}

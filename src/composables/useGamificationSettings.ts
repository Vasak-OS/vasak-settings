/**
 * El interruptor de la gamificación.
 *
 * Hace **dos** cosas, como el de tiempo de pantalla: persiste
 * `gamification.enabled` en `vasak.conf` —de donde el servicio lo lee al
 * arrancar— y llama a `SetEnabled` para que el cambio sea inmediato. Si una de
 * las dos falla, se deshace la otra: el archivo y el servicio no pueden quedar
 * diciendo cosas distintas.
 *
 * Es más simple que `useScreenTimeSettings`: la gamificación no tiene un informe
 * que reconciliar, así que la vista recarga su progreso después de cada cambio y
 * de ahí sale la verdad. No hace falta ni el secuenciador de pedidos ni los
 * ganchos.
 *
 * Las dependencias entran por parámetro para poder probarlo sin Tauri, como en
 * `useGameModeSettings`. El texto del error entra ya formateado: el composable
 * no sabe de idiomas.
 */

import { readConfig, type VSKConfig, writeConfig } from '@vasakgroup/plugin-config-manager';
import { ref } from 'vue';
import { setGamificationEnabled } from '@/services/health.service';
import { writeGamificationEnabled } from '@/utils/config-values';

export interface GamificationDeps {
	read: () => Promise<VSKConfig | null>;
	write: (config: VSKConfig) => Promise<void>;
	setEnabled: (enabled: boolean) => Promise<void>;
}

const defaultDeps: GamificationDeps = {
	read: readConfig,
	write: writeConfig,
	setEnabled: setGamificationEnabled,
};

export function useGamificationSettings(
	errorSaving: (reason: string) => string,
	deps: Partial<GamificationDeps> = {}
) {
	const { read, write, setEnabled } = { ...defaultDeps, ...deps };

	const enabled = ref(false);
	const busy = ref(false);
	const error = ref('');

	const persist = async (value: boolean) => {
		const config = await read();
		if (config) {
			writeGamificationEnabled(config as unknown as Record<string, unknown>, value);
			await write(config);
		}
	};

	const toggle = async (value: boolean) => {
		busy.value = true;
		error.value = '';
		const previous = enabled.value;
		enabled.value = value;
		try {
			await persist(value);
			await setEnabled(value);
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
			error.value = errorSaving(String(err));
		} finally {
			busy.value = false;
		}
	};

	return { enabled, busy, error, toggle };
}

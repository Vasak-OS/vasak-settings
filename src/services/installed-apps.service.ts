import { invoke } from '@tauri-apps/api/core';
import type { PinnedApp } from '@/utils/config-values';

/**
 * Las aplicaciones instaladas que se pueden anclar al panel.
 *
 * El backend las lee de los `.desktop` del sistema —filtradas por
 * `NoDisplay`/`Hidden` y resueltas por precedencia usuario sobre sistema, el
 * mismo criterio que la pantalla de aplicaciones por defecto— y las devuelve ya
 * con la forma que guarda `panel.pinned`: `{ id, name, icon, exec }`.
 */
export async function listInstalledApps(): Promise<PinnedApp[]> {
	return invoke<PinnedApp[]>('list_installed_apps');
}

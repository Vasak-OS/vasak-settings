import { invoke } from '@tauri-apps/api/core';
import type { ScreenTimeReport } from '@/utils/screen-time';

export type { ScreenTimeReport } from '@/utils/screen-time';

/**
 * El tiempo de pantalla entre dos fechas (`AAAA-MM-DD`, las dos incluidas).
 *
 * Lo contesta el servicio de salud desde su caché; el backend le pega a cada
 * aplicación su icono y su nombre antes de devolverlo.
 */
export const screenTime = (from: string, to: string): Promise<ScreenTimeReport> =>
	invoke<ScreenTimeReport>('screen_time', { from, to });

/** Borra todo el historial de tiempo de pantalla. No se puede deshacer. */
export const clearScreenTime = (): Promise<void> => invoke<void>('clear_screen_time');

/**
 * Prende o apaga el registro en el acto.
 *
 * La vista además persiste `screen_time.enabled` en `vasak.conf` con el plugin
 * de configuración: esto es lo que lo hace inmediato, sin esperar a que el
 * servicio relea el archivo.
 */
export const setScreenTimeEnabled = (enabled: boolean): Promise<void> =>
	invoke<void>('screen_time_set_enabled', { enabled });

/** Si el registro está prendido ahora mismo, según el servicio. */
export const screenTimeEnabled = (): Promise<boolean> => invoke<boolean>('screen_time_enabled');

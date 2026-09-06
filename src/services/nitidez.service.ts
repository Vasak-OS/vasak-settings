/**
 * El engrosado de trazos de FreeType.
 *
 * No pasa por la configuración de VasakOS: vive en un archivo de entorno de la
 * sesión, porque FreeType lee esa propiedad al inicializarse y no hay forma de
 * cambiarla en caliente. Por eso también toma efecto recién al volver a entrar.
 */

import { invoke } from '@tauri-apps/api/core';

/** Si el engrosado está pedido, mirando la preferencia del usuario primero. */
export const nitidezActiva = (): Promise<boolean> => invoke<boolean>('nitidez_activa');

/** Guarda la preferencia. Rechaza si no se pudo escribir. */
export const fijarNitidez = (activa: boolean): Promise<void> =>
	invoke<void>('fijar_nitidez', { activa });

import { saveUserScheme as saveInPlugin } from '@vasakgroup/plugin-config-manager';
import type { SchemeEntry, SchemeFile } from '@/types/scheme';

/**
 * Guarda un esquema en el directorio de esquemas del usuario
 * (`~/.config/vasak/schemes/<id>.json`).
 *
 * Es el `saveUserScheme` del plugin (desde la 2.9, que admite pinia 3) con los
 * tipos de la aplicación, que nombran también las claves que el editor tiene
 * que conservar (ver `src/types/scheme.ts`). Hasta la 2.9 esto era un `invoke`
 * a mano, porque el paquete estaba fijado en `~2.6.1` y la 2.6 no traía el
 * ayudante.
 *
 * El plugin valida el id, escribe de forma atómica, invalida su caché y avisa
 * con `config-changed` a todas las aplicaciones abiertas: acá no hace falta
 * avisarle a nadie.
 */
export function saveUserScheme(scheme: SchemeFile): Promise<SchemeEntry> {
	return saveInPlugin(scheme);
}

import { invoke } from '@tauri-apps/api/core';
import type { SchemeEntry, SchemeFile } from '@/types/scheme';

/**
 * Guarda un esquema en el directorio de esquemas del usuario
 * (`~/.config/vasak/schemes/<id>.json`).
 *
 * El comando es de `tauri-plugin-config-manager` 2.8.0 y del lado de Rust se
 * pide esa versión. Se llama con `invoke` y no con el ayudante del paquete de
 * npm porque el paquete está fijado en `~2.6.1`: desde la 2.7 pide pinia 4 y
 * esta aplicación está en pinia 3 (ver `vasak.bibliotecasAtrasadas` en
 * `package.json`). La 2.6.1 no trae el ayudante.
 *
 * Se reemplaza por el `saveUserScheme` del paquete cuando la aplicación pase a
 * pinia 4 y el rango del plugin se pueda subir.
 *
 * El plugin valida el id, escribe de forma atómica, invalida su caché y avisa
 * con `config-changed` a todas las aplicaciones abiertas: acá no hace falta
 * avisarle a nadie.
 */
export function saveUserScheme(scheme: SchemeFile): Promise<SchemeEntry> {
	return invoke<SchemeEntry>('plugin:config-manager|save_user_scheme', { scheme });
}

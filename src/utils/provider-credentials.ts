import type { ProviderInfo } from '../services/accounts.service';

/**
 * Las credenciales propias de un proveedor OAuth2 (el `client_id` y el
 * `client_secret` que la persona pegó): cuándo se pueden cambiar o quitar, y
 * qué decir después de quitarlas.
 *
 * Va aparte de la vista para poder probarlo sin Tauri ni Vue.
 */

/**
 * Si a este proveedor se le pueden cambiar o quitar las credenciales.
 *
 * Son los OAuth2 que ya están listos. Hace falta una acción aparte de la
 * tarjeta, porque el clic en la tarjeta de uno configurado **conecta la
 * cuenta**: el formulario sólo se abría para uno sin configurar, y ahí el
 * botón de quitar no aparece, así que no había forma de llegar a él
 * (Vasak-OS/vasak-settings#132).
 */
export const canManageCredentials = (provider: Pick<ProviderInfo, 'kind' | 'configured'>) =>
	provider.kind === 'oauth2' && provider.configured;

/**
 * Qué quedó después de quitar las credenciales propias.
 *
 * El servicio de cuentas borra sólo las **propias**. Si el proveedor sigue
 * listo después, es porque tiene unas del sistema —las que un administrador
 * dejó en `/etc`—, y decir «quitadas» a secas haría creer que ya no se pueden
 * conectar cuentas nuevas con él.
 *
 * `after` es el proveedor releído del catálogo, o `undefined` si ya no está.
 */
export const clearOutcome = (
	after: Pick<ProviderInfo, 'configured'> | undefined
): 'cleared' | 'systemRemains' => (after?.configured ? 'systemRemains' : 'cleared');

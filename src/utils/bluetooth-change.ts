/**
 * Qué cambios del evento `bluetooth-change` obligan a volver a leer la vista
 * «Red y Bluetooth».
 *
 * Desde tauri-plugin-bluetooth-manager 2.2.0 la clase de cambio viaja con dos
 * nombres y el mismo valor: `changeType`, el que declaran los tipos, y
 * `change_type`, el de hasta la 2.1, marcado `@deprecated` y que se va en la
 * próxima mayor del complemento. Acá se lee **sólo** `changeType`: si se
 * siguiera leyendo el viejo, el día que el complemento lo saque ninguna
 * comparación daría verdadera y la vista dejaría de refrescarse sin un solo
 * error (Vasak-OS/vasak-settings#140).
 */

import type {
	BluetoothChange,
	BluetoothChangeTypeValue,
} from '@vasakgroup/plugin-bluetooth-manager';

/**
 * Los cambios que tocan lo que la vista muestra: el encendido del adaptador y
 * qué dispositivos hay y cuáles están conectados.
 *
 * `device-property-changed` queda afuera, como estaba: llega a cada rato (RSSI,
 * batería) y cada refresco pasa la vista por «sincronizando», así que rehacer
 * las dos listas con cada uno la haría parpadear.
 */
export const REFRESHING_CHANGES: ReadonlySet<BluetoothChangeTypeValue> = new Set([
	'adapter-property-changed',
	'device-added',
	'device-removed',
	'device-connected',
	'device-disconnected',
]);

/**
 * Si el cambio pide volver a leer adaptador y dispositivos.
 *
 * Recibe la carga del evento tal como llega; sólo mira `changeType`.
 */
export function shouldRefresh(change: Pick<BluetoothChange, 'changeType'>): boolean {
	return (REFRESHING_CHANGES as ReadonlySet<string>).has(change.changeType);
}

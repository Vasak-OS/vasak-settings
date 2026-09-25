import type { DeviceInfo } from '@vasakgroup/plugin-bluetooth-manager';
import { signalLevel } from './bluetooth-signal';

/**
 * Las propiedades de la tarjeta a partir de un dispositivo de BlueZ.
 *
 * Es una función pura y vive fuera de la vista para poder probarla sin Tauri y
 * sin montar nada: lo único que era nuestro en esa vista es esta traducción de
 * un dispositivo de BlueZ a lo que la `DeviceCard` de la librería muestra.
 *
 * `metadata` se deja tal cual está —`icon` y si no `alias`— aunque `icon` sea
 * el **nombre** del icono del tema y no un texto pensado para leerse. Lo cambia
 * el issue #117 en su propio PR; acá no se toca.
 *
 * `extraInfo` va sin anotar el tipo: la librería declara `ExtraInfo` para esa
 * propiedad pero **no la exporta** en su índice, así que desde afuera no se
 * puede nombrar. La forma `{ icon, text }` es asignable igual. Queda anotado
 * como hueco de la librería, no como algo a resolver acá.
 */
export function deviceCardProps(device: DeviceInfo, t: (key: string) => string) {
	return {
		name: device.icon || 'bluetooth',
		title: device.alias || device.name || device.address,
		subtitle: device.address,
		metadata: device.icon || device.alias || '',
		// `!= null` y no un booleano: 0 dBm es un RSSI válido (y rarísimo), no
		// una ausencia. Sin RSSI la fila no muestra ni icono ni texto.
		//
		// El `t()` del taller no interpola; y el reemplazo va con una función
		// porque `replace` con una cadena interpreta `$&` y compañía.
		extraInfo:
			device.rssi != null
				? [
						{
							icon: signalLevel(device.rssi),
							text: t('views.networkBluetooth.signal').replace('{0}', () => String(device.rssi)),
						},
					]
				: [],
	};
}

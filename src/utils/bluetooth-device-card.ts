import type { DeviceInfo } from '@vasakgroup/plugin-bluetooth-manager';
import { batteryIcon } from './bluetooth-battery';
import { deviceKindKey } from './bluetooth-device-kind';
import { signalLevel } from './bluetooth-signal';

/**
 * Las propiedades de la tarjeta a partir de un dispositivo de BlueZ.
 *
 * Es una función pura y vive fuera de la vista para poder probarla sin Tauri y
 * sin montar nada: lo único que era nuestro en esa vista es esta traducción de
 * un dispositivo de BlueZ a lo que la `DeviceCard` de la librería muestra.
 *
 * `metadata` dice **qué es** el dispositivo —auricular, ratón, teléfono—, a
 * partir del `Icon` de BlueZ traducido. Antes mostraba el nombre del icono tal
 * cual, y sin icono caía en el alias, que ya es el título de la fila.
 *
 * `extraInfo` lleva, en este orden y sólo lo que el dispositivo informa: la
 * señal, la batería, si está emparejado y si es de confianza. Lo que no viene
 * no se muestra: un dispositivo sin batería no dice «0 %», no dice nada.
 *
 * `extraInfo` va con un tipo propio: la librería declara `ExtraInfo` para esa
 * propiedad pero **no la exporta** en su índice, así que desde afuera no se
 * puede nombrar. La forma `{ icon, text }` es asignable igual. Queda anotado
 * como hueco de la librería, no como algo a resolver acá.
 */
export function deviceCardProps(device: DeviceInfo, t: (key: string) => string) {
	const extraInfo: Array<{ icon?: string; text: string }> = [];

	// `!= null` y no un booleano: 0 dBm es un RSSI válido (y rarísimo), no
	// una ausencia. Sin RSSI la fila no muestra ni icono ni texto.
	//
	// El `t()` del taller no interpola; y el reemplazo va con una función
	// porque `replace` con una cadena interpreta `$&` y compañía.
	if (device.rssi != null) {
		extraInfo.push({
			icon: signalLevel(device.rssi),
			text: t('views.networkBluetooth.signal').replace('{0}', () => String(device.rssi)),
		});
	}

	// Lo mismo con la batería: `battery` falta cuando el dispositivo no publica
	// `org.bluez.Battery1`, y un 0 es una batería agotada, que sí se muestra.
	if (device.battery != null) {
		extraInfo.push({
			icon: batteryIcon(device.battery),
			text: t('views.networkBluetooth.battery').replace('{0}', () => String(device.battery)),
		});
	}

	if (device.paired) {
		extraInfo.push({ icon: 'bluetooth-paired', text: t('views.networkBluetooth.paired') });
	}

	if (device.trusted) {
		extraInfo.push({ icon: 'security-high', text: t('views.networkBluetooth.trusted') });
	}

	return {
		name: device.icon || 'bluetooth',
		title: device.alias || device.name || device.address,
		subtitle: device.address,
		metadata: t(deviceKindKey(device.icon)),
		extraInfo,
	};
}

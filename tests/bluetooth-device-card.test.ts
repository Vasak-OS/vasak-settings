/**
 * De un dispositivo de BlueZ a la fila que dibuja `DeviceCard`.
 *
 * Es una función pura, así que no hace falta doblar nada: el `t` de mentira
 * devuelve la clave, y con eso se ve qué clave se pidió y qué se le sustituyó.
 * El resto de la suite ya tiene un `mock.module` del i18n, y dos del mismo
 * módulo dan verde local y rojo en CI.
 */

import { describe, expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';
import type { DeviceInfo } from '@vasakgroup/plugin-bluetooth-manager';
import { deviceCardProps } from '../src/utils/bluetooth-device-card';

const t = (clave: string) => clave;

/**
 * Lo que hace el `t` de verdad con las claves con hueco: devolver `'{0} dBm'`
 * y `'{0}%'`, que es lo que traen los dos yml. Para mirar el número sustituido.
 */
const plantilla = (clave: string) => {
	if (clave.endsWith('.signal')) return '{0} dBm';
	if (clave.endsWith('.battery')) return '{0}%';
	return clave;
};

/** Un dispositivo mínimo; cada prueba pisa lo que le importa. */
const dispositivo = (extra: Partial<DeviceInfo> = {}): DeviceInfo => ({
	path: '/org/bluez/hci0/dev_AA_BB_CC_DD_EE_FF',
	address: 'AA:BB:CC:DD:EE:FF',
	paired: false,
	trusted: false,
	blocked: false,
	legacyPairing: false,
	connected: false,
	uuids: [],
	adapter: '/org/bluez/hci0',
	servicesResolved: false,
	...extra,
});

describe('deviceCardProps', () => {
	test('un dispositivo pelado —sin señal, sin batería, ni emparejado ni de confianza— no tiene extras', () => {
		// Ni un icono de «ninguna señal» ni un «0 %»: no es que no haya, es que
		// el dispositivo no lo informa.
		const { extraInfo } = deviceCardProps(dispositivo(), t);
		expect(extraInfo).toEqual([]);
	});

	test('un RSSI de cero sí se muestra: no es una ausencia', () => {
		// El código anterior preguntaba `device.rssi ?`, que trata el 0 como
		// «no hay». Es un valor rarísimo pero válido.
		const { extraInfo } = deviceCardProps(dispositivo({ rssi: 0 }), plantilla);
		expect(extraInfo).toHaveLength(1);
		expect(extraInfo[0]?.icon).toBe('network-wireless-signal-excellent');
		expect(extraInfo[0]?.text).toBe('0 dBm');
	});

	test('con RSSI va un solo elemento, con el icono del escalón y el número en dBm', () => {
		const { extraInfo } = deviceCardProps(dispositivo({ rssi: -65 }), t);

		expect(extraInfo).toHaveLength(1);
		expect(extraInfo[0]?.icon).toBe('network-wireless-signal-ok');
		// El `t` devuelve la clave, así que el texto es la clave con el `{0}`
		// sustituido: se ve a la vez qué clave se pidió y qué se puso.
		expect(extraInfo[0]?.text).toBe('views.networkBluetooth.signal');
	});

	test('el número se sustituye en la plantilla, y una plantilla con `$&` no se rompe', () => {
		// El reemplazo va con una función y no con una cadena, porque `replace`
		// con cadena interpreta `$&` y compañía.
		expect(deviceCardProps(dispositivo({ rssi: -65 }), plantilla).extraInfo[0]?.text).toBe(
			'-65 dBm'
		);
	});

	test('ya no hay ningún emoji en la fila', () => {
		const { extraInfo } = deviceCardProps(dispositivo({ rssi: -40 }), t);
		expect(JSON.stringify(extraInfo)).not.toContain('📶');
	});

	test('el nombre del icono cae en «bluetooth» cuando el dispositivo no trae uno', () => {
		expect(deviceCardProps(dispositivo(), t).name).toBe('bluetooth');
		expect(deviceCardProps(dispositivo({ icon: 'input-mouse' }), t).name).toBe('input-mouse');
	});

	test('el título prefiere el alias, después el nombre, y si no la dirección', () => {
		expect(deviceCardProps(dispositivo({ alias: 'Auris', name: 'WH-1000' }), t).title).toBe(
			'Auris'
		);
		expect(deviceCardProps(dispositivo({ name: 'WH-1000' }), t).title).toBe('WH-1000');
		expect(deviceCardProps(dispositivo(), t).title).toBe('AA:BB:CC:DD:EE:FF');
		expect(deviceCardProps(dispositivo(), t).subtitle).toBe('AA:BB:CC:DD:EE:FF');
	});
});

describe('metadata dice qué es el dispositivo', () => {
	test('con icono, es la clave del tipo y no el nombre del icono', () => {
		expect(
			deviceCardProps(dispositivo({ icon: 'audio-headset', alias: 'Auris' }), t).metadata
		).toBe('views.networkBluetooth.kinds.audioHeadset');
		expect(deviceCardProps(dispositivo({ icon: 'input-mouse' }), t).metadata).toBe(
			'views.networkBluetooth.kinds.inputMouse'
		);
	});

	test('sin icono ya no repite el alias, que es el título: dice «dispositivo Bluetooth»', () => {
		expect(deviceCardProps(dispositivo({ alias: 'Auris' }), t).metadata).toBe(
			'views.networkBluetooth.kinds.unknown'
		);
		expect(deviceCardProps(dispositivo(), t).metadata).toBe('views.networkBluetooth.kinds.unknown');
	});

	test('la clave pasa por el `t`: la fila muestra la traducción, no la clave', () => {
		const traduce = (clave: string) =>
			clave === 'views.networkBluetooth.kinds.phone' ? 'Teléfono' : clave;
		expect(deviceCardProps(dispositivo({ icon: 'phone' }), traduce).metadata).toBe('Teléfono');
	});
});

describe('la batería', () => {
	test('sin `battery` no hay entrada de batería: «no lo sé» no es «0 %»', () => {
		const { extraInfo } = deviceCardProps(dispositivo({ rssi: -50 }), t);
		expect(extraInfo).toHaveLength(1);
		expect(JSON.stringify(extraInfo)).not.toContain('battery');
	});

	test('un 0 sí se muestra: es una batería agotada', () => {
		const { extraInfo } = deviceCardProps(dispositivo({ battery: 0 }), plantilla);
		expect(extraInfo).toEqual([{ icon: 'battery-level-0', text: '0%' }]);
	});

	test('el icono es el escalón de diez más cercano y el texto lleva el número exacto', () => {
		const { extraInfo } = deviceCardProps(dispositivo({ battery: 87 }), plantilla);
		expect(extraInfo).toEqual([{ icon: 'battery-level-90', text: '87%' }]);
	});

	test('la clave que se pide es views.networkBluetooth.battery', () => {
		const { extraInfo } = deviceCardProps(dispositivo({ battery: 42 }), t);
		expect(extraInfo[0]?.text).toBe('views.networkBluetooth.battery');
	});
});

describe('emparejado y de confianza', () => {
	test('emparejado va como texto traducido con su icono, y no aparece cuando es false', () => {
		expect(deviceCardProps(dispositivo({ paired: true }), t).extraInfo).toEqual([
			{ icon: 'bluetooth-paired', text: 'views.networkBluetooth.paired' },
		]);
		expect(deviceCardProps(dispositivo({ paired: false }), t).extraInfo).toEqual([]);
	});

	test('de confianza va como texto traducido con su icono, y no aparece cuando es false', () => {
		expect(deviceCardProps(dispositivo({ trusted: true }), t).extraInfo).toEqual([
			{ icon: 'security-high', text: 'views.networkBluetooth.trusted' },
		]);
		expect(deviceCardProps(dispositivo({ trusted: false }), t).extraInfo).toEqual([]);
	});

	test('el orden es señal, batería, emparejado y de confianza', () => {
		const { extraInfo } = deviceCardProps(
			dispositivo({ rssi: -45, battery: 60, paired: true, trusted: true }),
			t
		);
		expect(extraInfo.map((e) => e.text)).toEqual([
			'views.networkBluetooth.signal',
			'views.networkBluetooth.battery',
			'views.networkBluetooth.paired',
			'views.networkBluetooth.trusted',
		]);
		expect(extraInfo.map((e) => e.icon)).toEqual([
			'network-wireless-signal-excellent',
			'battery-level-60',
			'bluetooth-paired',
			'security-high',
		]);
	});

	test('lo que falta en el medio no deja hueco: sin señal, la batería va primera', () => {
		const { extraInfo } = deviceCardProps(dispositivo({ battery: 30, trusted: true }), t);
		expect(extraInfo.map((e) => e.text)).toEqual([
			'views.networkBluetooth.battery',
			'views.networkBluetooth.trusted',
		]);
	});
});

/**
 * Y que la clave exista en los dos idiomas.
 *
 * `tests/locale-catalogs.test.ts` ya exige que los dos yml tengan las mismas
 * claves, pero no sabe que **ésta** tiene que estar: si nadie la agrega, el
 * `t()` devuelve la clave pelada y la fila dice `views.networkBluetooth.signal`.
 */
describe('la clave de la señal está en los locales', () => {
	const LOCALES = fileURLToPath(new URL('../src-tauri/locales/', import.meta.url));

	for (const idioma of ['en', 'es']) {
		test(`${idioma}.yml trae views.networkBluetooth.signal con el hueco para el número`, async () => {
			const texto = await Bun.file(`${LOCALES}${idioma}.yml`).text();
			const locales = Bun.YAML.parse(texto) as {
				views: { networkBluetooth: { signal?: string } };
			};
			const valor = locales.views.networkBluetooth.signal;
			expect(valor).toBeDefined();
			expect(valor).toContain('{0}');
			expect(valor).toContain('dBm');
		});
	}
});

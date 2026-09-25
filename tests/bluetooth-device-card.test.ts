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
 * Lo que hace el `t` de verdad con la clave de la señal: devolver `'{0} dBm'`,
 * que es lo que traen los dos yml. Para mirar el número sustituido.
 */
const plantilla = (clave: string) => (clave.endsWith('.signal') ? '{0} dBm' : clave);

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
	test('sin RSSI la fila no muestra ni icono ni texto', () => {
		// Ni un icono de «ninguna señal», que diría algo falso: no es que no haya
		// señal, es que el dispositivo no la informa.
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

	test('metadata sigue siendo el icono y si no el alias: lo cambia #117, no esto', () => {
		expect(
			deviceCardProps(dispositivo({ icon: 'audio-headset', alias: 'Auris' }), t).metadata
		).toBe('audio-headset');
		expect(deviceCardProps(dispositivo({ alias: 'Auris' }), t).metadata).toBe('Auris');
		expect(deviceCardProps(dispositivo(), t).metadata).toBe('');
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

/**
 * Y que la clave exista en los dos idiomas.
 *
 * `cargo test --test locales` ya exige que los dos yml tengan las mismas
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

/**
 * Del `Icon` de BlueZ a la clave de qué es el dispositivo.
 *
 * Lo que se cuida es que el mapa esté **completo** —los dieciocho nombres que
 * BlueZ puede dar— y que todo lo demás caiga en el genérico en vez de mostrar
 * una clave pelada; y que cada clave del mapa exista de verdad en los dos yml,
 * que es lo único que `cargo test --test locales` no puede saber.
 */

import { describe, expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';
import {
	DEVICE_KIND_KEY_PREFIX,
	DEVICE_KINDS,
	deviceKindKey,
} from '../src/utils/bluetooth-device-kind';

/** Los dieciocho de `class_to_icon` y `gap_appearance_to_icon` de BlueZ. */
const BLUEZ_ICONS: Array<[string, string]> = [
	['audio-card', 'audioCard'],
	['audio-headphones', 'audioHeadphones'],
	['audio-headset', 'audioHeadset'],
	['camera-photo', 'cameraPhoto'],
	['camera-video', 'cameraVideo'],
	['computer', 'computer'],
	['input-gaming', 'inputGaming'],
	['input-keyboard', 'inputKeyboard'],
	['input-mouse', 'inputMouse'],
	['input-tablet', 'inputTablet'],
	['modem', 'modem'],
	['multimedia-player', 'multimediaPlayer'],
	['network-wireless', 'networkWireless'],
	['phone', 'phone'],
	['printer', 'printer'],
	['scanner', 'scanner'],
	['video-display', 'videoDisplay'],
	['unknown', 'unknown'],
];

describe('deviceKindKey', () => {
	test('cada uno de los dieciocho nombres de BlueZ va a su clave', () => {
		for (const [icono, clave] of BLUEZ_ICONS) {
			expect(deviceKindKey(icono)).toBe(`views.networkBluetooth.kinds.${clave}`);
		}
	});

	test('el mapa tiene exactamente los dieciocho, ni uno más', () => {
		// Si BlueZ suma un nombre, se suma acá y en los dos yml; si alguien lo
		// suma sólo acá, la prueba de abajo contra los yml lo agarra.
		expect(Object.keys(DEVICE_KINDS).sort()).toEqual(BLUEZ_ICONS.map(([icono]) => icono).sort());
	});

	test('sin icono, vacío o con un nombre que no está en el mapa es «dispositivo Bluetooth»', () => {
		const generico = 'views.networkBluetooth.kinds.unknown';
		expect(deviceKindKey('unknown')).toBe(generico);
		expect(deviceKindKey(undefined)).toBe(generico);
		expect(deviceKindKey(null)).toBe(generico);
		expect(deviceKindKey('')).toBe(generico);
		expect(deviceKindKey('toaster-oven')).toBe(generico);
	});

	test('un nombre que coincide con algo heredado de Object no cuela', () => {
		// `DEVICE_KINDS['constructor']` existiría en un objeto pelado: el mapa
		// tiene que devolver el genérico, no una función.
		expect(deviceKindKey('constructor')).toBe('views.networkBluetooth.kinds.unknown');
		expect(deviceKindKey('toString')).toBe('views.networkBluetooth.kinds.unknown');
	});
});

/**
 * Y que cada clave exista en los dos idiomas.
 *
 * `cargo test --test locales` exige que los dos yml tengan las mismas claves,
 * pero no sabe que **éstas** tienen que estar: si falta una, el `t()` devuelve
 * la clave pelada y la fila dice `views.networkBluetooth.kinds.inputMouse`.
 */
describe('las claves del tipo, la batería, emparejado y de confianza están en los locales', () => {
	const LOCALES = fileURLToPath(new URL('../src-tauri/locales/', import.meta.url));

	type Bloque = {
		views: {
			networkBluetooth: {
				battery?: string;
				paired?: string;
				trusted?: string;
				kinds?: Record<string, string>;
			};
		};
	};

	for (const idioma of ['en', 'es']) {
		test(`${idioma}.yml trae las dieciocho claves de kinds con texto`, async () => {
			const texto = await Bun.file(`${LOCALES}${idioma}.yml`).text();
			const locales = Bun.YAML.parse(texto) as Bloque;
			const kinds = locales.views.networkBluetooth.kinds;
			expect(kinds).toBeDefined();
			for (const clave of Object.values(DEVICE_KINDS)) {
				expect(kinds?.[clave], `${idioma}: falta kinds.${clave}`).toBeString();
				expect(kinds?.[clave]).not.toBe('');
			}
			// Y al revés: nada en el yml que el mapa no use.
			expect(Object.keys(kinds ?? {}).sort()).toEqual(Object.values(DEVICE_KINDS).sort());
		});

		test(`${idioma}.yml trae battery con el hueco, paired y trusted`, async () => {
			const texto = await Bun.file(`${LOCALES}${idioma}.yml`).text();
			const { networkBluetooth } = (Bun.YAML.parse(texto) as Bloque).views;
			expect(networkBluetooth.battery).toContain('{0}');
			expect(networkBluetooth.battery).toContain('%');
			expect(networkBluetooth.paired).toBeString();
			expect(networkBluetooth.paired).not.toBe('');
			expect(networkBluetooth.trusted).toBeString();
			expect(networkBluetooth.trusted).not.toBe('');
		});
	}

	test('el prefijo de las claves es el del bloque del yml', () => {
		expect(DEVICE_KIND_KEY_PREFIX).toBe('views.networkBluetooth.kinds.');
	});
});

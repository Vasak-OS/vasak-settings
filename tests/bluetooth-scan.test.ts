/**
 * El escaneo de Bluetooth: de foto con cronómetro a flujo abierto.
 *
 * Antes `scanDevices` sacaba una foto: `startScan` → esperar 6 s → `stopScan` →
 * una sola `listDevices`. La ventana era corta y `stopScan` la cerraba, así que
 * los dispositivos BLE que anuncian despacio no llegaban a aparecer. Acá se
 * prueba el comportamiento nuevo: el escaneo queda **abierto**, no se detiene
 * por un cronómetro, cada evento `bluetooth-change` suma en vivo y sólo se
 * cierra al salir de la vista.
 *
 * El composable recibe sus dependencias por parámetro —como
 * `useGameModeSettings`—, así no hace falta ningún `mock.module`, que da verde o
 * rojo según el orden de la corrida.
 */

import { describe, expect, mock, test } from 'bun:test';
import type { Event } from '@tauri-apps/api/event';
import type {
	AdapterInfo,
	BluetoothChange,
	DeviceInfo,
} from '@vasakgroup/plugin-bluetooth-manager';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { type BluetoothDeps, useBluetooth } from '../src/composables/useBluetooth';

const ADAPTER: AdapterInfo = {
	path: '/org/bluez/hci0',
	address: '00:11:22:33:44:55',
	name: 'hci0',
	alias: 'hci0',
	class: 0,
	powered: true,
	discoverable: false,
	discoverableTimeout: 0,
	pairable: true,
	pairableTimeout: 0,
	discovering: false,
	uuids: [],
};

/** Un dispositivo mínimo; sólo importan `path` y `connected`. */
function device(path: string, connected = false): DeviceInfo {
	return {
		path,
		address: path,
		paired: false,
		trusted: false,
		blocked: false,
		legacyPairing: false,
		connected,
		uuids: [],
		adapter: ADAPTER.path,
		servicesResolved: false,
	};
}

/** La carga de un evento del bus, con el nombre nuevo o el viejo según se pida. */
function changeEvent(payload: Partial<BluetoothChange>): Event<BluetoothChange> {
	return { event: 'bluetooth-change', id: 1, payload: payload as BluetoothChange };
}

function makeDeps(adapter: AdapterInfo | null = { ...ADAPTER }) {
	let handler: ((event: Event<BluetoothChange>) => void) | null = null;
	const unlisten = mock(() => {});

	const deps = {
		getDefaultAdapter: mock(() => Promise.resolve(adapter)),
		listDevices: mock((_path: string) => Promise.resolve<DeviceInfo[]>([])),
		startScan: mock((_path: string) => Promise.resolve()),
		stopScan: mock((_path: string) => Promise.resolve()),
		toggleBluetooth: mock(() => Promise.resolve(true)),
		connectDevice: mock((_path: string) => Promise.resolve()),
		disconnectDevice: mock((_path: string) => Promise.resolve()),
		listen: mock((_event: string, cb: (event: Event<BluetoothChange>) => void) => {
			handler = cb;
			return Promise.resolve(unlisten);
		}),
		t: (key: string) => key,
	} satisfies BluetoothDeps;

	return {
		deps,
		unlisten,
		/** Dispara un evento del bus como si lo mandara el complemento. */
		fire: (payload: Partial<BluetoothChange>) => handler?.(changeEvent(payload)),
	};
}

/** Monta un componente vacío que sólo arma el composable y expone su API. */
function mountBluetooth(deps: BluetoothDeps) {
	let api!: ReturnType<typeof useBluetooth>;
	const wrapper = mount(
		defineComponent({
			setup() {
				api = useBluetooth(deps);
				return () => null;
			},
		})
	);
	return { wrapper, api };
}

describe('el escaneo es un flujo abierto', () => {
	test('arrancar el escaneo no lo detiene por un cronómetro', async () => {
		const { deps } = makeDeps();
		const { wrapper, api } = mountBluetooth(deps);
		await api.start();

		await api.startScanning();

		expect(deps.startScan).toHaveBeenCalledTimes(1);
		expect(deps.startScan).toHaveBeenCalledWith(ADAPTER.path);
		// Lo que antes rompía: un `stopScan` al rato. Ahora no se llama.
		expect(deps.stopScan).not.toHaveBeenCalled();
		// Y el escaneo queda marcado como activo, para el indicador «Buscando…».
		expect(api.isScanning.value).toBe(true);

		wrapper.unmount();
	});

	test('siembra lo ya conocido al arrancar, sin pasar por «sincronizando»', async () => {
		const { deps } = makeDeps();
		deps.listDevices.mockImplementation(() => Promise.resolve([device('/dev/known')]));
		const { wrapper, api } = mountBluetooth(deps);
		await api.start();

		await api.startScanning();

		// Una `listDevices` de siembra, además de la de `start`.
		expect(deps.listDevices).toHaveBeenCalledTimes(2);
		expect(api.availableDevices.value.map((d) => d.path)).toEqual(['/dev/known']);
		// Sembrar no prende «sincronizando»: la vista no parpadea.
		expect(api.loading.value).toBe(false);

		wrapper.unmount();
	});

	test('un «device-added» suma a la lista en vivo', async () => {
		const { deps, fire } = makeDeps();
		deps.listDevices
			.mockImplementationOnce(() => Promise.resolve([device('/dev/a')]))
			.mockImplementation(() => Promise.resolve([device('/dev/a'), device('/dev/b')]));
		const { wrapper, api } = mountBluetooth(deps);
		await api.start();
		expect(api.availableDevices.value.map((d) => d.path)).toEqual(['/dev/a']);

		await fire({ changeType: 'device-added', data: {} });
		await flushPromises();

		expect(api.availableDevices.value.map((d) => d.path)).toEqual(['/dev/a', '/dev/b']);
		// El refresco en vivo no prende «sincronizando».
		expect(api.loading.value).toBe(false);

		wrapper.unmount();
	});

	test('un «device-connected» mueve el dispositivo a conectados en vivo', async () => {
		const { deps, fire } = makeDeps();
		deps.listDevices
			.mockImplementationOnce(() => Promise.resolve([device('/dev/a', false)]))
			.mockImplementation(() => Promise.resolve([device('/dev/a', true)]));
		const { wrapper, api } = mountBluetooth(deps);
		await api.start();

		await fire({ changeType: 'device-connected', data: {} });
		await flushPromises();

		expect(api.connectedDevices.value.map((d) => d.path)).toEqual(['/dev/a']);
		expect(api.availableDevices.value).toEqual([]);

		wrapper.unmount();
	});
});

describe('la clave del evento se lee en camel', () => {
	test('«changeType» refresca; el «change_type» viejo solo, no', async () => {
		const { deps, fire } = makeDeps();
		const { wrapper, api } = mountBluetooth(deps);
		await api.start();
		expect(deps.listDevices).toHaveBeenCalledTimes(1);

		// Con el nombre nuevo refresca.
		await fire({ changeType: 'device-added', data: {} });
		await flushPromises();
		expect(deps.listDevices).toHaveBeenCalledTimes(2);

		// Con sólo el nombre viejo —el que el complemento va a sacar— no refresca.
		await fire({ change_type: 'device-added', data: {} } as Partial<BluetoothChange>);
		await flushPromises();
		expect(deps.listDevices).toHaveBeenCalledTimes(2);

		wrapper.unmount();
	});

	test('un cambio de ruido —RSSI, batería— no refresca', async () => {
		const { deps, fire } = makeDeps();
		const { wrapper, api } = mountBluetooth(deps);
		await api.start();

		await fire({ changeType: 'device-property-changed', data: {} });
		await flushPromises();

		expect(deps.listDevices).toHaveBeenCalledTimes(1);
		wrapper.unmount();
	});
});

describe('la lista no parpadea a vacío', () => {
	test('si un refresco en vivo falla, conserva lo que había', async () => {
		const { deps, fire } = makeDeps();
		deps.listDevices
			.mockImplementationOnce(() => Promise.resolve([device('/dev/a')]))
			.mockImplementation(() => Promise.reject(new Error('bus caído')));
		const { wrapper, api } = mountBluetooth(deps);
		await api.start();
		expect(api.availableDevices.value.map((d) => d.path)).toEqual(['/dev/a']);

		await fire({ changeType: 'device-added', data: {} });
		await flushPromises();

		// No se vació: sigue lo que había, y sin marcar error ni carga.
		expect(api.availableDevices.value.map((d) => d.path)).toEqual(['/dev/a']);
		expect(api.loading.value).toBe(false);
		expect(api.error.value).toBe('');

		wrapper.unmount();
	});
});

describe('el escaneo se detiene a pedido y al salir', () => {
	test('detener llama a stopScan y apaga la bandera', async () => {
		const { deps } = makeDeps();
		const { wrapper, api } = mountBluetooth(deps);
		await api.start();
		await api.startScanning();

		await api.stopScanning();

		expect(deps.stopScan).toHaveBeenCalledTimes(1);
		expect(deps.stopScan).toHaveBeenCalledWith(ADAPTER.path);
		expect(api.isScanning.value).toBe(false);

		wrapper.unmount();
	});

	test('al desmontar suelta el oyente y cierra un escaneo abierto', async () => {
		const { deps, unlisten } = makeDeps();
		const { wrapper, api } = mountBluetooth(deps);
		await api.start();
		await api.startScanning();
		expect(deps.stopScan).not.toHaveBeenCalled();

		wrapper.unmount();
		await flushPromises();

		expect(unlisten).toHaveBeenCalledTimes(1);
		expect(deps.stopScan).toHaveBeenCalledTimes(1);
		expect(deps.stopScan).toHaveBeenCalledWith(ADAPTER.path);
	});

	test('sin escaneo abierto, desmontar no llama a stopScan', async () => {
		const { deps, unlisten } = makeDeps();
		const { wrapper, api } = mountBluetooth(deps);
		await api.start();

		wrapper.unmount();
		await flushPromises();

		expect(unlisten).toHaveBeenCalledTimes(1);
		expect(deps.stopScan).not.toHaveBeenCalled();
	});
});

describe('con el chip apagado', () => {
	test('no arranca el escaneo y deja las listas vacías', async () => {
		const { deps } = makeDeps({ ...ADAPTER, powered: false });
		const { wrapper, api } = mountBluetooth(deps);
		await api.start();

		await api.startScanning();

		expect(deps.startScan).not.toHaveBeenCalled();
		expect(api.isScanning.value).toBe(false);
		expect(api.isBluetoothOn.value).toBe(false);
		expect(api.availableDevices.value).toEqual([]);

		wrapper.unmount();
	});
});

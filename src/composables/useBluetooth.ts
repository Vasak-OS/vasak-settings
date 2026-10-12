import { type Event, listen } from '@tauri-apps/api/event';
import {
	type AdapterInfo,
	type BluetoothChange,
	connectDevice,
	type DeviceInfo,
	disconnectDevice,
	getDefaultAdapter,
	listDevices,
	startScan,
	stopScan,
	toggleBluetooth,
} from '@vasakgroup/plugin-bluetooth-manager';
import { computed, onUnmounted, type Ref, ref } from 'vue';
import { shouldRefresh } from '@/utils/bluetooth-change';

/**
 * Toda la lógica de «Red y Bluetooth»: el adaptador, las listas de
 * dispositivos y, sobre todo, el escaneo.
 *
 * Vive en un composable y no dentro de la vista por lo mismo que
 * `useGameModeSettings`: recibe sus dependencias por parámetro, así se prueba
 * sin `mock.module` —un segundo doble del mismo módulo gana o pierde según el
 * orden de la corrida— y sin montar la vista entera.
 *
 * # El escaneo es un flujo abierto, no una foto
 *
 * Antes el escaneo era una foto con cronómetro: `startScan` → esperar 6 s →
 * `stopScan` → una sola `listDevices`. La ventana era corta y `stopScan` la
 * cerraba, así que los dispositivos BLE que anuncian despacio no llegaban a
 * aparecer —«dura poco y no encuentra»—, mientras `bluetoothctl` sí los veía.
 *
 * Ahora `startScanning` arranca el descubrimiento y lo deja **corriendo**: no
 * hay cronómetro ni `stopScan` por reloj. Se siembra lo ya conocido con una
 * `listDevices` y después cada dispositivo que BlueZ descubre entra por el
 * evento `bluetooth-change`, en vivo. El escaneo sólo se detiene a pedido —el
 * botón— o al salir de la vista (`dispose`).
 */

/** Lo que el composable necesita del exterior; se dobla en las pruebas. */
export interface BluetoothDeps {
	getDefaultAdapter: typeof getDefaultAdapter;
	listDevices: typeof listDevices;
	startScan: typeof startScan;
	stopScan: typeof stopScan;
	toggleBluetooth: typeof toggleBluetooth;
	connectDevice: typeof connectDevice;
	disconnectDevice: typeof disconnectDevice;
	/**
	 * `listen` de Tauri, con la firma concreta que se usa acá: el genérico no se
	 * deja doblar con un `mock` sin pelearse con la varianza, y acá siempre es
	 * `BluetoothChange`.
	 */
	listen: (event: string, handler: (event: Event<BluetoothChange>) => void) => Promise<() => void>;
	/** El `t` del i18n, ya resuelto por la vista. No interpola: va con `.replace`. */
	t: (key: string) => string;
}

/** Las de verdad, para que la vista no tenga que armarlas a mano. */
export const bluetoothApi = {
	getDefaultAdapter,
	listDevices,
	startScan,
	stopScan,
	toggleBluetooth,
	connectDevice,
	disconnectDevice,
	listen,
};

export function useBluetooth(deps: BluetoothDeps) {
	const { t } = deps;

	const connectedDevices: Ref<DeviceInfo[]> = ref([]);
	const availableDevices: Ref<DeviceInfo[]> = ref([]);
	const defaultAdapter = ref<AdapterInfo | null>(null);
	const loading = ref(true);
	const isTogglingBluetooth = ref(false);
	const isScanning = ref(false);
	const error = ref('');

	let unlistenBluetooth: (() => void) | null = null;

	const isBluetoothOn = computed(() => defaultAdapter.value?.powered ?? false);

	/**
	 * Lee el adaptador y rearma las dos listas.
	 *
	 * `silent` es para los refrescos en vivo: no pasa la vista por
	 * «sincronizando» —que la haría parpadear con cada evento— y, ante un error,
	 * conserva lo que ya había en vez de vaciar a cero.
	 */
	async function readDevices(silent = false) {
		defaultAdapter.value = await deps.getDefaultAdapter();

		if (!defaultAdapter.value?.powered) {
			connectedDevices.value = [];
			availableDevices.value = [];
			loading.value = false;
			return;
		}

		if (!silent) loading.value = true;
		try {
			const allDevices = await deps.listDevices(defaultAdapter.value.path);
			connectedDevices.value = allDevices.filter((d) => d.connected);
			availableDevices.value = allDevices.filter((d) => !d.connected);
		} catch (err) {
			console.error('[BT] Error al leer dispositivos:', err);
			// En vivo conservamos lo que había para no parpadear a vacío.
			if (!silent) {
				connectedDevices.value = [];
				availableDevices.value = [];
			}
		} finally {
			if (!silent) loading.value = false;
		}
	}

	/** El refresco «ruidoso»: al abrir y al encender, puede mostrar «sincronizando». */
	const refreshDevices = () => readDevices(false);

	async function toggleBT() {
		isTogglingBluetooth.value = true;
		error.value = '';
		try {
			await deps.toggleBluetooth();
			// Una pequeña espera ayuda a que el bus dbus recupere el estado.
			await new Promise((r) => setTimeout(r, 600));
			await refreshDevices();
		} catch (err) {
			error.value = t('views.networkBluetooth.errors.toggle').replace('{0}', String(err));
		} finally {
			isTogglingBluetooth.value = false;
		}
	}

	/**
	 * Arranca el escaneo y lo deja abierto. Siembra lo ya conocido sin parpadear;
	 * lo que BlueZ descubra después llega por `bluetooth-change`.
	 */
	async function startScanning() {
		if (!defaultAdapter.value?.powered || isScanning.value) return;

		isScanning.value = true;
		error.value = '';
		try {
			await deps.startScan(defaultAdapter.value.path);
			await readDevices(true);
		} catch (err) {
			isScanning.value = false;
			error.value = t('views.networkBluetooth.errors.scan').replace('{0}', String(err));
		}
	}

	/** Detiene el escaneo. Sólo a pedido o al salir, nunca por un cronómetro corto. */
	async function stopScanning() {
		if (!isScanning.value) return;

		isScanning.value = false;
		const path = defaultAdapter.value?.path;
		if (!path) return;
		try {
			await deps.stopScan(path);
		} catch (err) {
			console.error('[BT] Error al detener el escaneo:', err);
		}
	}

	async function connect(device: DeviceInfo) {
		try {
			await deps.connectDevice(device.path);
		} catch (err) {
			error.value = t('views.networkBluetooth.errors.connect')
				.replace('{0}', String(device.alias || device.name))
				.replace('{1}', String(err));
		}
	}

	async function disconnect(device: DeviceInfo) {
		try {
			await deps.disconnectDevice(device.path);
		} catch (err) {
			error.value = t('views.networkBluetooth.errors.disconnect').replace('{0}', String(err));
		}
	}

	/**
	 * Un evento del bus refresca en vivo, sin parpadeo. Qué cambios tocan lo que
	 * se ve lo decide `shouldRefresh`, que lee `changeType` y no el nombre viejo.
	 */
	async function handleBluetoothChange(event: Event<BluetoothChange>) {
		if (shouldRefresh(event.payload)) {
			await readDevices(true);
		}
	}

	/** Lee el estado inicial y se queda escuchando los cambios del bus. */
	async function start() {
		await refreshDevices();
		unlistenBluetooth = await deps.listen('bluetooth-change', handleBluetoothChange);
	}

	/** Suelta el oyente y cierra un escaneo que haya quedado abierto. */
	async function dispose() {
		if (unlistenBluetooth) {
			unlistenBluetooth();
			unlistenBluetooth = null;
		}
		if (isScanning.value) await stopScanning();
	}

	onUnmounted(() => {
		void dispose();
	});

	return {
		connectedDevices,
		availableDevices,
		defaultAdapter,
		loading,
		isTogglingBluetooth,
		isScanning,
		error,
		isBluetoothOn,
		start,
		dispose,
		refreshDevices,
		toggleBT,
		startScanning,
		stopScanning,
		connect,
		disconnect,
		handleBluetoothChange,
	};
}

<script lang="ts" setup>
import { listen } from '@tauri-apps/api/event';
import {
	type AdapterInfo,
	connectDevice,
	disconnectDevice,
	getDefaultAdapter,
	listDevices,
	startScan,
	stopScan,
	toggleBluetooth,
} from '@vasakgroup/plugin-bluetooth-manager';
import { computed, onMounted, onUnmounted, type Ref, ref } from 'vue';
import BluetoothDeviceCard from '@/components/cards/BluetoothDeviceCard.vue';
import AlertMessage from '@/components/ui/AlertMessage.vue';
import EmptyStateBox from '@/components/ui/EmptyStateBox.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import SwitchToggle from '@/components/ui/SwitchToggle.vue';

// --- Estado ---
const connectedDevices: Ref<any[]> = ref([]);
const availableDevices: Ref<any[]> = ref([]);
const isTogglingBluetooth = ref(false);
const defaultAdapter = ref<AdapterInfo | null>(null);
const loading = ref(true);
const isScanning = ref(false);
const error = ref('');

let unlistenBluetooth: (() => void) | null = null;

// --- Funciones Computadas ---
const isBluetoothOn = computed(() => defaultAdapter.value?.powered ?? false);

// --- Lógica del Adaptador y Refresco ---
const toggleBT = async () => {
	isTogglingBluetooth.value = true;
	error.value = '';
	try {
		await toggleBluetooth();
		// Una pequeña espera ayuda a que el bus dbus recupere el estado
		await new Promise((r) => setTimeout(r, 600));
		await refreshDevices();
	} catch (err) {
		error.value = `Error alternando Bluetooth: ${err}`;
	} finally {
		isTogglingBluetooth.value = false;
	}
};

const refreshDevices = async () => {
	defaultAdapter.value = await getDefaultAdapter();

	console.log(
		'[BT] Adapter:',
		defaultAdapter.value?.path,
		'powered:',
		defaultAdapter.value?.powered
	);

	if (!defaultAdapter.value?.powered) {
		connectedDevices.value = [];
		availableDevices.value = [];
		loading.value = false;
		return;
	}

	loading.value = true;
	try {
		const allDevices = await listDevices(defaultAdapter.value.path);
		console.log('[BT] Total devices from listDevices:', allDevices.length, allDevices);
		connectedDevices.value = allDevices.filter((d) => d.connected);
		availableDevices.value = allDevices.filter((d) => !d.connected);
	} catch (err) {
		console.error('[BT] Error refreshing devices:', err);
		connectedDevices.value = [];
		availableDevices.value = [];
	} finally {
		loading.value = false;
	}
};

const scanDevices = async () => {
	if (!defaultAdapter.value?.powered) return;

	isScanning.value = true;
	error.value = '';
	try {
		await startScan(defaultAdapter.value.path);
		await new Promise((r) => setTimeout(r, 6000));
		await stopScan(defaultAdapter.value.path);
		await refreshDevices();
	} catch (err) {
		try {
			await stopScan(defaultAdapter.value.path);
		} catch {}
		error.value = `Error buscando dispositivos: ${err}`;
	} finally {
		isScanning.value = false;
	}
};

const connect = async (device: any) => {
	try {
		await connectDevice(device.path);
	} catch (err) {
		error.value = `Error conectando a ${device.alias || device.name}: ${err}`;
	}
};

const disconnect = async (device: any) => {
	try {
		await disconnectDevice(device.path);
	} catch (err) {
		error.value = `Error desconectando: ${err}`;
	}
};

// --- Manejo unificado de eventos de sistema ---
// Para mantener la UI rápida reconstruimos las listas cuando hay un evento
const handleBluetoothChange = async (event: any) => {
	const { change_type } = event.payload;
	// Refrescar el estado de forma general cuando cambia alguna propiedad local
	if (
		change_type === 'adapter-property-changed' ||
		change_type === 'device-added' ||
		change_type === 'device-removed' ||
		change_type === 'device-connected' ||
		change_type === 'device-disconnected'
	) {
		await refreshDevices();
	}
};

onMounted(async () => {
	await refreshDevices();
	unlistenBluetooth = await listen('bluetooth-change', handleBluetoothChange);
});

onUnmounted(() => {
	if (unlistenBluetooth) unlistenBluetooth();
});
</script>

<template>
	<div class="flex min-h-full flex-col gap-4 pb-4">
		<PageHeader
			section="Conectividad"
			title="Bluetooth"
			description="Empareja y administra tus dispositivos inalámbricos."
		>
			<template #actions>
				<div class="flex items-center gap-3 rounded-corner border border-ui-border bg-ui-surface/60 px-4 py-2">
					<span class="text-sm font-medium">{{ isBluetoothOn ? 'Encendido' : 'Apagado' }}</span>
					<SwitchToggle
						:is-on="isBluetoothOn"
						:disabled="isTogglingBluetooth"
						@toggle="toggleBT"
					/>
				</div>
			</template>
		</PageHeader>

		<AlertMessage v-if="error" :message="error" tone="error" />

		<!-- Estado Apagado -->
		<div v-if="!isBluetoothOn && !loading && !isTogglingBluetooth" class="grid flex-1 place-items-center rounded-corner border border-dashed border-ui-border bg-ui-surface/20 p-6">
			<div class="text-center text-tx-muted">
				<div class="mx-auto mb-3 h-12 w-12 rounded-full bg-ui-surface flex items-center justify-center border border-ui-border">
					<svg class="h-6 w-6 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
					</svg>
				</div>
				<p class="text-base font-medium text-tx-primary">Bluetooth está apagado</p>
				<p class="text-sm mt-1">Habilita el chip Bluetooth para buscar dispositivos.</p>
			</div>
		</div>

		<!-- Estado Cargando -->
		<EmptyStateBox v-else-if="loading || isTogglingBluetooth" message="Sincronizando estado del dispositivo de radio..." padding="lg" />

		<!-- Estado Listando Dispositivos -->
		<template v-else>
			<div class="grid gap-4 xl:grid-cols-2">
				<!-- Conectados -->
				<SectionCard>
					<h3 class="mb-4 text-lg font-medium text-tx-primary flex items-center justify-between">
						Dispositivos Conectados
						<span class="text-xs text-tx-muted rounded bg-ui-surface/50 px-2 py-0.5 border border-ui-border">
							{{ connectedDevices.length }}
						</span>
					</h3>
					
					<EmptyStateBox v-if="connectedDevices.length === 0" message="No hay dispositivos conectados" />
					
					<ul v-else class="flex flex-col gap-1">
						<li v-for="dev in connectedDevices" :key="dev.path">
							<BluetoothDeviceCard
								:device="dev"
								action-label="Desconectar"
								connected
								@action="disconnect(dev)"
							/>
						</li>
					</ul>
				</SectionCard>

				<!-- Disponibles -->
				<SectionCard>
					<div class="mb-4 flex items-center justify-between">
						<h3 class="text-lg font-medium text-tx-primary">Disponibles</h3>
						
						<button
							class="flex items-center justify-center rounded p-1.5 transition-colors hover:bg-ui-surface border-transparent border hover:border-ui-border"
							:class="isScanning ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'"
							@click="scanDevices"
							:disabled="isScanning"
							title="Escanear"
						>
							<svg class="h-4 w-4 text-tx-muted" :class="{ 'animate-spin text-primary': isScanning }" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
							</svg>
						</button>
					</div>

					<EmptyStateBox v-if="availableDevices.length === 0" message="No se encontraron dispositivos en el área" />
					
					<ul v-else class="flex flex-col gap-1 max-h-[50vh] overflow-y-auto pr-1">
						<li v-for="dev in availableDevices" :key="dev.path">
							<BluetoothDeviceCard
								:device="dev"
								action-label="Conectar"
								@action="connect(dev)"
							/>
						</li>
					</ul>
				</SectionCard>
			</div>
		</template>
	</div>
</template>

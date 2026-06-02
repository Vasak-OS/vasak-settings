<script setup lang="ts">
import { listen } from '@tauri-apps/api/event';
import { computed, nextTick, onMounted, onUnmounted, type Ref, ref } from 'vue';
import AlertMessage from '@/components/ui/AlertMessage.vue';
import EmptyStateBox from '@/components/ui/EmptyStateBox.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import StatTile from '@/components/ui/StatTile.vue';
import SwitchToggle from '@/components/ui/SwitchToggle.vue';
import { useReactiveSymbol } from '@/composables/useReactiveIcon';
import {
	connectToWifi,
	getCurrentNetworkState,
	getNetworkInterfaces,
	getNetworkStats,
	getWirelessEnabled,
	isWirelessAvailable,
	listWifiNetworks,
	type NetworkInfo,
	type NetworkStats,
	rescanWifi,
	setWirelessEnabled,
	type WiFiConnectionConfig,
} from '@/services/network.service';

const wifiEnabled = ref(true);
const wifiAvailable = ref(true);
const loading = ref(false);
const availableNetworks: Ref<NetworkInfo[]> = ref([]);
const wifiStatus = ref('Verificando...');
const ethernetStatus = ref('Verificando...');
const isConnecting = ref(false);
const isRefreshing = ref(false);
const selectedNetwork = ref<NetworkInfo | null>(null);
const wifiPassword = ref('');
const showPasswordDialog = ref(false);
const error = ref('');
const [currentNetworkIcon, updateCurrentIcon] = useReactiveSymbol(() => {
	if (currentConnectedNetwork.value?.icon) {
		return currentConnectedNetwork.value.icon;
	}
	return 'network-wireless-disconnected-symbolic';
});
const networkStats = ref<NetworkStats | null>(null);
const networkInterfaces = ref<string[]>([]);

let unlistenNetwork: (() => void) | null = null;

const currentConnectedNetwork = computed(
	() => availableNetworks.value.find((network) => network.is_connected) || null
);

const getNetworkName = (network: NetworkInfo): string => {
	return network.ssid || network.name || 'Red sin nombre';
};

const getNetworkSecurity = (network: NetworkInfo): string => {
	return network.security_type || 'Abierta';
};

const updateEthernetStatus = (state: NetworkInfo | null) => {
	if (!state) {
		ethernetStatus.value = 'Desconocido';
		return;
	}

	const isEthernet = state.connection_type?.toLowerCase() === 'ethernet';
	if (isEthernet && state.is_connected) {
		ethernetStatus.value = 'Conectado';
		return;
	}

	if (isEthernet && !state.is_connected) {
		ethernetStatus.value = 'Desconectado';
		return;
	}

	ethernetStatus.value = 'Sin enlace activo';
};

const formatBytesPerSecond = (bytes: number): string => {
	if (!Number.isFinite(bytes) || bytes <= 0) return '0 B/s';
	const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
	let value = bytes;
	let idx = 0;
	while (value >= 1024 && idx < units.length - 1) {
		value /= 1024;
		idx += 1;
	}
	return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[idx]}`;
};

const refreshNetworkTelemetry = async () => {
	try {
		networkStats.value = await getNetworkStats();
		console.log('Network stats fetched:', networkStats.value);
	} catch (err) {
		console.error('Error fetching network stats:', err);
		networkStats.value = null;
	}

	try {
		networkInterfaces.value = await getNetworkInterfaces();
		console.log('Network interfaces fetched:', networkInterfaces.value);
	} catch (err) {
		console.error('Error fetching network interfaces:', err);
		networkInterfaces.value = [];
	}
};

const refreshEthernetStatus = async () => {
	try {
		const state = await getCurrentNetworkState();
		updateEthernetStatus(state);
	} catch (statusError) {
		console.error('Error fetching ethernet status:', statusError);
		ethernetStatus.value = 'Desconocido';
	}
};

const refreshNetworks = async () => {
	if (!wifiEnabled.value || !wifiAvailable.value) return;
	isRefreshing.value = true;
	loading.value = true;
	try {
		availableNetworks.value = await listWifiNetworks();
		await updateCurrentIcon();
		await refreshNetworkTelemetry();
	} catch (scanError) {
		error.value = `Error actualizando redes: ${String(scanError)}`;
	} finally {
		loading.value = false;
		isRefreshing.value = false;
	}
};

const triggerRescan = async () => {
	if (!wifiEnabled.value || !wifiAvailable.value) return;
	isRefreshing.value = true;
	loading.value = true;
	error.value = '';
	try {
		availableNetworks.value = await rescanWifi();
		await updateCurrentIcon();
		await refreshNetworkTelemetry();
	} catch (scanError) {
		error.value = `Error escaneando redes: ${String(scanError)}`;
	} finally {
		loading.value = false;
		isRefreshing.value = false;
	}
};

const checkWirelessStatus = async () => {
	try {
		error.value = '';
		const available = await isWirelessAvailable();
		wifiAvailable.value = available;

		if (available) {
			const enabled = await getWirelessEnabled();
			wifiEnabled.value = enabled;
			wifiStatus.value = enabled ? 'Encendido' : 'Apagado';

			if (enabled) {
				await refreshNetworks();
			} else {
				availableNetworks.value = [];
				networkStats.value = null;
				networkInterfaces.value = [];
				await updateCurrentIcon();
			}
		} else {
			wifiStatus.value = 'Hardware no disponible';
			wifiEnabled.value = false;
			availableNetworks.value = [];
			networkStats.value = null;
			networkInterfaces.value = [];
			await updateCurrentIcon();
		}
	} catch (wirelessError) {
		error.value = `Error verificando estado wireless: ${String(wirelessError)}`;
	}
};

const toggleWifi = async () => {
	if (!wifiAvailable.value) return;

	try {
		error.value = '';
		const newState = !wifiEnabled.value;
		await setWirelessEnabled(newState);

		wifiEnabled.value = newState;
		wifiStatus.value = newState ? 'Encendido' : 'Apagado';

		if (newState) {
			await refreshNetworks();
		} else {
			availableNetworks.value = [];
			networkStats.value = null;
			networkInterfaces.value = [];
			await updateCurrentIcon();
		}
	} catch (toggleError) {
		error.value = `Error alternando Wi-Fi: ${String(toggleError)}`;
	}
};

const openConnectDialog = async (network: NetworkInfo) => {
	if (network.is_connected) return;
	selectedNetwork.value = network;
	wifiPassword.value = '';
	error.value = '';

	if (!network.security_type || String(network.security_type).toUpperCase() === 'NONE') {
		await connectToSelectedNetwork('');
		return;
	}

	showPasswordDialog.value = true;
	await nextTick();
};

const connectToSelectedNetwork = async (password: string) => {
	if (!selectedNetwork.value) return;

	isConnecting.value = true;
	error.value = '';
	try {
		await connectToWifi({
			ssid: selectedNetwork.value.ssid,
			password,
			security_type: selectedNetwork.value.security_type,
		} as WiFiConnectionConfig);
		showPasswordDialog.value = false;
		wifiPassword.value = '';
		await refreshNetworks();
		await refreshEthernetStatus();
	} catch (connectError) {
		error.value = `Error al conectar: ${String(connectError)}`;
	} finally {
		isConnecting.value = false;
	}
};

const confirmConnect = async () => {
	await connectToSelectedNetwork(wifiPassword.value);
};

let statsUpdateInterval: ReturnType<typeof setInterval> | null = null;

onMounted(async () => {
	await checkWirelessStatus();
	await refreshEthernetStatus();
	await refreshNetworkTelemetry();

	// Actualizar estadísticas cada 2 segundos para mostrar velocidades en tiempo real
	statsUpdateInterval = setInterval(async () => {
		await refreshNetworkTelemetry();
	}, 2000);

	unlistenNetwork = await listen('network-changed', async () => {
		await checkWirelessStatus();
		await refreshEthernetStatus();
		await refreshNetworkTelemetry();
	});
});

onUnmounted(() => {
	if (unlistenNetwork) unlistenNetwork();
	if (statsUpdateInterval) clearInterval(statsUpdateInterval);
});
</script>

<template>
	<div class="flex min-h-full flex-col gap-4 pb-4">
		<PageHeader
			section="Conectividad"
			title="Wi-Fi"
			description="Administra redes inalámbricas, estado del adaptador y conexión activa."
		>
			<template #actions>
				<div class="flex items-center gap-3 rounded-corner border border-ui-border bg-ui-surface/60 px-4 py-2">
					<div class="flex items-center gap-2">
						<img v-if="currentNetworkIcon" :src="currentNetworkIcon" alt="Red actual" class="h-5 w-5" />
						<span class="text-sm font-medium">
							{{
								currentConnectedNetwork
									? `Conectado a ${getNetworkName(currentConnectedNetwork)}`
									: wifiEnabled
										? 'Sin conexión activa'
										: 'Wi-Fi desactivado'
							}}
						</span>
					</div>
					<SwitchToggle :is-on="wifiEnabled" :disabled="!wifiAvailable" @toggle="toggleWifi" />
				</div>
			</template>
		</PageHeader>

		<AlertMessage v-if="error" :message="error" tone="error" />

		<div class="grid gap-4 xl:grid-cols-3">
			<SectionCard class="xl:col-span-2">
				<div class="mb-4 flex items-center justify-between">
					<h3 class="text-lg font-medium text-tx-primary">Redes Disponibles</h3>
					<button
						class="flex items-center justify-center rounded p-1.5 transition-colors hover:bg-ui-surface border-transparent border hover:border-ui-border"
						:class="isRefreshing || !wifiEnabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'"
						@click="triggerRescan"
						:disabled="isRefreshing || !wifiEnabled"
						title="Escanear redes"
					>
						<svg class="h-4 w-4 text-tx-muted" :class="{ 'animate-spin text-primary': isRefreshing }" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
						</svg>
					</button>
				</div>

				<EmptyStateBox v-if="!wifiAvailable" message="No se detectó hardware inalámbrico disponible" />
				<EmptyStateBox v-else-if="!wifiEnabled" message="Activa Wi-Fi para escanear redes" />
				<EmptyStateBox v-else-if="loading" message="Buscando redes disponibles..." />
				<EmptyStateBox v-else-if="availableNetworks.length === 0" message="No se encontraron redes Wi-Fi" />

				<ul v-else class="flex max-h-[55vh] flex-col gap-2 overflow-y-auto pr-1">
					<li
						v-for="network in availableNetworks"
						:key="network.ssid"
						class="group flex cursor-pointer items-center justify-between gap-3 rounded-corner border px-4 py-3 transition-colors"
						:class="
							network.is_connected
								? 'border-status-success/40 bg-status-success/10'
								: 'border-ui-border bg-ui-surface/40 hover:border-ui-border.hover hover:bg-ui-surface'
						"
						@click="openConnectDialog(network)"
					>
						<div class="flex min-w-0 flex-1 flex-col">
							<span class="truncate text-sm font-medium text-tx-primary">
								{{ getNetworkName(network) }}
							</span>
							<span class="mt-0.5 text-xs text-tx-muted">
								{{ getNetworkSecurity(network) }}
							</span>
						</div>

						<div class="flex items-center gap-2">
							<span
								v-if="network.is_connected"
								class="rounded border border-status-success/30 bg-status-success/10 px-2 py-0.5 text-xs font-semibold text-status-success"
							>
								Conectado
							</span>
							<span
								v-else
								class="rounded border border-ui-border px-2 py-0.5 text-xs text-tx-muted group-hover:border-primary/40 group-hover:text-primary"
							>
								Conectar
							</span>
						</div>
					</li>
				</ul>
			</SectionCard>

			<SectionCard>
				<h3 class="mb-4 text-lg font-medium text-tx-primary">Estado de Red</h3>
				<div class="space-y-3">
					<StatTile label="Wi-Fi" :value="wifiStatus" />
					<StatTile label="Ethernet" :value="ethernetStatus" />
					<StatTile
						label="Interfaz activa"
						:value="networkStats?.interface || 'Sin interfaz detectada'"
						:hint="networkInterfaces.length ? networkInterfaces.join(', ') : 'Sin interfaces reportadas'"
					/>
					<StatTile
						label="Descarga"
						:value="formatBytesPerSecond(networkStats?.download_speed || 0)"
					/>
					<StatTile
						label="Subida"
						:value="formatBytesPerSecond(networkStats?.upload_speed || 0)"
					/>
				</div>
			</SectionCard>
		</div>

		<div
			v-if="showPasswordDialog && selectedNetwork"
			class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
		>
			<div class="w-full max-w-md rounded-corner border border-ui-border bg-ui-bg p-4 shadow-xl">
				<h2 class="text-lg font-semibold text-tx-primary">Conectar a {{ getNetworkName(selectedNetwork) }}</h2>
				<p class="mt-1 text-sm text-tx-muted">Ingresa la contraseña de la red para establecer la conexión.</p>

				<input
					v-model="wifiPassword"
					type="password"
					placeholder="Contraseña"
					class="mt-4 w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm outline-none focus:border-primary"
					@keyup.enter="confirmConnect"
				/>

				<div class="mt-4 flex justify-end gap-2">
					<button
						class="rounded-corner border border-ui-border px-3 py-1.5 text-sm text-tx-muted hover:bg-ui-surface"
						@click="showPasswordDialog = false"
						:disabled="isConnecting"
					>
						Cancelar
					</button>
					<button
						class="rounded-corner border border-primary/20 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/15"
						@click="confirmConnect"
						:disabled="isConnecting"
					>
						{{ isConnecting ? 'Conectando...' : 'Conectar' }}
					</button>
				</div>
			</div>
		</div>
	</div>
</template>

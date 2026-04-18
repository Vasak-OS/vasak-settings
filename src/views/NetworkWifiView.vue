<script setup lang="ts">
import { listen } from '@tauri-apps/api/event';
import {
	connectToWifi,
	getCurrentNetworkState,
	listWifiNetworks,
	type NetworkInfo,
	type WiFiConnectionConfig,
} from '@vasakgroup/plugin-network-manager';
import { getSymbolSource } from '@vasakgroup/plugin-vicons';
import { computed, nextTick, onMounted, onUnmounted, type Ref, ref } from 'vue';
import EmptyStateBox from '@/components/ui/EmptyStateBox.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import StatTile from '@/components/ui/StatTile.vue';
import SwitchToggle from '@/components/ui/SwitchToggle.vue';
import {
	getWirelessEnabled,
	isWirelessAvailable,
	setWirelessEnabled,
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
const currentNetworkIcon = ref('');

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

const updateCurrentIcon = async () => {
	try {
		if (currentConnectedNetwork.value?.icon) {
			currentNetworkIcon.value = await getSymbolSource(currentConnectedNetwork.value.icon);
			return;
		}
		currentNetworkIcon.value = await getSymbolSource('network-wireless-disconnected-symbolic');
	} catch (iconError) {
		console.error('Error loading network icon:', iconError);
	}
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
	} catch (scanError) {
		error.value = `Error actualizando redes: ${String(scanError)}`;
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
				await updateCurrentIcon();
			}
		} else {
			wifiStatus.value = 'Hardware no disponible';
			wifiEnabled.value = false;
			availableNetworks.value = [];
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

onMounted(async () => {
	await checkWirelessStatus();
	await refreshEthernetStatus();
	unlistenNetwork = await listen('network-changed', async () => {
		await checkWirelessStatus();
		await refreshEthernetStatus();
	});
});

onUnmounted(() => {
	if (unlistenNetwork) unlistenNetwork();
});
</script>

<template>
	<div class="flex min-h-full flex-col gap-4 pb-4">
		<header class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
			<div>
				<p class="text-xs uppercase tracking-[0.2em] text-tx-muted">Conectividad</p>
				<h1 class="text-2xl font-semibold">Wi-Fi</h1>
				<p class="text-sm text-tx-muted">Administra redes inalámbricas, estado del adaptador y conexión activa.</p>
			</div>

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
		</header>

		<div v-if="error" class="rounded-corner border border-status-error/40 bg-status-error/10 p-4 text-sm text-status-error">
			{{ error }}
		</div>

		<div class="grid gap-4 xl:grid-cols-3">
			<SectionCard class="xl:col-span-2">
				<div class="mb-4 flex items-center justify-between">
					<h3 class="text-lg font-medium text-tx-primary">Redes Disponibles</h3>
					<button
						class="flex items-center justify-center rounded p-1.5 transition-colors hover:bg-ui-surface border-transparent border hover:border-ui-border"
						:class="isRefreshing || !wifiEnabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'"
						@click="refreshNetworks"
						:disabled="isRefreshing || !wifiEnabled"
						title="Actualizar redes"
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

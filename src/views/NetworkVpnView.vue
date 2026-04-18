<script setup lang="ts">
import { listen } from '@tauri-apps/api/event';
import { getCurrentNetworkState, type NetworkInfo } from '@vasakgroup/plugin-network-manager';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import SectionCard from '@/components/ui/SectionCard.vue';

const networkState = ref<NetworkInfo | null>(null);
const loading = ref(true);
const error = ref('');
let unlistenNetwork: (() => void) | null = null;

const isVpnConnection = computed(() => {
	const connectionType = networkState.value?.connection_type?.toLowerCase() || '';
	return connectionType.includes('vpn');
});

const vpnStatus = computed(() => {
	if (!networkState.value) return 'Desconocido';
	if (isVpnConnection.value && networkState.value.is_connected) return 'Conectada';
	return 'Desconectada';
});

const activeConnectionLabel = computed(() => {
	if (!networkState.value) return 'Sin datos';

	if (isVpnConnection.value) {
		return networkState.value.name || networkState.value.ssid || 'Túnel VPN';
	}

	return networkState.value.ssid || networkState.value.name || 'Sin conexión activa';
});

const refreshNetworkState = async () => {
	loading.value = true;
	error.value = '';
	try {
		networkState.value = await getCurrentNetworkState();
	} catch (stateError) {
		error.value = `Error obteniendo estado de red: ${String(stateError)}`;
	} finally {
		loading.value = false;
	}
};

onMounted(async () => {
	await refreshNetworkState();
	unlistenNetwork = await listen('network-changed', async () => {
		await refreshNetworkState();
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
				<h1 class="text-2xl font-semibold">VPN</h1>
				<p class="text-sm text-tx-muted">Consulta el estado de la red privada virtual y la conexión activa del sistema.</p>
			</div>

			<button
				class="rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-1.5 text-sm text-tx-muted transition-colors hover:bg-ui-surface"
				@click="refreshNetworkState"
				:disabled="loading"
			>
				{{ loading ? 'Actualizando...' : 'Actualizar estado' }}
			</button>
		</header>

		<div v-if="error" class="rounded-corner border border-status-error/40 bg-status-error/10 p-4 text-sm text-status-error">
			{{ error }}
		</div>

		<div class="grid gap-4 xl:grid-cols-3">
			<SectionCard class="xl:col-span-2">
				<h3 class="mb-4 text-lg font-medium text-tx-primary">Estado Actual</h3>

				<div v-if="loading" class="rounded-corner border border-dashed border-ui-border bg-ui-surface/20 py-6 text-center text-sm text-tx-muted">
					Leyendo estado de red...
				</div>

				<div v-else class="space-y-3">
					<div class="rounded-corner border border-ui-border bg-ui-surface/40 px-3 py-2">
						<p class="text-xs uppercase tracking-[0.18em] text-tx-muted">Estado VPN</p>
						<p class="text-sm font-medium" :class="isVpnConnection ? 'text-status-success' : 'text-tx-primary'">
							{{ vpnStatus }}
						</p>
					</div>

					<div class="rounded-corner border border-ui-border bg-ui-surface/40 px-3 py-2">
						<p class="text-xs uppercase tracking-[0.18em] text-tx-muted">Conexión Activa</p>
						<p class="text-sm font-medium text-tx-primary">{{ activeConnectionLabel }}</p>
					</div>

					<div class="rounded-corner border border-ui-border bg-ui-surface/40 px-3 py-2">
						<p class="text-xs uppercase tracking-[0.18em] text-tx-muted">Tipo de Conexión</p>
						<p class="text-sm font-medium text-tx-primary">
							{{ networkState?.connection_type || 'Desconocido' }}
						</p>
					</div>
				</div>
			</SectionCard>

			<SectionCard>
				<h3 class="mb-4 text-lg font-medium text-tx-primary">Ayuda Rápida</h3>
				<div class="space-y-2 text-sm text-tx-muted">
					<p>1. Configura perfiles VPN desde tu cliente de red del sistema.</p>
					<p>2. Conecta o desconecta el túnel desde el administrador de red.</p>
					<p>3. Vuelve aquí para verificar el estado de la conexión.</p>
				</div>
			</SectionCard>
		</div>
	</div>
</template>

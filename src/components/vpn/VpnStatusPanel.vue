<script setup lang="ts">
import { computed } from 'vue';
import StatTile from '@/components/ui/StatTile.vue';
import type { VpnConnectionState, VpnProfile, VpnStatus } from '@/services/network.service';

interface Props {
	vpnStatus: VpnStatus | null;
	activeProfile: VpnProfile | null;
	isLoading: boolean;
}

const props = defineProps<Props>();

const vpnStateLabelComputed = computed(() => {
	const state = props.vpnStatus?.state;
	if (!state) return 'Desconocido';

	const labels: Record<VpnConnectionState, string> = {
		disconnected: 'Desconectada',
		connecting: 'Conectando',
		connected: 'Conectada',
		disconnecting: 'Desconectando',
		failed: 'Fallida',
		unknown: 'Desconocido',
	};

	return labels[state] ?? 'Desconocido';
});
</script>

<template>
	<div class="space-y-3">
		<StatTile label="Estado VPN" :value="vpnStateLabelComputed" />
		<StatTile
			label="Perfil activo"
			:value="activeProfile?.id || vpnStatus?.active_profile_name || 'Sin conexión activa'"
			:hint="vpnStatus?.active_profile_uuid || undefined"
		/>
		<StatTile label="Gateway" :value="vpnStatus?.gateway || 'No disponible'" />
		<StatTile label="IP" :value="vpnStatus?.ip_address || 'No disponible'" />
	</div>
</template>

<script setup lang="ts">
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
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

const { t } = useI18n();
</script>

<template>
	<div class="space-y-3">
		<StatTile :label="t('views.home.cards.vpnState')" :value="vpnStateLabelComputed" />
		<StatTile
			:label="t('views.home.cards.vpnProfile')"
			:value="activeProfile?.id || vpnStatus?.active_profile_name || t('views.networkVpn.noActiveConnection')"
			:hint="vpnStatus?.active_profile_uuid || undefined"
		/>
		<StatTile :label="t('views.home.cards.vpnGateway')" :value="vpnStatus?.gateway || 'No disponible'" />
		<StatTile label="IP" :value="vpnStatus?.ip_address || 'No disponible'" />
	</div>
</template>

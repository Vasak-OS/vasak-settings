<script setup lang="ts">
/**
 * «Red por app»: kill-switch, mapa de conexiones en vivo, reglas por dominio y registro de bloqueos.
 *
 * El mapa se refresca con `permissions-connection-observed`, que el backend
 * reenvía desde la señal `ConnectionObserved`: la señal no trae el destino
 * (viaja por el bus del sistema), así que acá sólo se vuelve a leer.
 */

import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { AlertMessage, Panel } from '@vasakgroup/vue-libvasak';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import FirewallConnections from '@/components/firewall/FirewallConnections.vue';
import FirewallDomainRules from '@/components/firewall/FirewallDomainRules.vue';
import FirewallKillSwitch from '@/components/firewall/FirewallKillSwitch.vue';
import FirewallLog from '@/components/firewall/FirewallLog.vue';
import {
	type BlockedDomain,
	listConnections,
	listDomainRules,
	listPermissions,
	type ObservedConnection,
	type PermissionEntry,
} from '@/services/permissions.service';

const { t } = useI18n();
const entries = ref<PermissionEntry[]>([]);
const connections = ref<ObservedConnection[]>([]);
const rules = ref<BlockedDomain[]>([]);
const errorMessage = ref('');

const names = computed(() =>
	Object.fromEntries(
		entries.value.map((e) => [e.application.binary_path, e.application.display_name])
	)
);

const loadConnections = async () => {
	connections.value = await listConnections().catch(() => connections.value);
};

const load = async () => {
	try {
		entries.value = await listPermissions();
		rules.value = await listDomainRules();
		await loadConnections();
	} catch (error) {
		errorMessage.value = String(error);
	}
};

const fail = (message: string) => {
	errorMessage.value = message;
};

let unlisten: UnlistenFn | undefined;
onMounted(async () => {
	await load();
	unlisten = await listen('permissions-connection-observed', loadConnections);
});
onBeforeUnmount(() => unlisten?.());
</script>

<template>
	<Panel as="article">
		<header>
			<h2 class="text-lg font-medium text-tx-main">{{ t('views.privacySecurity.firewall.title') }}</h2>
			<p class="text-sm text-tx-muted">{{ t('views.privacySecurity.firewall.description') }}</p>
		</header>
		<AlertMessage v-if="errorMessage" tone="error">{{ errorMessage }}</AlertMessage>
		<FirewallKillSwitch :entries="entries" @changed="load" @failed="fail" />
		<FirewallConnections :connections="connections" :names="names" />
		<FirewallDomainRules :entries="entries" :rules="rules" @changed="load" @failed="fail" />
		<FirewallLog />
	</Panel>
</template>

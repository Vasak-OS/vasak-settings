<script setup lang="ts">
/**
 * El kill-switch de red por aplicación: apagar el interruptor le corta todo el
 * egreso. Reusa `setPermission(.., 'network', ..)`, que ya pasa por polkit.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { EmptyState, SwitchToggle } from '@vasakgroup/vue-libvasak';
import { ref } from 'vue';
import AppIcon from '@/components/permissions/AppIcon.vue';
import {
	NETWORK_RESOURCE,
	type PermissionEntry,
	setPermission,
} from '@/services/permissions.service';

defineProps<{ entries: PermissionEntry[] }>();
const emit = defineEmits<{ changed: []; failed: [message: string] }>();

const { t } = useI18n();
const busyPath = ref('');

/** Sin decisión sobre la red, la app sale: «unknown» no es un corte. */
const hasNetwork = (entry: PermissionEntry) => entry.decisions[NETWORK_RESOURCE] !== 'denied';

const toggle = async (entry: PermissionEntry, allowed: boolean) => {
	busyPath.value = entry.application.binary_path;
	try {
		await setPermission(entry.application.binary_path, NETWORK_RESOURCE, allowed);
	} catch (error) {
		// Una autenticación rechazada es lo normal; el estado vuelve a la verdad.
		emit('failed', String(error));
	} finally {
		emit('changed');
		busyPath.value = '';
	}
};
</script>

<template>
	<section class="flex flex-col gap-2">
		<header>
			<h3 class="font-semibold text-tx-main">{{ t('views.privacySecurity.firewall.killSwitch.title') }}</h3>
			<p class="text-sm text-tx-muted">{{ t('views.privacySecurity.firewall.killSwitch.description') }}</p>
		</header>

		<EmptyState
			v-if="entries.length === 0"
			icon=""
			size="sm"
			bordered
			:title="t('views.privacySecurity.firewall.killSwitch.empty')"
		/>

		<ul v-else class="flex flex-col gap-2">
			<li
				v-for="entry in entries"
				:key="entry.application.binary_path"
				class="flex items-center gap-3 rounded-corner-m border border-ui-border bg-ui-surface/70 p-3"
			>
				<AppIcon :name="entry.application.icon" />
				<div class="min-w-0 flex-1">
					<p class="truncate font-medium text-tx-main">{{ entry.application.display_name }}</p>
					<p class="truncate text-xs text-tx-muted" :title="entry.application.binary_path">
						{{ entry.application.binary_path }}
					</p>
				</div>
				<SwitchToggle
					:label="t('views.privacySecurity.firewall.killSwitch.toggle').replace('{0}', entry.application.display_name)"
					:model-value="hasNetwork(entry)"
					:disabled="busyPath === entry.application.binary_path"
					@update:model-value="(value: boolean) => toggle(entry, value)"
				/>
			</li>
		</ul>
	</section>
</template>

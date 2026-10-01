<script setup lang="ts">
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { Panel, type PropertyItem, PropertyList } from '@vasakgroup/vue-libvasak';
import { computed } from 'vue';
import type { GpuInfo, SystemDetails } from '@/types/system';

const props = defineProps<{
	system: SystemDetails;
	gpu: GpuInfo | null;
}>();

const formatUptime = (seconds: number) => {
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);

	if (days > 0) return `${days}d ${hours}h`;
	return `${hours}h`;
};

const { t } = useI18n();

/** Los datos del equipo, como pares de nombre y valor. */
const details = computed<PropertyItem[]>(() => [
	{ label: t('views.home.cards.host'), value: props.system.hostname },
	{ label: t('views.home.cards.kernel'), value: props.system.kernel },
	{ label: t('views.home.cards.operatingSystem'), value: props.system.os_name },
	{ label: t('views.home.cards.display'), value: props.system.display_server },
	{ label: t('views.home.cards.uptime'), value: formatUptime(props.system.uptime_seconds) },
]);
</script>

<template>
	<div class="grid gap-4">
		<Panel as="article">
			<p class="text-xs uppercase tracking-[0.16em] text-tx-muted">{{ t('views.home.cards.system') }}</p>
			<PropertyList class="mt-3" layout="rows" :items="details" />
		</Panel>

		<Panel as="article">
			<p class="text-xs uppercase tracking-[0.16em] text-tx-muted">{{ t('views.home.cards.gpu') }}</p>
			<div v-if="gpu" class="mt-3 space-y-2 text-sm">
				<p class="font-medium">{{ gpu.vendor }}</p>
				<p class="text-tx-muted">{{ gpu.model }}</p>
			</div>
			<p v-else class="mt-3 text-sm text-tx-muted">{{ t('views.home.noGpu') }}</p>
		</Panel>
	</div>
</template>

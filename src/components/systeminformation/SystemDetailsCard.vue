<script setup lang="ts">
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import InfoRow from '@/components/ui/InfoRow.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import type { GpuInfo, SystemDetails } from '@/types/system';

defineProps<{
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
</script>

<template>
	<div class="grid gap-4">
		<SectionCard>
			<p class="text-xs uppercase tracking-[0.16em] text-tx-muted">{{ t('views.home.cards.system') }}</p>
			<div class="mt-3 grid gap-3 text-sm">
				<InfoRow label="Host" :value="system.hostname" />
				<InfoRow label="Kernel" :value="system.kernel" />
				<InfoRow label="OS" :value="system.os_name" />
				<InfoRow label="Display" :value="system.display_server" />
				<InfoRow label="Uptime" :value="formatUptime(system.uptime_seconds)" />
			</div>
		</SectionCard>

		<SectionCard>
			<p class="text-xs uppercase tracking-[0.16em] text-tx-muted">{{ t('views.home.cards.gpu') }}</p>
			<div v-if="gpu" class="mt-3 space-y-2 text-sm">
				<p class="font-medium">{{ gpu.vendor }}</p>
				<p class="text-tx-muted">{{ gpu.model }}</p>
			</div>
			<p v-else class="mt-3 text-sm text-tx-muted">{{ t('views.home.noGpu') }}</p>
		</SectionCard>
	</div>
</template>

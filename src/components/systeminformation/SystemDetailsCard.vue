<script setup lang="ts">
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
</script>

<template>
	<div class="grid gap-4">
		<SectionCard>
			<p class="text-xs uppercase tracking-[0.16em] text-tx-muted">Sistema</p>
			<div class="mt-3 grid gap-3 text-sm">
				<InfoRow label="Host" :value="system.hostname" />
				<InfoRow label="Kernel" :value="system.kernel" />
				<InfoRow label="OS" :value="system.os_name" />
				<InfoRow label="Display" :value="system.display_server" />
				<InfoRow label="Uptime" :value="formatUptime(system.uptime_seconds)" />
			</div>
		</SectionCard>

		<SectionCard>
			<p class="text-xs uppercase tracking-[0.16em] text-tx-muted">GPU</p>
			<div v-if="gpu" class="mt-3 space-y-2 text-sm">
				<p class="font-medium">{{ gpu.vendor }}</p>
				<p class="text-tx-muted">{{ gpu.model }}</p>
			</div>
			<p v-else class="mt-3 text-sm text-tx-muted">No se detecto GPU compatible.</p>
		</SectionCard>
	</div>
</template>

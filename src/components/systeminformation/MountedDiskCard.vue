<script setup lang="ts">
import ProgressBar from '@/components/ui/ProgressBar.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import type { DiskInfo } from '@/types/system';

defineProps<{
	disk: DiskInfo;
}>();

const formatNumber = (value: number, digits = 0) =>
	new Intl.NumberFormat('es-AR', {
		maximumFractionDigits: digits,
		minimumFractionDigits: digits,
	}).format(value);

const formatGb = (value: number) => `${formatNumber(value, 1)} GB`;
</script>

<template>
	<SectionCard class="p-0">
		<div class="rounded-corner border border-ui-border bg-ui-surface/40 p-4">
			<div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
				<div class="min-w-0">
					<p class="truncate font-medium">{{ disk.mountpoint }}</p>
					<p class="truncate text-sm text-tx-muted">{{ disk.device }} · {{ disk.fstype }}</p>
				</div>
				<span class="rounded-corner bg-ui-bg px-2 py-1 text-sm font-medium">{{ formatNumber(disk.usage_percent, 1) }}%</span>
			</div>

			<div class="mt-3 grid gap-2 text-sm text-tx-muted sm:grid-cols-3">
				<span>Total: {{ formatGb(disk.total_gb) }}</span>
				<span>Usado: {{ formatGb(disk.used_gb) }}</span>
				<span>Libre: {{ formatGb(disk.available_gb) }}</span>
			</div>

			<div class="mt-3">
				<ProgressBar label="Uso del disco" :value="disk.usage_percent" />
			</div>
		</div>
	</SectionCard>
</template>

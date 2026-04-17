<script setup lang="ts">
import SectionCard from '@/components/ui/SectionCard.vue';
import StatTile from '@/components/ui/StatTile.vue';

export interface SystemMetricItem {
	label: string;
	value: string;
	hint: string;
}

defineProps<{
	metrics: SystemMetricItem[];
}>();
</script>

<template>
	<SectionCard>
		<div class="flex items-center justify-between gap-3">
			<div>
				<p class="text-xs uppercase tracking-[0.16em] text-tx-muted">Resumen</p>
				<h2 class="mt-1 text-lg font-semibold">Indicadores rapidos</h2>
			</div>
		</div>

		<div class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
			<StatTile v-for="metric in metrics" :key="metric.label" :label="metric.label" :value="metric.value" :hint="metric.hint" />
		</div>
	</SectionCard>
</template>

<script setup lang="ts">
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import ProgressBar from '@/components/ui/ProgressBar.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import StatTile from '@/components/ui/StatTile.vue';
import type { CpuInfo, MemoryInfo, TemperatureInfo } from '@/types/system';

const { t, locale } = useI18n();

defineProps<{
	cpu: CpuInfo;
	memory: MemoryInfo;
	temperature: TemperatureInfo | null;
	updatedAtLabel: string;
}>();

const formatNumber = (value: number, digits = 0) =>
	new Intl.NumberFormat(locale.value, {
		maximumFractionDigits: digits,
		minimumFractionDigits: digits,
	}).format(value);

const formatGb = (value: number) => `${formatNumber(value, 1)} GB`;
</script>

<template>
	<SectionCard>
		<div class="flex items-center justify-between gap-3">
			<div>
				<p class="text-xs uppercase tracking-[0.16em] text-tx-muted">{{ t('views.home.cards.performanceSection') }}</p>
				<h2 class="mt-1 text-lg font-semibold">{{ t('views.home.cards.performanceTitle') }}</h2>
			</div>
			<span class="rounded-corner bg-ui-surface px-3 py-1 text-sm font-medium text-tx-muted">{{ updatedAtLabel }}</span>
		</div>

		<div class="mt-5 grid gap-4 xl:grid-cols-2">
			<div class="rounded-corner bg-ui-surface/30 p-4">
				<div class="flex items-center justify-between gap-3">
					<div>
						<p class="text-xs uppercase tracking-[0.16em] text-tx-muted">{{ t('views.home.cards.processor') }}</p>
						<p class="mt-1 truncate text-base font-semibold">{{ cpu.model }}</p>
					</div>
					<span class="rounded-corner bg-ui-bg px-2 py-1 text-sm font-medium">{{ formatNumber(cpu.usage, 1) }}%</span>
				</div>

				<div class="mt-4">
					<ProgressBar label="Uso de CPU" :value="cpu.usage" />
				</div>

				<div class="mt-4 grid gap-3 sm:grid-cols-3">
					<StatTile label="Nucleos" :value="String(cpu.cores)" />
					<StatTile label="Frecuencia" :value="cpu.frequency ? `${formatNumber(cpu.frequency, 2)} GHz` : 'N/A'" />
					<StatTile label="Temperatura" :value="temperature?.cpu_temp !== null && temperature?.cpu_temp !== undefined ? `${formatNumber(temperature.cpu_temp, 1)} °C` : 'N/A'" />
				</div>
			</div>

			<div class="rounded-corner bg-ui-surface/30 p-4">
				<div class="flex items-center justify-between gap-3">
					<div>
						<p class="text-xs uppercase tracking-[0.16em] text-tx-muted">{{ t('views.home.cards.memory') }}</p>
						<p class="mt-1 text-base font-semibold">{{ t('views.home.cards.currentUse') }}</p>
					</div>
					<span class="rounded-corner bg-ui-bg px-2 py-1 text-sm font-medium">{{ formatNumber(memory.usage_percent, 1) }}%</span>
				</div>

				<div class="mt-4">
					<ProgressBar label="Uso de RAM" :value="memory.usage_percent" />
				</div>

				<div class="mt-4 grid gap-3">
					<StatTile label="Total" :value="formatGb(memory.total_gb)" />
					<StatTile label="Usada / Disponible" :value="`${formatGb(memory.used_gb)} · ${formatGb(memory.available_gb)}`" />
				</div>
			</div>
		</div>
	</SectionCard>
</template>

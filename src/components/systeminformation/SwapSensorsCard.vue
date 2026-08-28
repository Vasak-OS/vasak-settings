<script setup lang="ts">
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import SectionCard from '@/components/ui/SectionCard.vue';
import type { SwapInfo, TemperatureInfo } from '@/types/system';

const { t, locale } = useI18n();

defineProps<{
	swap: SwapInfo | null;
	temperature: TemperatureInfo | null;
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
		<h2 class="text-lg font-semibold">{{ t('views.home.cards.swapSection') }}</h2>

		<div class="mt-4 grid gap-3">
			<div class="rounded-corner bg-ui-surface/40 p-4">
				<p class="text-xs uppercase tracking-[0.16em] text-tx-muted">{{ t('views.home.cards.swap') }}</p>
				<div v-if="swap" class="mt-2 grid gap-2 text-sm sm:grid-cols-2">
					<span>Total: {{ formatGb(swap.total_gb) }}</span>
					<span>Usada: {{ formatGb(swap.used_gb) }}</span>
					<span>Libre: {{ formatGb(swap.free_gb) }}</span>
					<span>Uso: {{ formatNumber(swap.usage_percent, 1) }}%</span>
				</div>
				<p v-else class="mt-2 text-sm text-tx-muted">{{ t('views.home.cards.noSwap') }}</p>
			</div>

			<div class="rounded-corner bg-ui-surface/40 p-4">
				<p class="text-xs uppercase tracking-[0.16em] text-tx-muted">{{ t('views.home.cards.temperatures') }}</p>
				<div v-if="temperature?.sensors.length" class="mt-2 space-y-2">
					<div v-for="sensor in temperature.sensors" :key="sensor.name" class="flex items-center justify-between gap-3 text-sm">
						<div class="min-w-0">
							<p class="truncate font-medium">{{ sensor.label }}</p>
							<p class="truncate text-tx-muted">{{ sensor.name }}</p>
						</div>
						<span class="rounded-corner bg-ui-bg px-2 py-1 font-medium">{{ formatNumber(sensor.temp, 1) }} °C</span>
					</div>
				</div>
				<p v-else class="mt-2 text-sm text-tx-muted">{{ t('views.home.cards.noSensors') }}</p>
			</div>
		</div>
	</SectionCard>
</template>

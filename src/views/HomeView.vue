<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import CpuMemoryCard from '@/components/systeminformation/CpuMemoryCard.vue';
import DisksCard from '@/components/systeminformation/DisksCard.vue';
import SwapSensorsCard from '@/components/systeminformation/SwapSensorsCard.vue';
import SystemDetailsCard from '@/components/systeminformation/SystemDetailsCard.vue';
import SystemOverviewCard, {
	type SystemMetricItem,
} from '@/components/systeminformation/SystemOverviewCard.vue';
import AlertMessage from '@/components/ui/AlertMessage.vue';
import EmptyStateBox from '@/components/ui/EmptyStateBox.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import { getSystemInfo } from '@/services/system.service';
import type { SystemInfo } from '@/types/system';

const refreshIntervalMs = 30000;
let refreshTimer: ReturnType<typeof window.setInterval> | null = null;

const systemInfo = ref<SystemInfo | null>(null);
const loading = ref(true);
const errorMessage = ref('');
const lastUpdatedAt = ref<Date | null>(null);

const formatNumber = (value: number, digits = 0) =>
	new Intl.NumberFormat('es-AR', {
		maximumFractionDigits: digits,
		minimumFractionDigits: digits,
	}).format(value);

const formatGb = (value: number) => `${formatNumber(value, 1)} GB`;

const formatPercent = (value: number) => `${formatNumber(value, 1)}%`;

const formatLastUpdatedAt = (value: Date | null) => {
	if (value === null) return 'Sin actualizaciones';

	return new Intl.DateTimeFormat('es-AR', {
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	}).format(value);
};

const formatUptime = (seconds: number) => {
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);

	if (days > 0) return `${days}d ${hours}h`;
	if (hours > 0) return `${hours}h ${minutes}m`;
	return `${minutes}m`;
};

const metrics = computed<SystemMetricItem[]>(() => {
	if (!systemInfo.value) return [];

	return [
		{
			label: 'CPU',
			value: formatPercent(systemInfo.value.cpu.usage),
			hint: systemInfo.value.cpu.model,
		},
		{
			label: 'Memoria',
			value: formatPercent(systemInfo.value.memory.usage_percent),
			hint: `${formatGb(systemInfo.value.memory.used_gb)} / ${formatGb(systemInfo.value.memory.total_gb)}`,
		},
		{ label: 'Discos', value: String(systemInfo.value.disks.length), hint: 'montajes detectados' },
		{
			label: 'Uptime',
			value: formatUptime(systemInfo.value.system.uptime_seconds),
			hint: systemInfo.value.system.hostname,
		},
	];
});

const loadSystemInfo = async (showLoading = false) => {
	if (showLoading) {
		loading.value = true;
		errorMessage.value = '';
	}

	try {
		systemInfo.value = await getSystemInfo();
		lastUpdatedAt.value = new Date();
		errorMessage.value = '';
	} catch (error) {
		if (!systemInfo.value) {
			errorMessage.value =
				error instanceof Error ? error.message : 'No se pudo obtener la informacion del sistema';
		}
	} finally {
		if (showLoading) {
			loading.value = false;
		}
	}
};

onMounted(() => {
	loadSystemInfo(true);
	refreshTimer = window.setInterval(() => loadSystemInfo(false), refreshIntervalMs);
});

onUnmounted(() => {
	if (refreshTimer !== null) {
		window.clearInterval(refreshTimer);
		refreshTimer = null;
	}
});
</script>

<template>
	<div class="flex min-h-full flex-col gap-4">
		<PageHeader
			section="Centro de control"
			title="Estado del sistema"
			description="Resumen rapido de recursos, hardware y entorno actual."
		>
			<template #actions>
				<span class="rounded-corner border border-ui-border bg-ui-surface/70 px-3 py-2 text-xs text-tx-muted">
					Ultima actualizacion: {{ formatLastUpdatedAt(lastUpdatedAt) }}
				</span>

				<button
					type="button"
					class="w-fit rounded-corner border border-ui-border bg-ui-surface/70 px-3 py-2 text-sm font-medium hover:bg-ui-surface"
					@click="loadSystemInfo(false)"
				>
					Actualizar
				</button>
			</template>
		</PageHeader>

		<EmptyStateBox v-if="loading" message="Cargando informacion del sistema..." padding="lg" />

		<AlertMessage v-else-if="errorMessage" :message="errorMessage" tone="error" />

		<div v-else-if="systemInfo" class="flex flex-col gap-4 pb-4">
				<SystemOverviewCard :metrics="metrics" />

				<section class="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
					<CpuMemoryCard
						:cpu="systemInfo.cpu"
						:memory="systemInfo.memory"
						:temperature="systemInfo.temperature"
						:updated-at-label="formatLastUpdatedAt(lastUpdatedAt)"
					/>

					<SystemDetailsCard :system="systemInfo.system" :gpu="systemInfo.gpu" />
				</section>

				<section class="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
					<DisksCard :disks="systemInfo.disks" />
					<SwapSensorsCard :swap="systemInfo.swap" :temperature="systemInfo.temperature" />
				</section>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
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

const formatTemp = (value: number | null) => (value === null ? 'N/A' : `${formatNumber(value, 1)} °C`);

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

const metrics = computed(() => {
	if (!systemInfo.value) return [];

	return [
		{ label: 'CPU', value: formatPercent(systemInfo.value.cpu.usage), hint: systemInfo.value.cpu.model },
		{ label: 'Memoria', value: formatPercent(systemInfo.value.memory.usage_percent), hint: `${formatGb(systemInfo.value.memory.used_gb)} / ${formatGb(systemInfo.value.memory.total_gb)}` },
		{ label: 'Discos', value: String(systemInfo.value.disks.length), hint: 'montajes detectados' },
		{ label: 'Uptime', value: formatUptime(systemInfo.value.system.uptime_seconds), hint: systemInfo.value.system.hostname },
	];
});

const loadSystemInfo = async () => {
	loading.value = true;
	errorMessage.value = '';

	try {
		systemInfo.value = await getSystemInfo();
		lastUpdatedAt.value = new Date();
	} catch (error) {
		errorMessage.value = error instanceof Error ? error.message : 'No se pudo obtener la informacion del sistema';
	} finally {
		loading.value = false;
	}
};

onMounted(loadSystemInfo);

onMounted(() => {
	refreshTimer = window.setInterval(loadSystemInfo, refreshIntervalMs);
});

onUnmounted(() => {
	if (refreshTimer !== null) {
		window.clearInterval(refreshTimer);
		refreshTimer = null;
	}
});
</script>

<template>
	<div class="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
		<header class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
			<div>
				<p class="text-xs uppercase tracking-[0.2em] text-tx-muted">Centro de control</p>
				<h1 class="text-2xl font-semibold">Estado del sistema</h1>
				<p class="text-sm text-tx-muted">Resumen rapido de recursos, hardware y entorno actual.</p>
			</div>

			<div class="flex flex-wrap items-center gap-2">
				<span class="rounded-corner border border-ui-border bg-ui-surface/70 px-3 py-2 text-xs text-tx-muted">
					Ultima actualizacion: {{ formatLastUpdatedAt(lastUpdatedAt) }}
				</span>

				<button
					type="button"
					class="w-fit rounded-corner border border-ui-border bg-ui-surface/70 px-3 py-2 text-sm font-medium hover:bg-ui-surface"
					@click="loadSystemInfo"
				>
					Actualizar
				</button>
			</div>
		</header>

		<div v-if="loading" class="grid flex-1 place-items-center rounded-corner border border-dashed border-ui-border bg-ui-surface/20 p-6 text-sm text-tx-muted">
			Cargando informacion del sistema...
		</div>

		<div v-else-if="errorMessage" class="rounded-corner border border-status-error/40 bg-status-error/10 p-4 text-sm text-status-error">
			{{ errorMessage }}
		</div>

		<div v-else-if="systemInfo" class="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
			<section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
				<article v-for="metric in metrics" :key="metric.label" class="rounded-corner border border-ui-border bg-ui-bg/70 p-4">
					<p class="text-xs uppercase tracking-[0.16em] text-tx-muted">{{ metric.label }}</p>
					<p class="mt-2 text-2xl font-semibold">{{ metric.value }}</p>
					<p class="mt-1 truncate text-sm text-tx-muted">{{ metric.hint }}</p>
				</article>
			</section>

			<section class="grid min-h-0 gap-4 xl:grid-cols-[1.3fr_0.7fr]">
				<div class="grid gap-4">
					<article class="rounded-corner border border-ui-border bg-ui-bg/70 p-4">
						<div class="flex items-center justify-between gap-3">
							<div>
								<p class="text-xs uppercase tracking-[0.16em] text-tx-muted">Procesador</p>
								<h2 class="mt-1 text-lg font-semibold">{{ systemInfo.cpu.model }}</h2>
							</div>
							<span class="rounded-corner bg-ui-surface px-3 py-1 text-sm font-medium">{{ formatPercent(systemInfo.cpu.usage) }}</span>
						</div>

						<div class="mt-4 grid gap-3 sm:grid-cols-3">
							<div class="rounded-corner bg-ui-surface/40 p-3">
								<p class="text-xs text-tx-muted">Nucleos</p>
								<p class="mt-1 text-lg font-semibold">{{ systemInfo.cpu.cores }}</p>
							</div>
							<div class="rounded-corner bg-ui-surface/40 p-3">
								<p class="text-xs text-tx-muted">Frecuencia</p>
								<p class="mt-1 text-lg font-semibold">{{ systemInfo.cpu.frequency ? `${formatNumber(systemInfo.cpu.frequency, 2)} GHz` : 'N/A' }}</p>
							</div>
							<div class="rounded-corner bg-ui-surface/40 p-3">
								<p class="text-xs text-tx-muted">Temperatura</p>
								<p class="mt-1 text-lg font-semibold">{{ formatTemp(systemInfo.temperature?.cpu_temp ?? null) }}</p>
							</div>
						</div>
					</article>

					<article class="rounded-corner border border-ui-border bg-ui-bg/70 p-4">
						<div class="flex items-center justify-between gap-3">
							<div>
								<p class="text-xs uppercase tracking-[0.16em] text-tx-muted">Memoria</p>
								<h2 class="mt-1 text-lg font-semibold">Uso actual</h2>
							</div>
							<span class="rounded-corner bg-ui-surface px-3 py-1 text-sm font-medium">{{ formatPercent(systemInfo.memory.usage_percent) }}</span>
						</div>

						<div class="mt-4 grid gap-3 sm:grid-cols-3">
							<div class="rounded-corner bg-ui-surface/40 p-3">
								<p class="text-xs text-tx-muted">Total</p>
								<p class="mt-1 text-lg font-semibold">{{ formatGb(systemInfo.memory.total_gb) }}</p>
							</div>
							<div class="rounded-corner bg-ui-surface/40 p-3">
								<p class="text-xs text-tx-muted">Usada</p>
								<p class="mt-1 text-lg font-semibold">{{ formatGb(systemInfo.memory.used_gb) }}</p>
							</div>
							<div class="rounded-corner bg-ui-surface/40 p-3">
								<p class="text-xs text-tx-muted">Disponible</p>
								<p class="mt-1 text-lg font-semibold">{{ formatGb(systemInfo.memory.available_gb) }}</p>
							</div>
						</div>
					</article>
				</div>

				<div class="grid gap-4 overflow-hidden">
					<article class="rounded-corner border border-ui-border bg-ui-bg/70 p-4">
						<p class="text-xs uppercase tracking-[0.16em] text-tx-muted">Sistema</p>
						<div class="mt-3 grid gap-3 text-sm">
							<div class="flex items-center justify-between gap-3">
								<span class="text-tx-muted">Host</span>
								<span class="truncate font-medium">{{ systemInfo.system.hostname }}</span>
							</div>
							<div class="flex items-center justify-between gap-3">
								<span class="text-tx-muted">Kernel</span>
								<span class="truncate font-medium">{{ systemInfo.system.kernel }}</span>
							</div>
							<div class="flex items-center justify-between gap-3">
								<span class="text-tx-muted">OS</span>
								<span class="truncate font-medium">{{ systemInfo.system.os_name }}</span>
							</div>
							<div class="flex items-center justify-between gap-3">
								<span class="text-tx-muted">Display</span>
								<span class="truncate font-medium">{{ systemInfo.system.display_server }}</span>
							</div>
							<div class="flex items-center justify-between gap-3">
								<span class="text-tx-muted">Uptime</span>
								<span class="truncate font-medium">{{ formatUptime(systemInfo.system.uptime_seconds) }}</span>
							</div>
						</div>
					</article>

					<article class="rounded-corner border border-ui-border bg-ui-bg/70 p-4">
						<p class="text-xs uppercase tracking-[0.16em] text-tx-muted">GPU</p>
						<div v-if="systemInfo.gpu" class="mt-3 space-y-2 text-sm">
							<p class="font-medium">{{ systemInfo.gpu.vendor }}</p>
							<p class="text-tx-muted">{{ systemInfo.gpu.model }}</p>
						</div>
						<p v-else class="mt-3 text-sm text-tx-muted">No se detecto GPU compatible.</p>
					</article>
				</div>
			</section>

			<section class="grid gap-4 xl:grid-cols-2">
				<article class="rounded-corner border border-ui-border bg-ui-bg/70 p-4">
					<div class="flex items-center justify-between gap-3">
						<h2 class="text-lg font-semibold">Discos</h2>
						<span class="text-sm text-tx-muted">{{ systemInfo.disks.length }} montajes</span>
					</div>

					<div class="mt-4 grid gap-3">
						<div v-for="disk in systemInfo.disks" :key="`${disk.device}-${disk.mountpoint}`" class="rounded-corner bg-ui-surface/40 p-3">
							<div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
								<div class="min-w-0">
									<p class="truncate font-medium">{{ disk.mountpoint }}</p>
									<p class="truncate text-sm text-tx-muted">{{ disk.device }} · {{ disk.fstype }}</p>
								</div>
								<span class="rounded-corner bg-ui-bg px-2 py-1 text-sm font-medium">{{ formatPercent(disk.usage_percent) }}</span>
							</div>

							<div class="mt-3 grid gap-2 text-sm text-tx-muted sm:grid-cols-3">
								<span>Total: {{ formatGb(disk.total_gb) }}</span>
								<span>Usado: {{ formatGb(disk.used_gb) }}</span>
								<span>Libre: {{ formatGb(disk.available_gb) }}</span>
							</div>
						</div>
					</div>
				</article>

				<article class="rounded-corner border border-ui-border bg-ui-bg/70 p-4">
					<h2 class="text-lg font-semibold">Swap y sensores</h2>

					<div class="mt-4 grid gap-3">
						<div class="rounded-corner bg-ui-surface/40 p-3">
							<p class="text-xs uppercase tracking-[0.16em] text-tx-muted">Swap</p>
							<div v-if="systemInfo.swap" class="mt-2 grid gap-2 text-sm sm:grid-cols-2">
								<span>Total: {{ formatGb(systemInfo.swap.total_gb) }}</span>
								<span>Usada: {{ formatGb(systemInfo.swap.used_gb) }}</span>
								<span>Libre: {{ formatGb(systemInfo.swap.free_gb) }}</span>
								<span>Uso: {{ formatPercent(systemInfo.swap.usage_percent) }}</span>
							</div>
							<p v-else class="mt-2 text-sm text-tx-muted">No hay swap activa.</p>
						</div>

						<div class="rounded-corner bg-ui-surface/40 p-3">
							<p class="text-xs uppercase tracking-[0.16em] text-tx-muted">Temperaturas</p>
							<div v-if="systemInfo.temperature?.sensors.length" class="mt-2 space-y-2">
								<div v-for="sensor in systemInfo.temperature.sensors" :key="sensor.name" class="flex items-center justify-between gap-3 text-sm">
									<div class="min-w-0">
										<p class="truncate font-medium">{{ sensor.label }}</p>
										<p class="truncate text-tx-muted">{{ sensor.name }}</p>
									</div>
									<span class="rounded-corner bg-ui-bg px-2 py-1 font-medium">{{ formatTemp(sensor.temp) }}</span>
								</div>
							</div>
							<p v-else class="mt-2 text-sm text-tx-muted">Sin sensores disponibles.</p>
						</div>
					</div>
				</article>
			</section>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import MonitorCanvas, { type CanvasMonitor } from '@/components/monitors/MonitorCanvas.vue';
import AlertMessage from '@/components/ui/AlertMessage.vue';
import FormGroup from '@/components/ui/FormGroup.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import SelectInput from '@/components/ui/SelectInput.vue';
import SwitchToggle from '@/components/ui/SwitchToggle.vue';
import {
	type DetectedMonitor,
	getDetectedMonitors,
	type MonitorMode,
} from '@/services/monitors.service';
import { writeWayfireSection } from '@/services/wayfire.service';

interface EditableMonitor {
	name: string;
	connected: boolean;
	has_config: boolean;
	values: Record<string, string>;
	original: Record<string, string>;
	allModes: MonitorMode[];
}

const monitors = ref<EditableMonitor[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const success = ref('');

const transforms = [
	{ label: 'Normal', value: 'normal' },
	{ label: '90°', value: '90' },
	{ label: '180°', value: '180' },
	{ label: '270°', value: '270' },
	{ label: 'Reflejado', value: 'flipped' },
	{ label: 'Reflejado 90°', value: 'flipped-90' },
	{ label: 'Reflejado 180°', value: 'flipped-180' },
	{ label: 'Reflejado 270°', value: 'flipped-270' },
];

const isDirty = computed(() =>
	monitors.value.some((m) => JSON.stringify(m.values) !== JSON.stringify(m.original))
);

function getUniqueResolutions(modes: MonitorMode[]): { label: string; value: string }[] {
	const seen = new Set<string>();
	return modes
		.filter((m) => {
			const key = `${m.width}x${m.height}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		})
		.sort((a, b) => b.width * b.height - a.width * a.height)
		.map((m) => ({
			label: `${m.width}x${m.height}`,
			value: `${m.width}x${m.height}`,
		}));
}

function getRefreshRates(
	modes: MonitorMode[],
	resolution: string
): { label: string; value: string }[] {
	const [w, h] = resolution.split('x').map(Number);
	return modes
		.filter((m) => m.width === w && m.height === h)
		.sort((a, b) => b.refresh - a.refresh)
		.map((m) => ({
			label: `${Math.round(m.refresh)} Hz`,
			value: `${Math.round(m.refresh)}`,
		}));
}

function parseMode(modeStr: string): { resolution: string; refresh: string } {
	const parts = modeStr.split('@');
	return {
		resolution: parts[0] || '1920x1080',
		refresh: parts[1] || '60',
	};
}

function buildMode(resolution: string, refresh: string): string {
	return `${resolution}@${refresh}`;
}

function findBestResolution(modes: MonitorMode[]): string {
	const preferred = modes.find((m) => m.is_preferred);
	if (preferred) return `${preferred.width}x${preferred.height}`;
	const sorted = [...modes].sort((a, b) => b.width * b.height - a.width * a.height);
	if (sorted.length > 0) return `${sorted[0].width}x${sorted[0].height}`;
	return '1920x1080';
}

function findBestRefresh(modes: MonitorMode[], resolution: string): string {
	const rates = getRefreshRates(modes, resolution);
	if (rates.length > 0) {
		// Prefer the highest refresh rate
		const byRate = [...rates].sort((a, b) => Number(b.value) - Number(a.value));
		return byRate[0].value;
	}
	return '60';
}

const canvasMonitors = computed<CanvasMonitor[]>(() =>
	monitors.value
		.filter((m) => m.connected)
		.map((m) => {
			const { resolution } = parseMode(m.values.mode || '1920x1080@60');
			const parts = resolution.split('x');
			const w = Number.parseInt(parts[0], 10) || 1920;
			const h = Number.parseInt(parts[1], 10) || 1080;
			const pos = (m.values.position || '0,0').split(',');
			return {
				name: m.name,
				width: w,
				height: h,
				x: Number.parseInt(pos[0], 10) || 0,
				y: Number.parseInt(pos[1], 10) || 0,
			};
		})
);

onMounted(async () => {
	try {
		const detected = await getDetectedMonitors();
		monitors.value = detected.map((d: DetectedMonitor) => {
			const cfg = d.wayfire_config ?? {};
			const currentMode =
				cfg.mode ||
				findBestResolution(d.available_modes) +
					'@' +
					findBestRefresh(d.available_modes, findBestResolution(d.available_modes));

			const values: Record<string, string> = {
				mode: currentMode,
				position: cfg.position || '0,0',
				scale: cfg.scale || '1',
				transform: cfg.transform || 'normal',
				enable: cfg.enable ?? 'true',
			};

			return {
				name: d.name,
				connected: d.connected,
				has_config: d.wayfire_config !== null,
				values: { ...values },
				original: { ...values },
				allModes: d.available_modes,
			};
		});

		// Auto-assign unique positions to overlapping monitors
		const connected = monitors.value.filter((m) => m.connected);
		const usedPositions = new Set<string>();
		let col = 0;
		let row = 0;
		for (const m of connected) {
			const pos = m.values.position || '0,0';
			if (usedPositions.has(pos)) {
				// Find the largest connected monitor to calculate offsets
				let maxW = 1920;
				for (const other of connected) {
					const { resolution } = parseMode(other.values.mode || '1920x1080@60');
					const parts = resolution.split('x');
					const w = Number.parseInt(parts[0], 10) || 1920;
					if (w > maxW) maxW = w;
				}
				// Assign a staggered position
				col++;
				if (col > 3) {
					col = 0;
					row++;
				}
				const offX = col * Math.round(maxW * 0.8);
				const offY = row * 400;
				m.values.position = `${offX},${offY}`;
				m.original.position = m.values.position;
			}
			usedPositions.add(m.values.position);
		}
	} catch (e) {
		error.value = `Error detectando monitores: ${e}`;
	} finally {
		loading.value = false;
	}
});

function getResOptions(monitor: EditableMonitor): { label: string; value: string }[] {
	return getUniqueResolutions(monitor.allModes);
}

function getRefreshOptions(monitor: EditableMonitor): { label: string; value: string }[] {
	const { resolution } = parseMode(monitor.values.mode || '1920x1080@60');
	return getRefreshRates(monitor.allModes, resolution);
}

function onResolutionChange(monitor: EditableMonitor, resolution: string) {
	const { refresh: oldRefresh } = parseMode(monitor.values.mode || '1920x1080@60');
	// Keep the same refresh if available for new resolution, else pick best
	const newRates = getRefreshRates(monitor.allModes, resolution);
	const newRefresh = newRates.some((r) => r.value === oldRefresh)
		? oldRefresh
		: newRates.length > 0
			? newRates[0].value
			: '60';
	monitor.values.mode = buildMode(resolution, newRefresh);
}

function onRefreshChange(monitor: EditableMonitor, refresh: string) {
	const { resolution } = parseMode(monitor.values.mode || '1920x1080@60');
	monitor.values.mode = buildMode(resolution, refresh);
}

function setVal(monitor: EditableMonitor, key: string, value: string) {
	monitor.values[key] = value;
}

function getVal(monitor: EditableMonitor, key: string, defaultVal = ''): string {
	return monitor.values[key] ?? defaultVal;
}

function onCanvasPositionChange(name: string, x: number, y: number) {
	const m = monitors.value.find((m) => m.name === name);
	if (m) m.values.position = `${x},${y}`;
}

async function saveMonitor(monitor: EditableMonitor) {
	const section = `output:${monitor.name}`;
	try {
		await writeWayfireSection(section, monitor.values);
		monitor.original = { ...monitor.values };
		monitor.has_config = true;
		success.value = `Configuración guardada para ${monitor.name}`;
		setTimeout(() => {
			success.value = '';
		}, 3000);
	} catch (e) {
		error.value = `Error guardando ${monitor.name}: ${e}`;
		setTimeout(() => {
			error.value = '';
		}, 5000);
	}
}

async function saveAll() {
	saving.value = true;
	error.value = '';
	try {
		await Promise.all(
			monitors.value
				.filter((m) => m.connected)
				.map((m) => writeWayfireSection(`output:${m.name}`, m.values))
		);
		for (const m of monitors.value) {
			if (m.connected) {
				m.original = { ...m.values };
				m.has_config = true;
			}
		}
		success.value = 'Configuración de pantallas guardada correctamente';
		setTimeout(() => {
			success.value = '';
		}, 3000);
	} catch (e) {
		error.value = `Error guardando configuración: ${e}`;
	} finally {
		saving.value = false;
	}
}
</script>

<template>
	<div class="flex min-h-full flex-col gap-4 pb-4">
		<PageHeader
			section="Sistema"
			title="Pantallas"
			description="Administra la configuración de tus monitores y pantallas."
		/>

		<AlertMessage v-if="error" :message="error" tone="error" />
		<AlertMessage v-if="success" :message="success" tone="success" />

		<div v-if="loading" class="py-8 text-center text-sm text-tx-muted">
			Cargando monitores...
		</div>

		<template v-else-if="monitors.length === 0">
			<SectionCard>
				<p class="py-4 text-center text-sm text-tx-muted">
					No se detectaron pantallas conectadas.
				</p>
			</SectionCard>
		</template>

		<template v-else>
			<SectionCard v-if="canvasMonitors.length > 0">
				<h3 class="mb-3 text-sm font-medium text-tx-muted">
					Arrastra los monitores para acomodarlos
				</h3>
				<MonitorCanvas
					:monitors="canvasMonitors"
					@position-change="onCanvasPositionChange"
				/>
			</SectionCard>

			<SectionCard v-for="monitor in monitors" :key="monitor.name">
				<div class="mb-3 flex items-center justify-between">
					<div class="flex items-center gap-2">
						<h3 class="text-base font-medium">{{ monitor.name }}</h3>
						<span
							v-if="!monitor.connected"
							class="rounded bg-status-warning/20 px-2 py-0.5 text-xs text-status-warning"
						>
							Desconectado
						</span>
						<span
							v-else-if="!monitor.has_config"
							class="rounded bg-status-info/20 px-2 py-0.5 text-xs text-status-info"
						>
							Nuevo
						</span>
					</div>
					<SwitchToggle
						v-if="monitor.connected"
						:isOn="getVal(monitor, 'enable', 'true') !== 'false'"
						@toggle="setVal(monitor, 'enable', $event ? 'true' : 'false')"
					/>
				</div>

				<template v-if="monitor.connected">
					<div class="grid gap-4 sm:grid-cols-2">
						<FormGroup label="Resolución">
							<SelectInput
								v-if="getResOptions(monitor).length > 0"
								:modelValue="parseMode(monitor.values.mode || '1920x1080@60').resolution"
								:options="getResOptions(monitor)"
								@update:modelValue="(v: string) => onResolutionChange(monitor, v)"
							/>
							<input
								v-else
								type="text"
								:value="parseMode(monitor.values.mode || '1920x1080@60').resolution"
								@input="setVal(monitor, 'mode', ($event.target as HTMLInputElement).value)"
								placeholder="1920x1080"
								class="w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
							/>
						</FormGroup>

						<FormGroup label="Frecuencia">
							<SelectInput
								v-if="getRefreshOptions(monitor).length > 0"
								:modelValue="parseMode(monitor.values.mode || '1920x1080@60').refresh"
								:options="getRefreshOptions(monitor)"
								@update:modelValue="(v: string) => onRefreshChange(monitor, v)"
							/>
							<input
								v-else
								type="text"
								:value="parseMode(monitor.values.mode || '1920x1080@60').refresh"
								placeholder="60"
								class="w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
							/>
						</FormGroup>

						<FormGroup label="Posición (x, y)">
							<input
								type="text"
								:value="getVal(monitor, 'position', '0,0')"
								@input="setVal(monitor, 'position', ($event.target as HTMLInputElement).value)"
								placeholder="0,0"
								class="w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
							/>
						</FormGroup>

						<FormGroup label="Escala">
							<input
								type="number" min="0.5" max="3" step="0.25"
								:value="getVal(monitor, 'scale', '1')"
								@input="setVal(monitor, 'scale', ($event.target as HTMLInputElement).value)"
								class="w-full rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm"
							/>
						</FormGroup>

						<FormGroup label="Rotación">
							<SelectInput
								:modelValue="getVal(monitor, 'transform', 'normal')"
								:options="transforms"
								@update:modelValue="(v: string) => setVal(monitor, 'transform', v)"
							/>
						</FormGroup>
					</div>

					<div class="mt-4 flex justify-end">
						<button
							type="button"
							:disabled="JSON.stringify(monitor.values) === JSON.stringify(monitor.original)"
							class="rounded-corner bg-primary px-4 py-1.5 text-sm font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50 hover:enabled:opacity-90"
							@click="saveMonitor(monitor)"
						>
							{{ monitor.has_config ? 'Guardar' : 'Agregar' }}
						</button>
					</div>
				</template>

				<p v-else class="text-sm text-tx-muted">
					Conecta el monitor para configurarlo.
				</p>
			</SectionCard>

			<div v-if="monitors.some((m) => m.connected)" class="flex justify-end">
				<button
					type="button"
					:disabled="!isDirty || saving"
					class="rounded-corner bg-primary px-6 py-2 text-sm font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50 hover:enabled:opacity-90"
					@click="saveAll"
				>
					{{ saving ? 'Guardando...' : 'Guardar todos los cambios' }}
				</button>
			</div>
		</template>
	</div>
</template>

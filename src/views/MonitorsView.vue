<script setup lang="ts">
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { computed, onMounted, ref } from 'vue';
import MonitorCanvas, { type CanvasMonitor } from '@/components/monitors/MonitorCanvas.vue';
import AlertMessage from '@/components/ui/AlertMessage.vue';
import FormGroup from '@/components/ui/FormGroup.vue';
import NumberInput from '@/components/ui/NumberInput.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import SelectInput from '@/components/ui/SelectInput.vue';
import SwitchToggle from '@/components/ui/SwitchToggle.vue';
import {
	applyMonitorLayout,
	type BrightnessKind,
	type DetectedMonitor,
	formatRefresh,
	getDetectedMonitors,
	getMonitorBrightness,
	logicalSize,
	type MonitorMode,
	type MonitorSetting,
	setMonitorBrightness,
} from '@/services/monitors.service';

interface EditableMonitor extends MonitorSetting {
	connected: boolean;
	description: string;
	modes: MonitorMode[];
}

interface Brightness {
	kind: BrightnessKind;
	handle: string;
	percent: number;
}

const { t } = useI18n();

const monitors = ref<EditableMonitor[]>([]);
const original = ref('');
const brightness = ref<Record<string, Brightness>>({});
const ddcHint = ref('');
const usingKernelFallback = ref(false);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const success = ref('');

const transforms = computed(() => [
	{ label: t('views.monitors.transformNormal'), value: 'normal' },
	{ label: '90°', value: '90' },
	{ label: '180°', value: '180' },
	{ label: '270°', value: '270' },
	{ label: t('views.monitors.transformFlipped'), value: 'flipped' },
	{ label: t('views.monitors.transformFlipped90'), value: 'flipped-90' },
	{ label: t('views.monitors.transformFlipped180'), value: 'flipped-180' },
	{ label: t('views.monitors.transformFlipped270'), value: 'flipped-270' },
]);

const connected = computed(() => monitors.value.filter((m) => m.connected));
const isDirty = computed(() => JSON.stringify(toSettings()) !== original.value);

/**
 * The screen at the origin. Wayfire has no "primary" flag: the one at 0,0 is
 * where the layout starts, which is what the panel and new windows follow.
 */
const primaryName = computed(
	() =>
		connected.value.find((m) => m.enabled && m.position.x === 0 && m.position.y === 0)?.name ?? ''
);

const canvasMonitors = computed<CanvasMonitor[]>(() =>
	connected.value
		.filter((m) => m.enabled)
		.map((m) => {
			const size = logicalSize(m.mode, m.scale, m.transform);
			return {
				name: m.name,
				width: size.width,
				height: size.height,
				x: m.position.x,
				y: m.position.y,
				label: `${m.mode.width}x${m.mode.height}${m.scale !== 1 ? ` @${m.scale}x` : ''}`,
			};
		})
);

function toSettings(): MonitorSetting[] {
	return monitors.value.map((m) => ({
		name: m.name,
		enabled: m.enabled,
		mode: m.mode,
		position: m.position,
		scale: m.scale,
		transform: m.transform,
	}));
}

function fallbackMode(): MonitorMode {
	return {
		width: 1920,
		height: 1080,
		refresh_mhz: 60000,
		is_preferred: true,
		is_current: true,
	};
}

function currentMode(monitor: DetectedMonitor): MonitorMode {
	return (
		monitor.modes.find((m) => m.is_current) ??
		monitor.modes.find((m) => m.is_preferred) ??
		monitor.modes[0] ??
		fallbackMode()
	);
}

async function load() {
	loading.value = true;
	error.value = '';
	try {
		const report = await getDetectedMonitors();
		usingKernelFallback.value = report.source === 'Kernel';

		monitors.value = report.monitors.map((m) => ({
			name: m.name,
			description: m.description,
			connected: m.connected,
			enabled: m.enabled,
			modes: m.modes,
			mode: currentMode(m),
			position: { ...m.position },
			scale: m.scale,
			transform: m.transform,
		}));

		original.value = JSON.stringify(toSettings());
		await loadBrightness();
	} catch (e) {
		error.value = t('views.monitors.detectError').replace('{0}', String(e));
	} finally {
		loading.value = false;
	}
}

async function loadBrightness() {
	try {
		const report = await getMonitorBrightness(connected.value.map((m) => m.name));
		ddcHint.value = report.ddc_hint ?? '';
		brightness.value = Object.fromEntries(
			report.monitors.map((entry) => [
				entry.output,
				{ kind: entry.kind, handle: entry.handle, percent: entry.percent },
			])
		);
	} catch (e) {
		ddcHint.value = String(e);
	}
}

function resolutionOptions(monitor: EditableMonitor) {
	const seen = new Set<string>();
	return monitor.modes
		.filter((m) => {
			const key = `${m.width}x${m.height}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		})
		.sort((a, b) => b.width * b.height - a.width * a.height)
		.map((m) => ({ label: `${m.width}x${m.height}`, value: `${m.width}x${m.height}` }));
}

/**
 * The rates are keyed by the exact millihertz value, not by a rounded label:
 * two entries can both read "60 Hz" and only one of them is a mode the screen
 * has.
 */
function refreshOptions(monitor: EditableMonitor) {
	return monitor.modes
		.filter((m) => m.width === monitor.mode.width && m.height === monitor.mode.height)
		.sort((a, b) => b.refresh_mhz - a.refresh_mhz)
		.map((m) => ({ label: formatRefresh(m), value: String(m.refresh_mhz) }));
}

function onResolutionChange(monitor: EditableMonitor, resolution: string) {
	const [width, height] = resolution.split('x').map(Number);
	const candidates = monitor.modes.filter((m) => m.width === width && m.height === height);
	if (candidates.length === 0) return;

	// Keep the rate if this resolution offers it, otherwise take its best.
	const same = candidates.find((m) => m.refresh_mhz === monitor.mode.refresh_mhz);
	monitor.mode =
		same ?? candidates.reduce((best, m) => (m.refresh_mhz > best.refresh_mhz ? m : best));
}

function onRefreshChange(monitor: EditableMonitor, refreshMhz: string) {
	const match = monitor.modes.find(
		(m) =>
			m.width === monitor.mode.width &&
			m.height === monitor.mode.height &&
			m.refresh_mhz === Number(refreshMhz)
	);
	if (match) monitor.mode = match;
}

function onCanvasPositionChange(name: string, x: number, y: number) {
	const monitor = monitors.value.find((m) => m.name === name);
	if (monitor) monitor.position = { x, y };
}

/**
 * Puts a screen at the origin and slides the rest to keep the arrangement.
 *
 * The whole layout moves by the same amount, so making the 4K on the left the
 * first screen does not shuffle anything around it — it just renumbers where
 * zero is. That is what "the 4K on the left" needs, and what forcing 0,0 on one
 * screen while shoving the others rightwards could never do.
 */
function makePrimary(monitor: EditableMonitor) {
	const dx = monitor.position.x;
	const dy = monitor.position.y;
	if (dx === 0 && dy === 0) return;

	for (const m of monitors.value) {
		if (!m.enabled) continue;
		m.position = { x: m.position.x - dx, y: m.position.y - dy };
	}
}

async function onBrightnessChange(name: string, percent: number) {
	const entry = brightness.value[name];
	if (!entry) return;
	entry.percent = percent;
	try {
		await setMonitorBrightness(entry.kind, entry.handle, percent);
	} catch (e) {
		error.value = t('views.monitors.brightnessError')
			.replace('{0}', name)
			.replace('{1}', String(e));
	}
}

async function save() {
	saving.value = true;
	error.value = '';
	success.value = '';
	try {
		const applied = await applyMonitorLayout(toSettings());
		for (const setting of applied) {
			const monitor = monitors.value.find((m) => m.name === setting.name);
			if (monitor) monitor.position = setting.position;
		}
		original.value = JSON.stringify(toSettings());
		success.value = t('views.monitors.savedAll');
		setTimeout(() => {
			success.value = '';
		}, 4000);
	} catch (e) {
		error.value = String(e);
	} finally {
		saving.value = false;
	}
}

onMounted(load);
</script>

<template>
	<div class="flex min-h-full flex-col gap-4 pb-4">
		<PageHeader
			:section="t('sidebar.system')"
			:title="t('views.monitors.title')"
			:description="t('views.monitors.description')"
		/>

		<AlertMessage v-if="error" :message="error" tone="error" />
		<AlertMessage v-if="success" :message="success" tone="success" />
		<AlertMessage
			v-if="usingKernelFallback"
			:message="t('views.monitors.installWlrRandr')"
			tone="warning"
		/>

		<div v-if="loading" class="py-8 text-center text-sm text-tx-muted">
			{{ t('views.monitors.loading') }}
		</div>

		<template v-else-if="monitors.length === 0">
			<SectionCard>
				<p class="py-4 text-center text-sm text-tx-muted">
					{{ t('views.monitors.emptyState') }}
				</p>
			</SectionCard>
		</template>

		<template v-else>
			<SectionCard v-if="canvasMonitors.length > 0">
				<h3 class="mb-1 text-sm font-medium">{{ t('views.monitors.arrangement') }}</h3>
				<p class="mb-3 text-xs text-tx-muted">{{ t('views.monitors.dragHint') }}</p>
				<MonitorCanvas
					:monitors="canvasMonitors"
					:primaryName="primaryName"
					@position-change="onCanvasPositionChange"
				/>
			</SectionCard>

			<SectionCard v-for="monitor in monitors" :key="monitor.name">
				<div class="mb-3 flex items-center justify-between">
					<div class="flex items-center gap-2">
						<h3 class="text-base font-medium">{{ monitor.name }}</h3>
						<span v-if="monitor.description" class="text-xs text-tx-muted">
							{{ monitor.description }}
						</span>
						<span
							v-if="!monitor.connected"
							class="rounded bg-status-warning/20 px-2 py-0.5 text-xs text-status-warning"
						>
							{{ t('views.monitors.disconnected') }}
						</span>
						<span
							v-else-if="monitor.name === primaryName"
							class="rounded bg-primary/20 px-2 py-0.5 text-xs text-primary"
						>
							{{ t('views.monitors.primary') }}
						</span>
					</div>
					<SwitchToggle
						v-if="monitor.connected"
						:isOn="monitor.enabled"
						@toggle="monitor.enabled = $event"
					/>
				</div>

				<template v-if="monitor.connected && monitor.enabled">
					<div class="mb-3 flex items-center gap-2">
						<button
							v-if="monitor.name !== primaryName"
							type="button"
							class="rounded-corner border border-ui-border px-3 py-1 text-xs text-tx-muted transition-colors hover:border-primary/40 hover:text-primary"
							@click="makePrimary(monitor)"
						>
							{{ t('views.monitors.setPrimary') }}
						</button>
					</div>

					<div class="grid gap-4 sm:grid-cols-2">
						<FormGroup :label="t('views.monitors.resolution')">
							<SelectInput
								:modelValue="`${monitor.mode.width}x${monitor.mode.height}`"
								:options="resolutionOptions(monitor)"
								:disabled="resolutionOptions(monitor).length === 0"
								@update:modelValue="(v: string) => onResolutionChange(monitor, v)"
							/>
						</FormGroup>

						<FormGroup :label="t('views.monitors.refreshRate')">
							<SelectInput
								:modelValue="String(monitor.mode.refresh_mhz)"
								:options="refreshOptions(monitor)"
								:disabled="refreshOptions(monitor).length === 0"
								@update:modelValue="(v: string) => onRefreshChange(monitor, v)"
							/>
						</FormGroup>

						<FormGroup :label="t('views.monitors.scale')">
							<NumberInput
								:model-value="monitor.scale"
								:min="0.5"
								:max="3"
								:step="0.25"
								@update:model-value="(v: number) => (monitor.scale = v)"
							/>
						</FormGroup>

						<FormGroup :label="t('views.monitors.rotation')">
							<SelectInput
								:modelValue="monitor.transform"
								:options="transforms"
								@update:modelValue="(v: string) => (monitor.transform = v)"
							/>
						</FormGroup>

						<FormGroup
							v-if="brightness[monitor.name]"
							:label="t('views.monitors.brightness')"
							customClass="sm:col-span-2"
						>
							<div class="flex items-center gap-3">
								<input
									type="range"
									min="1"
									max="100"
									class="h-2 w-full cursor-pointer appearance-none rounded-full bg-ui-border accent-primary"
									:value="brightness[monitor.name].percent"
									@input="
										onBrightnessChange(
											monitor.name,
											Number(($event.target as HTMLInputElement).value)
										)
									"
								/>
								<span class="w-12 text-right text-sm tabular-nums text-tx-muted">
									{{ brightness[monitor.name].percent }}%
								</span>
							</div>
						</FormGroup>
					</div>

					<p class="mt-3 text-xs text-tx-muted">
						{{ t('views.monitors.positionLabel') }}: {{ monitor.position.x }},{{ monitor.position.y }}
					</p>
				</template>

				<p v-else-if="!monitor.connected" class="text-sm text-tx-muted">
					{{ t('views.monitors.connectHint') }}
				</p>
			</SectionCard>

			<AlertMessage v-if="ddcHint" :message="ddcHint" tone="info" />

			<div v-if="connected.length > 0" class="flex justify-end">
				<button
					type="button"
					:disabled="!isDirty || saving"
					class="rounded-corner bg-primary px-6 py-2 text-sm font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50 hover:enabled:opacity-90"
					@click="save"
				>
					{{ saving ? t('common.saving') : t('views.monitors.saveAll') }}
				</button>
			</div>
		</template>
	</div>
</template>

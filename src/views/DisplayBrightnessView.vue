<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core';
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import {
	AlertMessage,
	FormGroup,
	PageHeader,
	Panel,
	SelectField,
	Slider,
	SwitchToggle,
	TextInput,
} from '@vasakgroup/vue-libvasak';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
	type BrightnessReport,
	getBrightness,
	getNightLight,
	type MonitorBrightness,
	type NightLight,
	onBrightnessChanged,
	setBrightness,
	setNightLight,
} from '@/services/display-manager';
import { ddcNotices } from '@/utils/ddc-status';
import { formatCoordinate, parseCoordinate } from '@/utils/night-light-form';

const { t } = useI18n();

const screens = ref<MonitorBrightness[]>([]);
const report = ref<BrightnessReport | null>(null);
const nightLight = ref<NightLight | null>(null);
const nightLightEnabled = ref(false);
const latitude = ref('');
const longitude = ref('');
const error = ref('');
const success = ref('');
const savingNight = ref(false);
let stopBrightness: (() => void) | null = null;
let unmounted = false;

const modes = computed(() => [
	{ label: t('views.brightness.modeManual'), value: 'manual' },
	{ label: t('views.brightness.modeLocation'), value: 'location' },
]);

const hasScreens = computed(() => screens.value.length > 0);
const isLocationMode = computed(() => nightLight.value?.config.mode === 'location');
const ddcMessages = computed(() =>
	report.value
		? ddcNotices(report.value.ddc).map(({ key, args }) =>
				args.reduce((text, arg, i) => text.replace(`{${i}}`, arg), t(key))
			)
		: []
);

function flash(message: string) {
	success.value = message;
	setTimeout(() => {
		success.value = '';
	}, 3000);
}

function applyReport(next: BrightnessReport) {
	report.value = next;
	screens.value = next.monitors;
}

function applyNightLight(next: NightLight) {
	nightLight.value = next;
	latitude.value = formatCoordinate(next.config.latitude);
	longitude.value = formatCoordinate(next.config.longitude);
}

async function loadAll() {
	try {
		applyReport(await getBrightness());
		applyNightLight(await getNightLight());
		nightLightEnabled.value = await invoke<boolean>('get_night_light_enabled');
		error.value = '';
		if (!stopBrightness) {
			const stop = await onBrightnessChanged(applyReport);
			if (unmounted) stop();
			else stopBrightness = stop;
		}
	} catch (err) {
		error.value = String(err);
	}
}

onMounted(loadAll);
onUnmounted(() => {
	unmounted = true;
	stopBrightness?.();
	stopBrightness = null;
});

/**
 * El deslizador cambia el valor local en el acto y lo manda en cada paso:
 * logind es barato, y a un monitor externo el plugin le escribe sólo el último
 * valor pedido, así que arrastrar no encola escrituras por DDC/CI.
 */
async function applyBrightness(screen: MonitorBrightness, percent: number) {
	screen.percent = percent;

	try {
		await setBrightness(screen.kind, screen.handle, percent);
		error.value = '';
	} catch (err) {
		error.value = String(err);
	}
}

/** Guarda la configuración en el plugin y, si está encendida, la aplica. */
async function saveNightLight(enable = nightLightEnabled.value) {
	if (!nightLight.value) return;

	const lat = parseCoordinate(latitude.value);
	const lon = parseCoordinate(longitude.value);
	if (lat === undefined || lon === undefined) {
		error.value = t('views.brightness.invalidCoordinates');
		return;
	}

	savingNight.value = true;
	error.value = '';

	try {
		applyNightLight(
			await setNightLight({ ...nightLight.value.config, latitude: lat, longitude: lon })
		);
		if (enable || nightLightEnabled.value) {
			nightLightEnabled.value = await invoke<boolean>('set_night_light_enabled', {
				enabled: enable,
			});
		}
		flash(t('views.brightness.nightLightUpdated'));
	} catch (err) {
		error.value = String(err);
		await loadAll();
	} finally {
		savingNight.value = false;
	}
}

function setMode(value: string) {
	if (nightLight.value && (value === 'manual' || value === 'location')) {
		nightLight.value.config.mode = value;
	}
}

function toggleNightLight(value: boolean) {
	void saveNightLight(value);
}
</script>

<template>
	<div class="flex min-h-full flex-col gap-4 pb-4">
		<PageHeader
			size="lg"
			:eyebrow="t('sidebar.system')"
			:title="t('views.brightness.title')"
			:description="t('views.brightness.description')"
		/>

		<AlertMessage v-if="error" tone="error">{{ error }}</AlertMessage>
		<AlertMessage v-if="success" tone="success">{{ success }}</AlertMessage>

		<Panel as="article">
			<h3 class="text-base font-medium">{{ t('views.brightness.brightness') }}</h3>

			<template v-if="hasScreens">
				<div v-for="screen in screens" :key="screen.handle" class="mt-3">
					<FormGroup :label="screen.output ?? screen.handle">
						<div class="flex items-center gap-3">
							<Slider
								:label="screen.output ?? screen.handle"
								class="flex-1"
								:model-value="screen.percent"
								:min="1"
								:max="100"
								:step="1"
								@update:model-value="applyBrightness(screen, $event)"
							/>
							<span class="w-10 shrink-0 text-right text-sm tabular-nums text-tx-muted">
								{{ screen.percent }}%
							</span>
						</div>
					</FormGroup>
				</div>
			</template>
			<p v-else class="mt-1 text-sm text-tx-muted">
				{{ t('views.brightness.noBacklight') }}
			</p>
			<AlertMessage v-for="message in ddcMessages" :key="message" tone="info" class="mt-3">{{
				message
			}}</AlertMessage>
		</Panel>

		<Panel as="article" v-if="nightLight">
			<div class="flex items-start gap-3">
				<div class="min-w-0 flex-1">
					<h3 class="text-base font-medium">{{ t('views.brightness.nightLight') }}</h3>
					<p class="mt-0.5 text-sm text-tx-muted">
						{{ t('views.brightness.nightLightDescription') }}
					</p>
				</div>
				<SwitchToggle :label="t('views.brightness.nightLight')"
					:model-value="nightLightEnabled"
					:disabled="savingNight || !nightLight.available"
					@update:model-value="toggleNightLight"
				/>
			</div>

			<AlertMessage
				v-if="!nightLight.available"
				tone="warning"
			
				class="mt-3">{{ t('views.brightness.wlsunsetMissing') }}</AlertMessage>

			<div class="mt-4 grid gap-4 sm:grid-cols-2">
				<FormGroup :label="t('views.brightness.nightTemp')">
					<div class="flex items-center gap-3">
						<Slider
							:label="t('views.brightness.nightTemp')"
							class="flex-1"
							v-model="nightLight.config.nightTemperature"
							:min="1000"
							:max="6500"
							:step="100"
						/>
						<span class="w-16 shrink-0 text-right text-sm tabular-nums text-tx-muted">
							{{ nightLight.config.nightTemperature }}K
						</span>
					</div>
				</FormGroup>
				<FormGroup :label="t('views.brightness.dayTemp')">
					<div class="flex items-center gap-3">
						<Slider :label="t('views.brightness.dayTemp')" class="flex-1" v-model="nightLight.config.dayTemperature" :min="1000" :max="10000" :step="100" />
						<span class="w-16 shrink-0 text-right text-sm tabular-nums text-tx-muted">
							{{ nightLight.config.dayTemperature }}K
						</span>
					</div>
				</FormGroup>
			</div>

			<FormGroup :label="t('views.brightness.schedule')" class="mt-4">
				<SelectField
					:model-value="nightLight.config.mode"
					:options="modes"
					@update:model-value="setMode"
				/>
			</FormGroup>

			<div v-if="isLocationMode" class="mt-4 grid gap-4 sm:grid-cols-2">
				<FormGroup :label="t('views.brightness.latitude')">
					<TextInput v-model="latitude" placeholder="-34.60" />
				</FormGroup>
				<FormGroup :label="t('views.brightness.longitude')">
					<TextInput v-model="longitude" placeholder="-58.38" />
				</FormGroup>
			</div>
			<div v-else class="mt-4 grid gap-4 sm:grid-cols-2">
				<FormGroup :label="t('views.brightness.dayStarts')">
					<TextInput v-model="nightLight.config.sunrise" type="time" />
				</FormGroup>
				<FormGroup :label="t('views.brightness.nightStarts')">
					<TextInput v-model="nightLight.config.sunset" type="time" />
				</FormGroup>
			</div>

			<div class="mt-4 flex justify-end">
				<button
					type="button"
					:disabled="savingNight || !nightLight.available"
					class="rounded-corner-m bg-primary px-6 py-2 text-sm font-medium text-tx-on-primary hover:opacity-90 disabled:opacity-50"
					@click="saveNightLight()"
				>
					{{ savingNight ? t('common.saving') : t('common.save') }}
				</button>
			</div>
		</Panel>
	</div>
</template>

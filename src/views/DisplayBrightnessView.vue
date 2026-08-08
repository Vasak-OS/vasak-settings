<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core';
import { computed, onMounted, ref } from 'vue';
import AlertMessage from '@/components/ui/AlertMessage.vue';
import FormGroup from '@/components/ui/FormGroup.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import RangeSlider from '@/components/ui/RangeSlider.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import SelectInput from '@/components/ui/SelectInput.vue';
import SwitchToggle from '@/components/ui/SwitchToggle.vue';
import TextInput from '@/components/ui/TextInput.vue';

interface BacklightDevice {
	name: string;
	brightness: number;
	max_brightness: number;
	percent: number;
}

interface NightLight {
	enabled: boolean;
	available: boolean;
	mode: string;
	day_temp: number;
	night_temp: number;
	start: string;
	stop: string;
	latitude: string;
	longitude: string;
}

const backlights = ref<BacklightDevice[]>([]);
const nightLight = ref<NightLight | null>(null);
const error = ref('');
const success = ref('');
const savingNight = ref(false);

const modes = [
	{ label: 'Horario fijo', value: 'manual' },
	{ label: 'Según ubicación (amanecer/atardecer)', value: 'location' },
];

const hasBacklight = computed(() => backlights.value.length > 0);
const isLocationMode = computed(() => nightLight.value?.mode === 'location');

function flash(message: string) {
	success.value = message;
	setTimeout(() => {
		success.value = '';
	}, 3000);
}

async function loadAll() {
	try {
		backlights.value = await invoke<BacklightDevice[]>('get_backlights');
		nightLight.value = await invoke<NightLight>('get_night_light');
		error.value = '';
	} catch (err) {
		error.value = String(err);
	}
}

onMounted(loadAll);

/**
 * The slider updates the local value immediately and pushes to logind on every
 * change; logind is cheap and this keeps the backlight following the drag.
 */
async function applyBrightness(device: BacklightDevice, percent: number) {
	device.percent = percent;

	try {
		await invoke('set_backlight_percent', { device: device.name, percent });
		error.value = '';
	} catch (err) {
		error.value = String(err);
	}
}

async function saveNightLight() {
	if (!nightLight.value) return;

	savingNight.value = true;
	error.value = '';

	try {
		nightLight.value = await invoke<NightLight>('set_night_light', {
			config: nightLight.value,
		});
		flash('Luz nocturna actualizada');
	} catch (err) {
		error.value = String(err);
		await loadAll();
	} finally {
		savingNight.value = false;
	}
}

function toggleNightLight(value: boolean) {
	if (!nightLight.value) return;
	nightLight.value.enabled = value;
	void saveNightLight();
}
</script>

<template>
	<div class="flex min-h-full flex-col gap-4 pb-4">
		<PageHeader
			section="Sistema"
			title="Brillo y luz nocturna"
			description="Brillo de la pantalla y temperatura de color según la hora."
		/>

		<AlertMessage v-if="error" tone="error" :message="error" />
		<AlertMessage v-if="success" tone="success" :message="success" />

		<SectionCard>
			<h3 class="text-base font-medium">Brillo</h3>

			<template v-if="hasBacklight">
				<div v-for="device in backlights" :key="device.name" class="mt-3">
					<FormGroup :label="device.name">
						<div class="flex items-center gap-3">
							<RangeSlider
								:model-value="device.percent"
								:min="1"
								:max="100"
								:step="1"
								@update:model-value="applyBrightness(device, $event)"
							/>
							<span class="w-10 shrink-0 text-right text-sm tabular-nums text-tx-muted">
								{{ device.percent }}%
							</span>
						</div>
					</FormGroup>
				</div>
			</template>
			<p v-else class="mt-1 text-sm text-tx-muted">
				Este equipo no expone ningún control de brillo por software (habitual en monitores de
				escritorio: usá los botones del monitor).
			</p>
		</SectionCard>

		<SectionCard v-if="nightLight">
			<div class="flex items-start gap-3">
				<div class="min-w-0 flex-1">
					<h3 class="text-base font-medium">Luz nocturna</h3>
					<p class="mt-0.5 text-sm text-tx-muted">
						Reduce la luz azul de la pantalla durante la noche.
					</p>
				</div>
				<SwitchToggle
					:is-on="nightLight.enabled"
					:disabled="savingNight || !nightLight.available"
					@toggle="toggleNightLight"
				/>
			</div>

			<AlertMessage
				v-if="!nightLight.available"
				tone="warning"
				message="wlsunset no está instalado; la luz nocturna no puede activarse."
				class="mt-3"
			/>

			<div class="mt-4 grid gap-4 sm:grid-cols-2">
				<FormGroup label="Temperatura nocturna">
					<div class="flex items-center gap-3">
						<RangeSlider
							v-model="nightLight.night_temp"
							:min="1000"
							:max="6500"
							:step="100"
						/>
						<span class="w-16 shrink-0 text-right text-sm tabular-nums text-tx-muted">
							{{ nightLight.night_temp }}K
						</span>
					</div>
				</FormGroup>
				<FormGroup label="Temperatura diurna">
					<div class="flex items-center gap-3">
						<RangeSlider v-model="nightLight.day_temp" :min="1000" :max="10000" :step="100" />
						<span class="w-16 shrink-0 text-right text-sm tabular-nums text-tx-muted">
							{{ nightLight.day_temp }}K
						</span>
					</div>
				</FormGroup>
			</div>

			<FormGroup label="Programación" class="mt-4">
				<SelectInput v-model="nightLight.mode" :options="modes" />
			</FormGroup>

			<div v-if="isLocationMode" class="mt-4 grid gap-4 sm:grid-cols-2">
				<FormGroup label="Latitud">
					<TextInput v-model="nightLight.latitude" placeholder="-34.60" />
				</FormGroup>
				<FormGroup label="Longitud">
					<TextInput v-model="nightLight.longitude" placeholder="-58.38" />
				</FormGroup>
			</div>
			<div v-else class="mt-4 grid gap-4 sm:grid-cols-2">
				<FormGroup label="Empieza el día">
					<TextInput v-model="nightLight.start" type="time" />
				</FormGroup>
				<FormGroup label="Empieza la noche">
					<TextInput v-model="nightLight.stop" type="time" />
				</FormGroup>
			</div>

			<div class="mt-4 flex justify-end">
				<button
					type="button"
					:disabled="savingNight || !nightLight.available"
					class="rounded-corner bg-primary px-6 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
					@click="saveNightLight"
				>
					{{ savingNight ? 'Guardando…' : 'Guardar cambios' }}
				</button>
			</div>
		</SectionCard>
	</div>
</template>

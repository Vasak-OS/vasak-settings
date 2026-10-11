<script lang="ts" setup>
import { listen } from '@tauri-apps/api/event';
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import {
	Badge,
	ConfigSection,
	EmptyState,
	PageHeader,
	Panel,
	Slider,
	ThemeIcon,
} from '@vasakgroup/vue-libvasak';
import { computed, onMounted, onUnmounted, type Ref, ref } from 'vue';
import {
	getAudioDevices,
	getAudioOutputProfiles,
	getAudioVolume,
	setAudioDevice,
	setAudioOutputProfile,
	setAudioVolume,
	toggleAudioMute,
} from '@/services/audio.service';
import type { AudioDevice, AudioOutputProfile, VolumeInfo } from '@/types/audio';
import { onRadioArrow, radioTabIndex } from '@/utils/radio-group';

const { t } = useI18n();

// --- Estado Volumen ---
const volumeInfo = ref<VolumeInfo>({
	current: 0,
	min: 0,
	max: 100,
	is_muted: false,
});
const currentVolume = ref(0);
const volumeChanging = ref(false);

// --- Estado Dispositivos ---
const devices: Ref<AudioDevice[]> = ref([]);
const deviceIds = computed(() => devices.value.map((device) => device.id));
const selectedDeviceId = ref('');
const devicesLoading = ref(false);

// --- Estado Salidas detrás de perfil de tarjeta (HDMI, S/PDIF) ---
const outputProfiles: Ref<AudioOutputProfile[]> = ref([]);
// Sólo las salidas disponibles pero inactivas: su sink no existe porque el
// perfil de la tarjeta no está activo. Es el caso del HDMI de la GPU cuando la
// tarjeta está en «off» o en analógico.
const availableOutputs = computed(() =>
	outputProfiles.value.filter((output) => output.is_available && !output.is_active)
);
const switchingProfile = ref('');

// --- Cierre de listeners ---
let unlistenVolume: (() => void) | null = null;
let unlistenDevices: (() => void) | null = null;
let unlistenOutputProfiles: (() => void) | null = null;

// --- Lógica Volumen ---
const getVolumeIconName = (isMuted: boolean, percentage: number): string => {
	if (isMuted) return 'audio-volume-muted-symbolic';
	if (percentage === 0) return 'audio-volume-muted-symbolic';
	if (percentage < 33) return 'audio-volume-low-symbolic';
	if (percentage < 66) return 'audio-volume-medium-symbolic';
	return 'audio-volume-high-symbolic';
};

const volumePercentage = computed(() => {
	const min = volumeInfo.value.min;
	const max = volumeInfo.value.max;
	if (max === min) return 0;
	return Math.round(((currentVolume.value - min) / (max - min)) * 100);
});

/**
 * El nombre del icono del volumen, que cambia con el silencio y con el nivel.
 *
 * Era un icono resuelto a mano más un `watch` que lo volvía a pedir, más tres
 * `await updateIcon()` repartidos por las funciones que tocan el volumen. Todo
 * eso existía porque el composable propio resolvía **una vez** y no miraba el
 * nombre. `ThemeIcon` recibe el nombre y lo mira: alcanza con el `computed`.
 */
const volumeIconName = computed(() =>
	getVolumeIconName(volumeInfo.value.is_muted, volumePercentage.value)
);

const getVolumeInfo = async () => {
	try {
		const info = await getAudioVolume();
		volumeInfo.value = info;
		currentVolume.value = info.current;
	} catch (error) {
		console.error('Error getting volume:', error);
	}
};

const setVolume = async () => {
	try {
		volumeChanging.value = true;
		await setAudioVolume(currentVolume.value);
	} catch (error) {
		console.error('Error setting volume:', error);
	} finally {
		volumeChanging.value = false;
	}
};

const toggleMute = async () => {
	try {
		await toggleAudioMute();
		await getVolumeInfo();
	} catch (error) {
		console.error('Error toggling mute:', error);
	}
};

// --- Lógica Dispositivos ---
const getDeviceName = (device: AudioDevice): string => {
	return device.name.replace('ALSA', '').replace('PulseAudio', '').replace('PipeWire', '').trim();
};

const loadOutputProfiles = async () => {
	try {
		outputProfiles.value = await getAudioOutputProfiles();
	} catch (e) {
		console.error('Failed to load output profiles:', e);
	}
};

const loadDevices = async () => {
	devicesLoading.value = true;
	try {
		const deviceList = await getAudioDevices();
		devices.value = deviceList;

		const defaultDevice = deviceList.find((d) => d.is_default);
		if (defaultDevice) {
			selectedDeviceId.value = defaultDevice.id;
		}

		await loadOutputProfiles();
	} catch (e) {
		console.error('Failed to load audio devices:', e);
	} finally {
		devicesLoading.value = false;
	}
};

const selectOutputProfile = async (output: AudioOutputProfile) => {
	switchingProfile.value = output.profile_name;
	try {
		await setAudioOutputProfile(output.card_name, output.profile_name);
		// Tras conmutar el perfil el sink ya existe: refrescamos ambas listas.
		await loadDevices();
	} catch (e) {
		console.error('Failed to switch output profile:', e);
	} finally {
		switchingProfile.value = '';
	}
};

const selectDevice = async (deviceId: string) => {
	if (selectedDeviceId.value === deviceId) return;
	selectedDeviceId.value = deviceId;
	try {
		await setAudioDevice(deviceId);
		// We expect event 'audio-devices-changed', but we force refresh anyway
		await loadDevices();
	} catch (e) {
		console.error('Failed to set device:', e);
	}
};

onMounted(async () => {
	await getVolumeInfo();
	await loadDevices();

	unlistenVolume = await listen<VolumeInfo>('volume-changed', async (event) => {
		volumeInfo.value = event.payload;
		if (!volumeChanging.value) {
			currentVolume.value = event.payload.current;
		}
	});

	unlistenDevices = await listen<AudioDevice[]>('audio-devices-changed', (event) => {
		devices.value = event.payload;
		const defaultDevice = event.payload.find((d) => d.is_default);
		if (defaultDevice) {
			selectedDeviceId.value = defaultDevice.id;
		}
	});

	unlistenOutputProfiles = await listen<AudioOutputProfile[]>(
		'audio-output-profiles-changed',
		(event) => {
			outputProfiles.value = event.payload;
		}
	);
});

onUnmounted(() => {
	if (unlistenVolume) unlistenVolume();
	if (unlistenDevices) unlistenDevices();
	if (unlistenOutputProfiles) unlistenOutputProfiles();
});
</script>

<template>
	<div class="flex min-h-full flex-col gap-4 pb-4">
		<PageHeader
			size="lg"
			:eyebrow="t('sidebar.multimedia')"
			:title="t('views.multimediaAudio.title')"
			:description="t('views.multimediaAudio.description')"
		>
			<template #actions>
				<div class="flex flex-col items-center">
					<p class="text-xs uppercase tracking-[0.2em] text-tx-muted mb-2">{{ t('views.multimediaAudio.statusLabel') }}</p>
					<Badge
						size="md"
						:label="volumeInfo.is_muted ? t('views.multimediaAudio.muted') : t('views.multimediaAudio.active')"
						:tone="volumeInfo.is_muted ? 'error' : 'success'"
					/>
				</div>
			</template>
		</PageHeader>

		<div class="mt-2 grid gap-6 xl:grid-cols-2">
			<!-- Slider Volumen -->
			<ConfigSection :title="t('views.multimediaAudio.masterVolume')">
				<div class="flex items-center gap-4 rounded-corner-m border border-ui-border bg-ui-surface/70 p-4">
					<button 
						class="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-corner-m bg-ui-surface transition-colors hover:bg-primary hover:text-tx-on-primary"
						:class="volumeInfo.is_muted ? 'text-status-error border border-status-error/40' : 'text-tx-main border border-ui-border'"
						@click="toggleMute"
						:title="t('views.multimediaAudio.muteTooltip')" :aria-label="t('views.multimediaAudio.muteTooltip')">
						<ThemeIcon
							:name="volumeIconName"
							type="symbol"
							:size="24"
							:alt="t('views.multimediaAudio.volumeAlt')"
							:class="{ 'opacity-60': volumeInfo.is_muted }" />
					</button>

					<div class="flex-1 px-2">
						<Slider
							:label="t('views.multimediaAudio.masterVolume')"
							class="flex-1"
							id="volume-slider"
							v-model="currentVolume"
							:min="volumeInfo.min"
							:max="volumeInfo.max"
							@update:model-value="setVolume"
						/>
					</div>

					<div class="w-12 text-right">
						<span class="text-sm font-semibold" :class="volumeInfo.is_muted ? 'text-status-error' : 'text-primary'">
							{{ volumePercentage }}%
						</span>
					</div>
				</div>
			</ConfigSection>

			<!-- Dispositivos Salida -->
			<Panel as="article">
				<h3 class="mb-4 text-lg font-medium text-tx-main flex items-center justify-between">
					{{ t('views.multimediaAudio.outputDevices') }}
					<button
						@click="loadDevices" 
						class="rounded p-1 transition-colors hover:bg-ui-surface border-transparent border hover:border-ui-border"
						:class="{ 'animate-pulse': devicesLoading }"
					>
						<svg class="h-4 w-4 text-tx-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
						</svg>
					</button>
				</h3>

				<EmptyState icon="" size="sm" bordered v-if="devicesLoading" :title="t('views.multimediaAudio.loadingDevices')" />
				<EmptyState icon="" size="sm" bordered v-else-if="devices.length === 0" :title="t('views.multimediaAudio.emptyDevices')" />
				
				<ul v-else class="flex flex-col gap-2 max-h-[14rem] overflow-y-auto pr-1" role="radiogroup">
					<li 
						v-for="device in devices" 
						:key="device.id"
						class="group flex cursor-pointer items-center justify-between gap-3 rounded-corner-m border px-4 py-3 transition-colors"
						:class="selectedDeviceId === device.id 
							? 'border-primary/50 bg-primary/5 shadow-sm' 
							: 'border-ui-border bg-ui-surface/70 hover:border-ui-border.hover hover:bg-ui-surface'"
						role="radio"
						:aria-checked="selectedDeviceId === device.id"
						:tabindex="radioTabIndex(deviceIds, selectedDeviceId, device.id)"
						@click="selectDevice(device.id)"
						@keydown.enter.prevent="selectDevice(device.id)"
						@keydown.space.prevent="selectDevice(device.id)"
						@keydown="onRadioArrow($event, deviceIds, device.id, selectDevice)"
					>
						<!-- Selector Circle -->
						<div 
							class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors"
							:class="selectedDeviceId === device.id ? 'border-primary bg-primary' : 'border-ui-border group-hover:border-primary/50'"
						>
							<div v-if="selectedDeviceId === device.id" class="h-2 w-2 rounded-full bg-white scale-100 transition-transform"></div>
						</div>
						
						<!-- Info -->
						<div class="flex flex-1 flex-col min-w-0">
							<span class="text-sm font-medium text-tx-main truncate">
								{{ getDeviceName(device) }}
							</span>
							<span class="text-xs text-tx-muted mt-0.5" v-if="device.volume">
								{{ t('views.multimediaAudio.level') }} {{ Math.round(device.volume * 100) }}%
							</span>
						</div>

						<!-- Badge Default -->
						<span v-if="device.is_default" class="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary border border-primary/20">
							{{ t('views.multimediaAudio.defaultBadge') }}
						</span>
					</li>
				</ul>
			</Panel>

			<!-- Salidas disponibles detrás de un perfil de tarjeta (HDMI, S/PDIF) -->
			<Panel as="article" v-if="availableOutputs.length > 0" class="xl:col-span-2">
				<h3 class="mb-1 text-lg font-medium text-tx-main">
					{{ t('views.multimediaAudio.availableOutputs') }}
				</h3>
				<p class="mb-4 text-xs text-tx-muted">
					{{ t('views.multimediaAudio.availableOutputsHint') }}
				</p>

				<ul class="flex flex-col gap-2 max-h-[14rem] overflow-y-auto pr-1">
					<li
						v-for="output in availableOutputs"
						:key="output.card_name + '::' + output.profile_name"
						class="group flex items-center justify-between gap-3 rounded-corner-m border border-ui-border bg-ui-surface/70 px-4 py-3 transition-colors hover:border-primary/50 hover:bg-ui-surface"
					>
						<div class="flex flex-1 items-center gap-3 min-w-0">
							<ThemeIcon
								name="video-display-symbolic"
								type="symbol"
								:size="20"
								:alt="output.description"
								class="shrink-0 text-tx-muted"
							/>
							<span class="text-sm font-medium text-tx-main truncate">
								{{ output.description }}
							</span>
						</div>

						<button
							class="shrink-0 cursor-pointer rounded-corner-m border border-ui-border bg-ui-surface px-3 py-1.5 text-xs font-semibold text-tx-main transition-colors hover:bg-primary hover:text-tx-on-primary disabled:cursor-wait disabled:opacity-60"
							:disabled="switchingProfile === output.profile_name"
							@click="selectOutputProfile(output)"
						>
							{{ switchingProfile === output.profile_name
								? t('views.multimediaAudio.activating')
								: t('views.multimediaAudio.activateOutput') }}
						</button>
					</li>
				</ul>
			</Panel>
		</div>
	</div>
</template>

<script lang="ts" setup>
import { listen } from '@tauri-apps/api/event';
import { getSymbolSource } from '@vasakgroup/plugin-vicons';
import { computed, onMounted, onUnmounted, type Ref, ref, watch } from 'vue';
import EmptyStateBox from '@/components/ui/EmptyStateBox.vue';
import RangeSlider from '@/components/ui/RangeSlider.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import {
	getAudioInputDevices,
	getAudioInputVolume,
	setAudioInputDevice,
	setAudioInputVolume,
	toggleAudioInputMute,
} from '@/services/audio.service';
import type { AudioDevice, VolumeInfo } from '@/types/audio';

const inputVolumeInfo = ref<VolumeInfo>({
	current: 0,
	min: 0,
	max: 100,
	is_muted: false,
});
const currentInputVolume = ref(0);
const inputVolumeIconContent = ref('');
const inputVolumeChanging = ref(false);

const inputDevices: Ref<AudioDevice[]> = ref([]);
const selectedInputDeviceId = ref('');
const inputDevicesLoading = ref(false);

let unlistenInputVolume: (() => void) | null = null;
let unlistenInputDevices: (() => void) | null = null;

const getVolumeIconName = (isMuted: boolean, percentage: number): string => {
	if (isMuted) return 'audio-volume-muted-symbolic';
	if (percentage === 0) return 'audio-volume-muted-symbolic';
	if (percentage < 33) return 'audio-volume-low-symbolic';
	if (percentage < 66) return 'audio-volume-medium-symbolic';
	return 'audio-volume-high-symbolic';
};

const inputVolumePercentage = computed(() => {
	const min = inputVolumeInfo.value.min;
	const max = inputVolumeInfo.value.max;
	if (max === min) return 0;
	return Math.round(((currentInputVolume.value - min) / (max - min)) * 100);
});

const updateInputIcon = async () => {
	try {
		const iconName = getVolumeIconName(inputVolumeInfo.value.is_muted, inputVolumePercentage.value);
		inputVolumeIconContent.value = await getSymbolSource(iconName);
	} catch (error) {
		console.error('Error loading input volume icon:', error);
	}
};

watch([() => inputVolumeInfo.value.is_muted, inputVolumePercentage], updateInputIcon, {
	immediate: true,
});

const getInputVolumeInfo = async () => {
	try {
		const info = await getAudioInputVolume();
		inputVolumeInfo.value = info;
		currentInputVolume.value = info.current;
		await updateInputIcon();
	} catch (error) {
		console.error('Error getting input volume:', error);
	}
};

const setInputVolume = async () => {
	try {
		inputVolumeChanging.value = true;
		await setAudioInputVolume(currentInputVolume.value);
		await updateInputIcon();
	} catch (error) {
		console.error('Error setting input volume:', error);
	} finally {
		inputVolumeChanging.value = false;
	}
};

const toggleInputMute = async () => {
	try {
		await toggleAudioInputMute();
		await getInputVolumeInfo();
	} catch (error) {
		console.error('Error toggling input mute:', error);
	}
};

const getDeviceName = (device: AudioDevice): string => {
	return device.name.replace('ALSA', '').replace('PulseAudio', '').replace('PipeWire', '').trim();
};

const loadInputDevices = async () => {
	inputDevicesLoading.value = true;
	try {
		const deviceList = await getAudioInputDevices();
		inputDevices.value = deviceList;

		const defaultDevice = deviceList.find((d) => d.is_default);
		if (defaultDevice) {
			selectedInputDeviceId.value = defaultDevice.id;
		}
	} catch (error) {
		console.error('Failed to load input devices:', error);
	} finally {
		inputDevicesLoading.value = false;
	}
};

const selectInputDevice = async (deviceId: string) => {
	if (selectedInputDeviceId.value === deviceId) return;
	selectedInputDeviceId.value = deviceId;
	try {
		await setAudioInputDevice(deviceId);
		await loadInputDevices();
		await getInputVolumeInfo();
	} catch (error) {
		console.error('Failed to set input device:', error);
	}
};

onMounted(async () => {
	await getInputVolumeInfo();
	await loadInputDevices();

	unlistenInputVolume = await listen<VolumeInfo>('audio-input-volume-changed', async (event) => {
		inputVolumeInfo.value = event.payload;
		if (!inputVolumeChanging.value) {
			currentInputVolume.value = event.payload.current;
		}
		await updateInputIcon();
	});

	unlistenInputDevices = await listen<AudioDevice[]>('audio-input-devices-changed', (event) => {
		inputDevices.value = event.payload;
		const defaultDevice = event.payload.find((d) => d.is_default);
		if (defaultDevice) {
			selectedInputDeviceId.value = defaultDevice.id;
		}
	});
});

onUnmounted(() => {
	if (unlistenInputVolume) unlistenInputVolume();
	if (unlistenInputDevices) unlistenInputDevices();
});
</script>

<template>
	<div class="flex min-h-full flex-col gap-4 pb-4">
		<header class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
			<div>
				<p class="text-xs uppercase tracking-[0.2em] text-tx-muted">Multimedia</p>
				<h1 class="text-2xl font-semibold">Audio de Entrada</h1>
				<p class="text-sm text-tx-muted">Administra micrófonos y nivel de captura del sistema.</p>
			</div>

			<div class="flex flex-col items-center">
				<p class="mb-2 text-xs uppercase tracking-[0.2em] text-tx-muted">Estado</p>
				<StatusBadge
					:text="inputVolumeInfo.is_muted ? 'MICRÓFONO SILENCIADO' : 'MICRÓFONO ACTIVO'"
					:tone="inputVolumeInfo.is_muted ? 'error' : 'success'"
				/>
			</div>
		</header>

		<div class="mt-2 grid gap-6 xl:grid-cols-2">
			<SectionCard>
				<h3 class="mb-4 text-lg font-medium text-tx-primary">Nivel de Entrada</h3>
				<div class="flex items-center gap-4 rounded-corner border border-ui-border bg-ui-surface/40 p-4">
					<button
						class="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-corner border transition-colors hover:bg-[var(--primary-color,#0084ff)] hover:text-white"
						:class="
							inputVolumeInfo.is_muted
								? 'border-status-error/40 text-status-error'
								: 'border-ui-border text-tx-primary'
						"
						@click="toggleInputMute"
						title="Silenciar micrófono"
					>
						<img
							v-if="inputVolumeIconContent"
							:src="inputVolumeIconContent"
							alt="Entrada"
							class="h-6 w-6"
							:class="{ 'opacity-60': inputVolumeInfo.is_muted }"
						/>
					</button>

					<div class="flex-1 px-2">
						<RangeSlider
							id="input-volume-slider"
							v-model="currentInputVolume"
							:min="inputVolumeInfo.min"
							:max="inputVolumeInfo.max"
							@update:model-value="setInputVolume"
						/>
					</div>

					<div class="w-12 text-right">
						<span
							class="text-sm font-semibold"
							:class="
								inputVolumeInfo.is_muted
									? 'text-status-error'
									: 'text-[var(--primary-color,#0084ff)]'
							"
						>
							{{ inputVolumePercentage }}%
						</span>
					</div>
				</div>
			</SectionCard>

			<SectionCard>
				<h3 class="mb-4 flex items-center justify-between text-lg font-medium text-tx-primary">
					Entrada de Audio
					<button
						@click="loadInputDevices"
						class="rounded border border-transparent p-1 transition-colors hover:border-ui-border hover:bg-ui-surface"
						:class="{ 'animate-pulse': inputDevicesLoading }"
					>
						<svg class="h-4 w-4 text-tx-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
							/>
						</svg>
					</button>
				</h3>

				<EmptyStateBox v-if="inputDevicesLoading" message="Cargando micrófonos..." />
				<EmptyStateBox v-else-if="inputDevices.length === 0" message="No hay dispositivos de entrada disponibles" />

				<ul v-else class="flex max-h-[14rem] flex-col gap-2 overflow-y-auto pr-1">
					<li
						v-for="device in inputDevices"
						:key="device.id"
						class="group flex cursor-pointer items-center justify-between gap-3 rounded-corner border px-4 py-3 transition-colors"
						:class="
							selectedInputDeviceId === device.id
								? 'border-[var(--primary-color,#0084ff)]/50 bg-[var(--primary-color,#0084ff)]/5 shadow-sm'
								: 'border-ui-border bg-ui-surface/40 hover:border-ui-border.hover hover:bg-ui-surface'
						"
						@click="selectInputDevice(device.id)"
					>
						<div
							class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors"
							:class="
								selectedInputDeviceId === device.id
									? 'border-[var(--primary-color,#0084ff)] bg-[var(--primary-color,#0084ff)]'
									: 'border-ui-border group-hover:border-[var(--primary-color,#0084ff)]/50'
							"
						>
							<div
								v-if="selectedInputDeviceId === device.id"
								class="h-2 w-2 scale-100 rounded-full bg-white transition-transform"
							></div>
						</div>

						<div class="flex min-w-0 flex-1 flex-col">
							<span class="truncate text-sm font-medium text-tx-primary">
								{{ getDeviceName(device) }}
							</span>
							<span v-if="device.volume" class="mt-0.5 text-xs text-tx-muted">
								Nivel: {{ Math.round(device.volume * 100) }}%
							</span>
						</div>

						<span
							v-if="device.is_default"
							class="rounded border border-[var(--primary-color,#0084ff)]/20 bg-[var(--primary-color,#0084ff)]/10 px-2 py-0.5 text-xs font-semibold text-[var(--primary-color,#0084ff)]"
						>
							Activo
						</span>
					</li>
				</ul>
			</SectionCard>
		</div>
	</div>
</template>

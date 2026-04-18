<script lang="ts" setup>
import { listen } from '@tauri-apps/api/event';
import { getSymbolSource } from '@vasakgroup/plugin-vicons';
import { computed, onMounted, onUnmounted, type Ref, ref, watch } from 'vue';
import EmptyStateBox from '@/components/ui/EmptyStateBox.vue';
import RangeSlider from '@/components/ui/RangeSlider.vue';
import SectionCard from '@/components/ui/SectionCard.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import {
	getAudioDevices,
	getAudioVolume,
	setAudioDevice,
	setAudioVolume,
	toggleAudioMute,
} from '@/services/audio.service';
import type { AudioDevice, VolumeInfo } from '@/types/audio';

// --- Estado Volumen ---
const volumeInfo = ref<VolumeInfo>({
	current: 0,
	min: 0,
	max: 100,
	is_muted: false,
});
const currentVolume = ref(0);
const volumeIconContent = ref('');
const volumeChanging = ref(false);

// --- Estado Dispositivos ---
const devices: Ref<AudioDevice[]> = ref([]);
const selectedDeviceId = ref('');
const devicesLoading = ref(false);

// --- Cierre de listeners ---
let unlistenVolume: (() => void) | null = null;
let unlistenDevices: (() => void) | null = null;

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

const updateIcon = async () => {
	try {
		const iconName = getVolumeIconName(volumeInfo.value.is_muted, volumePercentage.value);
		volumeIconContent.value = await getSymbolSource(iconName);
	} catch (error) {
		console.error('Error loading volume icon:', error);
	}
};

watch([() => volumeInfo.value.is_muted, volumePercentage], updateIcon, {
	immediate: true,
});

const getVolumeInfo = async () => {
	try {
		const info = await getAudioVolume();
		volumeInfo.value = info;
		currentVolume.value = info.current;
		await updateIcon();
	} catch (error) {
		console.error('Error getting volume:', error);
	}
};

const setVolume = async () => {
	try {
		volumeChanging.value = true;
		await setAudioVolume(currentVolume.value);
		await updateIcon();
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

const loadDevices = async () => {
	devicesLoading.value = true;
	try {
		const deviceList = await getAudioDevices();
		devices.value = deviceList;

		const defaultDevice = deviceList.find((d) => d.is_default);
		if (defaultDevice) {
			selectedDeviceId.value = defaultDevice.id;
		}
	} catch (e) {
		console.error('Failed to load audio devices:', e);
	} finally {
		devicesLoading.value = false;
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
		await updateIcon();
	});

	unlistenDevices = await listen<AudioDevice[]>('audio-devices-changed', (event) => {
		devices.value = event.payload;
		const defaultDevice = event.payload.find((d) => d.is_default);
		if (defaultDevice) {
			selectedDeviceId.value = defaultDevice.id;
		}
	});
});

onUnmounted(() => {
	if (unlistenVolume) unlistenVolume();
	if (unlistenDevices) unlistenDevices();
});
</script>

<template>
	<div class="flex min-h-full flex-col gap-4 pb-4">
		<header class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
			<div>
				<p class="text-xs uppercase tracking-[0.2em] text-tx-muted">Multimedia</p>
				<h1 class="text-2xl font-semibold">Audio de Salida</h1>
				<p class="text-sm text-tx-muted">Administra parlantes y volumen de reproducción del sistema.</p>
			</div>
			
			<div class="flex flex-col items-center">
				<p class="text-xs uppercase tracking-[0.2em] text-tx-muted mb-2">Estado</p>
				<StatusBadge
					:text="volumeInfo.is_muted ? 'SILENCIADO' : 'ACTIVO'"
					:tone="volumeInfo.is_muted ? 'error' : 'success'"
				/>
			</div>
		</header>

		<div class="mt-2 grid gap-6 xl:grid-cols-2">
			<!-- Slider Volumen -->
			<SectionCard>
				<h3 class="mb-4 text-lg font-medium text-tx-primary">Volumen Maestro</h3>
				<div class="flex items-center gap-4 rounded-corner border border-ui-border bg-ui-surface/40 p-4">
					<button 
						class="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-corner bg-ui-surface transition-colors hover:bg-[var(--primary-color,#0084ff)] hover:text-white"
						:class="volumeInfo.is_muted ? 'text-status-error border border-status-error/40' : 'text-tx-primary border border-ui-border'"
						@click="toggleMute"
						title="Silenciar Audio"
					>
						<img v-if="volumeIconContent" :src="volumeIconContent" alt="Volumen" class="h-6 w-6" :class="{'opacity-60': volumeInfo.is_muted}" />
					</button>

					<div class="flex-1 px-2">
						<RangeSlider
							id="volume-slider"
							v-model="currentVolume"
							:min="volumeInfo.min"
							:max="volumeInfo.max"
							@update:model-value="setVolume"
						/>
					</div>

					<div class="w-12 text-right">
						<span class="text-sm font-semibold" :class="volumeInfo.is_muted ? 'text-status-error' : 'text-[var(--primary-color,#0084ff)]'">
							{{ volumePercentage }}%
						</span>
					</div>
				</div>
			</SectionCard>

			<!-- Dispositivos Salida -->
			<SectionCard>
				<h3 class="mb-4 text-lg font-medium text-tx-primary flex items-center justify-between">
					Salida de Audio
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

				<EmptyStateBox v-if="devicesLoading" message="Cargando tarjetas de sonido..." />
				<EmptyStateBox v-else-if="devices.length === 0" message="No hay dispositivos de audio disponibles" />
				
				<ul v-else class="flex flex-col gap-2 max-h-[14rem] overflow-y-auto pr-1">
					<li 
						v-for="device in devices" 
						:key="device.id"
						class="group flex cursor-pointer items-center justify-between gap-3 rounded-corner border px-4 py-3 transition-colors"
						:class="selectedDeviceId === device.id 
							? 'border-[var(--primary-color,#0084ff)]/50 bg-[var(--primary-color,#0084ff)]/5 shadow-sm' 
							: 'border-ui-border bg-ui-surface/40 hover:border-ui-border.hover hover:bg-ui-surface'"
						@click="selectDevice(device.id)"
					>
						<!-- Selector Circle -->
						<div 
							class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors"
							:class="selectedDeviceId === device.id ? 'border-[var(--primary-color,#0084ff)] bg-[var(--primary-color,#0084ff)]' : 'border-ui-border group-hover:border-[var(--primary-color,#0084ff)]/50'"
						>
							<div v-if="selectedDeviceId === device.id" class="h-2 w-2 rounded-full bg-white scale-100 transition-transform"></div>
						</div>
						
						<!-- Info -->
						<div class="flex flex-1 flex-col min-w-0">
							<span class="text-sm font-medium text-tx-primary truncate">
								{{ getDeviceName(device) }}
							</span>
							<span class="text-xs text-tx-muted mt-0.5" v-if="device.volume">
								Nivel: {{ Math.round(device.volume * 100) }}%
							</span>
						</div>

						<!-- Badge Default -->
						<span v-if="device.is_default" class="rounded bg-[var(--primary-color,#0084ff)]/10 px-2 py-0.5 text-xs font-semibold text-[var(--primary-color,#0084ff)] border border-[var(--primary-color,#0084ff)]/20">
							Activo
						</span>
					</li>
				</ul>
			</SectionCard>
		</div>
	</div>
</template>

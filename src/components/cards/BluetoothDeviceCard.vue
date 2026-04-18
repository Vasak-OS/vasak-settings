<script lang="ts" setup>
import { getDeviceInfo } from '@vasakgroup/plugin-bluetooth-manager';
import { getIconSource } from '@vasakgroup/plugin-vicons';
import { computed, onMounted, type Ref, ref } from 'vue';

const icon: Ref<string> = ref('');
const extraInfo: Ref<any> = ref({});

const props = defineProps<{
	device: any;
	actionLabel: string;
	connected?: boolean;
}>();

const emit = defineEmits<{
	action: [];
}>();

const deviceTitle = computed(() => props.device.alias || props.device.name || props.device.address);
const deviceSubtitle = computed(() => props.device.address);
const deviceMetadata = computed(() =>
	props.device.icon || props.device.type ? props.device.type : ''
);

const deviceExtraInfo = computed(() => {
	const info: string[] = [];
	if (extraInfo.value.battery !== undefined) {
		info.push(`🔋 ${extraInfo.value.battery}%`);
	}
	if (props.device.rssi) {
		info.push(`📶 ${props.device.rssi} dBm`);
	}
	if (extraInfo.value.manufacturer) {
		info.push(`🏷️ ${extraInfo.value.manufacturer}`);
	}
	return info;
});

onMounted(async () => {
	icon.value = await getIconSource(props.device.icon || 'bluetooth');
	if (props.device.path) {
		try {
			extraInfo.value = await getDeviceInfo(props.device.path);
		} catch (e) {
			console.error('Error obteniendo info de dispositivo Bluetooth:', e);
			extraInfo.value = {};
		}
	}
});
</script>

<template>
	<div 
		class="flex items-center justify-between rounded-corner border bg-ui-surface/60 px-4 py-3 pb-3 mb-2"
		:class="[connected ? 'border-[var(--primary-color,#0084ff)]/60 bg-[var(--primary-color,#0084ff)]/5' : 'border-ui-border hover:border-ui-border/80']"
	>
		<div class="flex flex-1 min-w-0 items-center gap-3">
			<img v-if="icon" :src="icon" :alt="deviceTitle" class="h-6 w-6 shrink-0 opacity-80" />
			<div class="h-6 w-6 shrink-0 rounded-full bg-ui-border animate-pulse" v-else></div>

			<div class="min-w-0 flex-1">
				<div class="font-medium truncate text-sm text-tx-primary">
					{{ deviceTitle }}
				</div>
				<div class="flex items-center gap-2 text-xs mt-0.5 text-tx-muted opacity-80">
					<span v-if="deviceSubtitle" class="truncate">{{ deviceSubtitle }}</span>
					<span v-if="deviceMetadata" class="truncate hidden sm:inline-block">· {{ deviceMetadata }}</span>
				</div>
				<div v-if="deviceExtraInfo && deviceExtraInfo.length > 0" class="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[11px] text-tx-muted/70">
					<span v-for="(info, index) in deviceExtraInfo" :key="index">
						{{ info }}
					</span>
				</div>
			</div>
		</div>
		
		<div class="ml-4 flex items-center gap-3">
			<div
				v-if="connected"
				class="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
			/>
			<button
				type="button"
				class="rounded-corner px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors"
				:class="connected 
					? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20' 
					: 'bg-primary border border-primary text-white shadow-sm hover:brightness-110'"
				@click.stop="emit('action')"
			>
				{{ actionLabel }}
			</button>
		</div>
	</div>
</template>

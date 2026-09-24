<script lang="ts" setup>
import { ThemeIcon } from '@vasakgroup/vue-libvasak';
import { computed } from 'vue';

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
const deviceMetadata = computed(() => props.device.icon || props.device.alias || '');

const deviceExtraInfo = computed(() => {
	const info: string[] = [];
	if (props.device.rssi) {
		info.push(`📶 ${props.device.rssi} dBm`);
	}
	return info;
});
</script>

<template>
	<div 
		class="flex items-center justify-between rounded-corner border bg-ui-surface/60 px-4 py-3 pb-3 mb-2"
		:class="[connected ? 'border-primary/60 bg-primary/5' : 'border-ui-border hover:border-ui-border/80']"
	>
		<div class="flex flex-1 min-w-0 items-center gap-3">
			<!-- Antes había un círculo latiendo mientras no hubiera icono. Se va
			     por dos motivos: `ThemeIcon` ya reserva el hueco del mismo tamaño
			     —que era para lo que servía, para que la fila no salte— y ese
			     latido también aparecía cuando el tema **no tiene** ese icono, que
			     es un estado permanente: quedaba pulsando para siempre como si
			     estuviera por llegar algo. -->
			<ThemeIcon
				:name="device.icon || 'bluetooth'"
				:size="24"
				:alt="deviceTitle"
				class="opacity-80" />

			<div class="min-w-0 flex-1">
				<div class="font-medium truncate text-sm text-tx-main">
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
				class="w-2 h-2 rounded-full bg-status-success shadow-[0_0_8px_rgba(34,197,94,0.6)]"
			/>
			<button
				type="button"
				class="rounded-corner px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors"
				:class="connected 
					? 'bg-status-error/10 text-status-error hover:bg-status-error/20 border border-status-error/20' 
					: 'bg-primary border border-primary text-white shadow-sm hover:brightness-110'"
				@click.stop="emit('action')"
			>
				{{ actionLabel }}
			</button>
		</div>
	</div>
</template>

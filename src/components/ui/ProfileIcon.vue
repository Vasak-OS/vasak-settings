<script setup lang="ts">
import { useReactiveIcon } from '@/composables/useReactiveIcon';

interface Props {
	profile: string;
}

const props = defineProps<Props>();

function iconName(profile: string): string {
	switch (profile) {
		case 'performance':
			return 'battery-profile-performance';
		case 'balanced':
			return 'battery-profile-balanced';
		case 'power-saver':
			return 'battery-profile-powersave';
		default:
			return 'preferences-other';
	}
}

const [icon] = useReactiveIcon(() => iconName(props.profile));
</script>

<template>
	<img v-if="icon" :src="icon" class="h-5 w-5 shrink-0" />
</template>

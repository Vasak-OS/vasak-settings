<script setup lang="ts">
import { ThemeIcon } from '@vasakgroup/vue-libvasak';
import { computed } from 'vue';

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

const icono = computed(() => iconName(props.profile));
</script>

<template>
	<ThemeIcon :name="icono" :size="20" />
</template>

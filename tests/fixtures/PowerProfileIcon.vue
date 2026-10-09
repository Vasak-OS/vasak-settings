<script setup lang="ts">
/**
 * El icono de un perfil de energía, como lo dibuja la pantalla de Energía:
 * `ThemeIcon` con el nombre que da `powerProfileIcon`. Las pruebas del icono
 * reactivo lo usaban a través de `ProfileIcon.vue`, que ya no existe.
 */
import { ThemeIcon } from '@vasakgroup/vue-libvasak';
import { computed } from 'vue';
import { powerProfileIcon } from '../../src/utils/power-profile-icon';

const props = defineProps<{ profile: string }>();
const name = computed(() => powerProfileIcon(props.profile));
</script>

<template>
	<ThemeIcon :name="name" :size="20" />
</template>

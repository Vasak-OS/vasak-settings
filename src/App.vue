<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useConfigStore } from '@vasakgroup/plugin-config-manager';
import { RevealTransition } from '@vasakgroup/vue-libvasak';
import { nextTick, onMounted, onUnmounted, type Ref, ref } from 'vue';
import TextContextMenu from '@/components/ui/TextContextMenu.vue';
import { useWallpaperColors } from '@/composables/useWallpaperColors';
import WindowAppLayout from '@/layouts/WindowAppLayout.vue';
import { saveTheme } from '@/utils/theme-cache';

let unListenConfig: Ref<UnlistenFn | null> = ref(null);

// La primera lectura de la configuración va después del primer dibujo: en
// `onMounted` sin esperar, el marco se pinta con los valores por omisión y la
// configuración llega encima. Si la lectura falla, se avisa con el banner y la
// app sigue con los valores por defecto — nunca deja la ventana sin montar.
const configLoading = ref(true);
const configError = ref(false);

// «Seguir al fondo» lo corre vasak-desktop, que está siempre abierto. Cuando
// reescribe `custom.json`, el editor de Apariencia tiene que tomar los colores
// nuevos: si no, el próximo cambio a mano guardaría encima los de antes.
const wallpaperColors = useWallpaperColors();
const refreshCustomScheme = () => {
	wallpaperColors.refreshFromDisk().catch((error) => {
		console.error('Error al releer el esquema Personalizado', error);
	});
};

onMounted(async () => {
	// Afina el WebKit de la ventana para bajar su consumo de memoria; sin bloquear.
	invoke('tune_webview').catch(() => {});

	// Que el layout se pinte primero, antes de cualquier lectura.
	await nextTick();

	const configStore = useConfigStore();

	try {
		// Se guarda el tema ya aplicado, para que el próximo arranque no parpadee.
		await configStore.loadConfig().then(() => saveTheme());
		configLoading.value = false;
	} catch (error: any) {
		configLoading.value = false;
		configError.value = true;
		console.error('Error al cargar configuración en App.vue', error);
	}

	// Fuera del `try` de la lectura: aunque esa falle o nunca resuelva, los
	// cambios de configuración de después tienen que poder aplicarse. Antes,
	// un fallo en la primera lectura dejaba la suscripción sin registrar y la
	// app se quedaba con los valores por defecto hasta reiniciar.
	try {
		unListenConfig.value = await listen('config-changed', async () => {
			document.startViewTransition(() => {
				configStore.loadConfig().then(() => saveTheme());
			});
			refreshCustomScheme();
		});
	} catch (error: any) {
		console.error('No se pudo escuchar los cambios de configuración', error);
	}
});

onUnmounted(() => {
	if (unListenConfig.value !== null) {
		unListenConfig.value();
	}
});
</script>

<template>
	<WindowAppLayout>
		<!-- Cada sección es una ruta distinta: sale la vieja y recién entonces entra
		     la nueva (`out-in`), así nunca hay dos secciones apiladas en el panel. -->
		<RouterView v-slot="{ Component }">
			<RevealTransition mode="out-in">
				<component :is="Component" />
			</RevealTransition>
		</RouterView>
	</WindowAppLayout>

	<!-- Una sola vez, en el marco: escucha en el documento, así ninguna pantalla
	     tiene que acordarse de nada. -->
	<TextContextMenu />

	<div v-if="configLoading" class="config-status">
		Cargando configuración…
	</div>
	<div v-else-if="configError" class="error-banner">
		Error al cargar configuración. Usando valores por defecto.
	</div>
</template>

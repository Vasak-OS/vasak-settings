<script setup lang="ts">
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useConfigStore } from '@vasakgroup/plugin-config-manager';
import { onMounted, onUnmounted, type Ref, ref } from 'vue';
import TextContextMenu from '@/components/ui/TextContextMenu.vue';
import { useWallpaperColors } from '@/composables/useWallpaperColors';
import WindowAppLayout from '@/layouts/WindowAppLayout.vue';

let unListenConfig: Ref<UnlistenFn | null> = ref(null);

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
	try {
		const configStore = useConfigStore();
		// El fundido entre esquemas (`scheme-transition`) lo pone el store del
		// plugin desde la 2.10.0, en todas las aplicaciones.
		await configStore.loadConfig();

		unListenConfig.value = await listen('config-changed', async () => {
			document.startViewTransition(() => {
				configStore.loadConfig();
			});
			refreshCustomScheme();
		});
	} catch (error: any) {
		console.error('Error al cargar configuración en App.vue', error);
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
		<RouterView />
	</WindowAppLayout>

	<!-- Una sola vez, en el marco: escucha en el documento, así ninguna pantalla
	     tiene que acordarse de nada. -->
	<TextContextMenu />
</template>

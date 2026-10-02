<script setup lang="ts">
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useConfigStore } from '@vasakgroup/plugin-config-manager';
import { onMounted, onUnmounted, type Ref, ref } from 'vue';
import TextContextMenu from '@/components/ui/TextContextMenu.vue';
import { useWallpaperColors } from '@/composables/useWallpaperColors';
import WindowAppLayout from '@/layouts/WindowAppLayout.vue';

let unListenConfig: Ref<UnlistenFn | null> = ref(null);

// «Seguir al fondo» se mira acá y no en Apariencia: el fondo puede cambiar
// desde cualquier pantalla de esta ventana o desde el escritorio, y el acento
// tiene que seguirlo aunque Apariencia no esté abierta. Si no está prendido, o
// el «Personalizado» no está en uso, no hace nada.
const wallpaperColors = useWallpaperColors();
const followWallpaper = () => {
	wallpaperColors.syncWithConfig().catch((error) => {
		console.error('Error al seguir los colores del fondo', error);
	});
};

onMounted(async () => {
	try {
		const configStore = useConfigStore();
		await configStore.loadConfig();
		// Desde acá los cambios de esquema se funden en vez de saltar (el
		// `@property` de `tokens.css`, vue-libvasak ≥ 2.5). Va después de la
		// primera carga a propósito: antes, el fundido iría de los colores de
		// fábrica a los del esquema al abrir la ventana, y se vería un parpadeo.
		document.documentElement.classList.add('scheme-transition');
		followWallpaper();

		unListenConfig.value = await listen('config-changed', async () => {
			document.startViewTransition(() => {
				configStore.loadConfig();
			});
			followWallpaper();
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

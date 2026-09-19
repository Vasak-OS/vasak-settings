<script lang="ts" setup>
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { SideBar, type SidebarCategory, WindowFrame } from '@vasakgroup/vue-libvasak';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { categoriasDelMenu } from '@/composables/menu';
import { menuSegunHardware } from '@/composables/secciones-por-hardware';
import { useHardwareDeRed } from '@/composables/useHardwareDeRed';
import { useReactiveIcon } from '@/composables/useReactiveIcon';

const route = useRoute();
const router = useRouter();

const { t } = useI18n();

const selectedSection = ref((route.name as string) || 'home');

watch(selectedSection, (newSection) => {
	if (newSection !== route.name) {
		router.push({ name: newSection });
	}
});

watch(
	() => route.name,
	(newName) => {
		if (newName && newName !== selectedSection.value) {
			selectedSection.value = newName as string;
		}
	}
);

const [appIcon] = useReactiveIcon('preferences');

const { wifi, bluetooth } = useHardwareDeRed();

const todasLasCategorias = computed<SidebarCategory[]>(() => categoriasDelMenu(t));

/**
 * El menú que se dibuja, sin las secciones cuyo hardware no existe.
 *
 * Un equipo sin placa inalámbrica mostraba igual la sección de Wi-Fi, y ahí lo
 * único que se puede leer es que no hay ninguna red: no falla nada, pero le hace
 * buscar a alguien un problema donde no hay ninguno. Lo mismo con Bluetooth.
 *
 * Lo que **no se pudo averiguar** se muestra: ver `menuSegunHardware`.
 */
const sidebarCategories = computed<SidebarCategory[]>(() =>
	menuSegunHardware(todasLasCategorias.value, { wifi: wifi.value, bluetooth: bluetooth.value })
);
</script>
<template>
  <WindowFrame
    :minimize-label="t('windowControls.minimize')"
    :maximize-label="t('windowControls.maximize')"
    :close-label="t('windowControls.close')">
    <template #identidad>
      <img :src="appIcon" class="h-8 w-8" :alt="t('views.app.iconAlt')">
    </template>

    <!-- El nombre al medio de la ventana entera. Estaba centrado con un tercer
         `div` vacío tirando contra el `justify-between` de la barra propia, y
         eso lo deja centrado respecto de lo que sobra entre el icono y los
         controles: los tres botones ocupan bastante más que el icono, así que
         se corría. -->
    <template #centro>
      <span class="font-title font-semibold text-lg">{{ t('views.app.title') }}</span>
    </template>

    <div class="relative flex min-h-0 min-w-0 flex-1 overflow-hidden p-1">
      <!-- La barra es la de `@vasakgroup/vue-libvasak`. Nació acá y la copiaron
           la tienda y el monitor a mano; ahora vive en un solo lugar y cuando
           cambie cambia en todas las ventanas a la vez. -->
      <SideBar
        v-model="selectedSection"
        :title="t('views.app.title')"
        :subtitle="t('views.app.subtitle')"
        :categories="sidebarCategories"
        :collapse-label="t('sidebar.collapse')"
        :expand-label="t('sidebar.expand')"
      />

			<main class="min-h-0 min-w-0 flex-1 rounded-corner border border-ui-border bg-ui-surface/70 p-4 md:ml-1 overflow-y-auto overflow-x-hidden">
				<slot />
			</main>
    </div>
  </WindowFrame>
</template>

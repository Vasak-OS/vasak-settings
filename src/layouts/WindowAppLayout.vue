<script lang="ts" setup>
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import SidebarComponent from '@/components/sidebar/SidebarComponent.vue';
import TopBarComponent from '@/components/topbar/TopBarComponent.vue';
import { categoriasDelMenu } from '@/composables/menu';
import { menuSegunHardware } from '@/composables/secciones-por-hardware';
import { useHardwareDeRed } from '@/composables/useHardwareDeRed';
import { useReactiveIcon } from '@/composables/useReactiveIcon';
import { SidebarCategory } from '@/types/sidebar';

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
  <div
    class="h-screen w-screen bg-ui-bg/80 rounded-corner-window flex flex-col border border-ui-border overflow-hidden">
    <TopBarComponent>
      <div><img :src="appIcon" class="w-8 h-8" :alt="t('views.app.iconAlt')"></div>
      <div class="text-lg font-semibold">{{ t('views.app.title') }}</div>
      <div></div>
    </TopBarComponent>
    <div class="relative flex flex-1 overflow-hidden p-1">
      <SidebarComponent
        v-model="selectedSection"
        :title="t('views.app.title')"
        :subtitle="t('views.app.subtitle')"
        :categories="sidebarCategories"
      />

			<main class="min-h-0 min-w-0 flex-1 rounded-corner border border-ui-border bg-ui-bg/80 p-4 md:ml-1 overflow-y-auto overflow-x-hidden">
				<slot />
			</main>
    </div>
  </div>
</template>

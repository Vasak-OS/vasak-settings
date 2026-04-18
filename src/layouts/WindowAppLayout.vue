<script lang="ts" setup>
import { getIconSource } from '@vasakgroup/plugin-vicons';
import { onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import SidebarComponent from '@/components/sidebar/SidebarComponent.vue';
import TopBarComponent from '@/components/topbar/TopBarComponent.vue';
import { SidebarCategory } from '@/types/sidebar';

const route = useRoute();
const router = useRouter();

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

const appIcon = ref('');

const sidebarCategories: SidebarCategory[] = [
	{
		id: 'general',
		title: 'General',
		items: [{ id: 'home', label: 'Inicio', icon: 'home' }],
	},
	{
		id: 'appearance',
		title: 'Apariencia',
		items: [
			{ id: 'appearance-theme', label: 'Tema', icon: 'preferences-theme' },
			{ id: 'appearance-wallpaper', label: 'Fondos', icon: 'preferences-wallpaper' },
			{ id: 'appearance-desktop', label: 'Escritorio', icon: 'preferences-desktop-display' },
			{ id: 'appearance-font', label: 'Tipografia', icon: 'preferences-desktop-font' },
		],
	},
	{
		id: 'multimedia',
		title: 'Multimedia',
		items: [
			{ id: 'multimedia-audio', label: 'Audio salida', icon: 'audio-speakers-symbolic' },
			{
				id: 'multimedia-audio-input',
				label: 'Audio entrada',
				icon: 'audio-input-microphone-symbolic',
			},
		],
	},
	{
		id: 'system',
		title: 'Sistema',
		items: [
			{ id: 'system-power', label: 'Energia', icon: 'preferences-system-power-management' },
			{ id: 'system-storage', label: 'Almacenamiento', icon: 'preferences-system-disks' },
		],
	},
	{
		id: 'network',
		title: 'Conectividad',
		items: [
			{ id: 'network-wifi', label: 'Wi-Fi', icon: 'network-wireless' },
			{ id: 'network-bluetooth', label: 'Bluetooth', icon: 'preferences-bluetooth' },
			{ id: 'network-vpn', label: 'VPN', icon: 'preferences-system-network-vpn' },
		],
	},
];

onMounted(async () => {
	appIcon.value = await getIconSource('preferences');
});
</script>
<template>
  <div
    class="h-screen w-screen bg-ui-bg/80 rounded-corner-window flex flex-col border border-ui-border overflow-hidden">
    <TopBarComponent>
      <div><img :src="appIcon" class="w-8 h-8" alt="Icono de la aplicación"></div>
      <div class="text-lg font-semibold">Centro de Control</div>
      <div></div>
    </TopBarComponent>
    <div class="relative flex flex-1 overflow-hidden p-1">
      <SidebarComponent
        v-model="selectedSection"
        title="Centro de Control"
        subtitle="Ajustes principales"
        :categories="sidebarCategories"
      />

			<main class="min-h-0 min-w-0 flex-1 rounded-corner border border-ui-border bg-ui-bg/80 p-4 md:ml-1 overflow-y-auto overflow-x-hidden">
				<slot />
			</main>
    </div>
  </div>
</template>

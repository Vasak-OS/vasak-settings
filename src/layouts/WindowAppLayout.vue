<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import SidebarComponent from '@/components/sidebar/SidebarComponent.vue';
import TopBarComponent from '@/components/topbar/TopBarComponent.vue';
import { SidebarCategory } from '@/types/sidebar';
import { getIconSource } from '@vasakgroup/plugin-vicons';

const selectedSection = ref('appearance-theme');
const appIcon = ref(''); 

const sidebarCategories: SidebarCategory[] = [
	{
		id: 'appearance',
		title: 'Apariencia',
		items: [
			{ id: 'appearance-theme', label: 'Tema', icon: 'TH' },
			{ id: 'appearance-wallpaper', label: 'Fondos', icon: 'FD' },
			{ id: 'appearance-font', label: 'Tipografia', icon: 'TX' },
		],
	},
	{
		id: 'system',
		title: 'Sistema',
		items: [
			{ id: 'system-power', label: 'Energia', icon: 'EN' },
			{ id: 'system-storage', label: 'Almacenamiento', icon: 'AL' },
			{ id: 'system-updates', label: 'Actualizaciones', icon: 'UP', badge: '3' },
		],
	},
	{
		id: 'network',
		title: 'Conectividad',
		items: [
			{ id: 'network-wifi', label: 'Wi-Fi', icon: 'WF' },
			{ id: 'network-bluetooth', label: 'Bluetooth', icon: 'BT' },
			{ id: 'network-vpn', label: 'VPN', icon: 'VP' },
		],
	},
];

onMounted(async() => {
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

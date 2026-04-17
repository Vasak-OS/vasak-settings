<script lang="ts" setup>
import { ref } from 'vue';
import SidebarComponent from '@/components/sidebar/SidebarComponent.vue';
import TopBarComponent from '@/components/topbar/TopBarComponent.vue';
import { SidebarCategory } from '@/types/sidebar';

const selectedSection = ref('appearance-theme');

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
</script>
<template>
  <div
    class="h-screen w-screen bg-ui-bg/80 rounded-corner-window flex flex-col border border-ui-border overflow-hidden">
    <TopBarComponent>
    </TopBarComponent>
    <div class="relative flex flex-1 overflow-hidden p-1">
      <SidebarComponent
        v-model="selectedSection"
        title="Centro de Control"
        subtitle="Ajustes principales"
        :categories="sidebarCategories"
      />

			<main class="min-w-0 flex-1 rounded-corner border border-ui-border bg-ui-bg/80 p-4 md:ml-1 overflow-hidden">
				<slot />
			</main>
    </div>
  </div>
</template>

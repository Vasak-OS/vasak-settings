<script lang="ts" setup>
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import SidebarComponent from '@/components/sidebar/SidebarComponent.vue';
import TopBarComponent from '@/components/topbar/TopBarComponent.vue';
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

const sidebarCategories = computed<SidebarCategory[]>(() => [
	{
		id: 'general',
		title: t('sidebar.general'),
		items: [
			{ id: 'home', label: t('sidebar.items.home'), icon: 'home' },
			{
				id: 'shortcuts',
				label: t('sidebar.items.shortcuts'),
				icon: 'preferences-desktop-keyboard',
			},
		],
	},
	{
		id: 'appearance',
		title: t('sidebar.appearance'),
		items: [
			{
				id: 'appearance-theme',
				label: t('sidebar.items.appearanceTheme'),
				icon: 'preferences-theme',
			},
			{
				id: 'appearance-fonts',
				label: t('sidebar.items.appearanceFonts'),
				icon: 'preferences-desktop-font',
			},
			{
				id: 'appearance-icon-packs',
				label: t('sidebar.items.appearanceIconPacks'),
				icon: 'preferences-desktop-icons',
			},
			{
				id: 'appearance-wallpaper',
				label: t('sidebar.items.appearanceWallpaper'),
				icon: 'preferences-wallpaper',
			},
			{
				id: 'appearance-desktop',
				label: t('sidebar.items.appearanceDesktop'),
				icon: 'preferences-desktop-display',
			},
		],
	},
	{
		id: 'multimedia',
		title: t('sidebar.multimedia'),
		items: [
			{
				id: 'multimedia-audio',
				label: t('sidebar.items.multimediaAudio'),
				icon: 'audio-speakers-symbolic',
			},
			{
				id: 'multimedia-audio-input',
				label: t('sidebar.items.multimediaAudioInput'),
				icon: 'audio-input-microphone-symbolic',
			},
		],
	},
	{
		id: 'windows',
		title: t('sidebar.windows'),
		items: [
			{
				id: 'wayfire-input',
				label: t('sidebar.items.wayfireInput'),
				icon: 'preferences-desktop-keyboard',
			},
			{
				id: 'wayfire-windows',
				label: t('sidebar.items.wayfireWindows'),
				icon: 'preferences-system-windows',
			},
			{
				id: 'wayfire-workspaces',
				label: t('sidebar.items.wayfireWorkspaces'),
				icon: 'video-display',
			},
			{
				id: 'wayfire-appearance',
				label: t('sidebar.items.wayfireAppearance'),
				icon: 'preferences-desktop-theme',
			},
			{
				id: 'wayfire-effects',
				label: t('sidebar.items.wayfireEffects'),
				icon: 'preferences-desktop-effects',
			},
			{ id: 'wayfire-autostart', label: t('sidebar.items.wayfireAutostart'), icon: 'system-run' },
			{
				id: 'wayfire-plugins',
				label: t('sidebar.items.wayfirePlugins'),
				icon: 'application-x-addon',
			},
		],
	},
	{
		id: 'system',
		title: t('sidebar.system'),
		items: [
			{ id: 'users', label: t('sidebar.items.users'), icon: 'system-users' },
			{
				id: 'language-keyboard',
				label: t('sidebar.items.languageKeyboard'),
				icon: 'preferences-desktop-locale',
			},
			{ id: 'datetime', label: t('sidebar.items.datetime'), icon: 'preferences-system-time' },
			{ id: 'brightness', label: t('sidebar.items.brightness'), icon: 'display-brightness' },
			{ id: 'power', label: t('sidebar.items.power'), icon: 'battery' },
			{ id: 'monitors', label: t('sidebar.items.monitors'), icon: 'video-display' },
			{
				id: 'privacy-security',
				label: t('sidebar.items.privacySecurity'),
				icon: 'security-high',
			},
			{
				id: 'login-screen',
				label: t('sidebar.items.loginScreen'),
				icon: 'preferences-system-login',
			},
		],
	},
	{
		id: 'network',
		title: t('sidebar.network'),
		items: [
			{ id: 'network-wifi', label: t('sidebar.items.networkWifi'), icon: 'network-wireless' },
			{
				id: 'network-bluetooth',
				label: t('sidebar.items.networkBluetooth'),
				icon: 'preferences-bluetooth',
			},
			{
				id: 'network-vpn',
				label: t('sidebar.items.networkVpn'),
				icon: 'preferences-system-network-vpn',
			},
			{
				id: 'phone-devices',
				label: t('sidebar.items.phoneDevices'),
				icon: 'smartphone',
			},
		],
	},
]);
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

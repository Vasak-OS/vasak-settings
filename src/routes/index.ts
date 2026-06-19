import { createMemoryHistory, createRouter } from 'vue-router';

const routes = [
	{ path: '/', name: 'home', component: () => import('@/views/HomeView.vue') },
	{
		path: '/shortcuts',
		name: 'shortcuts',
		component: () => import('@/views/ShortcutsView.vue'),
	},
	{
		path: '/appearance-theme',
		name: 'appearance-theme',
		component: () => import('@/views/AppearanceThemeView.vue'),
	},
	{
		path: '/appearance-icon-packs',
		name: 'appearance-icon-packs',
		component: () => import('@/views/IconPacksView.vue'),
	},
	{
		path: '/appearance-desktop',
		name: 'appearance-desktop',
		component: () => import('@/views/AppearanceDesktopView.vue'),
	},
	{
		path: '/appearance-fonts',
		name: 'appearance-fonts',
		component: () => import('@/views/AppearanceFontsView.vue'),
	},
	{
		path: '/appearance-wallpaper',
		name: 'appearance-wallpaper',
		component: () => import('@/views/WallpaperView.vue'),
	},
	{
		path: '/network-wifi',
		name: 'network-wifi',
		component: () => import('@/views/NetworkWifiView.vue'),
	},
	{
		path: '/network-bluetooth',
		name: 'network-bluetooth',
		component: () => import('@/views/NetworkBluetoothView.vue'),
	},
	{
		path: '/network-vpn',
		name: 'network-vpn',
		component: () => import('@/views/NetworkVpnView.vue'),
	},
	{
		path: '/multimedia-audio',
		name: 'multimedia-audio',
		component: () => import('@/views/MultimediaAudioView.vue'),
	},
	{
		path: '/multimedia-audio-input',
		name: 'multimedia-audio-input',
		component: () => import('@/views/MultimediaAudioInputView.vue'),
	},
	{
		path: '/wayfire-input',
		name: 'wayfire-input',
		component: () => import('@/views/WayfireInputView.vue'),
	},
	{
		path: '/wayfire-windows',
		name: 'wayfire-windows',
		component: () => import('@/views/WayfireWindowsView.vue'),
	},
	{
		path: '/wayfire-workspaces',
		name: 'wayfire-workspaces',
		component: () => import('@/views/WayfireWorkspacesView.vue'),
	},
	{
		path: '/wayfire-appearance',
		name: 'wayfire-appearance',
		component: () => import('@/views/WayfireAppearanceView.vue'),
	},
	{
		path: '/wayfire-effects',
		name: 'wayfire-effects',
		component: () => import('@/views/WayfireEffectsView.vue'),
	},
	{
		path: '/wayfire-autostart',
		name: 'wayfire-autostart',
		component: () => import('@/views/WayfireAutostartView.vue'),
	},
	{
		path: '/power',
		name: 'power',
		component: () => import('@/views/PowerView.vue'),
	},
];
export const router = createRouter({
	history: createMemoryHistory(),
	routes,
});

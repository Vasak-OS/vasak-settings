import { createMemoryHistory, createRouter } from 'vue-router';

const routes = [
	{ path: '/', name: 'home', component: () => import('@/views/HomeView.vue') },
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
];
export const router = createRouter({
	history: createMemoryHistory(),
	routes,
});

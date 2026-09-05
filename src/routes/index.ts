import { createMemoryHistory, createRouter } from 'vue-router';
import { seccionInaccesible } from '@/composables/secciones-por-hardware';
import { hardwareDeRed } from '@/composables/useHardwareDeRed';

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
		path: '/appearance-panel',
		name: 'appearance-panel',
		component: () => import('@/views/AppearancePanelView.vue'),
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
		path: '/phone-devices',
		name: 'phone-devices',
		component: () => import('@/views/PhoneDevicesView.vue'),
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
		path: '/wayfire-plugins',
		name: 'wayfire-plugins',
		component: () => import('@/views/WayfirePluginsView.vue'),
	},
	{
		path: '/users',
		name: 'users',
		component: () => import('@/views/UsersView.vue'),
	},
	{
		path: '/datetime',
		name: 'datetime',
		component: () => import('@/views/DateTimeView.vue'),
	},
	{
		path: '/brightness',
		name: 'brightness',
		component: () => import('@/views/DisplayBrightnessView.vue'),
	},
	{
		path: '/power',
		name: 'power',
		component: () => import('@/views/PowerView.vue'),
	},
	{
		path: '/monitors',
		name: 'monitors',
		component: () => import('@/views/MonitorsView.vue'),
	},
	{
		path: '/language-keyboard',
		name: 'language-keyboard',
		component: () => import('@/views/LanguageKeyboardView.vue'),
	},
	{
		path: '/camera-microphone',
		name: 'camera-microphone',
		component: () => import('@/views/CameraMicrophoneView.vue'),
	},
	{
		path: '/online-accounts',
		name: 'online-accounts',
		component: () => import('@/views/OnlineAccountsView.vue'),
	},
	{
		path: '/login-screen',
		name: 'login-screen',
		component: () => import('@/views/LoginScreenView.vue'),
	},
];
export const router = createRouter({
	history: createMemoryHistory(),
	routes,
});

/**
 * No se llega a una sección cuyo hardware no está.
 *
 * El menú lateral ya la esconde, pero hay otra puerta: `vasak-settings
 * network-wifi` abre la aplicación directamente en esa pantalla, y es lo que usa
 * el menú del panel. Sin esto, las dos puertas contestaban distinto — una
 * escondía la sección y la otra dejaba entrar.
 *
 * El sondeo lo comparte con el menú, así que las dos decisiones salen de la
 * misma respuesta y no de dos consultas que podrían diferir.
 *
 * `desconocido` deja pasar, igual que deja la sección en el menú: si no se pudo
 * preguntar, esta pantalla es el único lugar donde eso se puede explicar.
 */
router.beforeEach(async (destino) => {
	if (seccionInaccesible(destino.name as string | undefined, await hardwareDeRed())) {
		return { name: 'home' };
	}
	// `undefined` y no `true`: es lo que vue-router entiende como «seguí».
	return undefined;
});

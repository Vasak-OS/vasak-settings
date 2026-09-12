/**
 * Qué secciones ofrece la ventana, y en qué orden.
 *
 * Aparte del componente por lo mismo que `secciones-por-hardware`: para poder
 * probarlo. Lo que se prueba acá no es el orden ni los nombres —eso es gusto—
 * sino que **no falte ninguna**: una pantalla puede estar escrita, ruteada y
 * traducida, y aun así no existir para quien usa el sistema, porque nada del
 * menú la nombra. Pasó con «Cuentas en Línea», que estuvo cuatro meses
 * terminada y sin forma de llegar.
 *
 * El `t` entra por parámetro en vez de llamarse acá adentro para que la prueba
 * pueda mirar los identificadores sin levantar medio plugin de traducciones.
 */

import type { SidebarCategory } from '@/types/sidebar';

/** Cómo se traduce una etiqueta. */
export type Traductor = (clave: string) => string;

export function categoriasDelMenu(t: Traductor): SidebarCategory[] {
	return [
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
				{
					id: 'appearance-panel',
					label: t('sidebar.items.appearancePanel'),
					icon: 'preferences-system-windows',
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
					id: 'online-accounts',
					label: t('sidebar.items.onlineAccounts'),
					icon: 'online-accounts',
				},
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
					id: 'actualizaciones',
					label: t('sidebar.items.actualizaciones'),
					icon: 'system-software-update',
				},
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
	];
}

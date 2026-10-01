/**
 * El icono del tema de cada perfil de energía.
 *
 * Vivía adentro de `ProfileIcon.vue`, una capa sobre `ThemeIcon` que sólo
 * elegía el nombre. La capa se fue con el resto de `components/ui/`: el icono
 * lo dibuja `ThemeIcon` de la librería y lo único propio de Configuración es
 * esta traducción de perfil a nombre, que es un dato y no un componente.
 *
 * Un perfil desconocido —power-profiles-daemon puede sumar uno— cae en el
 * genérico de preferencias en vez de pedirle al tema un nombre que no tiene.
 */
const ICONS: Record<string, string> = {
	performance: 'battery-profile-performance',
	balanced: 'battery-profile-balanced',
	'power-saver': 'battery-profile-powersave',
};

export function powerProfileIcon(profile: string): string {
	return ICONS[profile] ?? 'preferences-other';
}

/** El progreso de gamificación tal como lo serializa `vasak-health-protocol` (campos crudos, snake_case). */
export interface GamificationProgress {
	enabled: boolean;
	xp: number;
	streak_days: number;
	/** Ids estables de los logros desbloqueados (`xp-100`, `first-break`…). */
	achievements: string[];
}

/**
 * Los logros que informa el servicio, con su icono del tema y la clave con que
 * se traducen. Un id que no esté acá se muestra con su texto crudo y un icono
 * genérico.
 */
const ACHIEVEMENTS: Record<string, { icon: string; key: string }> = {
	'xp-100': { icon: 'starred', key: 'xp100' },
	'xp-500': { icon: 'starred', key: 'xp500' },
	'xp-1000': { icon: 'emblem-favorite', key: 'xp1000' },
	'first-break': { icon: 'media-playback-pause', key: 'firstBreak' },
	'first-hydration': { icon: 'weather-showers', key: 'firstHydration' },
};

/** El icono del tema para un logro; un id desconocido cae en uno genérico. */
export const achievementIcon = (id: string): string => ACHIEVEMENTS[id]?.icon ?? 'emblem-default';

/**
 * La clave de traducción de un logro conocido, o `null` si el id no está en la
 * tabla —ahí la vista muestra el id crudo—. Devuelve la clave y no el texto para
 * no atar esta utilidad al `t()` de la vista.
 */
export const achievementKey = (id: string): string | null => ACHIEVEMENTS[id]?.key ?? null;

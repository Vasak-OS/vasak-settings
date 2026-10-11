export interface VolumeInfo {
	current: number;
	min: number;
	max: number;
	is_muted: boolean;
}

export interface AudioDevice {
	id: string;
	name: string;
	description: string;
	is_default: boolean;
	volume: number;
}

/**
 * Una salida que vive detrás de un perfil de tarjeta (HDMI, S/PDIF). El sink no
 * existe hasta que su perfil está activo, así que estas salidas se ofrecen
 * aunque todavía no aparezcan en la lista de dispositivos.
 */
export interface AudioOutputProfile {
	card_name: string;
	profile_name: string;
	description: string;
	is_active: boolean;
	is_available: boolean;
	priority: number;
}

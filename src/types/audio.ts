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

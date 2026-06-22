import { invoke } from '@tauri-apps/api/core';

export interface MonitorMode {
	width: number;
	height: number;
	refresh: number;
	is_preferred: boolean;
	is_current: boolean;
}

export interface DetectedMonitor {
	name: string;
	connected: boolean;
	available_modes: MonitorMode[];
	wayfire_config: Record<string, string> | null;
}

export const getDetectedMonitors = (): Promise<DetectedMonitor[]> => {
	return invoke<DetectedMonitor[]>('get_detected_monitors');
};

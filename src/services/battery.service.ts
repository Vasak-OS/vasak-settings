import { invoke } from '@tauri-apps/api/core';

export interface BatteryInfo {
	has_battery: boolean;
	status: string;
	percentage: number;
	energy_rate: number;
	health: number;
	technology: string;
	model: string;
	manufacturer: string;
	time_to_empty: number;
	time_to_full: number;
	cycle_count: number;
}

export const getBatteryInfo = (): Promise<BatteryInfo> => {
	return invoke<BatteryInfo>('get_battery_info');
};

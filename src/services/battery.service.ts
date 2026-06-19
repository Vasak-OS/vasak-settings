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

export const getPowerProfiles = (): Promise<string[]> => {
	return invoke<string[]>('get_power_profiles');
};

export const setPowerProfile = (profile: string): Promise<void> => {
	return invoke<void>('set_power_profile', { profile });
};

export const getActivePowerProfile = (): Promise<string> => {
	return invoke<string>('get_active_power_profile');
};

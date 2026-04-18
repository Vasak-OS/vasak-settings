import { invoke } from '@tauri-apps/api/core';

export const isWirelessAvailable = (): Promise<boolean> => {
	return invoke<boolean>('plugin:network-manager|is_wireless_available');
};

export const getWirelessEnabled = (): Promise<boolean> => {
	return invoke<boolean>('plugin:network-manager|get_wireless_enabled');
};

export const setWirelessEnabled = (enabled: boolean): Promise<boolean> => {
	return invoke<boolean>('plugin:network-manager|set_wireless_enabled', { enabled });
};

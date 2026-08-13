import { invoke } from '@tauri-apps/api/core';

/**
 * A phone that has connected to this session at least once.
 *
 * There is no credential here and none is stored. Whether a phone may actually
 * connect is decided by adb's own authorisation, which lives on the phone.
 */
export interface KnownDevice {
	serial: string;
	/** The alias if one was set, otherwise the model reported by the phone. */
	name: string;
	first_seen: string;
	last_address: string;
	connected: boolean;
	/** `ready`, `unauthorized`, `connecting`, `offline`, or empty when absent. */
	state: string;
}

export const listKnownDevices = (): Promise<KnownDevice[]> =>
	invoke<KnownDevice[]>('connect_list_known_devices');

export const setDeviceAlias = (serial: string, alias: string): Promise<boolean> =>
	invoke<boolean>('connect_set_alias', { serial, alias });

export const forgetDevice = (serial: string): Promise<boolean> =>
	invoke<boolean>('connect_forget_device', { serial });

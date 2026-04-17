import { invoke } from '@tauri-apps/api/core';
import type { AudioDevice, VolumeInfo } from '@/types/audio';

export const getAudioVolume = (): Promise<VolumeInfo> => {
	return invoke<VolumeInfo>('get_audio_volume');
};

export const setAudioVolume = (volume: number): Promise<void> => {
	return invoke<void>('set_audio_volume', { volume });
};

export const toggleAudioMute = (): Promise<boolean> => {
	return invoke<boolean>('toggle_audio_mute');
};

export const getAudioDevices = (): Promise<AudioDevice[]> => {
	return invoke<AudioDevice[]>('get_audio_devices');
};

export const setAudioDevice = (deviceId: string): Promise<boolean> => {
	return invoke<boolean>('set_audio_device', { deviceId });
};

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

export const getAudioInputVolume = (): Promise<VolumeInfo> => {
	return invoke<VolumeInfo>('get_audio_input_volume');
};

export const setAudioInputVolume = (volume: number): Promise<void> => {
	return invoke<void>('set_audio_input_volume', { volume });
};

export const toggleAudioInputMute = (): Promise<boolean> => {
	return invoke<boolean>('toggle_audio_input_mute');
};

export const getAudioInputDevices = (): Promise<AudioDevice[]> => {
	return invoke<AudioDevice[]>('get_audio_input_devices');
};

export const setAudioInputDevice = (deviceId: string): Promise<boolean> => {
	return invoke<boolean>('set_audio_input_device', { deviceId });
};

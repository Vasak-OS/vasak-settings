import { invoke } from '@tauri-apps/api/core';
import type { SystemInfo } from '@/types/system';

export const getSystemInfo = (): Promise<SystemInfo> => {
	return invoke<SystemInfo>('get_system_info');
};

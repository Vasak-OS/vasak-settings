import { invoke } from '@tauri-apps/api/core';

export type Provenance = 'system-installed' | 'unverified';
export type Decision = 'allowed' | 'denied' | 'unknown';

export interface PermissionApplication {
	binary_path: string;
	display_name: string;
	provenance: Provenance;
}

export interface PermissionEntry {
	application: PermissionApplication;
	/** Resource id → decision. */
	decisions: Record<string, Decision>;
}

export const listPermissions = (): Promise<PermissionEntry[]> =>
	invoke<PermissionEntry[]>('list_permissions');

/**
 * The service asks polkit before writing, so this surfaces an authentication
 * dialog and can be refused. That is deliberate: without it any program could
 * grant itself what it had just been refused.
 */
export const setPermission = (
	binaryPath: string,
	resourceId: string,
	allowed: boolean
): Promise<void> => invoke<void>('set_permission', { binaryPath, resourceId, allowed });

export const forgetPermission = (binaryPath: string): Promise<void> =>
	invoke<void>('forget_permission', { binaryPath });

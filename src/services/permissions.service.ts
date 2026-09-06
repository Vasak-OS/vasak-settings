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

/**
 * Un bloqueo de un perfil de AppArmor que espera decisión.
 *
 * No corresponde a un recurso con nombre —cámara, micrófono, credenciales—
 * sino a una ruta concreta que un perfil del sistema no dejó abrir. Existe para
 * que se pueda desbloquear: sin esto, un perfil que niega algo deja un programa
 * que falla sin explicación y sin remedio.
 */
export interface BlockedItem {
	/** El perfil de AppArmor, que es la identidad estable. */
	perfil: string;
	ruta: string;
	mascara: string;
	/** De qué programa venía, si se pudo averiguar. Sólo para mostrar. */
	programa: string;
	/** Cuántas veces se repitió el mismo intento. */
	veces: number;
}

export const listBlocked = (): Promise<BlockedItem[]> => invoke<BlockedItem[]>('list_blocked');

/** Permite exactamente lo que se bloqueó. Pasa por polkit y se puede rechazar. */
export const allowBlocked = (profile: string, path: string): Promise<void> =>
	invoke<void>('allow_blocked', { profile, path });

/** Lo saca de la lista sin permitirlo: la respuesta es que no. */
export const dismissBlocked = (profile: string, path: string): Promise<void> =>
	invoke<void>('dismiss_blocked', { profile, path });

export const listAllowed = (profile: string): Promise<string[]> =>
	invoke<string[]>('list_allowed', { profile });

/** Vuelve a bloquear algo que se había permitido. Pasa por polkit. */
export const revokeBlocked = (profile: string, rule: string): Promise<void> =>
	invoke<void>('revoke_blocked', { profile, rule });

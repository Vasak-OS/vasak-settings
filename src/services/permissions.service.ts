import { invoke } from '@tauri-apps/api/core';

export type Provenance = 'system-installed' | 'unverified';
export type Decision = 'allowed' | 'denied' | 'unknown';

export interface PermissionApplication {
	binary_path: string;
	display_name: string;
	provenance: Provenance;
	/**
	 * El nombre del icono, resuelto por el backend desde el `.desktop`.
	 *
	 * Lo resuelve `vasak-settings` y no el servicio de permisos: el servicio
	 * decide política y no sabe de temas de iconos. Cae en
	 * `application-x-executable` cuando ningún `.desktop` nombra ese binario,
	 * que es el caso de algo lanzado desde la terminal.
	 */
	icon: string;
}

export interface PermissionEntry {
	application: PermissionApplication;
	/**
	 * Si este programa **pregunta** antes de usar el recurso.
	 *
	 * Distingue las dos formas en que una decisión llega a hacerse cumplir, que
	 * la procedencia sola no separa: a lo que el sistema no instaló lo confina
	 * un perfil, y a `vasak-connect` no lo confina nada pero consulta antes de
	 * encender la cámara del teléfono y respeta la respuesta.
	 */
	asks: boolean;
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

/** El recurso de red: apagarlo es el kill-switch de esa aplicación. */
export const NETWORK_RESOURCE = 'network';

/**
 * Un destino que el cortafuegos vio abrir a una aplicación.
 *
 * `domain` y `binary_path` los influye quien abre la conexión: se dibujan
 * siempre como texto (`{{ }}`), nunca como HTML.
 */
export interface ObservedConnection {
	uid: number;
	binary_path: string;
	ip: string;
	port: number;
	proto: string;
	/** `false` = el cortafuegos la cortó. */
	allowed: boolean;
	count: number;
	last_seen_secs: number;
	/** El nombre que la app resolvió para esa IP, si el servicio lo vio; si no, `null`. */
	domain: string | null;
}

/** «A esta aplicación se le corta este dominio». */
export interface BlockedDomain {
	binary_path: string;
	domain: string;
}

export const listConnections = (): Promise<ObservedConnection[]> =>
	invoke<ObservedConnection[]>('list_connections');

export const listDomainRules = (): Promise<BlockedDomain[]> =>
	invoke<BlockedDomain[]>('list_domain_rules');

/** Pasa por polkit, como `setPermission`: puede pedir autenticación y ser rechazado. */
export const setDomainRule = (
	binaryPath: string,
	domain: string,
	blocked: boolean
): Promise<void> => invoke<void>('set_domain_rule', { binaryPath, domain, blocked });

/**
 * Un bloqueo del registro persistente (opt-in). `binary_path` y `destination`
 * los influye la app: se dibujan siempre como texto (`{{ }}`).
 */
export interface FirewallLogEntry {
	/** Segundos Unix. */
	timestamp: number;
	uid: number;
	binary_path: string;
	destination: string;
	port: number;
	proto: string;
	/** `kill-switch` | `domain-rule` | `forced-resolver` | `''`. */
	reason: string;
}

export const firewallLoggingEnabled = (): Promise<boolean> =>
	invoke<boolean>('firewall_logging_enabled');

/** Pasa por polkit. Apagar NO borra lo guardado: eso es `clearFirewallLog`. */
export const setFirewallLogging = (enabled: boolean): Promise<void> =>
	invoke<void>('set_firewall_logging', { enabled });

export const readFirewallLog = (): Promise<FirewallLogEntry[]> =>
	invoke<FirewallLogEntry[]>('read_firewall_log');

/** Pasa por polkit. */
export const clearFirewallLog = (): Promise<void> => invoke<void>('clear_firewall_log');

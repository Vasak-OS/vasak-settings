/** Lo que la pantalla del asistente muestra, derivado de lo que contestan los comandos. */

import type {
	AssistantCapability,
	AssistantMemoryStatus,
	AssistantModel,
	AssistantStatus,
	AssistantUnitState,
} from '@/services/assistant.service';

export type ServiceView = 'notInstalled' | 'off' | 'starting' | 'ready' | 'unavailable';

/**
 * El estado del servicio para quien usa el sistema.
 *
 * `status` es `null` mientras el demonio no contesta por D-Bus. Una unidad
 * que debería correr y no corre es «No disponible»: no va a
 * arrancar sola.
 */
export function serviceView(
	unit: AssistantUnitState | null,
	status: AssistantStatus | null
): ServiceView {
	if (!unit?.installed) return 'notInstalled';
	// Apagar desde la pantalla enmascara la unidad: es el apagado normal. Si aún corre, sigue su estado.
	if (!unit.active) return unit.enabled && !unit.masked ? 'unavailable' : 'off';
	if (!status) return 'starting';
	return status.backendAvailable ? 'ready' : 'unavailable';
}

/** Los dominios con consentimiento, en el orden en que se muestran. */
export const CONSENT_DOMAINS = ['mail', 'calendar', 'contacts', 'files', 'web'] as const;

const NOT_AVAILABLE = (domain: string): AssistantCapability => ({
	domain,
	available: false,
	reason: '',
});

/** Una fila por dominio, siempre las cinco; falta o es desconocido → no disponible. */
export function consentRows(capabilities: AssistantCapability[] | null): AssistantCapability[] {
	return CONSENT_DOMAINS.map(
		(domain) => capabilities?.find((c) => c.domain === domain) ?? NOT_AVAILABLE(domain)
	);
}

export type MemoryState = 'unsupported' | 'notInstalled' | 'off' | 'ready';

export interface MemoryRow {
	state: MemoryState;
	enabled: boolean;
	available: boolean;
	reason: string;
	bytes: number;
}

/**
 * La fila de memoria. `memory` es `null` si el demonio es viejo y no tiene el
 * método, y `undefined` mientras no se pidió.
 */
export function memoryRow(
	unit: AssistantUnitState | null,
	memory: AssistantMemoryStatus | null | undefined
): MemoryRow {
	const empty = { enabled: false, available: false, reason: '', bytes: 0 };
	if (!unit?.installed) return { state: 'notInstalled', ...empty };
	if (!unit.active) return { state: 'off', ...empty };
	if (!memory) return { state: 'unsupported', ...empty };
	return { state: 'ready', ...memory };
}

/** El interruptor: si no está disponible pero está encendida, igual se puede apagar. */
export const canToggleMemory = (row: MemoryRow): boolean =>
	row.state === 'ready' && (row.available || row.enabled);

/** «Borrar memoria»: hace falta que haya algo para borrar. */
export const canClearMemory = (row: MemoryRow): boolean =>
	row.state === 'ready' && (row.bytes > 0 || row.enabled);

/** Un tamaño legible: «0 B», «1.5 KB», «12 MB». */
export function formatBytes(bytes: number): string {
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	let value = Math.max(0, bytes);
	let i = 0;
	while (value >= 1024 && i < units.length - 1) {
		value /= 1024;
		i++;
	}
	const text = i === 0 || value >= 10 ? Math.round(value).toString() : value.toFixed(1);
	return `${text} ${units[i]}`;
}

/** El aviso de que las conversaciones salen del equipo; sale del modelo en uso, no del borrador. */
export function remoteNotice(model: AssistantModel | null): { host: string } | null {
	return model && !model.local ? { host: model.host } : null;
}

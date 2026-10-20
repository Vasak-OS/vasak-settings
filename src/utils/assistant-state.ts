/** Lo que la pantalla del asistente muestra, derivado de lo que contestan los comandos. */

import type {
	AssistantCapability,
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
	// Apagar desde la pantalla enmascara la unidad (service_steps(false)): es el apagado normal.
	if (unit.masked) return 'off';
	if (!unit.active) return unit.enabled ? 'unavailable' : 'off';
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

export function memoryRow(capabilities: AssistantCapability[] | null): AssistantCapability {
	return capabilities?.find((c) => c.domain === 'memory') ?? NOT_AVAILABLE('memory');
}

/** El aviso de que las conversaciones salen del equipo; sale del modelo en uso, no del borrador. */
export function remoteNotice(model: AssistantModel | null): { host: string } | null {
	return model && !model.local ? { host: model.host } : null;
}

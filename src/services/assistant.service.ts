import { invoke } from '@tauri-apps/api/core';

/** Cómo está la unidad systemd de usuario del asistente. */
export interface AssistantUnitState {
	installed: boolean;
	enabled: boolean;
	active: boolean;
	masked: boolean;
}

/** El modelo que el demonio está usando; `local` y `host` dicen adónde van las conversaciones. */
export interface AssistantModel {
	provider: string;
	name: string;
	local: boolean;
	host: string;
}

export interface AssistantStatus {
	backendAvailable: boolean;
	reason: string;
	model: AssistantModel;
	conversations: number;
}

export interface AssistantCapability {
	domain: string;
	available: boolean;
	reason: string;
}

/** La unidad del servicio. No toca D-Bus: sirve aunque el demonio no corra. */
export const assistantUnitState = (): Promise<AssistantUnitState> =>
	invoke<AssistantUnitState>('assistant_unit_state');

/** Habilita y arranca (o deshabilita y detiene) el servicio. */
export const setAssistantServiceEnabled = (enabled: boolean): Promise<AssistantUnitState> =>
	invoke<AssistantUnitState>('set_assistant_service_enabled', { enabled });

/** Reinicia el servicio: cierra las conversaciones abiertas. */
export const restartAssistantService = (): Promise<void> =>
	invoke<void>('restart_assistant_service');

export const assistantStatus = (): Promise<AssistantStatus> =>
	invoke<AssistantStatus>('assistant_status');

export const assistantCapabilities = (): Promise<AssistantCapability[]> =>
	invoke<AssistantCapability[]>('assistant_capabilities');

export const assistantModels = (): Promise<string[]> => invoke<string[]>('assistant_models');

/** Si hay clave guardada para esa URL; `null` si el demonio es viejo y no sabe contestar. */
export const assistantHasProviderKey = (url: string): Promise<boolean | null> =>
	invoke<boolean | null>('assistant_has_provider_key', { url });

export const setAssistantProviderKey = (url: string, key: string): Promise<void> =>
	invoke<void>('set_assistant_provider_key', { url, key });

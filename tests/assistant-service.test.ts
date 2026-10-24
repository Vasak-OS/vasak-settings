/** Los `invoke` de la pantalla del asistente: comando y argumentos exactos. */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
	assistantCapabilities,
	assistantHasProviderKey,
	assistantMemoryStatus,
	assistantModels,
	assistantStatus,
	assistantUnitState,
	clearAssistantMemory,
	restartAssistantService,
	setAssistantMemoryEnabled,
	setAssistantProviderKey,
	setAssistantServiceEnabled,
} from '../src/services/assistant.service';
import { type FakeBackend, fakeBackend } from './screen-time-backend';

let backend: FakeBackend;
beforeEach(() => {
	backend = fakeBackend({});
});
afterEach(() => backend.restore());

describe('assistant.service', () => {
	test('cada función llama a su comando con los argumentos que el comando espera', async () => {
		await assistantUnitState();
		await setAssistantServiceEnabled(true);
		await restartAssistantService();
		await assistantStatus();
		await assistantCapabilities();
		await assistantModels();
		await assistantHasProviderKey('https://api.ejemplo.com/v1');
		await setAssistantProviderKey('https://api.ejemplo.com/v1', 'sk-x');
		await assistantMemoryStatus();
		await setAssistantMemoryEnabled(false);
		await clearAssistantMemory();

		expect(backend.calls).toEqual([
			{ command: 'assistant_unit_state', args: undefined },
			{ command: 'set_assistant_service_enabled', args: { enabled: true } },
			{ command: 'restart_assistant_service', args: undefined },
			{ command: 'assistant_status', args: undefined },
			{ command: 'assistant_capabilities', args: undefined },
			{ command: 'assistant_models', args: undefined },
			{ command: 'assistant_has_provider_key', args: { url: 'https://api.ejemplo.com/v1' } },
			{
				command: 'set_assistant_provider_key',
				args: { url: 'https://api.ejemplo.com/v1', key: 'sk-x' },
			},
			{ command: 'assistant_memory_status', args: undefined },
			{ command: 'set_assistant_memory_enabled', args: { enabled: false } },
			{ command: 'clear_assistant_memory', args: undefined },
		]);
	});

	test('devuelve lo que contesta el comando', async () => {
		backend.handlers.assistant_models = () => ['a', 'b'];
		backend.handlers.assistant_has_provider_key = () => null;
		expect(await assistantModels()).toEqual(['a', 'b']);
		expect(await assistantHasProviderKey('http://x')).toBeNull();
	});

	test('un comando que falla rechaza la promesa', async () => {
		backend.handlers.assistant_status = () => {
			throw new Error('El asistente no está en ejecución.');
		};
		await expect(assistantStatus()).rejects.toThrow('no está en ejecución');
	});
});

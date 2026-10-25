/** Lo que la pantalla del asistente muestra, derivado de lo que contestan los comandos. */

import { describe, expect, test } from 'bun:test';
import type {
	AssistantCapability,
	AssistantMemoryStatus,
	AssistantModel,
	AssistantStatus,
	AssistantUnitState,
} from '../src/services/assistant.service';
import {
	CONSENT_DOMAINS,
	canClearMemory,
	canToggleMemory,
	consentRows,
	formatBytes,
	type MemoryRow,
	memoryRow,
	remoteNotice,
	serviceView,
} from '../src/utils/assistant-state';

const unit = (patch: Partial<AssistantUnitState> = {}): AssistantUnitState => ({
	installed: true,
	enabled: true,
	active: true,
	masked: false,
	...patch,
});

const model = (patch: Partial<AssistantModel> = {}): AssistantModel => ({
	provider: 'ollama',
	name: 'llama3',
	local: true,
	host: '127.0.0.1',
	...patch,
});

const status = (patch: Partial<AssistantStatus> = {}): AssistantStatus => ({
	backendAvailable: true,
	reason: '',
	model: model(),
	conversations: 0,
	...patch,
});

describe('serviceView', () => {
	test('sin unidad o no instalada: no instalado', () => {
		expect(serviceView(null, null)).toBe('notInstalled');
		expect(serviceView(unit({ installed: false }), null)).toBe('notInstalled');
	});

	test('enmascarada: apagado (es el apagado desde la pantalla)', () => {
		expect(serviceView(unit({ masked: true, active: false }), status())).toBe('off');
		expect(serviceView(unit({ masked: true, active: false, enabled: false }), null)).toBe('off');
	});

	test('enmascarada pero activa (sigue corriendo): sigue el camino normal', () => {
		const running = unit({ masked: true, enabled: false });
		expect(serviceView(running, null)).toBe('starting');
		expect(serviceView(running, status())).toBe('ready');
		expect(serviceView(running, status({ backendAvailable: false }))).toBe('unavailable');
	});

	test('apagada y no habilitada: apagado', () => {
		expect(serviceView(unit({ active: false, enabled: false }), null)).toBe('off');
	});

	test('habilitada pero inactiva no va a arrancar sola: no disponible', () => {
		expect(serviceView(unit({ active: false }), null)).toBe('unavailable');
	});

	test('activa sin respuesta del demonio: arrancando', () => {
		expect(serviceView(unit(), null)).toBe('starting');
	});

	test('activa con backend disponible: listo; sin backend: no disponible', () => {
		expect(serviceView(unit(), status())).toBe('ready');
		expect(serviceView(unit(), status({ backendAvailable: false }))).toBe('unavailable');
	});
});

describe('consentRows', () => {
	test('siempre las cinco filas, en el orden de la pantalla', () => {
		expect(CONSENT_DOMAINS).toEqual(['mail', 'calendar', 'contacts', 'files', 'web']);
		for (const caps of [null, []]) {
			const rows = consentRows(caps);
			expect(rows.map((r) => r.domain)).toEqual([...CONSENT_DOMAINS]);
			expect(rows.every((r) => !r.available)).toBe(true);
		}
	});

	test('toma lo que contesta el demonio, ignora los dominios desconocidos y completa los que faltan', () => {
		const caps: AssistantCapability[] = [
			{ domain: 'web', available: true, reason: '' },
			{ domain: 'marte', available: true, reason: '' },
			{ domain: 'mail', available: false, reason: 'sin cuenta' },
			{ domain: 'memory', available: true, reason: '' },
		];
		const rows = consentRows(caps);
		expect(rows.map((r) => r.domain)).toEqual([...CONSENT_DOMAINS]);
		expect(rows.find((r) => r.domain === 'web')?.available).toBe(true);
		expect(rows.find((r) => r.domain === 'mail')?.reason).toBe('sin cuenta');
		expect(rows.find((r) => r.domain === 'files')).toEqual({
			domain: 'files',
			available: false,
			reason: '',
		});
	});
});

describe('memoryRow', () => {
	const memory = (patch: Partial<AssistantMemoryStatus> = {}): AssistantMemoryStatus => ({
		enabled: true,
		available: true,
		reason: '',
		bytes: 2048,
		...patch,
	});

	test('sin unidad o no instalada: no instalado', () => {
		expect(memoryRow(null, undefined).state).toBe('notInstalled');
		expect(memoryRow(unit({ installed: false }), memory()).state).toBe('notInstalled');
	});

	test('con el servicio apagado: apagado, sin tamaño ni encendida', () => {
		expect(memoryRow(unit({ active: false }), memory())).toEqual({
			state: 'off',
			enabled: false,
			available: false,
			reason: '',
			bytes: 0,
		});
	});

	test('activo pero el demonio no tiene memoria (null) o no se pidió todavía: no soportado', () => {
		expect(memoryRow(unit(), null).state).toBe('unsupported');
		expect(memoryRow(unit(), undefined).state).toBe('unsupported');
	});

	test('activo con memoria: listo, con lo que dijo el demonio', () => {
		const status = memory({
			enabled: false,
			available: false,
			reason: 'llavero bloqueado',
			bytes: 9,
		});
		expect(memoryRow(unit(), status)).toEqual({ state: 'ready', ...status });
	});

	test('con un error de lectura: estado «error» con el motivo, y manda sobre «no soportado»', () => {
		const row = memoryRow(unit(), undefined, 'llavero bloqueado');
		expect(row).toEqual({
			state: 'error',
			enabled: false,
			available: false,
			reason: 'llavero bloqueado',
			bytes: 0,
		});
		expect(memoryRow(unit(), null, 'llavero bloqueado').state).toBe('error');
	});

	test('con el servicio apagado o sin instalar no se muestra el error', () => {
		expect(memoryRow(unit({ active: false }), undefined, 'x').state).toBe('off');
		expect(memoryRow(unit({ installed: false }), undefined, 'x').state).toBe('notInstalled');
	});

	test('sin error de lectura (vacío) sigue el camino de siempre', () => {
		expect(memoryRow(unit(), null, '').state).toBe('unsupported');
		expect(memoryRow(unit(), memory(), '').state).toBe('ready');
	});
});

describe('canToggleMemory', () => {
	const row = (patch: Partial<MemoryRow>): MemoryRow => ({
		state: 'ready',
		enabled: false,
		available: true,
		reason: '',
		bytes: 0,
		...patch,
	});

	test('listo y disponible: se puede encender y apagar', () => {
		expect(canToggleMemory(row({}))).toBe(true);
		expect(canToggleMemory(row({ enabled: true }))).toBe(true);
	});

	test('encendida pero no disponible: se tiene que poder apagar', () => {
		expect(canToggleMemory(row({ enabled: true, available: false }))).toBe(true);
	});

	test('apagada y no disponible: no se puede encender', () => {
		expect(canToggleMemory(row({ enabled: false, available: false }))).toBe(false);
	});

	test('fuera de «listo» nunca', () => {
		for (const state of ['unsupported', 'error', 'notInstalled', 'off'] as const) {
			expect(canToggleMemory(row({ state, enabled: true, available: true }))).toBe(false);
		}
	});
});

describe('canClearMemory', () => {
	const row = (patch: Partial<MemoryRow>): MemoryRow => ({
		state: 'ready',
		enabled: false,
		available: true,
		reason: '',
		bytes: 0,
		...patch,
	});

	test('hay algo para borrar si ocupa lugar o está encendida', () => {
		expect(canClearMemory(row({ bytes: 1 }))).toBe(true);
		expect(canClearMemory(row({ enabled: true }))).toBe(true);
	});

	test('apagada y vacía: nada para borrar', () => {
		expect(canClearMemory(row({}))).toBe(false);
	});

	test('fuera de «listo» nunca', () => {
		for (const state of ['unsupported', 'error', 'notInstalled', 'off'] as const) {
			expect(canClearMemory(row({ state, bytes: 100, enabled: true }))).toBe(false);
		}
	});
});

describe('formatBytes', () => {
	test('los bordes de cada unidad', () => {
		expect(formatBytes(0)).toBe('0 B');
		expect(formatBytes(1023)).toBe('1023 B');
		expect(formatBytes(1024)).toBe('1.0 KB');
		expect(formatBytes(1536)).toBe('1.5 KB');
		expect(formatBytes(10 * 1024)).toBe('10 KB');
		expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
		expect(formatBytes(12 * 1024 * 1024)).toBe('12 MB');
		expect(formatBytes(1024 ** 3)).toBe('1.0 GB');
	});

	test('un negativo cuenta como cero y lo enorme no se pasa de TB', () => {
		expect(formatBytes(-5)).toBe('0 B');
		expect(formatBytes(1024 ** 5)).toBe('1024 TB');
	});
});

describe('remoteNotice', () => {
	test('sin modelo o con modelo local no hay aviso', () => {
		expect(remoteNotice(null)).toBeNull();
		expect(remoteNotice(model())).toBeNull();
	});

	test('con modelo remoto avisa con el host', () => {
		expect(remoteNotice(model({ local: false, host: 'api.ejemplo.com' }))).toEqual({
			host: 'api.ejemplo.com',
		});
	});
});

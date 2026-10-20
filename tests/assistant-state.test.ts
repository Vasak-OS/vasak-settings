/** Lo que la pantalla del asistente muestra, derivado de lo que contestan los comandos. */

import { describe, expect, test } from 'bun:test';
import type {
	AssistantCapability,
	AssistantModel,
	AssistantStatus,
	AssistantUnitState,
} from '../src/services/assistant.service';
import {
	CONSENT_DOMAINS,
	consentRows,
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

	test('enmascarada: no disponible, aunque figure activa', () => {
		expect(serviceView(unit({ masked: true }), status())).toBe('unavailable');
		expect(serviceView(unit({ masked: true, active: false, enabled: false }), null)).toBe(
			'unavailable'
		);
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
	test('sin la capacidad, memoria no disponible', () => {
		expect(memoryRow(null)).toEqual({ domain: 'memory', available: false, reason: '' });
		expect(memoryRow([{ domain: 'mail', available: true, reason: '' }]).available).toBe(false);
	});

	test('con la capacidad, la del demonio', () => {
		const cap = { domain: 'memory', available: true, reason: 'ok' };
		expect(memoryRow([cap])).toEqual(cap);
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

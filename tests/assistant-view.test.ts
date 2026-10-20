/**
 * La pantalla «Asistente» montada: lo que se ve según lo que contestan el
 * servicio y `vasak.conf`. Mismo doble de Tauri que `screen-time-view.test.ts`.
 */

import { afterEach, describe, expect, type Mock, spyOn, test } from 'bun:test';
import * as plugin from '@vasakgroup/plugin-config-manager';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import type { AssistantStatus, AssistantUnitState } from '../src/services/assistant.service';
import AssistantView from '../src/views/AssistantView.vue';
import { type FakeBackend, fakeBackend, textsOf } from './screen-time-backend';

const ACTIVE: AssistantUnitState = { installed: true, enabled: true, active: true, masked: false };

const status = (local: boolean, host: string): AssistantStatus => ({
	backendAvailable: true,
	reason: '',
	model: { provider: local ? 'ollama' : 'openai', name: 'm', local, host },
	conversations: 0,
});

let backend: FakeBackend;
let storeSpy: Mock<typeof plugin.useConfigStore>;
let view: VueWrapper | null = null;

afterEach(() => {
	view?.unmount();
	view = null;
	backend.restore();
	storeSpy.mockRestore();
});

async function mountView(opts: {
	config?: Record<string, unknown>;
	unit?: AssistantUnitState;
	status?: AssistantStatus;
}) {
	backend = fakeBackend(opts.config ?? {});
	backend.handlers.assistant_unit_state = () => opts.unit ?? ACTIVE;
	backend.handlers.assistant_status = () => opts.status ?? status(true, '127.0.0.1');
	backend.handlers.assistant_capabilities = () => [
		{ domain: 'mail', available: true, reason: '' },
		{ domain: 'memory', available: true, reason: '' },
	];
	backend.handlers.assistant_models = () => ['llama3'];
	backend.handlers.assistant_has_provider_key = () => false;
	storeSpy = spyOn(plugin, 'useConfigStore').mockImplementation(
		() => ({ loadConfig: async () => {} }) as unknown as ReturnType<typeof plugin.useConfigStore>
	);
	view = mount(AssistantView, { global: { stubs: { ThemeIcon: true, AppIcon: true } } });
	await flushPromises();
	return view;
}

/** Si el aviso de proveedor remoto está en pantalla, con el host puesto (la clave cruda si no hay catálogo). */
const noticeShown = (wrapper: VueWrapper, host: string) =>
	textsOf('views.assistant.remoteNotice').some((text) =>
		wrapper.text().includes(text.replace('{0}', host))
	);

describe('la pantalla del asistente', () => {
	test('el consentimiento por dominio y la memoria están deshabilitados aunque el demonio diga que sí', async () => {
		const wrapper = await mountView({});
		const switches = wrapper.findAll('[role="switch"]');
		// Servicio + cinco dominios + memoria.
		expect(switches).toHaveLength(7);
		for (const row of switches.slice(1)) {
			expect(row.attributes('disabled')).toBeDefined();
		}
	});

	test('el interruptor del servicio refleja la unidad y se puede tocar', async () => {
		const wrapper = await mountView({});
		const first = wrapper.findAll('[role="switch"]')[0];
		expect(first.attributes('aria-checked')).toBe('true');
		expect(first.attributes('disabled')).toBeUndefined();
	});

	test('no instalado o enmascarado: el interruptor del servicio no se puede tocar', async () => {
		for (const unit of [
			{ ...ACTIVE, installed: false, enabled: false, active: false },
			{ ...ACTIVE, masked: true, enabled: false },
		]) {
			const wrapper = await mountView({ unit });
			expect(wrapper.findAll('[role="switch"]')[0].attributes('disabled')).toBeDefined();
			view?.unmount();
			backend.restore();
			storeSpy.mockRestore();
		}
	});

	test('el aviso de proveedor remoto sale del estado del demonio y no del borrador', async () => {
		// Lo guardado es remoto, pero el demonio corre con un modelo local: sin aviso.
		const local = await mountView({
			config: {
				assistant: { backend: 'openai', url: 'https://api.ejemplo.com/v1', allow_remote: true },
			},
			status: status(true, '127.0.0.1'),
		});
		expect(noticeShown(local, '127.0.0.1')).toBe(false);
		expect(noticeShown(local, 'api.ejemplo.com')).toBe(false);
		view?.unmount();
		backend.restore();
		storeSpy.mockRestore();

		// Al revés: el borrador es local y el demonio habla con un host remoto: aviso, con el host.
		const remote = await mountView({
			config: {},
			status: status(false, 'api.ejemplo.com'),
		});
		expect(noticeShown(remote, 'api.ejemplo.com')).toBe(true);
	});

	test('el campo de la clave aparece sólo con el proveedor openai', async () => {
		const ollama = await mountView({ config: { assistant: { backend: 'ollama' } } });
		expect(ollama.find('input[type="password"]').exists()).toBe(false);
		view?.unmount();
		backend.restore();
		storeSpy.mockRestore();

		const openai = await mountView({ config: { assistant: { backend: 'openai' } } });
		expect(openai.find('input[type="password"]').exists()).toBe(true);
	});

	test('con el servicio apagado no se le habla al demonio', async () => {
		await mountView({ unit: { ...ACTIVE, active: false, enabled: false } });
		const dbus = backend
			.commands()
			.filter((c) =>
				[
					'assistant_status',
					'assistant_capabilities',
					'assistant_models',
					'assistant_has_provider_key',
				].includes(c)
			);
		expect(dbus).toEqual([]);
	});
});

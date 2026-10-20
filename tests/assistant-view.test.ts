/**
 * La pantalla «Asistente» montada: lo que se ve según lo que contestan el
 * servicio y `vasak.conf`. Mismo doble de Tauri que `screen-time-view.test.ts`.
 */

import { afterEach, describe, expect, type Mock, spyOn, test } from 'bun:test';
import * as plugin from '@vasakgroup/plugin-config-manager';
import * as i18n from '@vasakgroup/tauri-plugin-i18n';
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

/** Un `t` que devuelve la plantilla en español (con su `{0}`), para probar el reemplazo. */
function withCatalog() {
	catalogSpy = spyOn(i18n, 'useI18n').mockImplementation(
		() =>
			({ t: (key: string) => textsOf(key)[1] ?? key }) as unknown as ReturnType<typeof i18n.useI18n>
	);
}

let catalogSpy: Mock<typeof i18n.useI18n> | null = null;
let backend: FakeBackend;
let storeSpy: Mock<typeof plugin.useConfigStore>;
let view: VueWrapper | null = null;

afterEach(() => {
	catalogSpy?.mockRestore();
	catalogSpy = null;
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
		wrapper.text().includes(text.replace('{0}', () => host))
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

	test('no instalado: el interruptor del servicio no se puede tocar', async () => {
		for (const unit of [{ ...ACTIVE, installed: false, enabled: false, active: false }]) {
			const wrapper = await mountView({ unit });
			expect(wrapper.findAll('[role="switch"]')[0].attributes('disabled')).toBeDefined();
			view?.unmount();
			backend.restore();
			storeSpy.mockRestore();
		}
	});

	test('con la unidad enmascarada (apagada desde acá) el interruptor está habilitado y al encender pide encenderla', async () => {
		const masked = { installed: true, enabled: false, active: false, masked: true };
		const wrapper = await mountView({ unit: masked });
		backend.handlers.set_assistant_service_enabled = () => ACTIVE;
		const toggle = wrapper.findAll('[role="switch"]')[0];
		expect(toggle.attributes('aria-checked')).toBe('false');
		expect(toggle.attributes('disabled')).toBeUndefined();
		// Se ve apagado, no «No disponible».
		expect(
			textsOf('views.assistant.service.state.off').some((t) => wrapper.text().includes(t))
		).toBe(true);

		await toggle.trigger('click');
		await flushPromises();

		const call = backend.calls.find((c) => c.command === 'set_assistant_service_enabled');
		expect(call?.args).toEqual({ enabled: true });
		expect(wrapper.findAll('[role="switch"]')[0].attributes('aria-checked')).toBe('true');
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

	test('el campo de la clave se deshabilita con el servicio apagado', async () => {
		const wrapper = await mountView({
			config: { assistant: { backend: 'openai' } },
			unit: { ...ACTIVE, active: false },
		});
		expect(wrapper.get('input[type="password"]').attributes('disabled')).toBeDefined();
	});

	test('con el servicio encendido y la URL guardada el campo de la clave se puede usar', async () => {
		const wrapper = await mountView({ config: { assistant: { backend: 'openai' } } });
		expect(wrapper.get('input[type="password"]').attributes('disabled')).toBeUndefined();
	});

	test('si la dirección del borrador se aparta de la guardada, la clave se bloquea', async () => {
		const wrapper = await mountView({ config: { assistant: { backend: 'openai' } } });
		const url = wrapper.get('input[type="url"]');
		await url.setValue('https://otra.com/v1');
		await flushPromises();
		expect(wrapper.get('input[type="password"]').attributes('disabled')).toBeDefined();
	});

	test('elegir OpenAI en el borrador muestra el campo de la clave aunque lo guardado sea ollama', async () => {
		const wrapper = await mountView({ config: { assistant: { backend: 'ollama' } } });
		expect(wrapper.find('input[type="password"]').exists()).toBe(false);
		const openai = wrapper.findAll('[role="radio"]').find((r) => r.text().trim() === 'OpenAI');
		if (!openai) throw new Error('no está la opción OpenAI');
		await openai.trigger('click');
		await flushPromises();
		expect(wrapper.find('input[type="password"]').exists()).toBe(true);
		// Y la dirección de fábrica acompañó el cambio, así que difiere de la guardada.
		expect(wrapper.get('input[type="password"]').attributes('disabled')).toBeDefined();
	});

	test('con la dirección sin guardar el botón «Guardar clave» está deshabilitado y la ayuda lo explica', async () => {
		const wrapper = await mountView({ config: { assistant: { backend: 'openai' } } });
		const save = () =>
			wrapper
				.findAll('button')
				.find((b) => textsOf('views.assistant.key.save').includes(b.text().trim()));
		expect(save()?.attributes('disabled')).toBeUndefined();
		expect(
			textsOf('views.assistant.key.needsSaveModel').some((t) => wrapper.text().includes(t))
		).toBe(false);
		await wrapper.get('input[type="url"]').setValue('https://otra.com/v1');
		await flushPromises();
		expect(save()?.attributes('disabled')).toBeDefined();
		expect(
			textsOf('views.assistant.key.needsSaveModel').some((t) => wrapper.text().includes(t))
		).toBe(true);
	});

	test('con el servicio apagado el botón de la clave está deshabilitado y la ayuda pide encenderlo', async () => {
		const wrapper = await mountView({
			config: { assistant: { backend: 'openai' } },
			unit: { ...ACTIVE, active: false },
		});
		const save = wrapper
			.findAll('button')
			.find((b) => textsOf('views.assistant.key.save').includes(b.text().trim()));
		expect(save?.attributes('disabled')).toBeDefined();
		expect(
			textsOf('views.assistant.key.needsService').some((t) => wrapper.text().includes(t))
		).toBe(true);
	});

	test('un host con «$&» se muestra tal cual en el aviso de remoto y en «se guarda para»', async () => {
		withCatalog();
		const host = 'a$&b$`c.ejemplo.com';
		const wrapper = await mountView({
			config: { assistant: { backend: 'openai', url: `https://${host}/v1` } },
			status: status(false, host),
		});
		expect(noticeShown(wrapper, host)).toBe(true);
		expect(
			textsOf('views.assistant.key.boundTo').some((t) =>
				wrapper.text().includes(t.replace('{0}', () => `https://${host}/v1`))
			)
		).toBe(true);
	});

	test('un motivo de error con «$&» se muestra tal cual', async () => {
		withCatalog();
		backend = fakeBackend({});
		backend.handlers.assistant_unit_state = () => {
			throw new Error('falló $& y $1');
		};
		storeSpy = spyOn(plugin, 'useConfigStore').mockImplementation(
			() => ({ loadConfig: async () => {} }) as unknown as ReturnType<typeof plugin.useConfigStore>
		);
		view = mount(AssistantView, { global: { stubs: { ThemeIcon: true, AppIcon: true } } });
		await flushPromises();
		expect(view.text()).toContain('falló $& y $1');
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

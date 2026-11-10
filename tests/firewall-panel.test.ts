/**
 * El panel «Red por app»: kill-switch, reglas por dominio y refresco en vivo.
 *
 * `invoke` y `listen` se espían sobre el módulo real (ver `screen-time-backend.ts`
 * por qué no es un `mock.module`).
 */

import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import * as event from '@tauri-apps/api/event';
import { AlertMessage, SwitchToggle } from '@vasakgroup/vue-libvasak';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import FirewallDomainRules from '../src/components/firewall/FirewallDomainRules.vue';
import FirewallKillSwitch from '../src/components/firewall/FirewallKillSwitch.vue';
import FirewallPanel from '../src/components/firewall/FirewallPanel.vue';
import type { PermissionEntry } from '../src/services/permissions.service';
import { type FakeBackend, fakeBackend } from './screen-time-backend';

const entry = (path: string, name: string, network?: string): PermissionEntry =>
	({
		application: { binary_path: path, display_name: name, icon: '' },
		decisions: network ? { network } : {},
	}) as unknown as PermissionEntry;

let backend: FakeBackend;
let wrapper: VueWrapper | null = null;
const stubs = { AppIcon: true, ThemeIcon: true };

beforeEach(() => {
	backend = fakeBackend({});
});
afterEach(() => {
	wrapper?.unmount();
	wrapper = null;
	backend.restore();
});

describe('FirewallKillSwitch', () => {
	test('apagar el interruptor llama set_permission con el recurso «network» y allowed=false', async () => {
		backend.handlers.list_permissions = () => [];
		wrapper = mount(FirewallKillSwitch, {
			props: { entries: [entry('/usr/bin/curl', 'curl')] },
			global: { stubs },
		});
		wrapper.findComponent(SwitchToggle).vm.$emit('update:modelValue', false);
		await flushPromises();
		const call = backend.calls.find((c) => c.command === 'set_permission');
		expect(call?.args).toMatchObject({
			binaryPath: '/usr/bin/curl',
			resourceId: 'network',
			allowed: false,
		});
		expect(wrapper.emitted('changed')).toBeTruthy();
	});

	test('encenderlo manda allowed=true, y un «denied» se ve apagado', async () => {
		wrapper = mount(FirewallKillSwitch, {
			props: { entries: [entry('/usr/bin/curl', 'curl', 'denied')] },
			global: { stubs },
		});
		const toggle = wrapper.findComponent(SwitchToggle);
		expect(toggle.props('modelValue')).toBe(false);
		toggle.vm.$emit('update:modelValue', true);
		await flushPromises();
		expect(backend.calls.find((c) => c.command === 'set_permission')?.args).toMatchObject({
			resourceId: 'network',
			allowed: true,
		});
	});

	test('sin decisión sobre la red la app se ve encendida', () => {
		wrapper = mount(FirewallKillSwitch, {
			props: { entries: [entry('/usr/bin/curl', 'curl')] },
			global: { stubs },
		});
		expect(wrapper.findComponent(SwitchToggle).props('modelValue')).toBe(true);
	});

	test('el error al cambiar se avisa por failed', async () => {
		backend.handlers.set_permission = () => {
			throw 'autenticación rechazada';
		};
		wrapper = mount(FirewallKillSwitch, {
			props: { entries: [entry('/usr/bin/curl', 'curl')] },
			global: { stubs },
		});
		wrapper.findComponent(SwitchToggle).vm.$emit('update:modelValue', false);
		await flushPromises();
		expect(wrapper.emitted('failed')?.[0]).toEqual(['autenticación rechazada']);
	});
});

describe('FirewallDomainRules', () => {
	const mountRules = (rules: unknown[] = []) =>
		mount(FirewallDomainRules, {
			props: {
				entries: [entry('/usr/bin/curl', 'curl'), entry('portal:org.x', 'Portal')],
				rules: rules as never,
			},
			global: { stubs },
		});

	test('bloquear llama set_domain_rule con la ruta, el dominio sin espacios y blocked=true', async () => {
		wrapper = mountRules();
		wrapper.findComponent({ name: 'SelectField' }).vm.$emit('update:modelValue', '/usr/bin/curl');
		wrapper
			.findComponent({ name: 'TextInput' })
			.vm.$emit('update:modelValue', '  tracker.example  ');
		await flushPromises();
		await wrapper.find('form').trigger('submit');
		await flushPromises();
		expect(backend.calls.find((c) => c.command === 'set_domain_rule')?.args).toEqual({
			binaryPath: '/usr/bin/curl',
			domain: 'tracker.example',
			blocked: true,
		});
	});

	test('quitar una regla manda blocked=false con su ruta y dominio', async () => {
		wrapper = mountRules([{ binary_path: '/usr/bin/curl', domain: 'ads.example' }]);
		await wrapper.find('li button').trigger('click');
		await flushPromises();
		expect(backend.calls.find((c) => c.command === 'set_domain_rule')?.args).toEqual({
			binaryPath: '/usr/bin/curl',
			domain: 'ads.example',
			blocked: false,
		});
	});

	test('el error del daemon se avisa por failed y se recarga igual', async () => {
		backend.handlers.set_domain_rule = () => {
			throw 'dominio inválido';
		};
		wrapper = mountRules([{ binary_path: '/usr/bin/curl', domain: 'x' }]);
		await wrapper.find('li button').trigger('click');
		await flushPromises();
		expect(wrapper.emitted('failed')?.[0]).toEqual(['dominio inválido']);
		expect(wrapper.emitted('changed')).toBeTruthy();
	});

	test('el dominio y la ruta se dibujan como texto, no como HTML', () => {
		wrapper = mountRules([
			{ binary_path: '/usr/bin/curl', domain: '<img src=x onerror=alert(1)>' },
		]);
		expect(wrapper.find('img').exists()).toBe(false);
		expect(wrapper.text()).toContain('<img src=x onerror=alert(1)>');
	});
});

describe('FirewallPanel', () => {
	const evil = '<img src=x onerror=alert(1)>';
	let handler: (() => Promise<void> | void) | undefined;
	let unlistenCalls = 0;
	let listenSpy: ReturnType<typeof spyOn>;
	let reads = 0;

	beforeEach(() => {
		handler = undefined;
		unlistenCalls = 0;
		reads = 0;
		backend.handlers.list_permissions = () => [entry('/usr/bin/curl', 'curl')];
		backend.handlers.list_domain_rules = () => [];
		backend.handlers.list_connections = () => {
			reads++;
			return [
				{
					uid: 1,
					binary_path: `/opt/${evil}`,
					ip: '1.2.3.4',
					port: 443,
					proto: 'tcp',
					allowed: true,
					domain: evil,
					last_seen_secs: reads,
				},
			];
		};
		listenSpy = spyOn(event, 'listen').mockImplementation((async (name: string, cb: () => void) => {
			if (name === 'permissions-connection-observed') handler = cb;
			return () => {
				unlistenCalls++;
			};
		}) as never);
	});
	afterEach(() => listenSpy.mockRestore());

	test('re-lee list_connections al recibir el evento', async () => {
		wrapper = mount(FirewallPanel, { global: { stubs } });
		await flushPromises();
		expect(handler).toBeDefined();
		expect(reads).toBe(1);
		await handler?.();
		await flushPromises();
		expect(reads).toBe(2);
	});

	test('hace unlisten al desmontar', async () => {
		wrapper = mount(FirewallPanel, { global: { stubs } });
		await flushPromises();
		expect(unlistenCalls).toBe(0);
		wrapper.unmount();
		wrapper = null;
		expect(unlistenCalls).toBe(1);
	});

	test('el dominio y la ruta de una conexión salen como texto, no como HTML', async () => {
		wrapper = mount(FirewallPanel, { global: { stubs } });
		await flushPromises();
		expect(wrapper.find('img').exists()).toBe(false);
		expect(wrapper.text()).toContain(evil);
	});

	test('el error del daemon al bloquear un dominio se muestra en el panel', async () => {
		backend.handlers.set_domain_rule = () => {
			throw 'dominio inválido';
		};
		backend.handlers.list_domain_rules = () => [{ binary_path: '/usr/bin/curl', domain: 'x' }];
		wrapper = mount(FirewallPanel, { global: { stubs } });
		await flushPromises();
		await wrapper.find('section:last-of-type li button').trigger('click');
		await flushPromises();
		expect(wrapper.findComponent(AlertMessage).text()).toContain('dominio inválido');
	});
});

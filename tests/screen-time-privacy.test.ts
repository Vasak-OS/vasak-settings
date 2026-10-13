/**
 * El tiempo de pantalla en «Privacidad y seguridad» (vasak-settings#145).
 *
 * Se monta la pantalla entera, que es lo que abre quien busca dónde se apaga el
 * registro: el bloque tiene que estar ahí, con el interruptor, el borrado con
 * confirmación y el enlace a la sección del informe.
 *
 * El servicio de salud y `vasak.conf` son los de `screen-time-backend.ts`, que
 * espía `invoke` (ver ahí por qué no es un `mock.module`).
 *
 * Los botones se buscan por su texto, que es la clave del i18n o su traducción:
 * en la corrida el i18n puede estar doblado por otro archivo o caer a la clave,
 * y la prueba acepta las dos.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import PrivacySecurityView from '../src/views/PrivacySecurityView.vue';
import { type FakeBackend, fakeBackend, textsOf, WRITE_CONFIG } from './screen-time-backend';

let backend: FakeBackend;
let view: VueWrapper | null = null;
let router: Router;
/** Lo que el servicio de salud dice que está pasando. */
let serviceEnabled = false;

beforeEach(() => {
	serviceEnabled = false;
	backend = fakeBackend({
		style: { darkmode: true, radius: 12 },
		screen_time: { enabled: false },
		'x-puesto-a-mano': { nota: 'no se toca' },
	});
	backend.handlers.list_permissions = () => [];
	backend.handlers.list_blocked = () => [];
	backend.handlers.screen_time_enabled = () => serviceEnabled;
	backend.handlers.screen_time_set_enabled = (args) => {
		serviceEnabled = Boolean(args?.enabled);
	};
	router = createRouter({
		history: createMemoryHistory(),
		routes: [
			{ path: '/privacy-security', name: 'privacy-security', component: { render: () => null } },
			{ path: '/screen-time', name: 'screen-time', component: { render: () => null } },
		],
	});
});

afterEach(() => {
	view?.unmount();
	view = null;
	backend.restore();
});

async function mountView() {
	await router.push({ name: 'privacy-security' });
	view = mount(PrivacySecurityView, {
		global: { plugins: [router], stubs: { ThemeIcon: true, AppIcon: true } },
	});
	await flushPromises();
	return view;
}

/** El bloque del tiempo de pantalla; si no está, la prueba falla diciéndolo. */
function screenTimeBlock(wrapper: VueWrapper) {
	const block = wrapper.find('[data-screen-time-privacy]');
	if (!block.exists()) throw new Error('«Privacidad y seguridad» no muestra el tiempo de pantalla');
	return block;
}

function buttonWithText(wrapper: VueWrapper, key: string) {
	const texts = textsOf(key);
	const button = screenTimeBlock(wrapper)
		.findAll('button')
		.find((candidate) => texts.includes(candidate.text().trim()));
	if (!button) throw new Error(`no está el botón «${key}»`);
	return button;
}

describe('Privacidad y seguridad: el tiempo de pantalla', () => {
	test('la pantalla muestra el bloque del tiempo de pantalla, después de los permisos', async () => {
		const wrapper = await mountView();

		const block = screenTimeBlock(wrapper);
		expect(textsOf('views.privacySecurity.screenTime.title')).toContain(block.find('h2').text());
		// Va al final: arriba están los permisos.
		expect(wrapper.element.lastElementChild).toBe(block.element);
	});

	test('el interruptor muestra lo que dice el servicio', async () => {
		serviceEnabled = true;
		const wrapper = await mountView();

		expect(screenTimeBlock(wrapper).get('[role="switch"]').attributes('aria-checked')).toBe('true');
	});

	test('apagado, el interruptor se ve apagado', async () => {
		const wrapper = await mountView();

		expect(screenTimeBlock(wrapper).get('[role="switch"]').attributes('aria-checked')).toBe(
			'false'
		);
	});

	test('tocar el interruptor guarda en vasak.conf y le avisa al servicio', async () => {
		const wrapper = await mountView();
		backend.calls.length = 0;

		await screenTimeBlock(wrapper).get('[role="switch"]').trigger('click');
		await flushPromises();

		expect(backend.calls.filter((call) => call.command === 'screen_time_set_enabled')).toEqual([
			{ command: 'screen_time_set_enabled', args: { enabled: true } },
		]);
		expect(backend.commands()).toContain(WRITE_CONFIG);
		expect(backend.config()).toEqual({
			style: { darkmode: true, radius: 12 },
			screen_time: { enabled: true },
			'x-puesto-a-mano': { nota: 'no se toca' },
		});
		expect(screenTimeBlock(wrapper).get('[role="switch"]').attributes('aria-checked')).toBe('true');
	});

	test('el primer clic en borrar sólo pide confirmar; el segundo borra el historial', async () => {
		const wrapper = await mountView();

		await buttonWithText(wrapper, 'views.screenTime.clear.button').trigger('click');
		await flushPromises();

		expect(backend.commands()).not.toContain('clear_screen_time');
		expect(screenTimeBlock(wrapper).find('[data-screen-time-confirm]').exists()).toBe(true);

		await buttonWithText(wrapper, 'views.screenTime.clear.confirmButton').trigger('click');
		await flushPromises();

		expect(backend.commands().filter((command) => command === 'clear_screen_time')).toHaveLength(1);
		// Hecho el borrado, la confirmación se cierra.
		expect(screenTimeBlock(wrapper).find('[data-screen-time-confirm]').exists()).toBe(false);
	});

	test('cancelar la confirmación no borra nada', async () => {
		const wrapper = await mountView();

		await buttonWithText(wrapper, 'views.screenTime.clear.button').trigger('click');
		await buttonWithText(wrapper, 'common.cancel').trigger('click');
		await flushPromises();

		expect(backend.commands()).not.toContain('clear_screen_time');
		expect(screenTimeBlock(wrapper).find('[data-screen-time-confirm]').exists()).toBe(false);
	});

	test('el enlace lleva a la sección del tiempo de pantalla', async () => {
		const wrapper = await mountView();

		await buttonWithText(wrapper, 'views.privacySecurity.screenTime.open').trigger('click');
		await flushPromises();

		expect(router.currentRoute.value.name).toBe('screen-time');
	});
});

describe('los textos del tiempo de pantalla en Privacidad', () => {
	test('existen en los dos idiomas', () => {
		// `textsOf` devuelve la clave más cada traducción que exista.
		for (const key of ['title', 'description', 'open']) {
			const texts = textsOf(`views.privacySecurity.screenTime.${key}`);
			expect(texts).toHaveLength(3);
			expect(texts.every((text) => text.trim() !== '')).toBe(true);
		}
	});
});

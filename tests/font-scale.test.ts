/**
 * El tamaño del texto en «Fuentes».
 *
 * Se guarda en `vasak.conf` (`fonts.scale`) junto con las familias. Lo que hay
 * que cuidar es que **guardar las familias no se lleve la escala**: la pantalla
 * reemplaza la sección `fonts` entera al guardar, y sin incluir `scale` en lo que
 * escribe, cada cambio de fuente devolvía el texto al tamaño de siempre.
 */

import { afterEach, describe, expect, type Mock, spyOn, test } from 'bun:test';
import * as plugin from '@vasakgroup/plugin-config-manager';
import * as i18n from '@vasakgroup/tauri-plugin-i18n';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import AppearanceFontsView from '../src/views/AppearanceFontsView.vue';
import { type FakeBackend, fakeBackend, textsOf } from './screen-time-backend';

let catalogSpy: Mock<typeof i18n.useI18n> | null = null;
let storeSpy: Mock<typeof plugin.useConfigStore> | null = null;
let backend: FakeBackend;
let view: VueWrapper | null = null;

afterEach(() => {
	catalogSpy?.mockRestore();
	storeSpy?.mockRestore();
	view?.unmount();
	view = null;
	backend.restore();
});

async function mountView(fonts: Record<string, unknown>) {
	backend = fakeBackend({
		style: { darkmode: false },
		fonts: { terminal: 'Mono', title: 'Titulo', apps: 'Sans', ...fonts },
	});
	backend.handlers.get_system_fonts = () => [
		{
			id: '1',
			name: 'Mono',
			fontName: 'Mono',
			path: '/m',
			weight: 400,
			style: 'Normal',
			monospaced: true,
		},
	];
	backend.handlers.nitidez_activa = () => false;
	catalogSpy = spyOn(i18n, 'useI18n').mockImplementation(
		() =>
			({ t: (key: string) => textsOf(key)[1] ?? key }) as unknown as ReturnType<typeof i18n.useI18n>
	);
	storeSpy = spyOn(plugin, 'useConfigStore').mockImplementation(
		() => ({ loadConfig: async () => {} }) as unknown as ReturnType<typeof plugin.useConfigStore>
	);
	view = mount(AppearanceFontsView, { global: { stubs: { ThemeIcon: true, AppIcon: true } } });
	await flushPromises();
	return view;
}

const saveButton = (wrapper: VueWrapper) =>
	wrapper.findAll('button').find((button) => /Aplicar/.test(button.text()));

describe('el tamaño del texto', () => {
	test('guardar las familias conserva la escala que ya estaba', async () => {
		const wrapper = await mountView({ scale: 1.25 });

		await saveButton(wrapper)?.trigger('click');
		await flushPromises();

		const escrito = backend.writes().at(-1) as { fonts: { scale?: number } };
		expect(escrito.fonts.scale).toBe(1.25);
	});

	test('sin escala en el archivo se guarda la de siempre', async () => {
		const wrapper = await mountView({});

		await saveButton(wrapper)?.trigger('click');
		await flushPromises();

		const escrito = backend.writes().at(-1) as { fonts: { scale?: number } };
		expect(escrito.fonts.scale).toBe(1);
	});

	test('una escala fuera de los límites se acota al abrir', async () => {
		const wrapper = await mountView({ scale: 9 });

		await saveButton(wrapper)?.trigger('click');
		await flushPromises();

		const escrito = backend.writes().at(-1) as { fonts: { scale?: number } };
		expect(escrito.fonts.scale).toBe(2);
	});

	test('muestra el control con el tamaño de ahora', async () => {
		const wrapper = await mountView({ scale: 1.5 });

		expect(wrapper.text()).toContain('Tamaño del texto');
		expect(wrapper.find('#font-scale').exists()).toBe(true);
	});
});

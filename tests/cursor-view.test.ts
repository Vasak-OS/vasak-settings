/**
 * La pantalla «Cursor» montada, y que sea el único lugar donde se cambia.
 *
 * El cursor se elegía en dos pantallas que no se hablaban —«Tema», con un
 * desplegable de nombres que cambiaba `gsettings`, y las entradas de Wayfire,
 * con un campo de texto que cambiaba `wayfire.ini`—, así que las aplicaciones y
 * el escritorio podían terminar con cursores distintos. Ahora hay una sola, que
 * muestra los cursores de cada tema para elegir con la vista, como los iconos, y
 * aplica a los dos lados.
 */

import { afterEach, describe, expect, type Mock, spyOn, test } from 'bun:test';
import * as i18n from '@vasakgroup/tauri-plugin-i18n';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import CursorsView from '../src/views/CursorsView.vue';
import { type FakeBackend, fakeBackend, textsOf } from './screen-time-backend';

const PNG = 'data:image/png;base64,AAAA';

let catalogSpy: Mock<typeof i18n.useI18n> | null = null;
let backend: FakeBackend;
let view: VueWrapper | null = null;

afterEach(() => {
	catalogSpy?.mockRestore();
	view?.unmount();
	view = null;
	backend.restore();
});

async function mountView(opts: { apply?: () => unknown } = {}) {
	backend = fakeBackend({});
	backend.handlers.get_cursor_state = () => ({ theme: 'Adwaita', size: 24 });
	backend.handlers.get_cursor_themes = () => ['Adwaita', 'Bibata', 'Sin-Imagenes'];
	backend.handlers.get_cursor_theme_preview = (args) => ({
		name: args?.theme,
		images: args?.theme === 'Sin-Imagenes' ? [] : [PNG, PNG],
	});
	backend.handlers.apply_cursor = opts.apply ?? (() => undefined);
	catalogSpy = spyOn(i18n, 'useI18n').mockImplementation(
		() =>
			({ t: (key: string) => textsOf(key)[1] ?? key }) as unknown as ReturnType<typeof i18n.useI18n>
	);
	view = mount(CursorsView, { global: { stubs: { ThemeIcon: true, AppIcon: true } } });
	await flushPromises();
	return view;
}

const card = (wrapper: VueWrapper, theme: string) => wrapper.find(`[data-theme-name="${theme}"]`);
const applyButton = (wrapper: VueWrapper) =>
	wrapper
		.findAll('button')
		.find((button) => button.attributes('role') !== 'radio' && /Aplicar/.test(button.text()));

describe('la pantalla del cursor', () => {
	test('muestra una tarjeta por tema, con los cursores que trae, y marca el de ahora', async () => {
		const wrapper = await mountView();

		expect(wrapper.findAll('[role="radio"]')).toHaveLength(3);
		expect(card(wrapper, 'Adwaita').findAll('img')).toHaveLength(2);
		expect(card(wrapper, 'Adwaita').find('img').attributes('src')).toBe(PNG);
		expect(card(wrapper, 'Adwaita').attributes('aria-checked')).toBe('true');
		expect(card(wrapper, 'Bibata').attributes('aria-checked')).toBe('false');
	});

	test('un tema sin cursores legibles se ofrece igual, con su aviso', async () => {
		const wrapper = await mountView();

		expect(card(wrapper, 'Sin-Imagenes').findAll('img')).toHaveLength(0);
		expect(card(wrapper, 'Sin-Imagenes').text()).toContain('Sin vista previa');
	});

	test('no deja aplicar mientras no cambie nada', async () => {
		const wrapper = await mountView();

		expect(applyButton(wrapper)?.attributes('disabled')).toBeDefined();
	});

	test('elegir otro tema y aplicar manda el tema y el tamaño, juntos, al backend', async () => {
		const wrapper = await mountView();

		await card(wrapper, 'Bibata').trigger('click');
		expect(card(wrapper, 'Bibata').attributes('aria-checked')).toBe('true');
		await applyButton(wrapper)?.trigger('click');
		await flushPromises();

		const llamadas = backend.calls.filter((call) => call.command === 'apply_cursor');
		expect(llamadas).toHaveLength(1);
		expect(llamadas[0]?.args).toEqual({ theme: 'Bibata', size: 24 });
	});

	test('si el backend rechaza el cambio lo dice y deja aplicar de nuevo', async () => {
		const wrapper = await mountView({
			apply: () => {
				throw 'sin gsettings';
			},
		});

		await card(wrapper, 'Bibata').trigger('click');
		await applyButton(wrapper)?.trigger('click');
		await flushPromises();

		expect(wrapper.text()).toContain('sin gsettings');
		expect(applyButton(wrapper)?.attributes('disabled')).toBeUndefined();
	});
});

describe('el cursor se cambia en un solo lugar', () => {
	const fuente = (ruta: string) => Bun.file(new URL(ruta, import.meta.url)).text();

	test('«Tema» ya no tiene un desplegable de cursor', async () => {
		const vista = await fuente('../src/views/AppearanceThemeView.vue');

		expect(vista).not.toContain("id: 'cursor-theme'");
		expect(vista).not.toContain('getCursorThemes');
	});

	test('las entradas de Wayfire ya no tienen tema ni tamaño de cursor', async () => {
		const vista = await fuente('../src/views/WayfireInputView.vue');

		// La velocidad del cursor sigue ahí: es del ratón, no del tema.
		expect(vista).not.toContain('cursor_theme');
		expect(vista).not.toContain('cursor_size');
	});
});

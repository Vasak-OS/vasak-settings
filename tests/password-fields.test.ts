/**
 * Los campos de contraseña de Configuración son `PasswordField`, no un
 * `<input type="password">` crudo.
 *
 * Un campo crudo no deja mirar lo que se escribió ni avisa del Bloq Mayús, y
 * volver a escribir una clave larga a ciegas es lo que hace que se la repita
 * mal. Si alguien lo vuelve a poner —un `TextInput type="password"` es lo
 * primero que sale de copiar el de al lado— nada falla: el campo anda, sólo
 * que sin el botón. Por eso hay dos pruebas: una monta un formulario de verdad
 * y busca el botón de mostrar, y la otra mira el fuente de las pantallas que
 * no se pueden montar sin Tauri.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { PasswordField } from '@vasakgroup/vue-libvasak';
import { mount, type VueWrapper } from '@vue/test-utils';
import { Glob } from 'bun';
import NewProfileComponent from '@/components/vpn/NewProfileComponent.vue';

let view: VueWrapper | null = null;

afterEach(() => {
	view?.unmount();
	view = null;
});

describe('el perfil de VPN nuevo', () => {
	test('la contraseña y la de la clave privada se pueden mostrar', async () => {
		view = mount(NewProfileComponent, {
			props: { open: true },
			global: { stubs: { ThemeIcon: true } },
		});

		const toggles = view.findAll('button[aria-pressed]');
		expect(toggles).toHaveLength(2);

		const fields = () =>
			view?.findAllComponents(PasswordField).map((field) => field.get('input')) ?? [];
		expect(fields()).toHaveLength(2);
		expect(fields().map((field) => field.attributes('type'))).toEqual(['password', 'password']);

		await toggles[0].trigger('click');

		expect(toggles[0].attributes('aria-pressed')).toBe('true');
		expect(fields().map((field) => field.attributes('type'))).toEqual(['text', 'password']);
	});
});

describe('las pantallas con una contraseña', () => {
	const root = new URL('../src/', import.meta.url).pathname;
	const sources = [...new Glob('**/*.vue').scanSync(root)].map((path) => ({
		path,
		text: readFileSync(root + path, 'utf8'),
	}));

	// Cuántos campos de contraseña tiene cada archivo.
	const expected: Record<string, number> = {
		'components/vpn/NewProfileComponent.vue': 2,
		'views/NetworkWifiView.vue': 1,
		'views/UsersView.vue': 4,
		'views/OnlineAccountsView.vue': 2,
	};

	test('ninguna deja un campo de contraseña crudo', () => {
		const raw = sources
			.filter(({ text }) => /<(?:input|TextInput)\b[^>]*\btype="password"/s.test(text))
			.map(({ path }) => path);

		expect(raw).toEqual([]);
	});

	test('el guardia encuentra lo que busca', () => {
		const pattern = /<(?:input|TextInput)\b[^>]*\btype="password"/s;

		expect(pattern.test('<TextInput v-model="x" type="password" />')).toBe(true);
		expect(pattern.test('<input\n\tv-model="x"\n\ttype="password"\n/>')).toBe(true);
		expect(pattern.test('<PasswordField v-model="x" />')).toBe(false);
	});

	for (const [path, count] of Object.entries(expected)) {
		test(`${path} usa PasswordField`, () => {
			const text = sources.find((source) => source.path === path)?.text ?? '';

			expect(text.match(/<PasswordField\b/g)?.length ?? 0).toBe(count);
		});
	}
});

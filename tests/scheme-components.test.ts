import { afterEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import ColorSwatch from '@/components/scheme/ColorSwatch.vue';
import SchemeCard from '@/components/scheme/SchemeCard.vue';
import SchemeColorEditor from '@/components/scheme/SchemeColorEditor.vue';
import SchemeResetControl from '@/components/scheme/SchemeResetControl.vue';
import type { SchemeFile } from '@/types/scheme';

/**
 * Los componentes del editor del esquema «Personalizado».
 *
 * No se comprueban textos: el i18n tiene un doble en otro archivo de la suite
 * que devuelve la clave, y sin él devuelve otra cosa. Lo que se mira es lo que
 * no depende del idioma —qué se emite, qué se marca, cuántos campos hay—.
 */

const FIXTURE = new URL('./fixtures/scheme-vasak-default.json', import.meta.url);
const scheme = (): SchemeFile => JSON.parse(readFileSync(FIXTURE, 'utf8')) as SchemeFile;

const mounted: VueWrapper[] = [];

/**
 * `ThemeIcon` va en un doble: desde que el selector es el `SelectField` de la
 * librería, su flecha es un icono del tema, y el icono se suscribe al cambio de
 * tema al montar —que sin Tauri revienta—. Lo que se prueba acá es el diálogo
 * de confirmar, no la flecha.
 */
function mountAttached(component: Parameters<typeof mount>[0], options: Record<string, unknown>) {
	const wrapper = mount(component, {
		attachTo: document.body,
		global: { stubs: { ThemeIcon: true } },
		...options,
	} as never);
	mounted.push(wrapper);
	return wrapper;
}

afterEach(() => {
	for (const wrapper of mounted.splice(0)) wrapper.unmount();
	for (const loose of document.body.querySelectorAll('[role="dialog"]')) {
		loose.parentElement?.remove();
	}
});

describe('ColorSwatch', () => {
	const props = { id: 'c', label: 'Primario', modelValue: '#eba0ac', invalidMessage: 'mal' };

	test('un hex válido se emite, en minúscula', async () => {
		const wrapper = mountAttached(ColorSwatch, { props });
		await wrapper.get('input[type="text"]').setValue('#ABCDEF');

		expect(wrapper.emitted('update:modelValue')).toEqual([['#abcdef']]);
	});

	test('un hex inválido no se emite y queda marcado', async () => {
		const wrapper = mountAttached(ColorSwatch, { props });
		const field = wrapper.get('input[type="text"]');
		await field.setValue('#12');

		expect(wrapper.emitted('update:modelValue')).toBeUndefined();
		expect(field.attributes('aria-invalid')).toBe('true');
		const describedBy = field.attributes('aria-describedby');
		expect(describedBy).toBeTruthy();
		expect(wrapper.find(`#${describedBy}`).exists()).toBe(true);
	});

	test('el selector emite lo que se elige', async () => {
		const wrapper = mountAttached(ColorSwatch, { props });
		await wrapper.get('input[type="color"]').setValue('#00ff00');

		expect(wrapper.emitted('update:modelValue')).toEqual([['#00ff00']]);
	});

	test('con #rgb el selector recibe la forma larga, que es la única que entiende', () => {
		const wrapper = mountAttached(ColorSwatch, { props: { ...props, modelValue: '#abc' } });

		expect((wrapper.get('input[type="color"]').element as HTMLInputElement).value).toBe('#aabbcc');
	});

	test('cada campo tiene su etiqueta', () => {
		const wrapper = mountAttached(ColorSwatch, { props });

		expect(wrapper.get('label').attributes('for')).toBe('c');
		expect(wrapper.get('input[type="color"]').attributes('aria-label')).toBe('Primario');
	});
});

describe('SchemeColorEditor', () => {
	test('edita todos los colores: nueve de interfaz y diecinueve de terminal', () => {
		const wrapper = mountAttached(SchemeColorEditor, { props: { scheme: scheme() } });

		const ids = wrapper.findAll('input[type="text"]').map((input) => input.attributes('id'));
		expect(ids.filter((id) => !id?.includes('terminal') && !id?.includes('ansi'))).toHaveLength(9);
		expect(ids.filter((id) => id?.includes('terminal'))).toHaveLength(3);
		expect(ids.filter((id) => id?.includes('ansi'))).toHaveLength(16);
		expect(ids).toContain('scheme-dark-text-on-secondary');
	});

	test('sin on-secondary en el esquema no se inventa el campo', () => {
		const withoutOnSecondary = scheme();
		delete withoutOnSecondary.colors.dark.ui.text['on-secondary'];
		const wrapper = mountAttached(SchemeColorEditor, { props: { scheme: withoutOnSecondary } });

		expect(wrapper.find('#scheme-dark-text-on-secondary').exists()).toBe(false);
	});

	test('emite el cambio como parche sobre la variante elegida', async () => {
		const wrapper = mountAttached(SchemeColorEditor, { props: { scheme: scheme() } });
		await wrapper.get('#scheme-dark-primary').setValue('#101010');
		await wrapper.get('#scheme-dark-ansi-brightRed').setValue('#202020');

		expect(wrapper.emitted('update')).toEqual([
			['dark', { ui: { color: { primary: '#101010' } } }],
			['dark', { terminal: { ansi: { brightRed: '#202020' } } }],
		]);
	});

	test('las pestañas cambian de variante, también con las flechas', async () => {
		const wrapper = mountAttached(SchemeColorEditor, { props: { scheme: scheme() } });
		const tabs = wrapper.findAll('[role="tab"]');
		expect(tabs[0].attributes('aria-selected')).toBe('true');

		await tabs[0].trigger('keydown', { key: 'ArrowRight' });
		await nextTick();

		expect(wrapper.findAll('[role="tab"]')[1].attributes('aria-selected')).toBe('true');
		expect(document.activeElement).toBe(wrapper.findAll('[role="tab"]')[1].element);
		expect(wrapper.find('#scheme-light-primary').exists()).toBe(true);
		await wrapper.get('#scheme-light-primary').setValue('#303030');
		expect(wrapper.emitted('update')?.[0]).toEqual([
			'light',
			{ ui: { color: { primary: '#303030' } } },
		]);
	});

	test('avisa del contraste bajo sólo en el par que no llega', () => {
		const low = scheme();
		low.colors.dark.ui.text['on-primary'] = '#cdd6f4';
		const wrapper = mountAttached(SchemeColorEditor, { props: { scheme: low } });

		const warned = wrapper
			.findAll('[data-contrast]')
			.filter((item) => item.find('[data-contrast-warning]').exists())
			.map((item) => item.attributes('data-contrast'));
		expect(warned).toEqual(['onPrimary']);
	});

	test('la terminal va en una sección plegable', () => {
		const wrapper = mountAttached(SchemeColorEditor, { props: { scheme: scheme() } });
		const details = wrapper.get('details');

		expect(details.find('#scheme-dark-terminal-cursor').exists()).toBe(true);
		expect(details.attributes('open')).toBeUndefined();
	});
});

describe('SchemeResetControl', () => {
	const options = [
		{ label: 'Vasak Default', value: 'vasak-default' },
		{ label: 'Nord', value: 'nord' },
	];
	const dialog = () => document.body.querySelector<HTMLElement>('[role="dialog"]');

	test('reclonar pide confirmación: el botón sólo abre el diálogo', async () => {
		const wrapper = mountAttached(SchemeResetControl, { props: { options } });
		await wrapper.get('[data-reset-open]').trigger('click');
		await nextTick();

		expect(wrapper.emitted('reset')).toBeUndefined();
		expect(dialog()).not.toBeNull();
	});

	test('y al confirmar sale con el esquema elegido', async () => {
		const wrapper = mountAttached(SchemeResetControl, { props: { options } });
		await wrapper.get('select').setValue('nord');
		await wrapper.get('[data-reset-open]').trigger('click');
		await nextTick();

		dialog()?.querySelector<HTMLButtonElement>('[data-reset-confirm]')?.click();
		await nextTick();

		expect(wrapper.emitted('reset')).toEqual([['nord']]);
	});

	test('cancelar no reclona', async () => {
		const wrapper = mountAttached(SchemeResetControl, { props: { options } });
		await wrapper.get('[data-reset-open]').trigger('click');
		await nextTick();

		dialog()?.querySelector<HTMLButtonElement>('[data-reset-cancel]')?.click();
		await nextTick();

		expect(wrapper.emitted('reset')).toBeUndefined();
	});
});

describe('SchemeCard', () => {
	test('dice si está elegida y emite al elegirla', async () => {
		const wrapper = mountAttached(SchemeCard, {
			props: { title: 'Personalizado', swatches: ['#000000', '#ffffff'], selected: true },
		});
		const button = wrapper.get('button');

		expect(button.attributes('aria-pressed')).toBe('true');
		expect(button.classes()).toContain('ring-primary');
		await button.trigger('click');
		expect(wrapper.emitted('select')).toHaveLength(1);
	});
});

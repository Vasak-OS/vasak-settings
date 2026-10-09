/**
 * El icono de una aplicación en las listas de permisos y de aplicaciones por
 * defecto.
 *
 * Es un envoltorio fino sobre `ThemeIcon`: lo único que agrega es el recuadro
 * que deja el hueco cuando el tema no tiene el icono. Lo que se vigila es que
 * el nombre llegue entero a `ThemeIcon` —si se pierde en el camino, la fila se
 * dibuja con el hueco y nada falla— y que el componente siga siendo decorativo.
 */

import { describe, expect, test } from 'bun:test';
import { mount } from '@vue/test-utils';
import AppIcon from '../src/components/permissions/AppIcon.vue';

/** `ThemeIcon` de mentira: la prueba mira qué recibe, no cómo lo dibuja. */
const ThemeIconStub = {
	name: 'ThemeIcon',
	props: ['name', 'size'],
	template: '<i class="stub" :data-name="name" :data-size="size" />',
};

const mountIcon = (name: string) =>
	mount(AppIcon, { props: { name }, global: { stubs: { ThemeIcon: ThemeIconStub } } });

describe('AppIcon', () => {
	test('le pasa el nombre del icono a ThemeIcon tal cual', () => {
		const wrapper = mountIcon('org.gnome.Nautilus');
		const icon = wrapper.findComponent(ThemeIconStub);
		expect(icon.exists()).toBe(true);
		expect(icon.props('name')).toBe('org.gnome.Nautilus');
		expect(icon.props('size')).toBe(28);
	});

	test('cambia de icono cuando cambia el nombre', async () => {
		const wrapper = mountIcon('firefox');
		await wrapper.setProps({ name: 'thunderbird' });
		expect(wrapper.findComponent(ThemeIconStub).props('name')).toBe('thunderbird');
	});

	test('deja el recuadro con borde aunque el nombre venga vacío', () => {
		// Es el caso de un `.desktop` sin `Icon=`: la fila conserva la forma.
		const wrapper = mountIcon('');
		const frame = wrapper.get('span');
		expect(frame.classes()).toContain('border');
		expect(frame.classes()).toContain('size-9');
	});

	test('es decorativo: no agrega texto alternativo que repita el nombre de la fila', () => {
		const wrapper = mountIcon('firefox');
		expect(wrapper.find('[alt]').exists()).toBe(false);
		expect(wrapper.text()).toBe('');
	});
});

/**
 * Los componentes de formulario y de sección, ahora de la librería, y lo que
 * Configuración necesita que sigan haciendo.
 *
 * Eran `SectionCard` y `SelectInput`, copias propias en `components/ui/`, y los
 * dos tenían un hallazgo detrás que salió de activar `strictTemplates`:
 *
 *  - `SectionCard` no tenía la propiedad `title`, y seis pantallas se la
 *    pasaban. Caía sobre el `<article>` como el atributo `title` de HTML, así
 *    que el encabezado **no se dibujaba**: quedaba como un globito sobre toda
 *    la tarjeta. Hoy esas secciones son `ConfigSection`, que lo dibuja.
 *  - `SelectInput` emitía siempre la cadena del `<select>`, aun con opciones
 *    numéricas. Hoy es `SelectField`, y lo que importa es que el número siga
 *    llegando como número: el intervalo de las actualizaciones mezcla `'auto'`
 *    con milisegundos.
 *
 * `ThemeIcon` va en un doble: la flecha del selector y el icono de la sección
 * son iconos del tema, que se suscriben al cambio de tema al montar y sin Tauri
 * revientan. Lo que se prueba acá no es el icono.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { ConfigSection, SelectField } from '@vasakgroup/vue-libvasak';
import { mount, type VueWrapper } from '@vue/test-utils';

let view: VueWrapper | null = null;

const global = { stubs: { ThemeIcon: true } };

afterEach(() => {
	view?.unmount();
	view = null;
});

describe('la sección', () => {
	test('con `title` dibuja el encabezado', () => {
		view = mount(ConfigSection, {
			props: { title: 'Teclado' },
			slots: { default: '<p>x</p>' },
			global,
		});

		expect(view.get('h3').text()).toBe('Teclado');
	});

	test('el título no queda de globito sobre la tarjeta', () => {
		// Que es lo que hacía la copia de antes, cuando `title` caía como
		// atributo de HTML.
		view = mount(ConfigSection, {
			props: { title: 'Teclado' },
			slots: { default: '<p>x</p>' },
			global,
		});

		expect(view.attributes('title')).toBeUndefined();
	});

	test('la descripción va debajo del título, no en un párrafo suelto', () => {
		// Idioma y teclado escribían la descripción a mano adentro de la
		// tarjeta; ahora es la propiedad de la sección.
		view = mount(ConfigSection, {
			props: { title: 'Idioma', description: 'El idioma de todo el sistema' },
			global,
		});

		expect(view.text()).toContain('El idioma de todo el sistema');
	});
});

describe('el selector', () => {
	test('con opciones de texto devuelve texto', async () => {
		view = mount(SelectField, { props: { modelValue: 'a', options: ['a', 'b'] }, global });

		await view.get('select').setValue('b');

		expect(view.emitted('update:modelValue')?.[0]).toEqual(['b']);
	});

	test('y con opciones numéricas devuelve un número, no la cadena', async () => {
		// El `<select>` siempre devuelve una cadena. Emitir `'2'` donde quien
		// escucha espera `2` le deja un tipo que miente, y la comparación con
		// los valores de `options` falla sin decir por qué.
		view = mount(SelectField, {
			props: {
				modelValue: 1,
				options: [
					{ label: 'uno', value: 1 },
					{ label: 'dos', value: 2 },
				],
			},
			global,
		});

		await view.get('select').setValue('2');

		expect(view.emitted('update:modelValue')?.[0]).toEqual([2]);
	});

	test('y con una lista mezclada, cada opción devuelve lo suyo', async () => {
		// Con el modelo en `5000`, elegir `auto` no puede dar `NaN`; con el
		// modelo en `auto`, elegir `5000` no puede dar `'5000'`.
		const mixed = [
			{ label: 'automático', value: 'auto' },
			{ label: '5 s', value: 5000 },
		];

		view = mount(SelectField, { props: { modelValue: 5000, options: mixed }, global });
		await view.get('select').setValue('auto');
		expect(view.emitted('update:modelValue')?.[0]).toEqual(['auto']);
		view.unmount();

		view = mount(SelectField, { props: { modelValue: 'auto', options: mixed }, global });
		await view.get('select').setValue('5000');
		expect(view.emitted('update:modelValue')?.[0]).toEqual([5000]);
	});

	test('el `id` y el `disabled` que llegan por `v-bind` caen en el `<select>`', () => {
		// `SelectField` no los declara como propiedades, así que las pantallas
		// se los pasan en un objeto (ver `form-labels`). Si cayeran en el
		// contenedor, la etiqueta `for` no apuntaría al control y un selector
		// sin opciones quedaría habilitado.
		view = mount(SelectField, {
			props: { modelValue: 'a', options: ['a'] },
			attrs: { id: 'gtk-theme', disabled: true },
			global,
		});

		const select = view.get('select');
		expect(select.attributes('id')).toBe('gtk-theme');
		expect(select.attributes('disabled')).toBeDefined();
	});
});

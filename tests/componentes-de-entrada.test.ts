/**
 * Los componentes que ahora declaran lo que emiten, y lo que eso destapó.
 *
 * Los tres salieron de activar `strictTemplates`, y los tres funcionaban mal o
 * a medias sin que nada avisara:
 *
 *  - `SectionCard` no tenía ninguna propiedad, y seis pantallas le pasaban
 *    `:title`. Eso caía sobre el `<article>` como el atributo `title` de HTML,
 *    así que el encabezado **no se dibujaba**: quedaba como un globito al pasar
 *    el mouse por encima de toda la tarjeta;
 *  - `TextInput` no declaraba `keyup`, y el Wi-Fi y los dispositivos confirman
 *    con Enter. Caía sobre el `<input>` y funcionaba, pero no estaba escrito;
 *  - `SelectInput` emitía siempre la cadena del `<select>`, aun con opciones
 *    numéricas. Como su modelo era `string | number`, nadie se enteraba.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { mount, type VueWrapper } from '@vue/test-utils';
import SectionCard from '@/components/ui/SectionCard.vue';
import SelectInput from '@/components/ui/SelectInput.vue';
import TextInput from '@/components/ui/TextInput.vue';

let vista: VueWrapper | null = null;

afterEach(() => {
	vista?.unmount();
	vista = null;
});

describe('SectionCard', () => {
	test('con `title` dibuja el encabezado', () => {
		vista = mount(SectionCard, { props: { title: 'Teclado' }, slots: { default: '<p>x</p>' } });

		expect(vista.get('h3').text()).toBe('Teclado');
	});

	test('y sin `title` no dibuja ninguno', () => {
		// Las pantallas que ya ponen su propio `<h3>` no tienen que quedar con
		// dos encabezados.
		vista = mount(SectionCard, { slots: { default: '<h3>El mío</h3>' } });

		expect(vista.findAll('h3')).toHaveLength(1);
	});

	test('el título no queda de globito sobre la tarjeta', () => {
		// Que es lo que hacía antes, cuando `title` caía como atributo de HTML.
		vista = mount(SectionCard, { props: { title: 'Teclado' }, slots: { default: '<p>x</p>' } });

		expect(vista.get('article').attributes('title')).toBeUndefined();
	});
});

describe('TextInput', () => {
	test('la tecla llega a quien lo usa', async () => {
		// Es cómo el Wi-Fi confirma la contraseña con Enter.
		vista = mount(TextInput, { props: { modelValue: '' } });

		await vista.get('input').trigger('keyup', { key: 'Enter' });

		expect(vista.emitted('keyup')).toHaveLength(1);
	});
});

describe('SelectInput', () => {
	test('con opciones de texto devuelve texto', async () => {
		vista = mount(SelectInput, {
			props: { modelValue: 'a', options: ['a', 'b'] },
		});

		await vista.get('select').setValue('b');

		expect(vista.emitted('update:modelValue')?.[0]).toEqual(['b']);
	});

	test('y con opciones numéricas devuelve un número, no la cadena', async () => {
		// El `<select>` siempre devuelve una cadena. Emitir `'2'` donde quien
		// escucha espera `2` le deja un tipo que miente, y la comparación con
		// los valores de `options` falla sin decir por qué.
		vista = mount(SelectInput, {
			props: {
				modelValue: 1,
				options: [
					{ label: 'uno', value: 1 },
					{ label: 'dos', value: 2 },
				],
			},
		});

		await vista.get('select').setValue('2');

		expect(vista.emitted('update:modelValue')?.[0]).toEqual([2]);
	});
});

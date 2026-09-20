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

	test('y con una lista mezclada, cada opción devuelve lo suyo', async () => {
		// El tipo sale de la opción elegida, no de convertir según el tipo que
		// tenga el modelo en ese momento. Adivinar por el modelo rompía las dos
		// puntas de una lista mezclada: con el modelo en `5000`, elegir `auto`
		// daba `NaN`; con el modelo en `auto`, elegir `5000` daba `'5000'`. Lo
		// marcó la revisión.
		const mezcladas = [
			{ label: 'automático', value: 'auto' },
			{ label: '5 s', value: 5000 },
		];

		vista = mount(SelectInput, { props: { modelValue: 5000, options: mezcladas } });
		await vista.get('select').setValue('auto');
		expect(vista.emitted('update:modelValue')?.[0]).toEqual(['auto']);
		vista.unmount();

		vista = mount(SelectInput, { props: { modelValue: 'auto', options: mezcladas } });
		await vista.get('select').setValue('5000');
		expect(vista.emitted('update:modelValue')?.[0]).toEqual([5000]);
	});

	test('y un valor que no está en la lista sale como la cadena que es', async () => {
		// La red de abajo: si el `<select>` llega a tener un valor que no salió
		// de `options`, no hay opción de la que sacar el tipo y va lo único que
		// se sabe. Sin esa salida, `find` no encuentra nada y lo que se emite
		// es `undefined`, que es peor que una cadena.
		vista = mount(SelectInput, { props: { modelValue: 'a', options: ['a', 'b'] } });
		const select = vista.get('select').element as HTMLSelectElement;
		select.insertAdjacentHTML('beforeend', '<option value="suelta">suelta</option>');

		await vista.get('select').setValue('suelta');

		expect(vista.emitted('update:modelValue')?.[0]).toEqual(['suelta']);
	});
});

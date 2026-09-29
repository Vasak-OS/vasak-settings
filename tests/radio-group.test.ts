import { describe, expect, test } from 'bun:test';
import { onRadioArrow, radioStep, radioTabIndex } from '@/utils/radio-group';

const ids = ['a', 'b', 'c'];

describe('radioTabIndex', () => {
	test('sólo la opción elegida es tabulable', () => {
		expect(ids.map((id) => radioTabIndex(ids, 'b', id))).toEqual([-1, 0, -1]);
	});

	test('sin ninguna elegida, entra por la primera', () => {
		expect(ids.map((id) => radioTabIndex(ids, '', id))).toEqual([0, -1, -1]);
		expect(ids.map((id) => radioTabIndex(ids, 'ya-no-está', id))).toEqual([0, -1, -1]);
	});
});

describe('radioStep', () => {
	test('abajo y derecha avanzan, arriba e izquierda retroceden', () => {
		expect(radioStep(ids, 'a', 'ArrowDown')).toBe('b');
		expect(radioStep(ids, 'a', 'ArrowRight')).toBe('b');
		expect(radioStep(ids, 'b', 'ArrowUp')).toBe('a');
		expect(radioStep(ids, 'b', 'ArrowLeft')).toBe('a');
	});

	test('da la vuelta en los extremos', () => {
		expect(radioStep(ids, 'c', 'ArrowDown')).toBe('a');
		expect(radioStep(ids, 'a', 'ArrowUp')).toBe('c');
	});

	test('otra tecla, o un grupo vacío, no mueve nada', () => {
		expect(radioStep(ids, 'a', 'Tab')).toBeNull();
		expect(radioStep(ids, 'a', 'Enter')).toBeNull();
		expect(radioStep([], '', 'ArrowDown')).toBeNull();
	});
});

describe('onRadioArrow', () => {
	function group() {
		const ul = document.createElement('ul');
		for (const id of ids) {
			const li = document.createElement('li');
			li.tabIndex = -1;
			li.dataset.id = id;
			ul.appendChild(li);
		}
		document.body.appendChild(ul);
		return [...ul.children] as HTMLElement[];
	}

	function press(target: HTMLElement, key: string) {
		const event = new KeyboardEvent('keydown', { key, cancelable: true });
		Object.defineProperty(event, 'currentTarget', { value: target });
		return event;
	}

	test('elige la siguiente, le pasa el foco y evita el desplazamiento', () => {
		const options = group();
		const chosen: string[] = [];
		const event = press(options[0], 'ArrowDown');

		onRadioArrow(event, ids, 'a', (id) => chosen.push(id));

		expect(chosen).toEqual(['b']);
		expect(document.activeElement).toBe(options[1]);
		expect(event.defaultPrevented).toBe(true);
	});

	test('una tecla que no es flecha se deja pasar', () => {
		const options = group();
		const chosen: string[] = [];
		const event = press(options[0], 'Tab');

		onRadioArrow(event, ids, 'a', (id) => chosen.push(id));

		expect(chosen).toEqual([]);
		expect(event.defaultPrevented).toBe(false);
	});
});

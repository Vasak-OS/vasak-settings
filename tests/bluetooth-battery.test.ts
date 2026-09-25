/**
 * Del porcentaje de batería al icono de la escalera del tema.
 *
 * Lo que se cuida es el **redondeo** —a la decena más cercana, con el 5 hacia
 * arriba— y que nada salga de `battery-level-0` a `battery-level-100`, que son
 * los únicos nombres que el tema tiene.
 */

import { describe, expect, test } from 'bun:test';
import { BATTERY_ICON_PREFIX, batteryIcon } from '../src/utils/bluetooth-battery';

describe('batteryIcon', () => {
	test('redondea a la decena más cercana', () => {
		const casos: Array<[number, string]> = [
			[0, 'battery-level-0'],
			[4, 'battery-level-0'],
			[5, 'battery-level-10'],
			[87, 'battery-level-90'],
			[95, 'battery-level-100'],
			[100, 'battery-level-100'],
		];
		for (const [porcentaje, icono] of casos) {
			expect(batteryIcon(porcentaje)).toBe(icono);
		}
	});

	test('fuera de rango se acota: nunca pide un icono que el tema no tiene', () => {
		expect(batteryIcon(120)).toBe('battery-level-100');
		expect(batteryIcon(-5)).toBe('battery-level-0');
	});

	test('el cero es una batería agotada, no una ausencia: tiene icono', () => {
		// Que no venga el dato lo decide quien arma la fila; acá el 0 es un
		// número como cualquier otro.
		expect(batteryIcon(0)).toBe('battery-level-0');
	});

	test('el nombre va pelado, sin «-symbolic»', () => {
		// La tarjeta pide la variante simbólica ella sola con `type="symbol"`:
		// con `-symbolic` pegado pediría `…-symbolic-symbolic` y saldría el
		// cuadrito de imagen rota.
		expect(BATTERY_ICON_PREFIX).toBe('battery-level-');
		expect(batteryIcon(50)).not.toContain('symbolic');
	});

	test('sólo salen las once decenas de la escalera', () => {
		const nombres = new Set<string>();
		for (let p = 0; p <= 100; p++) nombres.add(batteryIcon(p));
		expect([...nombres].sort()).toEqual(
			[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((n) => `battery-level-${n}`).sort()
		);
	});
});

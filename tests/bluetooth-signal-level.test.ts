/**
 * Los cortes del RSSI a icono del tema.
 *
 * Lo que se cuida son los **bordes**: cada corte es «mayor o igual», así que
 * −50 ya es excelente y −51 es buena. Un `>` en vez de un `>=` mueve todos los
 * escalones un dBm y nada más lo notaría.
 */

import { describe, expect, test } from 'bun:test';
import { NO_SIGNAL_ICON, SIGNAL_THRESHOLDS, signalLevel } from '../src/utils/bluetooth-signal';

describe('signalLevel', () => {
	test('cada corte entra en su escalón, y un dBm menos cae al siguiente', () => {
		const casos: Array<[number, string]> = [
			[-50, 'network-wireless-signal-excellent'],
			[-51, 'network-wireless-signal-good'],
			[-60, 'network-wireless-signal-good'],
			[-61, 'network-wireless-signal-ok'],
			[-70, 'network-wireless-signal-ok'],
			[-71, 'network-wireless-signal-weak'],
			[-80, 'network-wireless-signal-weak'],
			[-81, 'network-wireless-signal-none'],
		];
		for (const [rssi, icono] of casos) {
			expect(signalLevel(rssi)).toBe(icono);
		}
	});

	test('un dispositivo pegado es excelente y uno al límite del alcance no tiene señal', () => {
		expect(signalLevel(-30)).toBe('network-wireless-signal-excellent');
		expect(signalLevel(-90)).toBe('network-wireless-signal-none');
	});

	test('el cero es un RSSI válido, y es el mejor posible', () => {
		expect(signalLevel(0)).toBe('network-wireless-signal-excellent');
	});

	test('los nombres son la escalera estándar del tema, en simbólico', () => {
		// La tarjeta pide la variante simbólica ella sola con `type="symbol"`,
		// así que acá va el nombre pelado: con `-symbolic` pegado pediría
		// `…-symbolic-symbolic` y saldría el cuadrito de imagen rota.
		const nombres = [...SIGNAL_THRESHOLDS.map(([, icono]) => icono), NO_SIGNAL_ICON];
		expect(nombres).toEqual([
			'network-wireless-signal-excellent',
			'network-wireless-signal-good',
			'network-wireless-signal-ok',
			'network-wireless-signal-weak',
			'network-wireless-signal-none',
		]);
	});

	test('los cortes van de mejor a peor, que es lo que el recorrido supone', () => {
		// `signalLevel` devuelve el primer corte que el RSSI alcanza: si alguien
		// reordena la tabla al ajustarla con un dispositivo real, todo lo de abajo
		// del primer corte desordenado se vuelve inalcanzable.
		const minimos = SIGNAL_THRESHOLDS.map(([minimo]) => minimo);
		expect(minimos).toEqual([...minimos].sort((a, b) => b - a));
	});
});

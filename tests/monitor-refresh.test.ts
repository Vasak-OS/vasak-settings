import { describe, expect, test } from 'bun:test';
import { formatRefresh, type MonitorMode } from '@/services/monitors.service';

/**
 * El bug #147: la pantalla mostraba 60 Hz para todos los modos. Del lado del
 * backend el respaldo del kernel ya no inventa 60; marca la frecuencia como
 * desconocida (0). Acá se cubre cómo la muestra el frontend, que es el último
 * borde antes del usuario.
 */
function mode(refresh_mhz: number): MonitorMode {
	return { width: 1920, height: 1080, refresh_mhz, is_preferred: false, is_current: false };
}

describe('formatRefresh', () => {
	test('muestra la frecuencia real con los decimales que hagan falta', () => {
		expect(formatRefresh(mode(59_997))).toBe('59.997 Hz');
		expect(formatRefresh(mode(143_998))).toBe('143.998 Hz');
		expect(formatRefresh(mode(119_982))).toBe('119.982 Hz');
	});

	test('una frecuencia redonda no arrastra ceros', () => {
		expect(formatRefresh(mode(60_000))).toBe('60 Hz');
		expect(formatRefresh(mode(144_000))).toBe('144 Hz');
	});

	test('una frecuencia desconocida (0) no miente 60 Hz: muestra un guion', () => {
		expect(formatRefresh(mode(0))).toBe('—');
	});
});

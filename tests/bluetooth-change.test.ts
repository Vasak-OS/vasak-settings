/**
 * Qué cambios del evento `bluetooth-change` refrescan «Red y Bluetooth».
 *
 * Las cargas se arman **sólo** con `changeType`, sin el `change_type` que el
 * complemento todavía manda por compatibilidad: así la prueba es la del día en
 * que la 3.x lo saque. Con la lectura de antes (`const { change_type } =
 * event.payload`) ninguna comparación da verdadera y las cinco primeras caen.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BluetoothChange } from '@vasakgroup/plugin-bluetooth-manager';
import { REFRESHING_CHANGES, shouldRefresh } from '../src/utils/bluetooth-change';

/** La carga como la mandará el complemento cuando saque el nombre viejo. */
function payload(changeType: string): Omit<BluetoothChange, 'change_type'> {
	return { changeType, data: {} };
}

describe('shouldRefresh', () => {
	for (const changeType of [
		'adapter-property-changed',
		'device-added',
		'device-removed',
		'device-connected',
		'device-disconnected',
	]) {
		test(`«${changeType}» refresca la vista`, () => {
			expect(shouldRefresh(payload(changeType))).toBe(true);
		});
	}

	test('«device-property-changed» no refresca: llega con cada RSSI y cada batería', () => {
		expect(shouldRefresh(payload('device-property-changed'))).toBe(false);
	});

	test('un error del complemento no refresca', () => {
		expect(shouldRefresh(payload('error'))).toBe(false);
	});

	test('mira `changeType` y no el nombre viejo', () => {
		// Si el nombre viejo trajera otra cosa, decide el nuevo.
		const both = { changeType: 'device-added', change_type: 'error', data: {} };
		expect(shouldRefresh(both)).toBe(true);
		const onlyOld = { change_type: 'device-added', data: {} } as unknown as BluetoothChange;
		expect(shouldRefresh(onlyOld)).toBe(false);
	});

	test('son exactamente los cinco cambios que refrescaban antes', () => {
		expect([...REFRESHING_CHANGES].sort()).toEqual([
			'adapter-property-changed',
			'device-added',
			'device-connected',
			'device-disconnected',
			'device-removed',
		]);
	});
});

describe('NetworkBluetoothView', () => {
	const view = readFileSync(
		join(import.meta.dir, '..', 'src/views/NetworkBluetoothView.vue'),
		'utf8'
	);

	test('decide con el ayudante', () => {
		expect(view).toMatch(/shouldRefresh\(event\.payload\)/);
	});

	test('no vuelve a leer `change_type`', () => {
		expect(view).not.toMatch(/change_type/);
	});
});

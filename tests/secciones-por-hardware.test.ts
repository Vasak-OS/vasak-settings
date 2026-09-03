import { describe, expect, test } from 'bun:test';
import {
	HARDWARE_POR_SECCION,
	type Hardware,
	menuSegunHardware,
} from '../src/composables/secciones-por-hardware';
import type { Disponibilidad } from '../src/composables/useHardwareDeRed';
import type { SidebarCategory } from '../src/types/sidebar';

/**
 * Un equipo de escritorio sin placa inalámbrica mostraba igual la sección de
 * Wi-Fi, donde lo único que se puede leer es que no hay ninguna red. Lo que se
 * prueba acá son los dos casos que se equivocan callados: el hardware que no se
 * pudo averiguar —que **no** es lo mismo que no tenerlo— y la categoría que
 * queda sin elementos.
 */

const red = (): SidebarCategory => ({
	id: 'network',
	title: 'Conectividad',
	items: [
		{ id: 'network-wifi', label: 'Wi-Fi' },
		{ id: 'network-bluetooth', label: 'Bluetooth' },
		{ id: 'network-vpn', label: 'VPN' },
		{ id: 'phone-devices', label: 'Teléfonos' },
	],
});

const general = (): SidebarCategory => ({
	id: 'general',
	title: 'General',
	items: [{ id: 'home', label: 'Inicio' }],
});

const todo = (valor: Disponibilidad): Record<Hardware, Disponibilidad> => ({
	wifi: valor,
	bluetooth: valor,
});

const ids = (categorias: SidebarCategory[]) => categorias.flatMap((c) => c.items.map((i) => i.id));

describe('el menú según el hardware', () => {
	test('con las dos cosas no se saca nada', () => {
		const menu = menuSegunHardware([general(), red()], todo('si'));

		expect(ids(menu)).toEqual([
			'home',
			'network-wifi',
			'network-bluetooth',
			'network-vpn',
			'phone-devices',
		]);
	});

	test('sin placa inalámbrica, el Wi-Fi no aparece', () => {
		const menu = menuSegunHardware([red()], { wifi: 'no', bluetooth: 'si' });

		expect(ids(menu)).not.toContain('network-wifi');
		expect(ids(menu)).toContain('network-bluetooth');
	});

	test('sin adaptador Bluetooth, el Bluetooth no aparece', () => {
		const menu = menuSegunHardware([red()], { wifi: 'si', bluetooth: 'no' });

		expect(ids(menu)).not.toContain('network-bluetooth');
		expect(ids(menu)).toContain('network-wifi');
	});

	test('lo que no depende de hardware nunca se saca', () => {
		// VPN y teléfonos no necesitan ninguna de las dos cosas: la VPN va sobre
		// la conexión que haya, y el teléfono entra por cable.
		const menu = menuSegunHardware([red()], todo('no'));

		expect(ids(menu)).toEqual(['network-vpn', 'phone-devices']);
	});

	test('lo que no se pudo averiguar se muestra', () => {
		// El caso que importa y el fácil de errar: si NetworkManager o bluez no
		// contestaron, no se sabe si hay hardware. Esconder la sección ahí deja a
		// la persona sin el único lugar donde eso se puede explicar.
		const menu = menuSegunHardware([red()], todo('desconocido'));

		expect(ids(menu)).toContain('network-wifi');
		expect(ids(menu)).toContain('network-bluetooth');
	});

	test('una categoría que queda vacía se saca entera', () => {
		// Un título de grupo solo, sin nada abajo, se lee como una lista que no
		// cargó.
		const soloWifi: SidebarCategory = {
			id: 'network',
			title: 'Conectividad',
			items: [{ id: 'network-wifi', label: 'Wi-Fi' }],
		};

		const menu = menuSegunHardware([general(), soloWifi], todo('no'));

		expect(menu.map((c) => c.id)).toEqual(['general']);
	});

	test('no se modifican las categorías que entran', () => {
		// El componente las recalcula en un `computed`; mutar la lista de entrada
		// haría que la segunda pasada trabajara sobre lo ya filtrado.
		const entrada = [red()];
		const antes = ids(entrada);

		menuSegunHardware(entrada, todo('no'));

		expect(ids(entrada)).toEqual(antes);
	});

	test('el mapa de hardware nombra secciones que existen en el menú', () => {
		// Un `id` mal escrito acá no falla: simplemente no esconde nada, y el
		// síntoma es el que veníamos a arreglar.
		const enElMenu = ids([red()]);

		for (const seccion of Object.keys(HARDWARE_POR_SECCION)) {
			expect(enElMenu).toContain(seccion);
		}
	});
});

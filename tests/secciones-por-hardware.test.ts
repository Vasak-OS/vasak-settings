import { describe, expect, test } from 'bun:test';
import {
	type Disponibilidad,
	HARDWARE_POR_SECCION,
	type Hardware,
	menuSegunHardware,
	seccionInaccesible,
} from '../src/composables/secciones-por-hardware';
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

describe('llegar a una sección por su ruta', () => {
	test('la sección escondida tampoco se puede abrir', () => {
		// La otra puerta: `vasak-settings network-wifi` abre la aplicación en esa
		// pantalla, y es lo que usa el menú del panel. Sin el guard, el menú
		// escondía la sección y la ruta dejaba entrar igual.
		expect(seccionInaccesible('network-wifi', { wifi: 'no', bluetooth: 'si' })).toBe(true);
		expect(seccionInaccesible('network-bluetooth', { wifi: 'si', bluetooth: 'no' })).toBe(true);
	});

	test('con el hardware puesto se entra', () => {
		expect(seccionInaccesible('network-wifi', todo('si'))).toBe(false);
		expect(seccionInaccesible('network-bluetooth', todo('si'))).toBe(false);
	});

	test('lo que no se pudo averiguar deja pasar', () => {
		// La misma regla que en el menú: si no se pudo preguntar, esa pantalla es
		// el único lugar donde el problema se puede explicar.
		expect(seccionInaccesible('network-wifi', todo('desconocido'))).toBe(false);
		expect(seccionInaccesible('network-bluetooth', todo('desconocido'))).toBe(false);
	});

	test('las secciones que no dependen de hardware nunca se bloquean', () => {
		for (const nombre of ['home', 'network-vpn', 'phone-devices', 'appearance-theme']) {
			expect(seccionInaccesible(nombre, todo('no'))).toBe(false);
		}
	});

	test('una ruta sin nombre no bloquea nada', () => {
		// `destino.name` puede llegar vacío, y devolver `true` ahí dejaría la
		// aplicación redirigiendo a la portada para siempre.
		expect(seccionInaccesible(undefined, todo('no'))).toBe(false);
		expect(seccionInaccesible(null, todo('no'))).toBe(false);
		expect(seccionInaccesible('', todo('no'))).toBe(false);
	});

	test('el destino de la redirección nunca se bloquea a sí mismo', () => {
		// Si «home» dependiera de hardware, el guard se redirigiría en círculo.
		expect(Object.keys(HARDWARE_POR_SECCION)).not.toContain('home');
	});

	test('esconder y bloquear usan la misma regla', () => {
		// Dos reglas que se escriben aparte terminan discrepando. Acá se comprueba
		// que para cada sección con hardware, esconderla del menú y bloquear su
		// ruta digan lo mismo en los tres estados.
		for (const seccion of Object.keys(HARDWARE_POR_SECCION)) {
			for (const estado of ['si', 'no', 'desconocido'] as Disponibilidad[]) {
				const disponible = todo(estado);
				const enElMenu = ids(menuSegunHardware([red()], disponible)).includes(seccion);
				const bloqueada = seccionInaccesible(seccion, disponible);

				expect(enElMenu).toBe(!bloqueada);
			}
		}
	});
});

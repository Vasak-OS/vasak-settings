/**
 * Qué se pide al conectar un proveedor, y qué frena la conexión.
 *
 * El servicio de cuentas marca en `unavailable_capabilities` lo que un
 * proveedor ofrece y todavía no puede dar. Lo que se prueba acá es que eso no
 * se pida —si sólo quedan ésas, el servicio devuelve error después de haberle
 * abierto el navegador a la persona— y que un servicio viejo, que no manda el
 * campo, siga pidiendo todo como antes.
 */

import { describe, expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';
import {
	connectionBlocker,
	isCapabilityAvailable,
	requestedCapabilities,
} from '../src/utils/requested-capabilities';

describe('requestedCapabilities', () => {
	test('sin capacidades apagadas se pide todo, en el mismo orden', () => {
		expect(
			requestedCapabilities({
				capabilities: ['email', 'calendar', 'contacts'],
				unavailable_capabilities: [],
			})
		).toEqual(['email', 'calendar', 'contacts']);
	});

	test('el Drive de Google no se pide y el resto conserva su orden', () => {
		expect(
			requestedCapabilities({
				capabilities: ['email', 'drive', 'calendar', 'contacts'],
				unavailable_capabilities: ['drive'],
			})
		).toEqual(['email', 'calendar', 'contacts']);
	});

	test('un servicio anterior a 0.13.1 no manda el campo, y se pide todo', () => {
		expect(requestedCapabilities({ capabilities: ['email', 'drive'] })).toEqual(['email', 'drive']);
	});

	test('si todo está apagado —Microsoft hoy— no queda nada que pedir', () => {
		expect(
			requestedCapabilities({
				capabilities: ['email', 'calendar', 'contacts', 'drive'],
				unavailable_capabilities: ['calendar', 'contacts', 'drive', 'email'],
			})
		).toEqual([]);
	});

	test('una apagada que el proveedor no ofrece no inventa ni quita nada', () => {
		expect(
			requestedCapabilities({
				capabilities: ['email'],
				unavailable_capabilities: ['tasks'],
			})
		).toEqual(['email']);
	});
});

describe('isCapabilityAvailable', () => {
	test('una capacidad apagada no está disponible', () => {
		expect(isCapabilityAvailable({ unavailable_capabilities: ['drive'] }, 'drive')).toBe(false);
	});

	test('las demás sí', () => {
		expect(isCapabilityAvailable({ unavailable_capabilities: ['drive'] }, 'email')).toBe(true);
	});

	test('sin el campo, todo está disponible', () => {
		expect(isCapabilityAvailable({}, 'drive')).toBe(true);
	});
});

describe('connectionBlocker', () => {
	test('un proveedor listo y con algo disponible se conecta', () => {
		expect(
			connectionBlocker({
				capabilities: ['email', 'drive'],
				unavailable_capabilities: ['drive'],
				configured: true,
			})
		).toBeUndefined();
	});

	test('sin credenciales, se piden si hay algo que conectar', () => {
		expect(
			connectionBlocker({
				capabilities: ['email', 'drive'],
				unavailable_capabilities: ['drive'],
				configured: false,
			})
		).toBe('credentialsNeeded');
	});

	// Pedir un `client_id` para terminar, después de pegarlo, en «no hay nada
	// que conectar» es mandar a alguien a la consola del proveedor para nada.
	test('si no hay nada disponible, eso va antes que las credenciales', () => {
		expect(
			connectionBlocker({
				capabilities: ['email', 'calendar'],
				unavailable_capabilities: ['email', 'calendar'],
				configured: false,
			})
		).toBe('nothingAvailable');
	});

	test('y aunque las credenciales ya estén, tampoco se empieza', () => {
		expect(
			connectionBlocker({
				capabilities: ['email'],
				unavailable_capabilities: ['email'],
				configured: true,
			})
		).toBe('nothingAvailable');
	});

	test('con un servicio viejo manda sólo la falta de credenciales, como antes', () => {
		expect(connectionBlocker({ capabilities: ['email'], configured: false })).toBe(
			'credentialsNeeded'
		);
	});
});

/**
 * Y que la vista los use, que es lo que las funciones solas no dicen.
 *
 * Se mira el texto y no se monta la vista a propósito: montarla pide doblar
 * `@tauri-apps/api/core`, y `iconos-reactivos.test.ts` ya lo dobla. Dos
 * `mock.module` del mismo módulo dan verde o rojo según el orden en que Bun
 * evalúe los archivos. Lo que se vigila es la regresión concreta: volver a
 * mandar `provider.capabilities` entero, o dibujar el nombre crudo de una
 * capacidad sin su «todavía no disponible».
 */
describe('la vista de Cuentas en Línea', () => {
	const VISTA = fileURLToPath(new URL('../src/views/OnlineAccountsView.vue', import.meta.url));

	test('pide sólo las capacidades disponibles', async () => {
		const texto = await Bun.file(VISTA).text();
		const llamada = texto.match(/connectOauthAccount\(([^)]*\))[^)]*\)/)?.[0] ?? '';

		expect(llamada).toContain('requestedCapabilities(provider)');
		expect(llamada).not.toContain('provider.capabilities');
	});

	test('las dos listas de capacidades pasan por el texto que avisa', async () => {
		const texto = await Bun.file(VISTA).text();
		const plantilla = texto.slice(texto.indexOf('<template>'));

		expect(plantilla.match(/capabilityLabel\((account|provider), c\)/g)).toEqual([
			'capabilityLabel(account, c)',
			'capabilityLabel(provider, c)',
		]);
		// El autodescubrimiento de DAV sí nombra la capacidad cruda, y está bien:
		// ahí no hay proveedor que la tenga apagada.
		expect(plantilla).not.toMatch(/views\.onlineAccounts\.capabilities\.\$\{c\}/);
	});
});

/**
 * Las credenciales propias de un proveedor: cuándo se pueden administrar desde
 * la tarjeta, y qué se le dice a la persona después de quitarlas
 * (Vasak-OS/vasak-settings#132).
 */

import { describe, expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { canManageCredentials, clearOutcome } from '../src/utils/provider-credentials';

describe('canManageCredentials', () => {
	test('un OAuth2 configurado se administra', () => {
		expect(canManageCredentials({ kind: 'oauth2', configured: true })).toBe(true);
	});

	test('uno sin configurar no: su tarjeta ya abre el formulario para pegarlas', () => {
		expect(canManageCredentials({ kind: 'oauth2', configured: false })).toBe(false);
	});

	test('Nextcloud no tiene credenciales propias: las emite el servidor de cada uno', () => {
		expect(canManageCredentials({ kind: 'nextcloud', configured: true })).toBe(false);
	});
});

describe('clearOutcome', () => {
	test('si el proveedor deja de estar listo, se quitaron', () => {
		expect(clearOutcome({ configured: false })).toBe('cleared');
	});

	test('si sigue listo, quedan las del sistema', () => {
		expect(clearOutcome({ configured: true })).toBe('systemRemains');
	});

	test('si el proveedor ya no está en el catálogo, se quitaron', () => {
		expect(clearOutcome(undefined)).toBe('cleared');
	});
});

const vista = await Bun.file(
	fileURLToPath(new URL('../src/views/OnlineAccountsView.vue', import.meta.url))
).text();

describe('la vista', () => {
	test('la acción de administrar está fuera del botón de la tarjeta', () => {
		// El bug era que la acción no tenía cómo alcanzarse. Lo que se mira acá
		// es que exista un botón que abra el formulario para un proveedor ya
		// configurado, sin depender del clic de la tarjeta, que conecta.
		expect(vista).toMatch(
			/v-if="canManageCredentials\(provider\)"[\s\S]{0,400}@click="openCredentials\(provider\)"/
		);
	});

	test('quitar pide confirmación antes de llamar al servicio', () => {
		expect(vista).toMatch(/@click="confirmingClear = true"/);
		expect(vista).toMatch(
			/v-if="confirmingClear"[\s\S]{0,1200}@click="clearCredentials\(credentialsFor\)"/
		);
	});
});

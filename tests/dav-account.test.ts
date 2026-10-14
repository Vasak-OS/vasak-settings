/**
 * Lo que arma una cuenta «Otro servidor (CalDAV/CardDAV)» antes de registrarla.
 *
 * El formulario vive en un `.vue` que la cobertura no mira; la lógica que se
 * puede equivocar —qué capacidades se declaran, qué dirección es usable, contra
 * qué dominio se busca cada capacidad— vive acá y se prueba acá.
 */

import { describe, expect, test } from 'bun:test';
import type { DavDiscovery } from '../src/services/accounts.service';
import {
	buildDavCapabilities,
	DAV_PRESETS,
	discoverPresetDav,
	getDavPreset,
	hasAnyDavUrl,
	isSecureDavUrl,
} from '../src/utils/dav-account';

describe('buildDavCapabilities', () => {
	test('declara calendario y contactos con la forma que espera el sincronizador', () => {
		const caps = buildDavCapabilities({
			calendarUrl: 'https://caldav.icloud.com/123/calendars/',
			contactsUrl: 'https://contacts.icloud.com/123/carddavhome/',
			username: 'ana@icloud.com',
		});

		expect(caps.calendar).toEqual({
			url: 'https://caldav.icloud.com/123/calendars/',
			username: 'ana@icloud.com',
			auth: 'basic',
		});
		expect(caps.contacts).toEqual({
			url: 'https://contacts.icloud.com/123/carddavhome/',
			username: 'ana@icloud.com',
			auth: 'basic',
		});
	});

	test('una capacidad sin dirección no se declara', () => {
		const soloContactos = buildDavCapabilities({
			calendarUrl: '',
			contactsUrl: 'https://carddav.fastmail.com/dav/addressbooks/user/ana/',
			username: 'ana@fastmail.com',
		});
		expect(soloContactos.calendar).toBeUndefined();
		expect(soloContactos.contacts).toBeDefined();
	});

	test('recorta los espacios de la dirección y del usuario', () => {
		const caps = buildDavCapabilities({
			calendarUrl: '  https://dav.ejemplo.com/cal/  ',
			contactsUrl: '',
			username: '  ana@ejemplo.com  ',
		});
		expect(caps.calendar).toEqual({
			url: 'https://dav.ejemplo.com/cal/',
			username: 'ana@ejemplo.com',
			auth: 'basic',
		});
	});

	test('sin ninguna dirección no declara nada', () => {
		expect(buildDavCapabilities({ calendarUrl: '  ', contactsUrl: '', username: 'ana' })).toEqual(
			{}
		);
	});
});

describe('isSecureDavUrl', () => {
	test('acepta HTTPS', () => {
		expect(isSecureDavUrl('https://dav.ejemplo.com/')).toBe(true);
	});

	test('rechaza HTTP: la contraseña viaja en cada pedido', () => {
		expect(isSecureDavUrl('http://dav.ejemplo.com/')).toBe(false);
	});

	test('rechaza lo que no es una dirección y lo vacío', () => {
		for (const malo of ['', '   ', 'dav.ejemplo.com', 'no es una url']) {
			expect(isSecureDavUrl(malo)).toBe(false);
		}
	});
});

describe('hasAnyDavUrl', () => {
	test('con al menos una dirección es verdadero', () => {
		expect(hasAnyDavUrl({ calendarUrl: 'https://x/', contactsUrl: '' })).toBe(true);
		expect(hasAnyDavUrl({ calendarUrl: '', contactsUrl: 'https://y/' })).toBe(true);
	});

	test('sin ninguna es falso, incluso con espacios', () => {
		expect(hasAnyDavUrl({ calendarUrl: '  ', contactsUrl: '' })).toBe(false);
	});
});

describe('getDavPreset', () => {
	test('encuentra el preset por su providerType', () => {
		expect(getDavPreset('icloud').labelKey).toBe('icloud');
		expect(getDavPreset('fastmail').calendarDomain).toBe('caldav.fastmail.com');
	});

	test('un providerType desconocido cae en «Otro», el genérico', () => {
		const otro = getDavPreset('loquesea');
		expect(otro.providerType).toBe('carddav');
		expect(otro.calendarDomain).toBeUndefined();
	});

	test('los presets con la dirección conocida coinciden con el catálogo del daemon', () => {
		// El providerType se guarda en la cuenta y el servicio lo busca en su
		// catálogo (`vasak-accounts/daemon/packaging/providers.d/*.toml`): si no
		// coincide, el resumen de la cuenta queda sin el nombre del proveedor.
		for (const id of ['icloud', 'yahoo', 'fastmail']) {
			expect(DAV_PRESETS.some((preset) => preset.providerType === id)).toBe(true);
		}
	});
});

describe('discoverPresetDav', () => {
	const hallazgo = (url: string | null) => ({ url, detail: url ? '' : 'no se encontró' });

	test('iCloud pregunta cada capacidad contra su propio dominio', async () => {
		const llamadas: string[] = [];
		const discover = async (account: string): Promise<DavDiscovery> => {
			llamadas.push(account);
			if (account === 'caldav.icloud.com') {
				return { calendar: hallazgo('https://caldav.icloud.com/1/cal/'), contacts: hallazgo(null) };
			}
			return {
				calendar: hallazgo(null),
				contacts: hallazgo('https://contacts.icloud.com/1/card/'),
			};
		};

		const resultado = await discoverPresetDav(
			getDavPreset('icloud'),
			'ana@icloud.com',
			'secreto',
			discover
		);

		expect(llamadas.sort()).toEqual(['caldav.icloud.com', 'contacts.icloud.com']);
		expect(resultado.calendar.url).toBe('https://caldav.icloud.com/1/cal/');
		expect(resultado.contacts.url).toBe('https://contacts.icloud.com/1/card/');
	});

	test('«Otro servidor» busca una sola vez, contra el correo', async () => {
		const llamadas: string[] = [];
		const discover = async (account: string): Promise<DavDiscovery> => {
			llamadas.push(account);
			return {
				calendar: hallazgo('https://dav.ejemplo.com/cal/'),
				contacts: hallazgo('https://dav.ejemplo.com/card/'),
			};
		};

		const resultado = await discoverPresetDav(
			getDavPreset('carddav'),
			'ana@ejemplo.com',
			'secreto',
			discover
		);

		expect(llamadas).toEqual(['ana@ejemplo.com']);
		expect(resultado.calendar.url).toBe('https://dav.ejemplo.com/cal/');
		expect(resultado.contacts.url).toBe('https://dav.ejemplo.com/card/');
	});
});

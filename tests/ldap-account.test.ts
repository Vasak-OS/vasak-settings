/**
 * Lo que arma una cuenta «LDAP / Active Directory» antes de registrarla.
 *
 * El formulario vive en un `.vue` que la cobertura no mira; la lógica que se
 * puede equivocar —qué capacidad se declara y con qué claves, qué dirección es
 * un LDAP válido, cuándo la contraseña puede ir en claro, cómo se parte la lista
 * de atributos— vive acá y se prueba acá.
 */

import { describe, expect, test } from 'bun:test';
import {
	buildLdapCapabilities,
	canBuildLdap,
	isValidLdapUrl,
	type LdapForm,
	ldapUrlCanBePlaintext,
	ldapUrlScheme,
	parseLdapAttributes,
} from '../src/utils/ldap-account';

/** Un formulario completo y válido, para variar un solo campo por prueba. */
const baseForm = (overrides: Partial<LdapForm> = {}): LdapForm => ({
	url: 'ldaps://ldap.ejemplo.com',
	bindDn: 'cn=lector,ou=servicios,dc=ejemplo,dc=com',
	searchBase: 'dc=ejemplo,dc=com',
	searchFilter: '',
	attributes: '',
	allowInsecure: false,
	...overrides,
});

describe('ldapUrlScheme', () => {
	test('reconoce los tres esquemas que el servidor entiende', () => {
		expect(ldapUrlScheme('ldaps://ldap.ejemplo.com')).toBe('ldaps');
		expect(ldapUrlScheme('ldap://ldap.ejemplo.com:389')).toBe('ldap');
		expect(ldapUrlScheme('ldapi://%2Fvar%2Frun%2Fldapi')).toBe('ldapi');
	});

	test('recorta los espacios de alrededor', () => {
		expect(ldapUrlScheme('  ldaps://ldap.ejemplo.com  ')).toBe('ldaps');
	});

	test('rechaza lo que no es un LDAP y lo vacío', () => {
		for (const malo of ['', '   ', 'https://ldap.ejemplo.com', 'ldap.ejemplo.com', 'no es url']) {
			expect(ldapUrlScheme(malo)).toBeNull();
		}
	});
});

describe('isValidLdapUrl', () => {
	test('acepta los tres esquemas', () => {
		for (const bueno of [
			'ldaps://ldap.ejemplo.com',
			'ldap://ldap.ejemplo.com',
			'ldapi://%2Frun%2Fldapi',
		]) {
			expect(isValidLdapUrl(bueno)).toBe(true);
		}
	});

	test('rechaza HTTPS y lo que no es una dirección', () => {
		expect(isValidLdapUrl('https://ldap.ejemplo.com')).toBe(false);
		expect(isValidLdapUrl('ldap.ejemplo.com')).toBe(false);
	});
});

describe('ldapUrlCanBePlaintext', () => {
	test('sólo «ldap://» puede ir en claro', () => {
		expect(ldapUrlCanBePlaintext('ldap://ldap.ejemplo.com')).toBe(true);
	});

	test('«ldaps://» cifra siempre y «ldapi://» es un socket local', () => {
		expect(ldapUrlCanBePlaintext('ldaps://ldap.ejemplo.com')).toBe(false);
		expect(ldapUrlCanBePlaintext('ldapi://%2Frun%2Fldapi')).toBe(false);
	});
});

describe('parseLdapAttributes', () => {
	test('parte por comas y por espacios', () => {
		expect(parseLdapAttributes('cn, sn givenName,mail')).toEqual(['cn', 'sn', 'givenName', 'mail']);
	});

	test('descarta huecos y repetidos', () => {
		expect(parseLdapAttributes('  cn , , cn  mail ')).toEqual(['cn', 'mail']);
	});

	test('una cadena vacía no da ningún atributo', () => {
		expect(parseLdapAttributes('   ')).toEqual([]);
	});
});

describe('canBuildLdap', () => {
	test('con URL válida, DN de enlace y base es verdadero', () => {
		expect(canBuildLdap(baseForm())).toBe(true);
	});

	test('sin una URL válida es falso', () => {
		expect(canBuildLdap(baseForm({ url: 'https://ldap.ejemplo.com' }))).toBe(false);
	});

	test('sin DN de enlace o sin base es falso, incluso con espacios', () => {
		expect(canBuildLdap(baseForm({ bindDn: '   ' }))).toBe(false);
		expect(canBuildLdap(baseForm({ searchBase: '' }))).toBe(false);
	});
});

describe('buildLdapCapabilities', () => {
	test('declara contactos con las claves que espera el sincronizador', () => {
		const caps = buildLdapCapabilities(baseForm());

		expect(caps).toEqual({
			contacts: {
				ldap_url: 'ldaps://ldap.ejemplo.com',
				ldap_bind_dn: 'cn=lector,ou=servicios,dc=ejemplo,dc=com',
				ldap_search_base: 'dc=ejemplo,dc=com',
			},
		});
	});

	test('recorta los espacios de la dirección, el DN y la base', () => {
		const caps = buildLdapCapabilities(
			baseForm({
				url: '  ldaps://ldap.ejemplo.com  ',
				bindDn: '  cn=lector,dc=ejemplo,dc=com  ',
				searchBase: '  dc=ejemplo,dc=com  ',
			})
		);
		expect(caps.contacts.ldap_url).toBe('ldaps://ldap.ejemplo.com');
		expect(caps.contacts.ldap_bind_dn).toBe('cn=lector,dc=ejemplo,dc=com');
		expect(caps.contacts.ldap_search_base).toBe('dc=ejemplo,dc=com');
	});

	test('el filtro y los atributos sólo se declaran cuando se escriben', () => {
		const sinOpcionales = buildLdapCapabilities(baseForm());
		expect(sinOpcionales.contacts.ldap_search_filter).toBeUndefined();
		expect(sinOpcionales.contacts.ldap_attributes).toBeUndefined();

		const conOpcionales = buildLdapCapabilities(
			baseForm({
				searchFilter: '(objectClass=inetOrgPerson)',
				attributes: 'cn, mail',
			})
		);
		expect(conOpcionales.contacts.ldap_search_filter).toBe('(objectClass=inetOrgPerson)');
		expect(conOpcionales.contacts.ldap_attributes).toEqual(['cn', 'mail']);
	});

	test('«permitir sin cifrar» sólo se escribe para «ldap://» y cuando está marcada', () => {
		// Marcada y con ldap://: se declara.
		const enClaro = buildLdapCapabilities(
			baseForm({ url: 'ldap://ldap.ejemplo.com', allowInsecure: true })
		);
		expect(enClaro.contacts.ldap_allow_insecure).toBe(true);

		// Marcada pero con ldaps://: no tiene efecto, no se declara.
		const cifrado = buildLdapCapabilities(baseForm({ allowInsecure: true }));
		expect(cifrado.contacts.ldap_allow_insecure).toBeUndefined();

		// Sin marcar: no se declara, el sincronizador cae en `false`.
		const sinMarcar = buildLdapCapabilities(baseForm({ url: 'ldap://ldap.ejemplo.com' }));
		expect(sinMarcar.contacts.ldap_allow_insecure).toBeUndefined();
	});

	test('el provider_type casa con el id del catálogo del daemon (ldap.toml)', () => {
		// buildLdapCapabilities arma sólo la capacidad; el provider_type lo pone el
		// modal, pero se deja escrito acá que la capacidad es `contacts`, que es la
		// única que ese catálogo declara.
		const caps = buildLdapCapabilities(baseForm());
		expect(Object.keys(caps)).toEqual(['contacts']);
	});
});

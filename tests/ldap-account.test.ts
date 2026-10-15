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

	test('unos atributos de puro hueco quedan omitidos, no en una lista vacía', () => {
		// El sincronizador lee `ldap_attributes` con `as_array()` y pide cada
		// atributo tal cual: una lista con una cadena vacía le haría pedir el
		// atributo «», y el servidor rechaza la búsqueda. Comas y espacios sueltos
		// no son atributos, así que la clave no se declara —el sincronizador cae en
		// su lista estándar— en vez de declararse como `['']`.
		for (const hueco of ['', '   ', ' , , ', ',,', '  ,  ']) {
			expect(parseLdapAttributes(hueco)).toEqual([]);
			const caps = buildLdapCapabilities(baseForm({ attributes: hueco }));
			expect(caps.contacts.ldap_attributes).toBeUndefined();
			expect(caps.contacts.ldap_attributes).not.toEqual(['']);
		}
	});

	test('el provider_type casa con el id del catálogo del daemon (ldap.toml)', () => {
		// buildLdapCapabilities arma sólo la capacidad; el provider_type lo pone el
		// modal, pero se deja escrito acá que la capacidad es `contacts`, que es la
		// única que ese catálogo declara.
		const caps = buildLdapCapabilities(baseForm());
		expect(Object.keys(caps)).toEqual(['contacts']);
	});
});

/**
 * La invariante de seguridad del alta LDAP.
 *
 * El bind simple manda la contraseña al servidor, así que es un secreto de
 * verdad y tiene que viajar como viaja el de IMAP/SMTP y DAV: por el campo
 * `password` aparte del evento `submit`, que el servicio envuelve en
 * `secrets_json={access: password}` y cifra en el llavero. **Jamás** dentro de
 * las capacidades, que el servicio guarda en claro en su base de datos.
 *
 * `buildLdapCapabilities` recibe en producción el `reactive` del modal, que sí
 * tiene `password` (y `displayName`) encima de los campos de `LdapForm`. Que su
 * tipo no declare `password` no alcanza como garantía: una edición futura que
 * lea `form.password` para «completar» el config compilaría igual. Por eso la
 * prueba le pasa un formulario con la contraseña puesta —como el modal— y mira
 * el objeto que sale, no el tipo.
 */
describe('la contraseña nunca entra en las capacidades', () => {
	/** El `reactive` del modal: `LdapForm` más lo que el `.vue` tiene encima. */
	type ModalForm = LdapForm & { displayName: string; password: string };

	const SECRET = 'correcta-caballo-bateria-grapa-42';

	/** Un formulario completo con contraseña, igual que el que arma el modal. */
	const modalForm = (overrides: Partial<ModalForm> = {}): ModalForm => ({
		...baseForm(),
		displayName: 'Directorio de la empresa',
		password: SECRET,
		...overrides,
	});

	test('la contraseña no aparece en el JSON de las capacidades', () => {
		// Se prueban las dos ramas que más tocan el config: con y sin opcionales, y
		// con «permitir sin cifrar» marcada —el camino que escribe más claves—.
		const formularios = [
			modalForm(),
			modalForm({
				url: 'ldap://ldap.ejemplo.com',
				allowInsecure: true,
				searchFilter: '(objectClass=person)',
				attributes: 'cn, mail',
			}),
		];

		for (const form of formularios) {
			const json = JSON.stringify(buildLdapCapabilities(form));
			expect(json).not.toContain(SECRET);
		}
	});

	test('no hay ninguna clave con pinta de contraseña en «contacts»', () => {
		// No alcanza con que el valor no esté: una clave vacía o renombrada
		// (`ldap_password`, `password`, `secret`, `access`…) también sería una fuga
		// en cuanto alguien le pusiera algo. El config sólo puede llevar las claves
		// que el sincronizador espera.
		const permitidas = new Set([
			'ldap_url',
			'ldap_bind_dn',
			'ldap_search_base',
			'ldap_search_filter',
			'ldap_attributes',
			'ldap_allow_insecure',
		]);

		const { contacts } = buildLdapCapabilities(
			modalForm({
				url: 'ldap://ldap.ejemplo.com',
				allowInsecure: true,
				searchFilter: '(objectClass=person)',
				attributes: 'cn, mail',
			})
		);

		for (const clave of Object.keys(contacts)) {
			expect(permitidas.has(clave)).toBe(true);
			expect(clave.toLowerCase()).not.toMatch(/pass|pwd|secret|credential|access|token/);
		}
	});

	test('aunque la contraseña se repita en otro campo, no se filtra por el config', () => {
		// Si alguien reusara la contraseña como DN de enlace o como base —error de
		// la persona, no del formulario—, ahí sí viajaría: pero porque es el valor
		// de ese campo, no porque el armado la copie. Esta prueba fija que el armado
		// no la agrega por su cuenta: con la contraseña sólo en `password`, no está.
		const caps = buildLdapCapabilities(modalForm());
		const valores = Object.values(caps.contacts);
		expect(valores).not.toContain(SECRET);
	});
});

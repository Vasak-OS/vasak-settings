import { describe, expect, test } from 'bun:test';
import { CSP_KEYWORDS, sanitizeUrl } from '../src/utils/csp';

/**
 * Lo que se registra al bloquearse un recurso es una URL que eligió otro, y las
 * URL llevan credenciales. Lo que estas pruebas cuidan es que ninguna termine
 * en el diario.
 */
describe('sanitizeUrl', () => {
	test('una URL relativa al protocolo no deja pasar las credenciales', () => {
		// El caso reportado: `new URL` sin base rechaza estas direcciones, y la
		// versión anterior caía a cortar por `?` y `#`, que deja el token.
		const limpia = sanitizeUrl('//user:token@example.test/path?access_token=secret#frag');

		for (const secreto of ['user', 'token', 'access_token', 'secret', 'frag']) {
			expect(limpia).not.toContain(secreto);
		}
		expect(limpia).toBe('//example.test/path');
	});

	test('y sin credenciales conserva el sitio y la ruta', () => {
		expect(sanitizeUrl('//example.test/path')).toBe('//example.test/path');
		expect(sanitizeUrl('//example.test/a/b.js?x=1')).toBe('//example.test/a/b.js');
	});

	/**
	 * El agujero que no estaba en el reporte y se encontró midiendo.
	 *
	 * `new URL('user:token@sitio/x')` **no** falla: lo toma como esquema opaco
	 * `user:`, deja `username` vacío —así que limpiarlo no hace nada— y devuelve
	 * el token entero en `href`. O sea que también filtraba por la rama buena.
	 */
	test('un esquema opaco no deja pasar lo que lleva adentro', () => {
		const limpia = sanitizeUrl('user:token@example.test/path');
		expect(limpia).not.toContain('token');
		expect(limpia).toBe('user:(recortado)');
	});

	test('las credenciales de una URL absoluta tampoco', () => {
		const limpia = sanitizeUrl('https://user:token@example.test/p?x=1#f');
		for (const secreto of ['user', 'token', 'x=1', '#f']) {
			expect(limpia).not.toContain(secreto);
		}
		expect(limpia).toBe('https://example.test/p');
	});

	test('los marcadores de la especificación se dejan tal cual', () => {
		for (const marcador of CSP_KEYWORDS) {
			expect(sanitizeUrl(marcador)).toBe(marcador);
		}
	});

	/**
	 * `data` sin dos puntos es un marcador y se conserva; `data:` con contenido
	 * es una carga útil y se recorta. Son dos cosas distintas que se escriben
	 * casi igual.
	 */
	test('una URL de datos se recorta pero se sigue sabiendo que lo era', () => {
		expect(sanitizeUrl('data:text/html;base64,UEFTUw==')).toBe('data:(recortado)');
		expect(sanitizeUrl('data')).toBe('data');
	});

	test('una ruta relativa pierde la query y el fragmento', () => {
		expect(sanitizeUrl('/assets/app.js?v=2#top')).toBe('/assets/app.js');
		expect(sanitizeUrl('app.js')).toBe('app.js');
	});

	/**
	 * Vacío al entrar y vacío al salir son casos distintos, y quien llame tiene
	 * que aplicar su texto de reserva **después** de sanear. Una entrada como
	 * `?token=X` no es vacía, pero lo que queda de ella sí — y sin esto el
	 * registro salía con el campo en blanco.
	 */
	test('lo que queda en nada devuelve vacío', () => {
		expect(sanitizeUrl('?token=X')).toBe('');
		expect(sanitizeUrl('#fragment')).toBe('');
		expect(sanitizeUrl('')).toBe('');
		expect(sanitizeUrl(null)).toBe('');
		expect(sanitizeUrl(undefined)).toBe('');
	});

	test('nunca devuelve algo que parezca credencial', () => {
		// Una red de seguridad sobre todos los casos de arriba juntos: si en el
		// resultado queda un `@` antes de la primera barra, hay userinfo.
		for (const entrada of [
			'//u:p@sitio/x',
			'https://u:p@sitio/x',
			'user:p@sitio/x',
			'ftp://u:p@sitio/x',
		]) {
			const limpia = sanitizeUrl(entrada);
			const autoridad = limpia
				.replace(/^[a-z]+:/, '')
				.replace(/^\/\//, '')
				.split('/')[0];
			expect(autoridad).not.toContain('@');
		}
	});

	/**
	 * Un esquema jerárquico también admite forma opaca, y ahí las credenciales
	 * viajan en lo que la URL llama «ruta» — donde limpiar `username` no hace
	 * nada, porque para un esquema opaco ese campo ni existe.
	 *
	 * `blob:` es el caso más claro: su contenido es **otra URL entera**.
	 */
	test('un esquema conocido en forma opaca tampoco deja pasar nada', () => {
		for (const entrada of [
			'blob:https://user:token@example.test/path',
			'tauri:user:token@example.test',
			'asset:user:token@example.test',
			'ipc:user:token@example.test',
		]) {
			expect(sanitizeUrl(entrada)).not.toContain('token');
		}
		expect(sanitizeUrl('blob:https://user:token@example.test/x')).toBe('blob:(recortado)');
	});

	test('y en forma jerárquica el mismo esquema sí conserva sitio y ruta', () => {
		expect(sanitizeUrl('asset://user:token@example.test/path')).toBe('asset://example.test/path');
	});

	/**
	 * `new URL` completa una ruta ausente con «/». Eso cambia la forma de lo
	 * que llegó, y lo que se registra tiene que parecerse a lo que se bloqueó.
	 */
	test('una autoridad sola no gana una barra que no tenía', () => {
		expect(sanitizeUrl('//example.test')).toBe('//example.test');
		expect(sanitizeUrl('//example.test?x=1')).toBe('//example.test');
		// Y la que sí la tenía la conserva.
		expect(sanitizeUrl('//example.test/')).toBe('//example.test/');
	});

	/**
	 * Si algo declara autoridad y no se pudo parsear, no se registra.
	 *
	 * El respaldo sólo corta la query y el fragmento, así que dejaría pasar las
	 * credenciales enteras. Perder la línea del diario es mejor que dejar un
	 * token escrito ahí para siempre.
	 */
	test('lo que declara autoridad y no parsea no se registra', () => {
		expect(sanitizeUrl('//user:token@[malformado/x')).toBe('');
		expect(sanitizeUrl('https://user:token@[malformado/x')).toBe('');
	});

	/**
	 * Y la razón por la que no alcanza con rechazar todo lo que tenga un `@`:
	 * las rutas de Vite lo llevan, y son de las más frecuentes que hay.
	 */
	test('una ruta relativa con arroba sobrevive', () => {
		expect(sanitizeUrl('/assets/@vite/client.js')).toBe('/assets/@vite/client.js');
		expect(sanitizeUrl('/node_modules/.vite/deps/@vue_devtools.js?v=1')).toBe(
			'/node_modules/.vite/deps/@vue_devtools.js'
		);
	});
});

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Que cada recurso de «Privacidad y seguridad» tenga su nombre traducido.
 *
 * La pestaña arma la clave con una plantilla —`resources.${ETIQUETA[id] ?? id}`—
 * y por eso `catalogos.test.ts` no la ve: ese test sólo reconoce las literales
 * `t('...')`. O sea que un recurso nuevo sin su traducción pasa los dos filtros
 * y se dibuja con la clave cruda en la pestaña.
 *
 * Importa más desde que la pantalla tiene los recursos de cuenta: sus ids
 * llevan un punto (`account.email`) y las claves se resuelven partiendo por
 * punto, así que usar el id tal cual —en vez del mapa— baja a una clave que no
 * existe. Ya había costado eso una vez, y está anotado en el propio componente.
 */

const RAIZ = join(import.meta.dir, '..');
const VISTA = readFileSync(join(RAIZ, 'src/views/PrivacySecurityView.vue'), 'utf8');

/** Los ids de `RESOURCES`, tal como los declara la vista. */
function recursos(): string[] {
	const bloque = VISTA.match(/const RESOURCES = \[([\s\S]*?)\] as const;/);
	if (!bloque) throw new Error('no se encontró RESOURCES en la vista');
	return [...bloque[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/** El mapa `ETIQUETA`, que es lo que evita la clave con punto. */
function etiquetas(): Record<string, string> {
	const bloque = VISTA.match(/const ETIQUETA: Record<string, string> = \{([\s\S]*?)\};/);
	if (!bloque) throw new Error('no se encontró ETIQUETA en la vista');
	return Object.fromEntries(
		[...bloque[1].matchAll(/'([^']+)':\s*'([^']+)'/g)].map((m) => [m[1], m[2]])
	);
}

/** El mapa `ICONO`, sin la parte que se genera desde las capacidades. */
function iconos(): Record<string, string> {
	const bloque = VISTA.match(/const ICONO: Record<string, string> = \{([\s\S]*?)\n\};/);
	if (!bloque) throw new Error('no se encontró ICONO en la vista');
	return Object.fromEntries(
		[...bloque[1].matchAll(/'?([\w.-]+)'?:\s*'([^']+)'/g)].map((m) => [m[1], m[2]])
	);
}

const catalogo = (idioma: string) =>
	readFileSync(join(RAIZ, `src-tauri/locales/${idioma}.yml`), 'utf8');

describe('los recursos de privacidad', () => {
	test('todos tienen nombre en los dos idiomas', () => {
		const mapa = etiquetas();
		const faltantes: string[] = [];

		for (const idioma of ['es', 'en']) {
			const texto = catalogo(idioma);
			for (const id of recursos()) {
				const clave = mapa[id] ?? id;
				if (!new RegExp(`^      ${clave}:`, 'm').test(texto)) {
					faltantes.push(`${idioma}: ${id} → resources.${clave}`);
				}
			}
		}

		expect(faltantes.sort()).toEqual([]);
	});

	test('ningún id con punto llega crudo a la clave', () => {
		// Un `account.*` sin entrada en el mapa se resolvería como
		// `resources.account.email`, que baja dos niveles y no existe.
		const mapa = etiquetas();
		const crudos = recursos().filter((id) => id.includes('.') && !(id in mapa));

		expect(crudos).toEqual([]);
	});

	test('están los seis recursos de cuenta', () => {
		// Es el cambio que trajo esta pantalla: los permisos de cuentas vivían en
		// «Cuentas en Línea» y volvieron acá. Si alguno se cae de la lista, su
		// pestaña desaparece sin que nada falle.
		const ids = recursos();
		for (const capacidad of ['email', 'calendar', 'contacts', 'chat', 'drive', 'tasks']) {
			expect(ids).toContain(`account.${capacidad}`);
		}
	});

	test('está compartir pantalla', () => {
		// Llega sólo por el portal, así que es el único recurso de esta lista
		// cuyas entradas no se identifican por la ruta del ejecutable. Se decidió
		// mostrarlo igual: hasta que estuvo, lo que se concedía para compartir la
		// pantalla no figuraba en ninguna pantalla y no había forma de retirarlo.
		expect(recursos()).toContain('screen-capture');
	});

	test('todos tienen icono propio', () => {
		// `iconos` cae en 'security-high' cuando falta la entrada, así que un
		// recurso nuevo sin icono no falla: se dibuja con el candado genérico y
		// queda indistinguible de los demás en la lista, que es por donde se
		// entra a esta pantalla.
		const mapa = iconos();
		const sinIcono = recursos().filter((id) => !(id in mapa) && !id.startsWith('account.'));

		expect(sinIcono).toEqual([]);
	});

	test('el alcance nombra lo que el perfil cubre de verdad', () => {
		// Sólo `vasak-appimage` niega la cámara, el micrófono y las credenciales,
		// y se engancha a `@{HOME}/**/*.AppImage`. El texto decía «las
		// aplicaciones que no instaló el sistema», que es más ancho: un binario
		// suelto en la carpeta del usuario tampoco tiene perfil.
		//
		// Prometer de más en esta pantalla es la falla que ya costó que se la
		// borrara una vez, así que el texto tiene que nombrar el caso real.
		for (const idioma of ['es', 'en']) {
			const texto = catalogo(idioma);
			const scope = texto.match(/scope: >-\n([\s\S]*?)\n {4}\w+:/)?.[1] ?? '';

			expect(scope).toContain('AppImage');
			// Y no puede volver a decir que alcanza a todo lo que el sistema no
			// instaló, que es la afirmación que sobra.
			expect(scope).not.toContain('que no instaló el sistema');
			expect(scope).not.toContain('the system did not install');
		}
	});
});

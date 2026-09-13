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
});

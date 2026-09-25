import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	PRIVACY_RESOURCES,
	RESOURCE_ICONS,
	RESOURCE_LABEL_KEYS,
	resourceIcon,
	resourceLabelKey,
} from '../src/tools/privacy-resources';

/**
 * Que cada recurso de «Privacidad y seguridad» tenga su nombre traducido.
 *
 * La lista arma la clave con una plantilla —`resources.${RESOURCE_LABEL_KEYS[id] ?? id}`—
 * y por eso `catalogos.test.ts` no la ve: ese test sólo reconoce las literales
 * `t('...')`. O sea que un recurso nuevo sin su traducción pasa los dos filtros
 * y se dibuja con la clave cruda.
 *
 * Importa más desde que la pantalla tiene los recursos de cuenta y los del
 * almacén: sus ids llevan un punto (`account.email`, `store.email`) y las
 * claves se resuelven partiendo por punto, así que usar el id tal cual —en vez
 * del mapa— baja a una clave que no existe. Ya había costado eso una vez.
 *
 * Antes esta prueba leía la vista con expresiones regulares; ahora la lista y
 * los mapas viven en `tools/privacy-resources.ts` y se importan, así que un
 * cambio de formato en la vista ya no deja la prueba mirando nada.
 */

const ROOT = join(import.meta.dir, '..');
const VIEW = readFileSync(join(ROOT, 'src/views/PrivacySecurityView.vue'), 'utf8');
const LANGUAGES = ['es', 'en'] as const;

const catalogText = (language: string) =>
	readFileSync(join(ROOT, `src-tauri/locales/${language}.yml`), 'utf8');

/** El catálogo leído con un analizador de YAML de verdad, como el plugin. */
const catalog = (language: string): unknown => Bun.YAML.parse(catalogText(language));

/** Lo mismo que hace `t()`: bajar por la clave partida en puntos. */
function translate(root: unknown, key: string): string | undefined {
	let current: unknown = root;
	for (const part of key.split('.')) {
		if (typeof current !== 'object' || current === null) return undefined;
		current = (current as Record<string, unknown>)[part];
	}
	return typeof current === 'string' ? current : undefined;
}

const STORE_RESOURCES = ['store.email', 'store.calendar', 'store.contacts'] as const;

describe('los recursos de privacidad', () => {
	test('todos tienen nombre en los dos idiomas', () => {
		const missing: string[] = [];

		for (const language of LANGUAGES) {
			const root = catalog(language);
			for (const id of PRIVACY_RESOURCES) {
				const label = translate(root, resourceLabelKey(id));
				if (!label || label.trim() === '') {
					missing.push(`${language}: ${id} → ${resourceLabelKey(id)}`);
				}
			}
		}

		expect(missing.sort()).toEqual([]);
	});

	test('ningún id con punto llega crudo a la clave', () => {
		// Un `account.*` o un `store.*` sin entrada en el mapa se resolvería como
		// `resources.account.email`, que baja dos niveles y no existe.
		const raw = PRIVACY_RESOURCES.filter((id) => id.includes('.') && !(id in RESOURCE_LABEL_KEYS));

		expect(raw).toEqual([]);
	});

	test('están los seis recursos de cuenta', () => {
		// Es el cambio que trajo esta pantalla: los permisos de cuentas vivían en
		// «Cuentas en Línea» y volvieron acá. Si alguno se cae de la lista, su
		// pestaña desaparece sin que nada falle.
		for (const capability of ['email', 'calendar', 'contacts', 'chat', 'drive', 'tasks']) {
			expect(PRIVACY_RESOURCES).toContain(`account.${capability}` as never);
		}
	});

	test('están los tres recursos del almacén local', () => {
		// Los suma `vasak-permissions` para que leer lo que el sincronizador ya
		// guardó pida permiso aparte de llegar a la cuenta. Si no están acá, lo
		// que se conceda desde el diálogo no se ve ni se puede retirar.
		for (const id of STORE_RESOURCES) {
			expect(PRIVACY_RESOURCES).toContain(id);
		}
	});

	test('un recurso del almacén se muestra con su nombre y no con el id crudo', () => {
		// Es lo que se ve en la fila: si la clave no resuelve, `t()` devuelve la
		// clave misma y la persona lee «views.privacySecurity.resources.store.email».
		for (const language of LANGUAGES) {
			const root = catalog(language);
			for (const id of STORE_RESOURCES) {
				const key = resourceLabelKey(id);
				const label = translate(root, key);

				expect(key).toBe(`views.privacySecurity.resources.${RESOURCE_LABEL_KEYS[id]}`);
				expect(label).toBeString();
				expect(label).not.toBe(id);
				expect(label).not.toBe(key);
				expect(label).not.toContain('store.');
			}
		}
	});

	test('el nombre del almacén dice que es lo guardado en el equipo', () => {
		// La diferencia con `account.*` es toda la razón de que sean dos
		// permisos: uno llega a la cuenta, el otro sólo lee lo que ya bajó. El
		// nombre tiene que decirlo con las mismas palabras que el diálogo de
		// `vasak-permissions` («guardado en este equipo»), o la persona no
		// reconoce en Configuración lo que aceptó en la ventana.
		const expected = { es: /guardad[oa]s? en este equipo/, en: /saved on this computer/ };

		for (const language of LANGUAGES) {
			const root = catalog(language);
			for (const area of ['email', 'calendar', 'contacts']) {
				const store = translate(root, resourceLabelKey(`store.${area}`)) ?? '';
				const account = translate(root, resourceLabelKey(`account.${area}`)) ?? '';

				expect(store).toMatch(expected[language]);
				expect(store).not.toBe(account);
			}
		}
	});

	test('está compartir pantalla', () => {
		// Llega sólo por el portal, así que es el único recurso de esta lista
		// cuyas entradas no se identifican por la ruta del ejecutable. Se decidió
		// mostrarlo igual: hasta que estuvo, lo que se concedía para compartir la
		// pantalla no figuraba en ninguna pantalla y no había forma de retirarlo.
		expect(PRIVACY_RESOURCES).toContain('screen-capture');
	});

	test('todos tienen icono propio', () => {
		// `resourceIcon` cae en 'security-high' cuando falta la entrada, así que
		// un recurso nuevo sin icono no falla: se dibuja con el candado genérico
		// y queda indistinguible de los demás en la lista, que es por donde se
		// entra a esta pantalla.
		const withoutIcon = PRIVACY_RESOURCES.filter((id) => !RESOURCE_ICONS[id]);

		expect(withoutIcon).toEqual([]);
		expect(resourceIcon('store.email')).toBe(resourceIcon('account.email'));
		expect(resourceIcon('algo-que-no-existe')).toBe('security-high');
	});

	test('la vista usa la lista y los mapas compartidos', () => {
		// Si la vista vuelve a declarar su propia lista, las pruebas de arriba
		// siguen verdes mirando una copia que nadie dibuja.
		expect(VIEW).toContain("from '@/tools/privacy-resources'");
		expect(VIEW).toContain('resourceLabelKey(');
		expect(VIEW).not.toMatch(/const RESOURCES = \[/);
	});

	test('el alcance nombra lo que el perfil cubre de verdad', () => {
		// Sólo `vasak-appimage` niega la cámara, el micrófono y las credenciales,
		// y se engancha a `@{HOME}/**/*.AppImage`. El texto decía «las
		// aplicaciones que no instaló el sistema», que es más ancho: un binario
		// suelto en la carpeta del usuario tampoco tiene perfil.
		//
		// Prometer de más en esta pantalla es la falla que ya costó que se la
		// borrara una vez, así que el texto tiene que nombrar el caso real.
		for (const language of LANGUAGES) {
			const text = catalogText(language);
			const scope = text.match(/scope: >-\n([\s\S]*?)\n {4}\w+:/)?.[1] ?? '';

			expect(scope).toContain('AppImage');
			// Y no puede volver a decir que alcanza a todo lo que el sistema no
			// instaló, que es la afirmación que sobra.
			expect(scope).not.toContain('que no instaló el sistema');
			expect(scope).not.toContain('the system did not install');
			// La otra puerta de atrás, la de compartir pantalla. El permiso sólo
			// alcanza a lo que pasa por el portal; por fuera, el compositor ya no
			// le ofrece los protocolos de captura a cualquier cliente —eso lo
			// cerró `permisos-globales`, y un binario que los pida por su cuenta
			// rebota—, **pero** las herramientas que sí los tienen las puede
			// ejecutar cualquiera. Medido: un guion de dos líneas que llama a
			// `grim` capturó la pantalla entera sin estar en ninguna lista.
			//
			// Por eso el texto ya no puede decir «un programa puede capturarla
			// por su cuenta» —eso dejó de ser cierto— ni prometer que nadie puede
			// capturar, que nunca lo fue. Tiene que decir las dos mitades, y eso
			// es lo que se comprueba.
			expect(scope).toMatch(/portal/);
			// Los saltos del YAML parten las frases en cualquier lado, así que
			// los espacios van flexibles: la frase de arriba llegó cortada entre
			// «ask one of» y «them».
			expect(scope).toMatch(/pedirle\s+a\s+una\s+de\s+ellas|ask\s+one\s+of\s+them/);
			expect(scope).not.toMatch(
				/un\s+programa\s+puede\s+capturarla|capture\s+the\s+screen\s+on\s+its\s+own/
			);
		}
	});

	test('el alcance no vuelve al aviso grande de arriba', () => {
		// Estaba como `AlertMessage` encima de los permisos: un párrafo largo que
		// se lee una vez y después estorba cada vez que se entra a cambiar algo,
		// que es a lo que se viene. Ahora va al pie y en letra chica.
		//
		// El texto tiene que seguir estando —la pantalla no puede presentarse
		// como protección completa— así que lo que se comprueba es dónde, no si.
		expect(VIEW).toContain("t('views.privacySecurity.scope')");
		expect(VIEW).not.toMatch(/AlertMessage[^>]*privacySecurity\.scope/);
	});
});

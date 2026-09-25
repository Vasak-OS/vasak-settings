import { describe, expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';

/**
 * Que los catálogos de idioma sirvan.
 *
 * El plugin de i18n los parsea en tiempo de ejecución y **paniquea** si no
 * puede, así que un error de sintaxis no se ve hasta que la aplicación no
 * arranca. Y una clave que falta en un idioma no falla: se muestra cruda, con
 * el nombre de la clave a la vista de la persona.
 *
 * Estas pruebas nacieron en Rust, en `src-tauri/tests/locales.rs`, al mover
 * el bloque de permisos de `views.privacy` a `views.onlineAccounts.permissions`:
 * reindentar un bloque de veinte líneas a mano en dos archivos es exactamente
 * donde se pierde una clave. Después el bloque volvió a mudarse —a
 * `views.privacySecurity`— y la prueba que lo vigilaba por nombre quedó rota
 * durante semanas sin que nadie lo viera, porque el CI compartido no corre las
 * pruebas del crate de Tauri: arrastran webkit2gtk y medio escritorio. Por eso
 * viven acá: `bun test` corre en cada PR sobre el runner pelado, y un catálogo
 * roto corta antes de mergear.
 *
 * `catalogos.test.ts` mira los mismos archivos, pero con un lector propio por
 * sangría y para otra cosa: que cada clave que la interfaz usa exista. Acá se
 * los lee con un analizador de YAML de verdad, que es lo que hace el plugin, y
 * se comprueban por nombre los bloques que ya se perdieron alguna vez.
 */

const LOCALES = fileURLToPath(new URL('../src-tauri/locales/', import.meta.url));
const LANGUAGES = ['es', 'en'] as const;
type Language = (typeof LANGUAGES)[number];

/** Un nodo del catálogo ya parseado: mapeo, lista o valor suelto. */
type Node = unknown;

function isMapping(value: Node): value is Record<string, Node> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const cache = new Map<Language, Promise<Node>>();

/** El catálogo parseado, o un error que nombra el archivo si no es YAML válido. */
function catalog(language: Language): Promise<Node> {
	let pending = cache.get(language);
	if (!pending) {
		pending = (async () => {
			const path = `${LOCALES}${language}.yml`;
			const text = await Bun.file(path).text();
			try {
				return Bun.YAML.parse(text) as Node;
			} catch (error) {
				throw new Error(`${path} no es YAML válido: ${String(error)}`);
			}
		})();
		cache.set(language, pending);
	}
	return pending;
}

/** Todas las claves, aplanadas con puntos, como las busca el plugin. */
function collectKeys(value: Node, prefix: string, out: Set<string>): void {
	if (isMapping(value)) {
		for (const [name, child] of Object.entries(value)) {
			collectKeys(child, prefix ? `${prefix}.${name}` : name, out);
		}
	} else {
		out.add(prefix);
	}
}

async function keysOf(language: Language): Promise<Set<string>> {
	const out = new Set<string>();
	collectKeys(await catalog(language), '', out);
	return out;
}

/** El valor bajo una clave con puntos, o `undefined` si algún tramo falta. */
function valueAt(root: Node, key: string): Node {
	let current: Node = root;
	for (const part of key.split('.')) {
		if (!isMapping(current)) return undefined;
		current = current[part];
	}
	return current;
}

/** Un texto con algo adentro, que es lo único que sirve como etiqueta. */
function isFilledText(value: Node): value is string {
	return typeof value === 'string' && value.trim() !== '';
}

function textAt(root: Node, key: string): string {
	const value = valueAt(root, key);
	return typeof value === 'string' ? value : '';
}

/** Los marcadores de interpolación de un texto —`{0}`, `{1}`—, ordenados. */
function placeholders(value: Node): string[] {
	const text = typeof value === 'string' ? value : '';
	const found: string[] = [];
	for (let open = text.indexOf('{'); open !== -1; open = text.indexOf('{', open + 1)) {
		const close = text.indexOf('}', open);
		if (close !== -1) found.push(text.slice(open, close + 1));
	}
	return found.sort();
}

/** Falla con el mismo mensaje que daba la prueba de Rust. */
function check(condition: boolean, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

describe('los catálogos de idioma', () => {
	test('los dos idiomas parsean y la raíz es un mapeo', async () => {
		for (const language of LANGUAGES) {
			const root = await catalog(language);
			check(
				isMapping(root),
				`la raíz de ${language}.yml tiene que ser un mapeo, no un valor suelto`
			);
		}
	});

	test('los dos idiomas tienen las mismas claves', async () => {
		const es = await keysOf('es');
		const en = await keysOf('en');

		const onlyInEs = [...es].filter((key) => !en.has(key)).sort();
		const onlyInEn = [...en].filter((key) => !es.has(key)).sort();

		// «las claves no coinciden»: la diferencia dice cuáles.
		expect({ onlyInEs, onlyInEn }).toEqual({ onlyInEs: [], onlyInEn: [] });
	});

	test('ningún texto está vacío', async () => {
		// Una clave vacía no es un texto faltante que se note: se muestra como nada,
		// y el control queda sin etiqueta.
		for (const language of LANGUAGES) {
			const root = await catalog(language);
			const empty: string[] = [];
			for (const key of await keysOf(language)) {
				const value = valueAt(root, key);
				if (typeof value === 'string' && value.trim() === '') empty.push(key);
			}
			check(empty.length === 0, `textos vacíos en ${language}.yml: ${JSON.stringify(empty)}`);
		}
	});

	test('los marcadores de interpolación coinciden', async () => {
		// Un `{0}` que está en un idioma y no en el otro pierde el dato: el texto
		// sale sin el nombre del proveedor, sin el error, sin el número.
		const es = await catalog('es');
		const en = await catalog('en');
		const mismatched: string[] = [];

		for (const key of await keysOf('es')) {
			const inEs = placeholders(valueAt(es, key));
			const inEn = placeholders(valueAt(en, key));
			if (inEs.join(',') !== inEn.join(',')) {
				mismatched.push(
					`los marcadores de «${key}» no coinciden entre idiomas: es ${inEs} / en ${inEn}`
				);
			}
		}

		expect(mismatched).toEqual([]);
	});

	/**
	 * El bloque que se mudó dos veces, comprobado por nombre.
	 *
	 * No basta con que los dos idiomas coincidan: si el bloque hubiera quedado
	 * anidado un nivel más arriba, coincidirían igual y la pantalla mostraría las
	 * claves crudas. Las claves son las que `PrivacySecurityView.vue` pide de
	 * verdad; las de `resources` van una por una porque la vista las arma con
	 * una plantilla, y ésas no las puede resolver la prueba que busca los
	 * literales.
	 */
	test('los permisos por aplicación cuelgan de privacidad y seguridad', async () => {
		const USED_BY_THE_VIEW = [
			'title',
			'description',
			'scope',
			'notConfined',
			'allow',
			'deny',
			'forget',
			'forgetHint',
			'noAppsForResource',
			'none',
			'back',
			'blocked.title',
			'blocked.description',
			'blocked.permissions',
			'blocked.times',
			'blocked.dismiss',
			'resources.credentials',
			'resources.accountEmail',
			'resources.accountCalendar',
			'resources.accountContacts',
			'resources.accountChat',
			'resources.accountDrive',
			'resources.accountTasks',
			'resources.camera',
			'resources.microphone',
			'resources.screenCapture',
		];

		for (const language of LANGUAGES) {
			const root = await catalog(language);
			const block = valueAt(root, 'views.privacySecurity');
			check(isMapping(block), `views.privacySecurity falta en ${language}.yml`);

			const missing = USED_BY_THE_VIEW.filter((key) => !isFilledText(valueAt(block, key))).map(
				(key) => `falta views.privacySecurity.${key} en ${language}.yml`
			);
			expect(missing).toEqual([]);

			// Las dos casas anteriores no pueden volver: la vista no las lee, así
			// que un bloque ahí es un bloque que nadie muestra.
			check(
				valueAt(root, 'views.privacy') === undefined,
				`views.privacy quedó en ${language}.yml después de moverlo`
			);
			check(
				valueAt(root, 'views.onlineAccounts.permissions') === undefined,
				`views.onlineAccounts.permissions quedó en ${language}.yml después de moverlo`
			);
		}
	});

	/**
	 * Un proveedor sin configurar tiene que llevar a algún lado.
	 *
	 * Antes decía «falta configurarlo» y nombraba un archivo de `/etc` para
	 * editar como administrador: un «no» con una salida que casi nadie iba a
	 * tomar. Ahora el botón abre el formulario, así que el texto invita a
	 * tocarlo, y la ruta —que sigue haciendo falta para saber dónde mirar los
	 * pasos de cada proveedor— vive en la explicación del propio formulario.
	 */
	test('un proveedor sin configurar lleva a configurarlo', async () => {
		for (const language of LANGUAGES) {
			const root = await catalog(language);
			const credentials = 'views.onlineAccounts.credentials';

			check(
				isFilledText(valueAt(root, `${credentials}.needed`)),
				`falta ${credentials}.needed en ${language}.yml`
			);

			// Y el formulario dice dónde están los pasos de cada proveedor, o la
			// explicación se queda a mitad de camino.
			const how = textAt(root, `${credentials}.how`);
			check(
				how.includes('/usr/share/vasak-accounts/providers.d'),
				`la explicación no dice dónde mirar los pasos en ${language}.yml: ${how}`
			);

			// El bloque viejo no puede volver: decía que había que editar un archivo
			// como administrador, y eso ya no es cierto.
			check(
				valueAt(root, 'views.onlineAccounts.unavailable') === undefined,
				`views.onlineAccounts.unavailable volvió en ${language}.yml`
			);
		}
	});

	/**
	 * Las capacidades se nombran con la misma clave con la que las nombra el
	 * servicio, así que una que falte se muestra cruda —«drive» en vez de
	 * «Archivos en la nube»— en la lista de cada proveedor y de cada cuenta.
	 */
	test('todas las capacidades tienen nombre visible', async () => {
		for (const language of LANGUAGES) {
			const root = await catalog(language);
			for (const capability of ['email', 'calendar', 'contacts', 'chat', 'drive', 'tasks']) {
				check(
					isFilledText(valueAt(root, `views.onlineAccounts.capabilities.${capability}`)),
					`falta el nombre de '${capability}' en ${language}.yml`
				);
			}
		}
	});

	/**
	 * Proton no vuelve.
	 *
	 * No tiene API pública para terceros: el botón registraba una cuenta vacía
	 * con secreto vacío y no había forma de que llegara a funcionar. Si alguien
	 * reintroduce sus textos, es que está por reintroducir el botón.
	 */
	test('Proton no tiene textos porque no tiene API', async () => {
		for (const language of LANGUAGES) {
			const leftovers = [...(await keysOf(language))].filter((key) =>
				key.toLowerCase().includes('proton')
			);
			check(
				leftovers.length === 0,
				`quedaron textos de Proton en ${language}.yml: ${JSON.stringify(leftovers)}`
			);
		}
	});

	/**
	 * La pantalla de Nextcloud pide algo que ninguna otra pide —la dirección de
	 * un servidor— y explica por qué tiene que ser HTTPS.
	 *
	 * Esa nota importa más que las otras: quien tiene un Nextcloud casero sin
	 * certificado se tiene que enterar **antes** de escribir todo, no cuando el
	 * servicio lo rechaza. Si la clave falta, el campo queda sin la advertencia
	 * y el fallo aparece al final.
	 */
	test('la pantalla de Nextcloud avisa del HTTPS', async () => {
		for (const language of LANGUAGES) {
			const root = await catalog(language);
			const nextcloud = valueAt(root, 'views.onlineAccounts.nextcloud');
			check(isMapping(nextcloud), `views.onlineAccounts.nextcloud falta en ${language}.yml`);

			for (const key of [
				'title',
				'description',
				'server',
				'serverPlaceholder',
				'httpsNote',
				'name',
				'namePlaceholder',
				'connect',
				'waiting',
			]) {
				check(
					isFilledText(nextcloud[key]),
					`falta views.onlineAccounts.nextcloud.${key} en ${language}.yml`
				);
			}

			const note = String(nextcloud.httpsNote);
			check(
				note.toUpperCase().includes('HTTPS'),
				`la nota no nombra HTTPS en ${language}.yml: ${note}`
			);
		}
	});

	/**
	 * El título lleva el nombre del proveedor interpolado, y el marcador tiene
	 * que estar: sin él el título dice «Conectar» a secas.
	 */
	test('el título de Nextcloud interpola el proveedor', async () => {
		for (const language of LANGUAGES) {
			const title = textAt(await catalog(language), 'views.onlineAccounts.nextcloud.title');
			check(title.includes('{0}'), `falta el marcador en ${language}.yml: ${title}`);
		}
	});

	/**
	 * Los textos de la prueba de conexión de una cuenta de correo.
	 *
	 * El que más importa es `saveAnywayHint`: una prueba puede dar un falso
	 * negativo —una red que filtra el puerto, un servidor con un mecanismo de
	 * autenticación poco común— y sin ese texto la persona creería que su cuenta
	 * está mal cuando el problema es la prueba.
	 */
	test('la prueba de conexión tiene todos sus textos', async () => {
		for (const language of LANGUAGES) {
			const probe = valueAt(await catalog(language), 'views.onlineAccounts.probe');
			check(isMapping(probe), `views.onlineAccounts.probe falta en ${language}.yml`);

			for (const key of ['test', 'testing', 'imap', 'smtp', 'saveAnyway', 'saveAnywayHint']) {
				check(
					isFilledText(probe[key]),
					`falta views.onlineAccounts.probe.${key} en ${language}.yml`
				);
			}
		}
	});

	/**
	 * Las dos puntas se nombran distinto, o el resultado no diría cuál falló —
	 * que es la única razón de mostrarlas por separado.
	 */
	test('las dos puntas del correo se nombran distinto', async () => {
		for (const language of LANGUAGES) {
			const root = await catalog(language);
			const incoming = textAt(root, 'views.onlineAccounts.probe.imap');
			const outgoing = textAt(root, 'views.onlineAccounts.probe.smtp');

			check(incoming !== outgoing, `las dos puntas dicen lo mismo en ${language}.yml`);
		}
	});

	/**
	 * Los textos del autodescubrimiento de calendario y contactos.
	 *
	 * `nothingFoundHint` es el que más importa: hay servidores que no publican
	 * esa información y andan perfecto para el correo. Sin ese texto, no
	 * encontrar nada se lee como un fallo y alguien va a cancelar una cuenta que
	 * estaba bien.
	 */
	test('el autodescubrimiento tiene todos sus textos', async () => {
		for (const language of LANGUAGES) {
			const dav = valueAt(await catalog(language), 'views.onlineAccounts.dav');
			check(isMapping(dav), `views.onlineAccounts.dav falta en ${language}.yml`);

			for (const key of ['search', 'searching', 'hint', 'nothingFoundHint']) {
				check(isFilledText(dav[key]), `falta views.onlineAccounts.dav.${key} en ${language}.yml`);
			}
		}
	});

	/**
	 * Lo encontrado se rotula con los mismos nombres de capacidad que el resto
	 * de la pantalla, así que ésos tienen que existir — ya los cubre otra
	 * prueba, pero acá se deja dicho que el bloque de `dav` depende de ellos.
	 */
	test('lo encontrado se rotula con los nombres de capacidad', async () => {
		for (const language of LANGUAGES) {
			const root = await catalog(language);
			for (const capability of ['calendar', 'contacts']) {
				check(
					isFilledText(valueAt(root, `views.onlineAccounts.capabilities.${capability}`)),
					`falta el nombre de '${capability}', que rotula lo que se encontró`
				);
			}
		}
	});

	/**
	 * Los textos de pegar las credenciales propias.
	 *
	 * `why` es el que hace la diferencia entre «esto no anda» y «esto necesita
	 * un paso tuyo». Sin él, un botón que pide un ID de cliente parece un error
	 * de la distribución en vez de una decisión de no pagar una auditoría anual.
	 */
	test('las credenciales propias explican por qué hacen falta', async () => {
		for (const language of LANGUAGES) {
			const credentials = valueAt(await catalog(language), 'views.onlineAccounts.credentials');
			check(isMapping(credentials), `views.onlineAccounts.credentials falta en ${language}.yml`);

			for (const key of [
				'own',
				'needed',
				'title',
				'why',
				'how',
				'clientId',
				'clientSecret',
				'clientSecretPlaceholder',
				'secretNote',
				'clear',
				'saved',
				'cleared',
			]) {
				check(
					isFilledText(credentials[key]),
					`falta views.onlineAccounts.credentials.${key} en ${language}.yml`
				);
			}
		}
	});

	/**
	 * Los tres textos que llevan el nombre del proveedor tienen que
	 * interpolarlo: sin el marcador, el título dice «Credenciales para» a secas.
	 */
	test('los textos de credenciales nombran al proveedor', async () => {
		for (const language of LANGUAGES) {
			const root = await catalog(language);
			for (const key of ['title', 'why', 'saved', 'cleared']) {
				const text = textAt(root, `views.onlineAccounts.credentials.${key}`);
				check(
					text.includes('{0}'),
					`views.onlineAccounts.credentials.${key} no nombra al proveedor en ${language}.yml: ${text}`
				);
			}
		}
	});

	/**
	 * La nota del secreto tiene que decir que **no** es un secreto de verdad.
	 *
	 * Si no, alguien puede no pegarlo creyendo que se está exponiendo, y
	 * quedarse sin poder conectar la cuenta por una precaución que no
	 * corresponde.
	 */
	test('la nota del secreto aclara que no es uno', async () => {
		for (const language of LANGUAGES) {
			const note = textAt(await catalog(language), 'views.onlineAccounts.credentials.secretNote');
			check(
				note.includes('PKCE'),
				`la nota no dice qué protege de verdad en ${language}.yml: ${note}`
			);
		}
	});

	/**
	 * El aviso de cuando la cuenta se borró pero no se le pudo avisar al
	 * proveedor.
	 *
	 * Es el texto que convierte «se borró» en «se borró, y queda esto por
	 * hacer». Sin él, la persona creería que cortó el acceso cuando la
	 * autorización sigue viva del otro lado — que es exactamente el estado que
	 * la revocación viene a evitar.
	 */
	test('se avisa cuando no se pudo revocar', async () => {
		for (const language of LANGUAGES) {
			const text = textAt(await catalog(language), 'views.onlineAccounts.errors.notRevoked');

			check(text.trim() !== '', `falta views.onlineAccounts.errors.notRevoked en ${language}.yml`);
			// Lleva el nombre de la cuenta y el motivo: sin los dos marcadores el
			// aviso no dice cuál cuenta ni por qué.
			check(text.includes('{0}') && text.includes('{1}'), `${language}: ${text}`);
		}
	});

	test('el catálogo se lee de verdad', async () => {
		// Si el analizador de YAML devolviera un mapeo vacío, todo lo de arriba
		// que filtra claves pasaría sin proteger nada.
		const es = await keysOf('es');
		expect(es.size).toBeGreaterThan(200);
		expect(es.has('views.home.title')).toBe(true);
	});
});

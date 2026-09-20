/**
 * El catálogo de secciones que lee el lanzador, armado desde el menú.
 *
 * `vasak-prism` ofrece «Wi-Fi» o «Pantallas» como resultados que abren la
 * configuración en esa sección. Para eso necesita la lista, y la lista ya
 * existe: es el menú lateral de esta ventana. Lo que no puede hacer el lanzador
 * es leerla de acá —está en TypeScript, adentro de un `.vue` compilado— ni
 * copiarla, que es como se terminan dos listas que se separan.
 *
 * Así que se genera un archivo de datos que el paquete instala, y una prueba
 * comprueba que el archivo committeado es exactamente lo que sale de acá. Si
 * alguien agrega una pantalla y no regenera, la prueba lo dice.
 *
 *     bun run secciones
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { categoriasDelMenu } from '../src/composables/menu';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));

/** Los idiomas que la aplicación trae. */
export const IDIOMAS = ['es', 'en'] as const;

export interface Seccion {
	/** Lo que se le pasa al programa: `vasak-settings network-wifi`. */
	id: string;
	/** El icono del tema, el mismo que muestra el menú. */
	icono: string;
	/** El nombre en cada idioma, ya resuelto. */
	nombres: Record<string, string>;
	/**
	 * Con qué más se la puede encontrar, por idioma.
	 *
	 * Sólo donde el nombre no alcanza, así que la mayoría de las secciones no lo
	 * trae y quien lee el catálogo tiene que aguantar que falte.
	 */
	palabras?: Record<string, string[]>;
}

/**
 * Los textos de un catálogo, aplanados como `sidebar.items.home`.
 *
 * Parser de andar por casa, como el de `catalogos.test.ts`: los catálogos son
 * planos por indentación y no hace falta más. Lo único que se le pide es leer
 * el valor, que aquél no necesitaba.
 */
function textosDe(yaml: string): Map<string, string> {
	const salida = new Map<string, string>();
	const camino: string[] = [];

	for (const linea of yaml.split('\n')) {
		if (!linea.trim() || linea.trim().startsWith('#')) continue;

		const sangria = linea.length - linea.trimStart().length;
		const contenido = linea.trim();
		const corte = contenido.indexOf(':');
		if (corte < 0) continue;

		const clave = contenido.slice(0, corte).trim();
		const valor = contenido.slice(corte + 1).trim();

		camino.length = sangria / 2;
		camino.push(clave);

		if (valor) {
			// Las comillas son del YAML, no del texto.
			salida.set(camino.join('.'), valor.replace(/^["']|["']$/g, ''));
		}
	}

	return salida;
}

/**
 * Con qué más busca la gente cada sección.
 *
 * Existe porque el buscador sólo mira el **nombre**, y el nombre es como la
 * pantalla se llama, no como se la busca: nadie escribe «Audio salida» cuando
 * quiere bajar el volumen, ni «Fuentes» cuando quiere agrandar la letra.
 *
 * # Por qué a mano y no sacadas de otro lado
 *
 * Cada pantalla ya tiene una `description` traducida, y era tentador usarla: es
 * prosa escrita y no cuesta nada. Se midió contra los cinco casos que motivaron
 * esto y cubre **dos**: «micrófono» y «contraseña» están en sus descripciones,
 * «sonido», «tipografía» y «resolución» no. Y lo que sí aporta viene con lo que
 * no: «sistema» y «configuración» aparecen en casi todas, así que indexarlas
 * enteras haría que media lista coincidiera con media consulta.
 *
 * # Por qué faltan la mayoría
 *
 * Porque «Bluetooth», «VPN» o «Panel» se buscan por su nombre y no necesitan
 * nada. Un sinónimo que no aporta es ruido que le gana a la sección correcta.
 * La prueba **no** exige el campo, justamente para que esto pueda quedarse
 * corto sin quedarse a medias.
 */
export const PALABRAS: Record<string, Record<(typeof IDIOMAS)[number], string[]>> = {
	shortcuts: {
		es: ['teclas', 'combinaciones', 'atajos de teclado'],
		en: ['keys', 'keybindings', 'hotkeys'],
	},
	'default-apps': {
		es: ['navegador', 'predeterminadas', 'abrir con'],
		// «default» no va: ya está en el nombre.
		en: ['browser', 'open with'],
	},
	'appearance-theme': {
		es: ['colores', 'modo oscuro', 'modo claro'],
		en: ['colors', 'dark mode', 'light mode'],
	},
	'appearance-fonts': {
		es: ['tipografía', 'letra', 'tamaño del texto'],
		en: ['typography', 'text size'],
	},
	'appearance-wallpaper': {
		es: ['fondo de pantalla', 'wallpaper', 'papel tapiz'],
		en: ['background', 'desktop background'],
	},
	'appearance-panel': {
		es: ['barra', 'bandeja', 'barra de tareas'],
		en: ['bar', 'tray', 'taskbar'],
	},
	'multimedia-audio': {
		es: ['sonido', 'volumen', 'parlantes', 'altavoces'],
		en: ['sound', 'volume', 'speakers'],
	},
	'multimedia-audio-input': {
		es: ['micrófono', 'grabar'],
		en: ['microphone', 'recording'],
	},
	'wayfire-input': {
		// «mouse» y no «ratón»: acá nadie escribe «ratón».
		es: ['mouse', 'touchpad', 'puntero', 'velocidad del cursor'],
		en: ['touchpad', 'pointer', 'cursor speed'],
	},
	'wayfire-windows': {
		es: ['mosaico', 'acomodar ventanas'],
		en: ['tiling', 'snapping'],
	},
	'wayfire-workspaces': {
		es: ['escritorios virtuales'],
		en: ['virtual desktops'],
	},
	'wayfire-effects': {
		es: ['animaciones', 'transparencia', 'sombras'],
		en: ['animations', 'blur', 'shadows'],
	},
	'wayfire-autostart': {
		es: ['arranque', 'al iniciar sesión', 'inicio automático'],
		en: ['startup', 'run at login'],
	},
	'wayfire-plugins': {
		es: ['complementos', 'extensiones'],
		en: ['extensions', 'addons'],
	},
	users: {
		es: ['contraseña', 'cuenta', 'administrador'],
		en: ['password', 'account', 'administrator'],
	},
	'online-accounts': {
		// Se busca por el proveedor, que es lo que uno quiere conectar.
		es: ['google', 'nextcloud', 'microsoft'],
		en: ['google', 'nextcloud', 'microsoft'],
	},
	'language-keyboard': {
		es: ['distribución del teclado', 'región', 'traducción'],
		en: ['keyboard layout', 'locale', 'region'],
	},
	datetime: {
		es: ['zona horaria', 'reloj'],
		en: ['timezone', 'clock'],
	},
	power: {
		es: ['batería', 'suspender', 'ahorro de energía'],
		en: ['battery', 'suspend', 'power saving'],
	},
	monitors: {
		es: ['resolución', 'monitor', 'escala', 'hdmi'],
		en: ['resolution', 'scaling', 'hdmi'],
	},
	actualizaciones: {
		es: ['paquetes', 'pacman', 'actualizar el sistema'],
		en: ['packages', 'pacman', 'upgrade'],
	},
	'privacy-security': {
		es: ['permisos', 'cortafuegos'],
		en: ['permissions', 'firewall'],
	},
	'login-screen': {
		es: ['greeter', 'pantalla de bienvenida'],
		en: ['greeter', 'display manager'],
	},
	'network-wifi': {
		es: ['red', 'internet', 'inalámbrica'],
		en: ['network', 'internet', 'wireless'],
	},
	'network-bluetooth': {
		es: ['auriculares', 'emparejar'],
		en: ['headphones', 'pairing'],
	},
	'network-vpn': {
		es: ['wireguard', 'openvpn'],
		en: ['wireguard', 'openvpn'],
	},
	'phone-devices': {
		es: ['android', 'celular', 'móvil'],
		en: ['android', 'mobile'],
	},
};

/** Las secciones, con sus nombres resueltos en cada idioma. */
export function secciones(): Seccion[] {
	// El `t` devuelve la clave: lo que hace falta acá son los identificadores,
	// no los textos, y los textos salen del catálogo de cada idioma.
	const categorias = categoriasDelMenu((clave) => clave);

	const catalogos = new Map(
		IDIOMAS.map((idioma) => [
			idioma,
			textosDe(readFileSync(join(RAIZ, `src-tauri/locales/${idioma}.yml`), 'utf8')),
		])
	);

	const salida: Seccion[] = [];

	for (const categoria of categorias) {
		for (const item of categoria.items ?? []) {
			const nombres: Record<string, string> = {};

			for (const idioma of IDIOMAS) {
				const texto = catalogos.get(idioma)?.get(item.label);
				if (!texto) {
					throw new Error(`falta ${item.label} en ${idioma}.yml`);
				}
				nombres[idioma] = texto;
			}

			const suyas = PALABRAS[item.id];
			// Sin el campo cuando no hay nada que decir: un `palabras: {}` en cada
			// sección es ruido en el archivo y una forma más de estar vacío.
			salida.push(
				suyas
					? { id: item.id, icono: item.icon ?? '', nombres, palabras: { ...suyas } }
					: { id: item.id, icono: item.icon ?? '', nombres }
			);
		}
	}

	return salida;
}

export const DESTINO = join(RAIZ, 'packaging/secciones.json');

export function comoSeEscribe(): string {
	return `${JSON.stringify(secciones(), null, '\t')}\n`;
}

if (import.meta.main) {
	writeFileSync(DESTINO, comoSeEscribe());
	console.log(`${DESTINO}: ${secciones().length} secciones`);
}

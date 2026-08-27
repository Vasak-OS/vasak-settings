import { invoke } from '@tauri-apps/api/core';
import { getIconSource } from '@vasakgroup/plugin-vicons';
import { setupContextMenu } from '@vasakgroup/plugin-vsk-contextual-menu';
import I18n from '@vasakgroup/tauri-plugin-i18n';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from '@/App.vue';
import { router } from '@/routes';
import '@/assets/main.css';
import { captureFailures } from '@vasakgroup/plugin-vsk-journal';

/**
 * Los valores que la especificación de CSP informa en lugar de una URL.
 *
 * Van tal cual: no son rutas y recortarlos los volvería ilegibles.
 */
const MARCADORES_CSP = new Set([
	'inline',
	'eval',
	'wasm-eval',
	'data',
	'blob',
	'filesystem',
	'self',
	'unsafe-eval',
	'unsafe-inline',
]);

/**
 * Saca de una URL lo que no debería quedar en un registro.
 *
 * Se conserva el esquema y la autoridad usando `href`, y no `origin + pathname`:
 * para esquemas propios como `asset:` o `ipc:` el `origin` es la cadena «null»,
 * así que esa forma escribía `null/ruta` y perdía justamente lo que permite
 * entender qué se bloqueó.
 *
 * El caso que faltaba cubrir es el del `catch`: una ruta relativa o
 * protocol-relative hace que `new URL` falle, y devolverla tal cual dejaba la
 * query y el fragmento en el registro — o sea, exactamente lo que esta función
 * viene a evitar. Ahora sólo pasan sin tocar los marcadores de la
 * especificación; cualquier otra cosa se corta antes de `?` o `#`.
 */
const sanearUrl = (valor: string | null | undefined): string => {
	if (!valor) {
		return '';
	}
	try {
		const url = new URL(valor);
		if (url.protocol === 'data:') {
			return 'data:(recortado)';
		}
		// Credenciales, query y fragmento: ahí es donde viajan los tokens.
		url.username = '';
		url.password = '';
		url.search = '';
		url.hash = '';
		return url.href;
	} catch {
		if (MARCADORES_CSP.has(valor)) {
			return valor;
		}
		return valor.split(/[?#]/)[0];
	}
};

// Una violación de CSP no se ve: el recurso no carga y la interfaz queda a
// medias sin decir nada. Se sanean **las dos** URLs, porque `sourceFile` también
// puede llevar query con datos sensibles.
document.addEventListener('securitypolicyviolation', (evento) => {
	// El respaldo se decide antes de sanear: `sanearUrl` nunca devuelve vacío
	// para una entrada con contenido, así que un `|| 'documento'` después de
	// llamarla era código muerto.
	const recurso = evento.blockedURI ? sanearUrl(evento.blockedURI) : '(en línea)';
	const origen = evento.sourceFile ? sanearUrl(evento.sourceFile) : 'documento';
	console.error(
		`[CSP] bloqueado ${recurso} por la directiva ` +
			`«${evento.violatedDirective}» en ${origen}:${evento.lineNumber}`
	);
});

const i18n = I18n.getInstance();
// Soltar un archivo en la ventana lo maneja Tauri, que avisa por
// `tauri://drag-drop` con la ruta. Lo que sigue evita que **además** lo procese
// WebKit por su cuenta: con un video de por medio, el motor intenta cargarlo y
// mostrarlo dentro de la página, y ahí la memoria se va sin techo hasta que el
// kernel mata el proceso. La página nunca necesita el archivo en sí: le alcanza
// la ruta.
for (const evento of ['dragover', 'drop'] as const) {
	window.addEventListener(evento, (e) => e.preventDefault());
}

// El menú del clic derecho del escritorio, una sola vez para toda la
// aplicación: le enseña a resolver los nombres de iconos del sistema y apaga el
// menú que dibuja WebKit, que ofrece «Recargar» e «Inspeccionar elemento» sobre
// una aplicación que no es una página web.
setupContextMenu({ iconResolver: getIconSource });

// Lo que rompe la interfaz va al diario del sistema, con el nombre de esta
// aplicación. Antes no iba a ninguna parte: un error de JavaScript deja la
// pantalla a medias y la consola del WebView no la ve nadie en una máquina
// instalada.
captureFailures();

const app = createApp(App);
const pinia = createPinia();

i18n.load();
app.use(pinia);
app.use(router);

app.mount('#app');

/**
 * `vasak-settings appearance-panel` abre esa pantalla en vez de la portada.
 *
 * La lista de secciones válidas es la del router y no una copia: `hasRoute`
 * descarta cualquier cosa que no exista, así que agregar una pantalla no obliga
 * a tocar además una lista aparte. Va después de montar para no demorar el
 * primer dibujado, y si el argumento no sirve la aplicación abre donde siempre.
 */
invoke<string | null>('initial_section')
	.then((seccion) => {
		if (seccion && router.hasRoute(seccion)) router.push({ name: seccion });
	})
	.catch(() => {
		// Sin el puente con Rust no hay argumento que leer; la portada sirve.
	});

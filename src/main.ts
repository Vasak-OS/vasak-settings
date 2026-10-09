import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getIconSource } from '@vasakgroup/plugin-vicons';
import { setupContextMenu } from '@vasakgroup/plugin-vsk-contextual-menu';
import I18n from '@vasakgroup/tauri-plugin-i18n';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from '@/App.vue';
import { router } from '@/routes';
import { sanearUrl } from '@/tools/csp';
import '@/assets/main.css';
import { captureFailures } from '@vasakgroup/plugin-vsk-journal';

/**
 * Cuánto se espera a las traducciones antes de montar.
 *
 * Se espera para que la primera pantalla no muestre las claves crudas, pero con
 * un plazo: si el backend no contesta, es mejor una interfaz con las claves a la
 * vista que una ventana en blanco para siempre.
 */
const PLAZO_TRADUCCIONES_MS = 3000;

// Una violación de CSP no se ve: el recurso no carga y la interfaz queda a
// medias sin decir nada. Se sanean **las dos** URLs, porque `sourceFile` también
// puede llevar query con datos sensibles.
document.addEventListener('securitypolicyviolation', (evento) => {
	// El respaldo va **después** de sanear, no antes.
	//
	// Mirando el valor crudo, una entrada como `?token=X` es verdadera y
	// pasa el respaldo de largo — pero lo que queda de ella al sanearla es
	// nada, así que el registro salía con el campo en blanco. Sanear
	// primero y decidir después es lo que hace que un aviso incompleto no
	// exista.
	const recurso = sanearUrl(evento.blockedURI) || '(en línea)';
	const origen = sanearUrl(evento.sourceFile) || 'documento';
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

app.use(pinia);
app.use(router);

// Se esperan las traducciones antes de montar: montando primero, la ventana
// enseña las claves crudas —«views.home.title» donde va el texto— hasta que el
// catálogo termina de cargar.
//
// Antes esto era un `i18n.load()` suelto, sin esperar. Y hasta la 2.3.0 del
// plugin esperarlo tampoco habría servido: la clase y el composable guardaban el
// catálogo por separado, y el `t()` de los componentes lee el del composable.
//
// Un intento que falla se reintenta —el backend puede tardar o no escuchar a la
// primera—, pero la espera total sigue acotada por `PLAZO_TRADUCCIONES_MS`: un
// backend colgado tiene que dar una ventana con las claves a la vista, no una
// ventana en blanco para siempre. Ese tope era la garantía del `Promise.race`
// anterior, y el reintento no la toca.
async function cargarTraducciones(): Promise<void> {
	const MAX_INTENTOS = 3;
	const ESPERA_BASE_MS = 500;
	const ESPERA_MAX_MS = 2000;

	const intentar = async () => {
		for (let intento = 0; intento < MAX_INTENTOS; intento++) {
			try {
				await i18n.load();
				return;
			} catch (error) {
				console.error(
					`No se pudieron cargar las traducciones (intento ${intento + 1}/${MAX_INTENTOS}):`,
					error
				);
				if (intento === MAX_INTENTOS - 1) return;
				const espera = Math.min(ESPERA_BASE_MS * 2 ** intento, ESPERA_MAX_MS);
				await new Promise((resolve) => setTimeout(resolve, espera));
			}
		}
	};

	await Promise.race([
		intentar(),
		new Promise((resolve) => setTimeout(resolve, PLAZO_TRADUCCIONES_MS)),
	]);
}

await cargarTraducciones();

app.mount('#app');

/**
 * Lleva la ventana a una sección, si esa sección existe.
 *
 * La lista de secciones válidas es la del router y no una copia: `hasRoute`
 * descarta cualquier cosa que no exista, así que agregar una pantalla no obliga
 * a tocar además una lista aparte.
 */
function irASeccion(seccion: string | null) {
	if (seccion && router.hasRoute(seccion)) router.push({ name: seccion });
}

/**
 * `vasak-settings appearance-panel` abre esa pantalla en vez de la portada.
 *
 * Va después de montar para no demorar el primer dibujado, y si el argumento no
 * sirve la aplicación abre donde siempre.
 */
invoke<string | null>('initial_section')
	.then(irASeccion)
	.catch(() => {
		// Sin el puente con Rust no hay argumento que leer; la portada sirve.
	});

/**
 * Y lo mismo cuando la ventana **ya estaba abierta**.
 *
 * Una segunda invocación no dibuja una ventana nueva —de eso se encarga
 * `tauri-plugin-single-instance`—, así que la sección que pidió tiene que
 * llegar por acá. Sin esto, pedir una sección con la configuración abierta no
 * hacía nada visible: la ventana se traía al frente en la portada o donde
 * hubiera quedado.
 */
listen<string>('vasak-settings:ir-a-seccion', (aviso) => irASeccion(aviso.payload)).catch(() => {
	// Sin el puente, la ventana igual se trae al frente desde Rust.
});

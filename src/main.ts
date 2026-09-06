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

i18n.load();
app.use(pinia);
app.use(router);

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

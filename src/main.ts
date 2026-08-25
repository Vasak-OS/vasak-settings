import { invoke } from '@tauri-apps/api/core';
import { getIconSource } from '@vasakgroup/plugin-vicons';
import { setupContextMenu } from '@vasakgroup/plugin-vsk-contextual-menu';
import I18n from '@vasakgroup/tauri-plugin-i18n';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from '@/App.vue';
import { router } from '@/routes';
import '@/assets/main.css';

/**
 * Saca de una URL lo que no debería quedar en un registro.
 *
 * Se conserva el esquema y la autoridad completos usando `href`, y no
 * `origin + pathname`: para esquemas propios como `asset:` o `ipc:` el `origin`
 * es la cadena «null», así que esa forma escribía `null/ruta` y perdía
 * justamente lo que permite entender qué se bloqueó.
 */
const sanearUrl = (valor: string | null | undefined): string => {
	if (!valor) {
		return '(en línea)';
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
		// No era una URL absoluta —'inline', 'eval', una ruta relativa—: tal cual.
		return valor;
	}
};

document.addEventListener('securitypolicyviolation', (evento) => {
	// Se sanean **las dos** URLs. `sourceFile` también puede llevar query con
	// datos sensibles, y antes se escribía sin tocar.
	console.error(
		`[CSP] bloqueado ${sanearUrl(evento.blockedURI)} por la directiva ` +
			`«${evento.violatedDirective}» en ${sanearUrl(evento.sourceFile) || 'documento'}:${evento.lineNumber}`
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

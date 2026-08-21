import I18n from '@vasakgroup/tauri-plugin-i18n';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from '@/App.vue';
import { router } from '@/routes';
import '@/assets/main.css';

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

const app = createApp(App);
const pinia = createPinia();

i18n.load();
app.use(pinia);
app.use(router);

app.mount('#app');

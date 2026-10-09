/**
 * Lo que tiene que estar listo antes de la primera prueba.
 *
 * El DOM y el complemento que compila los `.vue` —Bun los trata como un archivo
 * suelto y lo que se importa sin él es la ruta, no el componente—.
 *
 * Los dobles de Tauri por módulo **no** se ponen acá: este repositorio ya tiene
 * pruebas que doblan lo que necesitan desde su propio archivo, y un segundo
 * `mock.module` sobre el mismo módulo gana o pierde según el orden en que Bun
 * evalúe los archivos.
 *
 * Lo que sí va acá es el **piso** de la capa nativa, que no es un `mock.module`
 * sino el global que lee el `invoke` real: `window.__TAURI_INTERNALS__`. Sin él,
 * un componente que se renderiza antes de que algún archivo doble
 * `@tauri-apps/api/core` —el orden entre archivos cambia entre local y CI— llama
 * a `window.__TAURI_INTERNALS__.invoke`, que no existe, y el acceso a `.invoke`
 * **tira sincrónico**. Eso no es un promise rechazado —que quien llama ya atrapa,
 * como el plugin de i18n con su «Failed to load translations»— sino una
 * excepción que nadie espera; bajo carga cae dentro de una prueba y voltea la
 * corrida entera aunque ninguna falle (ver la memoria del taller sobre
 * `__TAURI_INTERNALS__`). Devolviendo un promise rechazado, ese camino vuelve a
 * ser el que ya se maneja, y la suite deja de depender del orden. Un archivo que
 * quiera respuestas de verdad sigue poniendo su `mock.module`, que gana sobre
 * esto.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import './complemento-vue';

GlobalRegistrator.register();

const capaNativa = {
	invoke: () => Promise.reject(new Error('Tauri no está disponible en las pruebas')),
	transformCallback: (callback?: unknown) => callback,
};

const conGlobal = globalThis as unknown as {
	__TAURI_INTERNALS__?: typeof capaNativa;
	window?: { __TAURI_INTERNALS__?: typeof capaNativa };
};
conGlobal.__TAURI_INTERNALS__ ??= capaNativa;
if (conGlobal.window) conGlobal.window.__TAURI_INTERNALS__ ??= capaNativa;

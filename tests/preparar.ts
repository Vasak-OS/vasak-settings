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
 * **tira sincrónico**; bajo carga eso cae dentro de una prueba y voltea la
 * corrida entera aunque ninguna falle (ver la memoria del taller sobre
 * `__TAURI_INTERNALS__`).
 *
 * El `invoke` del piso **resuelve** —no rechaza—: un rechazo lo atrapa quien
 * llama (el plugin de i18n con su «Failed to load translations»), pero sigue
 * siendo un error de corrida que Bun en CI cuenta y hace salir con código 1. Al
 * resolver `undefined` no se produce ningún error: el único backend que se toca
 * al montar es el i18n, y su `translate` cae a la clave cuando no hay catálogo.
 * Un archivo que quiera respuestas de verdad sigue poniendo su `mock.module`,
 * que gana sobre esto.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import './complemento-vue';

GlobalRegistrator.register();

const capaNativa = {
	invoke: () => Promise.resolve(undefined),
	transformCallback: (callback?: unknown) => callback,
};

const conGlobal = globalThis as unknown as {
	__TAURI_INTERNALS__?: typeof capaNativa;
	window?: { __TAURI_INTERNALS__?: typeof capaNativa };
};
conGlobal.__TAURI_INTERNALS__ ??= capaNativa;
if (conGlobal.window) conGlobal.window.__TAURI_INTERNALS__ ??= capaNativa;

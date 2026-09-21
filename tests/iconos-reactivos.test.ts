/**
 * Que nadie vuelva a resolver un icono del tema a mano.
 *
 * Acá vivía `useReactiveIcon`/`useReactiveSymbol`, la copia propia de esta
 * ventana, y este archivo cuidaba su parte más filosa: anotaban una función en
 * un conjunto del módulo para volver a resolver cuando cambiara el tema, y lo
 * único que la sacaba de ahí era el `onUnmounted` del componente que la puso.
 * Fuera del `setup` no había quien la sacara — la función quedaba para siempre,
 * apuntando a un `ref` que nadie mira.
 *
 * Pasaba en «Cuentas en Línea», que resolvía el icono de cada proveedor dentro
 * de una función que vuelve a correr con cada recarga del catálogo: sumaba un
 * proveedor de fuga por recarga y encima no servía, porque lo que la plantilla
 * dibujaba era una copia hecha en el momento.
 *
 * Con `ThemeIcon` ese problema no existe: el icono es un componente, se pone
 * dentro de un `v-for` sin más, y el oyente del cambio de tema es **uno solo**
 * para toda la ventana, con su cuenta de suscriptores. Lo que resuelve de otra
 * forma —los iconos del catálogo de proveedores, que preguntan si el tema tiene
 * el nombre antes de usarlo— se cuelga de ese mismo oyente con
 * `usarLaVersionDelTema()`.
 *
 * Así que lo que queda por vigilar es la **forma** de la copia y no su nombre:
 * que nadie pida iconos al complemento ni escuche el cambio de tema por su
 * cuenta. Ver Vasak-OS/vue-libvasak#54.
 */

import { describe, expect, mock, test } from 'bun:test';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Glob } from 'bun';

/**
 * Qué variante del tema devuelve el doble, para poder cambiarla a mitad.
 *
 * El nombre resuelto lleva la variante adentro: así el `src` dibujado dice de
 * qué tema salió, que es lo único que distingue «volvió a pedirlo» de «se quedó
 * con el de antes».
 */
let variante = 'claro';

/** Los manejadores del cambio de tema, para dispararlos a mano. */
const oyentesDelTema: Array<() => void> = [];

/**
 * Los dobles van **encima** del módulo de verdad, no en su lugar.
 *
 * Reemplazarlo entero deja sin exportar lo que no se nombre acá, y lo que falla
 * entonces es el import y no la prueba: los componentes compilados de la
 * librería importan `once` del módulo de eventos, así que en cuanto una prueba
 * monta uno, la corrida se cae con un «Export named 'once' not found» que no
 * nombra ninguna prueba.
 */
const eventos = await import('@tauri-apps/api/event');
const nucleo = await import('@tauri-apps/api/core');

mock.module('@tauri-apps/api/event', () => ({
	...eventos,
	listen: async (nombre: string, manejador: () => void) => {
		if (nombre === 'vicons:theme-changed') oyentesDelTema.push(manejador);
		return () => {
			const donde = oyentesDelTema.indexOf(manejador);
			if (donde >= 0) oyentesDelTema.splice(donde, 1);
		};
	},
}));

/** El catálogo mínimo: un proveedor, para mirarle el icono. */
mock.module('@tauri-apps/api/core', () => ({
	...nucleo,
	invoke: async (comando: string) => {
		if (comando.includes('list_providers')) {
			return [{ id: 'google', display_name: 'Google', capabilities: [] }];
		}
		return [];
	},
}));

mock.module('@vasakgroup/plugin-vicons', () => ({
	getIconSource: async (nombre: string) => `icono:${variante}:${nombre}`,
	getSymbolSource: async (nombre: string) => `simbolo:${variante}:${nombre}`,
	hasSymbol: async () => true,
}));

mock.module('@vasakgroup/tauri-plugin-i18n', () => ({
	useI18n: () => ({ t: (clave: string) => clave, locale: { value: 'es' } }),
}));

// `fileURLToPath` y no `.pathname`: éste deja los caracteres codificados tal
// como están, así que un checkout en una ruta con un espacio llega con `%20` y
// `scanSync` no encuentra nada.
const FUENTE = fileURLToPath(new URL('../src/', import.meta.url));
const fuentes = [...new Glob('**/*.{vue,ts}').scanSync(FUENTE)];

/**
 * Los dos que sí resuelven a mano, y por qué.
 *
 * - `views/OnlineAccountsView.vue`: los proveedores salen del catálogo y no se
 *   saben de antemano, y antes de usar un nombre hay que preguntar si el tema lo
 *   tiene —`hasSymbol`—, porque pedir uno que no está devuelve el cuadrito de
 *   imagen rota, con forma de icono válido. `ThemeIcon` dibuja un nombre; esto
 *   es otra cosa. Sigue al tema con `usarLaVersionDelTema()`, o sea con el mismo
 *   oyente que la librería ya tiene.
 * - `main.ts`: el menú contextual del escritorio no dibuja con Vue, pide una
 *   **función** que resuelva el nombre a una ruta porque lo pinta el complemento
 *   fuera de esta ventana.
 */
const EXCEPCIONES = new Set(['views/OnlineAccountsView.vue', 'main.ts']);

describe('el composable de iconos propio', () => {
	test('hay algo que mirar', () => {
		// Sin esto las de abajo pasan sobre una lista vacía, que es en lo que
		// quedan si el patrón deja de encontrar archivos. Una guardia que se
		// apaga sola dice que sí.
		expect(fuentes).toContain('layouts/WindowAppLayout.vue');
		expect(fuentes.length).toBeGreaterThan(50);
	});

	test('ya no está', () => {
		expect(fuentes.filter((ruta) => ruta.includes('useReactiveIcon'))).toEqual([]);
	});

	test('y nadie lo llama', async () => {
		const culpables: string[] = [];
		for (const ruta of fuentes) {
			const texto = await Bun.file(join(FUENTE, ruta)).text();
			if (/\buseReactive(?:Icon|Symbol)\s*\(/.test(texto)) culpables.push(ruta);
		}

		expect(culpables).toEqual([]);
	});
});

describe('quién resuelve iconos a mano', () => {
	test('sólo los dos que no pueden hacerlo de otra forma', async () => {
		// Lo que cuenta es **importar** el complemento o escuchar el evento, no
		// nombrarlos. `tools/icono-de-proveedor.ts` recibe el resolvedor como
		// parámetro —por eso se puede probar sin arrastrar Vue— y lo nombra en un
		// `@param`: buscando el nombre a secas aparecía como culpable.
		const aMano: string[] = [];
		for (const ruta of fuentes) {
			const texto = await Bun.file(join(FUENTE, ruta)).text();
			const importa = /from '@vasakgroup\/plugin-vicons'/.test(texto);
			const escucha = /listen\(\s*'vicons:theme-changed'/.test(texto);
			if (importa || escucha) aMano.push(ruta);
		}

		expect(aMano.sort()).toEqual([...EXCEPCIONES].sort());
	});

	test('y el que resuelve a mano sigue al tema por la librería', async () => {
		// Sin esto, la lista de excepciones se cumple igual con un archivo que
		// resuelve y **no** vuelve a resolver nunca: las tarjetas se quedarían
		// con la variante anterior al cambiar de tema, y nada fallaría.
		//
		// Es una guardia de texto, y sola **no alcanza**: sacándole el `watch` a
		// la versión, el archivo sigue nombrando `usarLaVersionDelTema` y esto
		// sigue en verde. Lo que cierra el agujero es la prueba de más abajo, que
		// monta la vista y mira el dibujo. Ésta queda por lo otro que el texto sí
		// puede decir: que no haya vuelto a aparecer un `listen` propio.
		const texto = await Bun.file(join(FUENTE, 'views/OnlineAccountsView.vue')).text();

		expect(texto).toContain('usarLaVersionDelTema');
		expect(texto).not.toContain("listen('vicons:theme-changed'");
	});
});

/**
 * Y que de verdad vuelva a pedirlos, que es lo que el texto no puede decir.
 *
 * La guardia de arriba comprueba que el archivo se cuelgue del oyente
 * compartido, y con eso **no alcanza**: sacándole el `watch` a la versión, el
 * archivo sigue nombrando `usarLaVersionDelTema` y la guardia sigue en verde
 * mientras las tarjetas se quedan con los iconos del tema anterior. Medido, y
 * lo marcó CodeRabbit en la revisión de este PR.
 *
 * Así que esto monta la vista, cambia lo que el tema devuelve, emite el aviso
 * del cambio y mira el `src` que quedó dibujado.
 */
describe('las tarjetas de proveedor vuelven a pedir el icono al cambiar el tema', () => {
	test('el dibujo cambia, no sólo el import', async () => {
		const { mount } = await import('@vue/test-utils');
		const { nextTick } = await import('vue');
		const { olvidarLosIconosDelTema } = await import('@vasakgroup/vue-libvasak');

		olvidarLosIconosDelTema();
		variante = 'claro';

		const OnlineAccountsView = (await import('@/views/OnlineAccountsView.vue')).default;
		const vista = mount(OnlineAccountsView, { attachTo: document.body });
		for (let i = 0; i < 12; i++) await nextTick();

		const antes = vista.find('img[alt="Google"]').attributes('src');
		expect(antes).toBe('simbolo:claro:google-symbolic');

		variante = 'oscuro';
		for (const manejador of oyentesDelTema) manejador();
		for (let i = 0; i < 12; i++) await nextTick();

		expect(vista.find('img[alt="Google"]').attributes('src')).toBe(
			'simbolo:oscuro:google-symbolic'
		);

		vista.unmount();
		olvidarLosIconosDelTema();
	});
});

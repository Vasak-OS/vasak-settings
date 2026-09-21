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

import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Glob } from 'bun';

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
		// Es una guardia de texto y no de comportamiento, así que comprueba lo
		// único que el texto puede decir: que el archivo se cuelgue del oyente
		// compartido. Que de verdad vuelva a pedir los iconos se prueba en
		// `icono-de-proveedor.test.ts`, que es donde vive esa función.
		const texto = await Bun.file(join(FUENTE, 'views/OnlineAccountsView.vue')).text();

		expect(texto).toContain('usarLaVersionDelTema');
		expect(texto).not.toContain("listen('vicons:theme-changed'");
	});
});

/**
 * La barra lateral es la de la librería, no una copia.
 *
 * Nació acá, y la tienda y el monitor la copiaron a mano: mismas clases, otro
 * archivo, y una prueba en cada repositorio que ataba las clases a éstas. Eso
 * funciona mientras alguien se acuerde de seguir los cambios. Ahora vive en
 * `@vasakgroup/vue-libvasak` y cuando cambie cambia en todas las ventanas a la
 * vez.
 *
 * Lo de acá se lee del fuente a propósito: son afirmaciones sobre **de dónde
 * sale** el componente y sobre la hoja de estilos, no sobre lo que hace. Lo que
 * la barra hace —plegarse, marcar el activo, esconder el texto— se prueba en la
 * librería, montándola.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');

const layout = leer('src/layouts/WindowAppLayout.vue');
const css = leer('src/assets/main.css');
const paquete = JSON.parse(leer('package.json'));

describe('de dónde sale la barra', () => {
	test('del paquete, y no de una copia local', () => {
		expect(layout).toContain("from '@vasakgroup/vue-libvasak'");
		expect(layout).toContain('<SideBar');
		expect(layout).not.toContain('SidebarComponent');
	});

	test('y el paquete es una dependencia declarada', () => {
		expect(paquete.dependencies['@vasakgroup/vue-libvasak']).toBeTruthy();
	});

	test('la copia local ya no está', () => {
		// Mientras el archivo exista, alguien lo va a importar sin querer y las
		// dos barras se van a separar otra vez.
		expect(() => leer('src/components/sidebar/SidebarComponent.vue')).toThrow();
		expect(() => leer('src/types/sidebar.ts')).toThrow();
	});
});

describe('la hoja de estilos', () => {
	test('manda a Tailwind a mirar adentro del paquete', () => {
		// Tailwind no mira `node_modules`. Sin esto, las clases que sólo usa la
		// librería no llegan a la hoja y el componente se dibuja sin la mitad de
		// sus reglas: sin paddings, con los iconos enormes. No falla nada al
		// compilar ni al probar — se ve recién con la ventana abierta.
		expect(css).toContain('@source');
		expect(css).toContain('@vasakgroup/vue-libvasak');
	});
});

describe('el token de fondo', () => {
	test('el panel de contenido no usa el fondo de la ventana', () => {
		// `--ui-background` es el de **la ventana**; lo que se apoya encima va en
		// superficie. Con el fondo de ventana, el panel se lee como un
		// rectángulo apenas más claro en vez de como algo apoyado.
		const contenido = layout.slice(layout.indexOf('<main'), layout.indexOf('</main>'));
		expect(contenido).toContain('bg-ui-surface');
		expect(contenido).not.toContain('bg-ui-bg');
	});

	test('y ninguna tarjeta quedó con la opacidad vieja', () => {
		// La barra está en `/70` y las tarjetas estaban en `/40`: las dos mitades
		// de la pantalla se veían como dos materiales distintos sobre la misma
		// ventana.
		const vue = new Bun.Glob('src/**/*.vue');
		const rezagadas: string[] = [];
		let miradas = 0;
		for (const ruta of vue.scanSync({ cwd: RAIZ })) {
			miradas++;
			if (leer(ruta).includes('bg-ui-surface/40')) {
				rezagadas.push(ruta);
			}
		}
		// Primero que haya mirado algo: esta prueba afirma una ausencia.
		expect(miradas).toBeGreaterThan(30);
		expect(rezagadas).toEqual([]);
	});
});

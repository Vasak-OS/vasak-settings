/**
 * El marco de la ventana, y la pantalla que elige de qué lado va la barra.
 *
 * Dos cosas relacionadas: el Centro de Control dejó de dibujar su propia
 * ventana —ahora es el `WindowFrame` de la librería, el mismo de todas—, y es
 * también la aplicación desde donde se elige dónde queda la barra de **todas**
 * las ventanas.
 *
 * Se lee del fuente, como el resto de las pruebas de estructura de este
 * repositorio: son afirmaciones sobre de dónde sale el componente y sobre cómo
 * está cableada la pantalla nueva. Lo que el marco hace —acomodarse a los
 * cuatro lados, encoger las pestañas— se prueba en la librería, montándolo. Lo
 * que la pantalla escribe se prueba en `valores-de-config.test.ts`, que es el
 * único lugar donde hay lógica de verdad.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');

const layout = leer('src/layouts/WindowAppLayout.vue');
const rutas = leer('src/routes/index.ts');
const menu = leer('src/composables/menu.ts');
const pantalla = leer('src/views/AppearanceWindowsView.vue');
const es = leer('src-tauri/locales/es.yml');
const en = leer('src-tauri/locales/en.yml');

describe('el marco de la ventana', () => {
	test('sale de la librería y no está dibujado acá', () => {
		expect(layout).toContain('<WindowFrame');
		// `rounded-corner-window` es la esquina de la ventana, y ahora la pone el
		// marco. Con dos, el borde y el fondo se dibujan dos veces.
		expect(layout).not.toContain('rounded-corner-window');
	});

	test('y la barra propia ya no existe', () => {
		// Mientras el archivo exista, alguien lo va a importar sin querer.
		expect(() => leer('src/components/topbar/TopBarComponent.vue')).toThrow();
		expect(layout).not.toContain('TopBarComponent');
	});

	test('el nombre va en `centro` y no como una columna más', () => {
		// Estaba centrado con un tercer `div` vacío tirando contra el
		// `justify-between`, y eso lo deja centrado respecto de lo que sobra
		// entre el icono y los controles: los tres botones ocupan bastante más
		// que el icono, así que se corría.
		expect(layout).toContain('#centro');
		expect(layout).toContain('#identidad');
		expect(layout).not.toContain('<div></div>');
	});

	test('los botones llevan su nombre traducido', () => {
		// Sin esto salen en inglés, que son los valores por omisión de la
		// librería. Es el nombre accesible, así que lo único que lo dice es el
		// lector de pantalla.
		for (const clave of ['minimize', 'maximize', 'close']) {
			expect(layout).toContain(`t('windowControls.${clave}')`);
		}
	});
});

describe('la pantalla de las ventanas', () => {
	test('está en el menú, en Apariencia', () => {
		expect(menu).toContain("id: 'appearance-windows'");
		expect(menu).toContain("t('sidebar.items.appearanceWindows')");
	});

	test('y tiene su ruta con el mismo nombre', () => {
		// El menú navega por nombre de ruta: con el `id` y el `name` distintos,
		// hacer clic no lleva a ningún lado y no hay ningún error.
		expect(rutas).toContain("name: 'appearance-windows'");
		expect(rutas).toContain("import('@/views/AppearanceWindowsView.vue')");
	});

	test('escribe con el mismo ayudante que se prueba aparte', () => {
		// La lógica —qué se considera una posición válida, y no pisar lo que ya
		// hubiera en la sección— vive en `tools/valores-de-config`, que se
		// prueba sin montar nada.
		expect(pantalla).toContain('escribirPosicionDeLaBarra');
		expect(pantalla).toContain('posicionDeLaBarra');
	});

	test('usa el `select` de la librería, con su etiqueta asociada', () => {
		// Un `<label>` suelto al lado no está asociado a nada: un lector de
		// pantalla anuncia un desplegable sin nombre, y hacer clic en el texto
		// no abre la lista.
		expect(pantalla).toContain('<SelectField');
		expect(pantalla).toContain(':label="t(\'views.appearanceWindows.barPosition\')"');
	});

	test('los cuatro lados salen de la lista y no escritos a mano', () => {
		// Escritos a mano, agregar un lado en la librería deja esta pantalla
		// sin ofrecerlo y nadie se entera.
		expect(pantalla).toContain('v-for="lado in POSICIONES_DE_LA_BARRA"');
	});

	test('y los cuatro tienen texto en los dos idiomas', () => {
		for (const lado of ['top', 'bottom', 'left', 'right']) {
			expect(es).toContain(`      ${lado}:`);
			expect(en).toContain(`      ${lado}:`);
		}
	});
});

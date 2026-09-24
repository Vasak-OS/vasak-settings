/**
 * Lo que Configuración deja de tener propio.
 *
 * Eran cinco piezas usadas en unos cien lugares: el aviso —treinta y un
 * usos—, el interruptor —veinte—, el campo de texto —doce—, el modal y la
 * barra de progreso. Las cinco existían igual en la librería, con otros
 * nombres y otra suerte.
 *
 * Y ahora son seis: se suma `FormGroup`, que eran dieciocho vistas importando
 * una copia idéntica a la de la librería salvo la sangría y el color de la
 * etiqueta.
 *
 * Lo que se comprueba acá es lo que la mudanza cambia y podría romperse
 * callado: que el aviso siga diciendo lo que decía después de pasar de
 * propiedad a ranura en sesenta y nueve etiquetas, que el modal —que no se
 * anunciaba como diálogo ni atrapaba el foco— ahora haga las dos cosas, y que
 * la barra de progreso diga su valor a quien no la ve, que era lo único que le
 * faltaba y no se notaba.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
	ProgressBar as BarraDeLaLibreria,
	olvidarLosIconosDelTema,
} from '@vasakgroup/vue-libvasak';
import { mount, type VueWrapper } from '@vue/test-utils';
import { Glob } from 'bun';
import { nextTick } from 'vue';
import ModalDialog from '@/components/ui/ModalDialog.vue';
import ProgressBar from '@/components/ui/ProgressBar.vue';

const montadas: VueWrapper[] = [];

function montar(componente: Parameters<typeof mount>[0], opciones: Record<string, unknown> = {}) {
	const vista = mount(componente, { attachTo: document.body, ...opciones } as never);
	montadas.push(vista);
	return vista;
}

const elPanel = () => document.body.querySelector<HTMLElement>('[role="dialog"]');

beforeEach(() => {
	olvidarLosIconosDelTema();
});

afterEach(() => {
	for (const vista of montadas.splice(0)) vista.unmount();
	// El panel se teletransporta al `body`, así que no se va con el desmontaje.
	for (const suelto of document.body.querySelectorAll('[role="dialog"]')) {
		suelto.parentElement?.remove();
	}
});

describe('el aviso, en las sesenta y nueve etiquetas convertidas', () => {
	// El mensaje pasó de propiedad a ranura, con un guion, en treinta y una
	// pantallas. Si alguna hubiera quedado con `:message`, la librería la
	// ignoraría —no es una prop suya, cae como atributo— y el aviso se
	// dibujaría **vacío**: ni error, ni aviso de Vue, ni chequeo en rojo.
	//
	// Por eso esto mira el fuente y no monta: lo que puede fallar es una
	// etiqueta suelta entre sesenta y nueve, no el componente.
	const raiz = new URL('../src/', import.meta.url).pathname;
	const fuentes = [...new Glob('**/*.vue').scanSync(raiz)].map((ruta) => ({
		ruta,
		texto: readFileSync(raiz + ruta, 'utf8'),
	}));

	function conteniendo(patron: RegExp): string[] {
		return fuentes.filter(({ texto }) => patron.test(texto)).map(({ ruta }) => ruta);
	}

	test('ninguna quedó pasando el mensaje como propiedad', () => {
		expect(conteniendo(/<AlertMessage\b[^>]*:?message=/s)).toEqual([]);
	});

	test('y todas siguen diciendo algo', () => {
		// Una etiqueta vacía es el otro final del mismo error: la conversión
		// sacó el `:message` y no puso nada en su lugar.
		expect(conteniendo(/<AlertMessage\b[^>]*>\s*<\/AlertMessage>/s)).toEqual([]);
	});

	test('y ninguna pantalla importa el aviso viejo', () => {
		expect(conteniendo(/components\/ui\/AlertMessage\.vue/)).toEqual([]);
	});

	test('el guardia encuentra lo que busca', () => {
		// Sin esto, un patrón que dejara de reconocer la forma que busca dejaría
		// las tres pruebas de arriba en verde sin haber mirado nada.
		expect(/<AlertMessage\b[^>]*:?message=/s.test('<AlertMessage :message="x" />')).toBe(true);
		expect(/<AlertMessage\b[^>]*>\s*<\/AlertMessage>/s.test('<AlertMessage></AlertMessage>')).toBe(
			true
		);
	});
});

describe('el modal', () => {
	function abrir(props: Record<string, unknown> = {}) {
		const vista = montar(ModalDialog, {
			props: { open: false, title: 'Borrar el atajo', ...props },
			slots: { default: '<button class="dentro">Confirmar</button>' },
		});
		return vista;
	}

	test('se anuncia como diálogo, que antes no', async () => {
		// La copia de acá era un `div` con un velo: ni `role`, ni `aria-modal`,
		// ni nombre. Un lector de pantalla no tenía forma de saber que lo de
		// atrás había dejado de estar disponible.
		const vista = abrir();
		await vista.setProps({ open: true });
		await nextTick();

		expect(elPanel()).not.toBeNull();
		expect(elPanel()?.getAttribute('aria-modal')).toBe('true');
	});

	test('y con su título, no con un nombre escrito aparte', async () => {
		const vista = abrir({ title: 'Borrar el atajo' });
		await vista.setProps({ open: true });
		await nextTick();

		const id = elPanel()?.getAttribute('aria-labelledby');
		expect(id).toBeTruthy();
		expect(document.getElementById(id as string)?.textContent).toContain('Borrar el atajo');
	});

	test('Escape lo cierra, que antes sólo lo hacía el clic en el velo', async () => {
		const vista = abrir();
		await vista.setProps({ open: true });
		await nextTick();

		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await nextTick();

		expect(vista.emitted('close')).toHaveLength(1);
	});

	test('el contenido sigue adentro del panel', async () => {
		// La ranura pasó por tres piezas nuevas; si se hubiera desconectado, lo
		// que se le ponga desaparece sin dar ningún error.
		const vista = abrir();
		await vista.setProps({ open: true });
		await nextTick();

		expect(elPanel()?.querySelector('.dentro')).not.toBeNull();
	});
});

describe('la barra de progreso', () => {
	test('ahora dice su valor a quien no la ve', () => {
		// Es lo único que le faltaba, y no se notaba: el espacio en disco y la
		// memoria se leían sólo mirando el ancho de una caja de colores.
		const vista = montar(ProgressBar, { props: { label: 'Disco', value: 62.5 } });
		const barra = vista.find('[role="progressbar"]');

		expect(barra.exists()).toBe(true);
		expect(barra.attributes('aria-valuenow')).toBe('62.5');
		expect(barra.attributes('aria-label')).toBe('Disco');
	});

	test('y el número escrito al lado dice lo mismo que la barra', () => {
		// Los dos leen el mismo valor acotado: si se separan, uno miente.
		const vista = montar(ProgressBar, { props: { label: 'Memoria', value: 140 } });

		expect(vista.text()).toContain('100.0%');
		expect(vista.find('[role="progressbar"]').attributes('aria-valuenow')).toBe('100');
	});

	test('la barra es la de la librería y no una dibujada acá', () => {
		const vista = montar(ProgressBar, { props: { label: 'Disco', value: 10 } });

		expect(vista.findComponent(BarraDeLaLibreria).exists()).toBe(true);
	});
});


/**
 * El grupo de formulario, la sexta pieza que se va.
 *
 * Eran dieciocho vistas importando `@/components/ui/FormGroup.vue`, idéntica a
 * la de la librería salvo la sangría y una clase: la de la librería le pone
 * `text-primary` a la etiqueta y la copia dejaba el color de texto de siempre.
 *
 * Eso **sí cambia cómo se ve**: las etiquetas de todos los formularios de
 * Configuración pasan a ir en el color de marca. Es una decisión tomada a
 * propósito, no un descuido — la alternativa era sacarle el color a la librería
 * o pasar `label-class` en dieciocho lugares.
 */
describe('el grupo de formulario', () => {
	const FUENTE = new URL('../src/', import.meta.url).pathname;
	const fuentes = [...new Glob('**/*.vue').scanSync(FUENTE)];

	test('hay algo que mirar', () => {
		expect(fuentes.length).toBeGreaterThan(30);
	});

	test('ya no hay copia propia', () => {
		expect(fuentes.filter((ruta) => ruta.endsWith('ui/FormGroup.vue'))).toEqual([]);
	});

	test('y nadie la importa de acá adentro', () => {
		const culpables = fuentes.filter((ruta) =>
			readFileSync(FUENTE + ruta, 'utf8').includes('components/ui/FormGroup.vue')
		);

		expect(culpables).toEqual([]);
	});

	test('las dieciocho la piden a la librería', () => {
		// Si alguna la usa sin importarla, Vue dibuja un elemento desconocido y
		// no falla: la vista queda sin el campo y nadie se entera.
		const culpables = fuentes.filter((ruta) => {
			const texto = readFileSync(FUENTE + ruta, 'utf8');
			if (!/<FormGroup\b/.test(texto)) return false;
			return !/import \{[^}]*\bFormGroup\b[^}]*\} from '@vasakgroup\/vue-libvasak'/.test(texto);
		});

		expect(culpables).toEqual([]);
	});
});

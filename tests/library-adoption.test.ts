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
import { olvidarLosIconosDelTema, ProgressBar } from '@vasakgroup/vue-libvasak';
import { mount, type VueWrapper } from '@vue/test-utils';
import { Glob } from 'bun';
import { nextTick } from 'vue';
import ShortcutDeleteModal from '@/components/shortcuts/ShortcutDeleteModal.vue';
import MountedDiskCard from '@/components/systeminformation/MountedDiskCard.vue';

const mountedViews: VueWrapper[] = [];

function mountAttached(
	component: Parameters<typeof mount>[0],
	options: Record<string, unknown> = {}
) {
	const view = mount(component, { attachTo: document.body, ...options } as never);
	mountedViews.push(view);
	return view;
}

const dialogPanel = () => document.body.querySelector<HTMLElement>('[role="dialog"]');

beforeEach(() => {
	olvidarLosIconosDelTema();
});

afterEach(() => {
	for (const view of mountedViews.splice(0)) view.unmount();
	// El panel se teletransporta al `body`, así que no se va con el desmontaje.
	for (const leftover of document.body.querySelectorAll('[role="dialog"]')) {
		leftover.parentElement?.remove();
	}
});

/**
 * El archivo sin lo que está comentado.
 *
 * Sin esto, un `// import { FormGroup } from '@vasakgroup/vue-libvasak';`
 * comentado alcanza para que las comprobaciones de abajo pasen, y la vista
 * queda **sin el componente**: Vue dibuja un elemento desconocido, no falla, y
 * el campo simplemente no está. Lo mismo al revés — un import viejo comentado
 * haría fallar una guardia sin que haya nada mal.
 *
 * Se sacan los bloques `/* *\/` y las líneas que **empiezan** con `//`, no
 * cualquier `//`: así una URL adentro de una cadena no se lleva media línea
 * puesta.
 *
 * **Por qué el bucle y no un `.replace` suelto.** Una sola pasada deja pasar los
 * marcadores anidados: en `<!-- <!-- x --> -->`, la expresión no codiciosa se
 * come el tramo del medio y devuelve un texto que **todavía tiene** `<!--`. Con
 * el comentario de un `.vue` real no cambia nada, pero es una guardia: lo que
 * lee es código que alguien va a escribir, y dejar una sanitización que se
 * aplica «casi siempre» es lo que CodeQL marca —con razón— como incompleta. Se
 * repite hasta que el texto deja de cambiar.
 *
 * Va una sola vez y a nivel de módulo: había dos copias idénticas, una por
 * bloque, que es exactamente la clase de duplicado que este archivo existe para
 * cazar en el código de la aplicación.
 */
function stripComments(text: string): string {
	let previous: string;
	let current = text;

	do {
		previous = current;
		current = current.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
	} while (current !== previous);

	return current
		.split('\n')
		.filter((line) => !/^\s*\/\//.test(line))
		.join('\n');
}

describe('el aviso, en las sesenta y nueve etiquetas convertidas', () => {
	// El mensaje pasó de propiedad a ranura, con un guion, en treinta y una
	// pantallas. Si alguna hubiera quedado con `:message`, la librería la
	// ignoraría —no es una prop suya, cae como atributo— y el aviso se
	// dibujaría **vacío**: ni error, ni aviso de Vue, ni chequeo en rojo.
	//
	// Por eso esto mira el fuente y no monta: lo que puede fallar es una
	// etiqueta suelta entre sesenta y nueve, no el componente.
	const root = new URL('../src/', import.meta.url).pathname;
	const sources = [...new Glob('**/*.vue').scanSync(root)].map((path) => ({
		path,
		text: readFileSync(root + path, 'utf8'),
	}));

	function containing(patron: RegExp): string[] {
		return sources.filter(({ text }) => patron.test(text)).map(({ path }) => path);
	}

	test('ninguna quedó pasando el mensaje como propiedad', () => {
		expect(containing(/<AlertMessage\b[^>]*:?message=/s)).toEqual([]);
	});

	test('y todas siguen diciendo algo', () => {
		// Una etiqueta vacía es el otro final del mismo error: la conversión
		// sacó el `:message` y no puso nada en su lugar.
		expect(containing(/<AlertMessage\b[^>]*>\s*<\/AlertMessage>/s)).toEqual([]);
	});

	test('y ninguna pantalla importa el aviso viejo', () => {
		expect(containing(/components\/ui\/AlertMessage\.vue/)).toEqual([]);
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

/**
 * El modal, que dejó de ser una capa propia (`ModalDialog`) y es la composición
 * de `Dialog` de la librería. Se prueba sobre un consumidor de verdad —el que
 * pregunta antes de borrar un atajo—, que es donde se ve si la mudanza dejó
 * algo en el camino: el nombre, el Escape, el contenido y el botón de cerrar
 * escrito, que es el formato de Configuración.
 */
describe('el modal', () => {
	const shortcut = { keys: '<super> KEY_T', action: 'command', target: 'vasak-terminal' };

	function open() {
		return mountAttached(ShortcutDeleteModal, {
			props: { open: true, shortcut },
			global: { stubs: { ThemeIcon: true } },
		});
	}

	test('se anuncia como diálogo', async () => {
		open();
		await nextTick();

		expect(dialogPanel()).not.toBeNull();
		expect(dialogPanel()?.getAttribute('aria-modal')).toBe('true');
	});

	test('y con su título, no con un nombre escrito aparte', async () => {
		open();
		await nextTick();

		const id = dialogPanel()?.getAttribute('aria-labelledby');
		expect(id).toBeTruthy();
		expect(document.getElementById(id as string)?.textContent?.trim()).toBeTruthy();
	});

	test('Escape lo cierra y avisa que se canceló', async () => {
		const view = open();
		await nextTick();

		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await nextTick();

		expect(view.emitted('cancel')).toHaveLength(1);
		expect(view.emitted('update:open')?.[0]).toEqual([false]);
	});

	test('el contenido sigue adentro del panel', async () => {
		// La ranura pasó por cuatro piezas; si se hubiera desconectado, lo que
		// se le ponga desaparece sin dar ningún error.
		open();
		await nextTick();

		expect(dialogPanel()?.textContent).toContain('vasak-terminal');
	});

	test('el cerrar es un botón con la palabra, arriba, como antes', async () => {
		// `closeStyle="label"`: la forma que tenía la copia de acá. Con el de
		// icono la pantalla cambiaría de formato.
		const view = open();
		await nextTick();

		const buttons = [...(dialogPanel()?.querySelectorAll('button') ?? [])];
		const close = buttons.find(
			(b) => b.textContent?.trim() === 'common.close' || b.textContent?.trim() === 'Cerrar'
		);
		expect(close).toBeDefined();
		close?.click();
		await nextTick();
		expect(view.emitted('cancel')).toHaveLength(1);
	});
});

/**
 * La fila de progreso: la etiqueta, el porcentaje con un decimal y la barra.
 * Era la capa `ProgressBar` de acá; ahora es `show-value` y `decimals` de la de
 * la librería. Se prueba sobre la tarjeta del disco, que es quien la usa.
 */
describe('la barra de progreso', () => {
	const disk = {
		device: '/dev/nvme0n1p2',
		mountpoint: '/',
		mountpoints: ['/'],
		fstype: 'btrfs',
		total_gb: 100,
		used_gb: 62.5,
		available_gb: 37.5,
		usage_percent: 62.5,
	};

	test('dice su valor a quien no la ve', () => {
		const view = mountAttached(MountedDiskCard, { props: { disk } });
		const bar = view.find('[role="progressbar"]');

		expect(bar.exists()).toBe(true);
		expect(bar.attributes('aria-valuenow')).toBe('62.5');
	});

	test('y el número escrito al lado dice lo mismo, con un decimal', () => {
		// Los dos leen el mismo valor acotado: si se separan, uno miente.
		const view = mountAttached(MountedDiskCard, {
			props: { disk: { ...disk, usage_percent: 140 } },
		});

		expect(view.text()).toContain('100.0%');
		expect(view.find('[role="progressbar"]').attributes('aria-valuenow')).toBe('100');
	});

	test('la barra es la de la librería y no una dibujada acá', () => {
		const view = mountAttached(MountedDiskCard, { props: { disk } });

		expect(view.findComponent(ProgressBar).exists()).toBe(true);
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
	const SOURCE = new URL('../src/', import.meta.url).pathname;
	const sources = [...new Glob('**/*.vue').scanSync(SOURCE)];

	test('hay algo que mirar', () => {
		expect(sources.length).toBeGreaterThan(30);
	});

	test('ya no hay copia propia', () => {
		expect(sources.filter((path) => path.endsWith('ui/FormGroup.vue'))).toEqual([]);
	});

	/**
	 * El archivo sin lo que está comentado.
	 *
	 * Sin esto, un `// import { FormGroup } from '@vasakgroup/vue-libvasak';`
	 * comentado alcanza para que la comprobación de abajo pase, y la vista queda
	 * **sin el componente**: Vue dibuja un elemento desconocido, no falla, y el
	 * campo simplemente no está. Lo mismo al revés — un import viejo comentado
	 * haría fallar la guardia sin que haya nada mal.
	 *
	 * Se sacan los bloques `/* *\/` y las líneas que **empiezan** con `//`, no
	 * cualquier `//`: así una URL adentro de una cadena no se lleva media línea
	 * puesta.
	 */
	const read = (path: string) => stripComments(readFileSync(SOURCE + path, 'utf8'));

	test('y nadie la importa de acá adentro', () => {
		const offenders = sources.filter((path) => read(path).includes('components/ui/FormGroup.vue'));

		expect(offenders).toEqual([]);
	});

	test('la guardia mira importaciones vivas, no texto comentado', () => {
		// Un import comentado no es un import: el componente no queda disponible.
		const commented = "// import { FormGroup } from '@vasakgroup/vue-libvasak';";

		expect(stripComments(commented)).toBe('');
		// Y una URL adentro de una cadena sobrevive entera.
		expect(stripComments("const u = 'https://vasak.net.ar';")).toContain('https://vasak.net.ar');
	});

	test('y no deja marcadores atrás cuando vienen anidados', () => {
		// Una sola pasada devuelve `<!--  -->`, que todavía tiene marcador: la
		// no codiciosa se come el tramo del medio y deja los extremos pegados.
		// Es lo que CodeQL marca como sanitización incompleta, y con un import
		// escondido ahí adentro la guardia miraría un texto que no es el que se
		// compila.
		expect(stripComments('<!-- <!-- x --> -->')).not.toContain('<!--');
		expect(stripComments('/* /* x */ */')).not.toContain('/*');
		// Y lo de siempre sigue andando igual.
		expect(stripComments('<!-- fuera -->adentro')).toBe('adentro');
	});

	test('las dieciocho la piden a la librería', () => {
		// Si alguna la usa sin importarla, Vue dibuja un elemento desconocido y
		// no falla: la vista queda sin el campo y nadie se entera.
		const offenders = sources.filter((path) => {
			const text = read(path);
			if (!/<FormGroup\b/.test(text)) return false;
			return !/import \{[^}]*\bFormGroup\b[^}]*\} from '@vasakgroup\/vue-libvasak'/.test(text);
		});

		expect(offenders).toEqual([]);
	});
});

/**
 * ── La tarjeta de dispositivo de Bluetooth ─────────────────────────────────
 *
 * Era la séptima copia: `BluetoothDeviceCard.vue` dibujaba a mano lo que la
 * `DeviceCard` de la librería ya hacía. La adopción esperó a que la librería
 * aprendiera lo único que la copia sabía y ella no — pintar de rojo el botón
 * que desconecta, que llegó en la 1.9.0 con `actionKind`.
 *
 * Eso es lo que estas pruebas cuidan: no que la tarjeta exista, sino que la
 * fila de un dispositivo **conectado** siga ofreciendo su acción en rojo. Sin
 * `action-kind`, la adopción compila, se ve bien y el botón de desconectar
 * queda del mismo color que el de conectar — que es exactamente la clase de
 * detalle que una mudanza se lleva puesta sin que nadie lo note.
 */
describe('la tarjeta de dispositivo de Bluetooth', () => {
	// Propios: los del bloque de arriba viven dentro de aquel `describe`.
	const SOURCE = new URL('../src/', import.meta.url).pathname;
	const sources = [...new Glob('**/*.vue').scanSync(SOURCE)];
	const VIEW = 'views/NetworkBluetoothView.vue';

	const view = () => stripComments(readFileSync(SOURCE + VIEW, 'utf8'));

	test('ya no hay copia propia', () => {
		expect(sources.filter((path) => path.endsWith('cards/BluetoothDeviceCard.vue'))).toEqual([]);
	});

	test('y nadie la importa de acá adentro', () => {
		const offenders = sources.filter((path) =>
			stripComments(readFileSync(SOURCE + path, 'utf8')).includes('BluetoothDeviceCard')
		);

		expect(offenders).toEqual([]);
	});

	test('la vista la pide a la librería', () => {
		// Si la usa sin importarla, Vue dibuja un elemento desconocido y no
		// falla: la lista de dispositivos queda vacía y nadie se entera.
		const text = view();

		expect(text).toMatch(/<DeviceCard\b/);
		expect(text).toMatch(/import \{[^}]*\bDeviceCard\b[^}]*\} from '@vasakgroup\/vue-libvasak'/);
	});

	test('el botón de desconectar sigue siendo el rojo, y el de conectar no', () => {
		const text = view();
		// Las dos tarjetas de la vista, en orden: la del dispositivo conectado
		// —que desconecta— y la del disponible —que conecta—.
		const cards = text.split(/<DeviceCard\b/).slice(1);

		expect(cards).toHaveLength(2);

		const [connected, available] = cards.map((t) => t.slice(0, t.indexOf('/>')));

		expect(connected).toContain('action-kind="destructive"');
		expect(connected).toContain('is-connected');
		expect(available).not.toContain('action-kind');
	});

	test('y la fila conectada muestra su indicador de estado', () => {
		// La copia dibujaba un punto verde cuando el dispositivo estaba
		// conectado. En la librería eso no viene solo: hay que pedirlo.
		const connected = view().split(/<DeviceCard\b/)[1];

		expect(connected.slice(0, connected.indexOf('/>'))).toContain('show-status-indicator');
	});
});

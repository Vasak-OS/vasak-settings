/**
 * Los botones de la ventana y el borde de afuera, en Apariencia → Ventanas.
 *
 * La pantalla se monta de verdad: lo que importa es que muestre lo que está
 * guardado en `vasak.conf` y que, al aplicar, escriba las cuatro opciones sin
 * llevarse puesto lo demás del archivo. La lógica de lectura y escritura se
 * prueba sin montar nada en `config-values.test.ts`; acá se mira que la
 * pantalla esté cableada a ella.
 *
 * Del plugin de configuración se espían `readConfig`, `writeConfig` y
 * `useConfigStore` sobre el módulo, como en `scheme-service.test.ts`, y no con
 * un `mock.module`: otro doble del mismo módulo da verde o rojo según el orden
 * de la corrida. Los espías se restauran después de cada prueba.
 *
 * Los desplegables se buscan por sus opciones y no por su etiqueta: el i18n
 * puede estar doblado por otro archivo o caer a la clave, y la prueba no tiene
 * que depender de cuál de las dos cosas pasó.
 */

import { afterEach, beforeEach, describe, expect, type Mock, spyOn, test } from 'bun:test';
import * as plugin from '@vasakgroup/plugin-config-manager';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import AppearanceWindowsView from '../src/views/AppearanceWindowsView.vue';

const STYLES = ['default', 'macos'];
const ORDERS = ['default', 'reversed'];
const WIDTHS = ['normal', 'thick'];
const COLORS = ['scheme', 'accent'];

/** Lo que hay en el archivo antes de abrir la pantalla. */
function storedConfig(): Record<string, unknown> {
	return {
		style: {
			darkmode: true,
			'color-scheme': 'nord',
			radius: 12,
			border: { width: 'thick', color: 'accent', glow: true },
		},
		window: {
			barPosition: 'left',
			controlsStyle: 'macos',
			controlsOrder: 'reversed',
			futureKey: 1,
		},
		desktop: { wallpaper: [], iconsize: 48, showfiles: true, showhiddenfiles: false },
		fonts: { terminal: '', title: '', apps: '' },
		icons: { dark: '', light: '' },
		'x-puesto-a-mano': { nota: 'no se toca' },
	};
}

let view: VueWrapper | null = null;
let calls: string[] = [];
let stored: Record<string, unknown> = storedConfig();
let readSpy: Mock<typeof plugin.readConfig>;
let writeSpy: Mock<typeof plugin.writeConfig>;
let storeSpy: Mock<typeof plugin.useConfigStore>;

beforeEach(() => {
	calls = [];
	stored = storedConfig();
	readSpy = spyOn(plugin, 'readConfig').mockImplementation(async () => {
		calls.push('readConfig');
		return structuredClone(stored) as unknown as plugin.VSKConfig;
	});
	writeSpy = spyOn(plugin, 'writeConfig').mockImplementation(async () => {
		calls.push('writeConfig');
	});
	storeSpy = spyOn(plugin, 'useConfigStore').mockImplementation(
		() =>
			({
				loadConfig: async () => {
					calls.push('loadConfig');
				},
			}) as unknown as ReturnType<typeof plugin.useConfigStore>
	);
});

afterEach(() => {
	view?.unmount();
	view = null;
	readSpy.mockRestore();
	writeSpy.mockRestore();
	storeSpy.mockRestore();
});

async function mountView() {
	view = mount(AppearanceWindowsView, { global: { stubs: { ThemeIcon: true } } });
	await flushPromises();
	return view;
}

/** El `select` cuyas opciones son exactamente éstas. */
function selectWith(wrapper: VueWrapper, values: string[]) {
	const found = wrapper
		.findAll('select')
		.filter(
			(select) =>
				JSON.stringify(select.findAll('option').map((option) => option.element.value)) ===
				JSON.stringify(values)
		);
	if (found.length !== 1) {
		throw new Error(`se esperaba un desplegable con [${values.join(', ')}] y hay ${found.length}`);
	}
	return found[0];
}

function applyButton(wrapper: VueWrapper) {
	const button = wrapper
		.findAll('button')
		.find(
			(candidate) =>
				candidate.text().includes('applyChanges') || candidate.text() === 'Aplicar Cambios'
		);
	if (!button) throw new Error('no está el botón de aplicar');
	return button;
}

describe('la pantalla de las ventanas: botones y borde', () => {
	test('muestra las cuatro opciones guardadas', async () => {
		const wrapper = await mountView();

		expect((selectWith(wrapper, STYLES).element as HTMLSelectElement).value).toBe('macos');
		expect((selectWith(wrapper, ORDERS).element as HTMLSelectElement).value).toBe('reversed');
		expect((selectWith(wrapper, WIDTHS).element as HTMLSelectElement).value).toBe('thick');
		expect((selectWith(wrapper, COLORS).element as HTMLSelectElement).value).toBe('accent');
	});

	test('sin nada guardado muestra los valores de siempre', async () => {
		stored = { style: { radius: 8 }, desktop: {}, fonts: {}, icons: {} };
		const wrapper = await mountView();

		expect((selectWith(wrapper, STYLES).element as HTMLSelectElement).value).toBe('default');
		expect((selectWith(wrapper, ORDERS).element as HTMLSelectElement).value).toBe('default');
		expect((selectWith(wrapper, WIDTHS).element as HTMLSelectElement).value).toBe('normal');
		expect((selectWith(wrapper, COLORS).element as HTMLSelectElement).value).toBe('scheme');
	});

	test('al aplicar guarda las cuatro opciones y conserva lo demás del archivo', async () => {
		const wrapper = await mountView();

		await selectWith(wrapper, STYLES).setValue('default');
		await selectWith(wrapper, ORDERS).setValue('default');
		await selectWith(wrapper, WIDTHS).setValue('normal');
		await selectWith(wrapper, COLORS).setValue('scheme');
		await applyButton(wrapper).trigger('click');
		await flushPromises();

		expect(writeSpy).toHaveBeenCalledTimes(1);
		const written = writeSpy.mock.calls[0][0] as unknown as Record<string, unknown>;
		expect(written.window).toEqual({
			barPosition: 'left',
			controlsStyle: 'default',
			controlsOrder: 'default',
			futureKey: 1,
		});
		expect(written.style).toEqual({
			darkmode: true,
			'color-scheme': 'nord',
			radius: 12,
			border: { width: 'normal', color: 'scheme', glow: true },
		});
		expect(written['x-puesto-a-mano']).toEqual({ nota: 'no se toca' });
	});

	test('y también guarda el cambio en el otro sentido', async () => {
		stored = { style: { radius: 8 }, desktop: {}, fonts: {}, icons: {} };
		const wrapper = await mountView();

		await selectWith(wrapper, STYLES).setValue('macos');
		await selectWith(wrapper, ORDERS).setValue('reversed');
		await selectWith(wrapper, WIDTHS).setValue('thick');
		await selectWith(wrapper, COLORS).setValue('accent');
		await applyButton(wrapper).trigger('click');
		await flushPromises();

		const written = writeSpy.mock.calls[0][0] as unknown as Record<string, unknown>;
		expect(written.window).toMatchObject({ controlsStyle: 'macos', controlsOrder: 'reversed' });
		expect(written.style).toEqual({ radius: 8, border: { width: 'thick', color: 'accent' } });
	});

	test('después de guardar recarga la configuración para que esta ventana tome el borde', async () => {
		const wrapper = await mountView();
		calls = [];

		await applyButton(wrapper).trigger('click');
		await flushPromises();

		// El config-manager aplica el borde al cargar: si no se recarga después
		// de escribir, la propia ventana de Configuración sigue con el viejo.
		expect(calls).toEqual(['writeConfig', 'loadConfig']);
	});
});

describe('los textos de los botones y el borde', () => {
	const KEYS = [
		'controls',
		'controlsStyle',
		'controlsStyleHint',
		'controlsOrder',
		'controlsOrderHint',
		'border',
		'borderWidth',
		'borderHint',
		'borderColor',
		'borderColorHint',
		...STYLES.map((value) => `controlsStyles.${value}`),
		...ORDERS.map((value) => `controlsOrders.${value}`),
		...WIDTHS.map((value) => `borderWidths.${value}`),
		...COLORS.map((value) => `borderColors.${value}`),
	];

	for (const language of ['es', 'en']) {
		test(`existen y no están vacíos en ${language}`, async () => {
			// Las opciones se arman con una plantilla (`controlsStyles.${style}`),
			// así que la prueba de claves usadas no las ve: una que falte se
			// mostraría cruda, con el nombre de la clave en el desplegable.
			const text = await Bun.file(
				new URL(`../src-tauri/locales/${language}.yml`, import.meta.url)
			).text();
			const catalog = Bun.YAML.parse(text) as Record<string, unknown>;
			const section = (catalog.views as Record<string, unknown>).appearanceWindows;
			const missing = KEYS.filter((key) => {
				let node: unknown = section;
				for (const part of key.split('.')) {
					node = (node as Record<string, unknown> | undefined)?.[part];
				}
				return typeof node !== 'string' || node.trim() === '';
			});
			expect(missing).toEqual([]);
		});
	}
});

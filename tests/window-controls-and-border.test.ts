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
 * Los desplegables se buscan por sus opciones y no por su etiqueta. Desde
 * vue-libvasak 2.19.0 `SelectField` no es un `<select>` sino un botón con una
 * lista `role="listbox"`, y una opción ya no lleva su valor en el DOM: lleva el
 * texto, que es `t('…controlsStyles.macos')`. Sin catálogo el i18n cae a la
 * clave —y el doble de otro archivo también la devuelve—, así que el valor es
 * lo que va después del último punto; si alguna vez llega traducido, se busca
 * en el catálogo (ver `optionValue`). Se elige como lo hace quien usa la pantalla:
 * abriendo la lista y haciendo clic en la opción.
 */

import { afterEach, beforeEach, describe, expect, type Mock, spyOn, test } from 'bun:test';
import * as plugin from '@vasakgroup/plugin-config-manager';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import AppearanceWindowsView from '../src/views/AppearanceWindowsView.vue';

const STYLES = ['default', 'macos'];
const ORDERS = ['default', 'reversed'];
const WIDTHS = ['normal', 'thick', 'heavy'];
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

const CATALOGS = await Promise.all(
	['es', 'en'].map(
		async (language) =>
			Bun.YAML.parse(
				await Bun.file(new URL(`../src-tauri/locales/${language}.yml`, import.meta.url)).text()
			) as { views: { appearanceWindows: Record<string, Record<string, string>> } }
	)
);

/** El valor detrás del texto de una opción: la clave cruda o su traducción. */
function optionValue(text: string): string {
	const clean = text.trim();
	if (clean.startsWith('views.appearanceWindows.')) return clean.split('.').at(-1) ?? clean;
	for (const catalog of CATALOGS) {
		for (const group of Object.values(catalog.views.appearanceWindows)) {
			if (typeof group !== 'object') continue;
			const found = Object.entries(group).find(([, label]) => label === clean);
			if (found) return found[0];
		}
	}
	return clean;
}

/** Un desplegable de la pantalla, manejado como lo maneja quien la usa. */
interface Dropdown {
	/** El valor que muestra el botón cerrado. */
	shown: () => string;
	/** El valor que la lista abierta marca como elegido. */
	selectedInList: () => Promise<string | undefined>;
	/** Abrir la lista y hacer clic en la opción. */
	choose: (value: string) => Promise<void>;
}

/** El desplegable cuyas opciones son exactamente éstas. */
async function selectWith(wrapper: VueWrapper, values: string[]): Promise<Dropdown> {
	const matches: Dropdown[] = [];
	for (const button of wrapper.findAll('button[aria-haspopup="listbox"]')) {
		const root = button.element.parentElement as HTMLElement;
		const options = async () => {
			if (button.attributes('aria-expanded') !== 'true') await button.trigger('click');
			return [...root.querySelectorAll<HTMLElement>('[role="option"]')];
		};
		const close = async () => {
			if (button.attributes('aria-expanded') === 'true') await button.trigger('click');
		};
		const listed = (await options()).map((option) => optionValue(option.textContent ?? ''));
		await close();
		if (JSON.stringify(listed) !== JSON.stringify(values)) continue;
		matches.push({
			shown: () => optionValue(button.text()),
			selectedInList: async () => {
				const chosen = (await options()).find(
					(option) => option.getAttribute('aria-selected') === 'true'
				);
				await close();
				return chosen ? optionValue(chosen.textContent ?? '') : undefined;
			},
			choose: async (value) => {
				const option = (await options()).find(
					(candidate) => optionValue(candidate.textContent ?? '') === value
				);
				if (!option) throw new Error(`no está la opción ${value}`);
				option.click();
				await flushPromises();
			},
		});
	}
	if (matches.length !== 1) {
		throw new Error(
			`se esperaba un desplegable con [${values.join(', ')}] y hay ${matches.length}`
		);
	}
	return matches[0];
}

/** Lo que muestra un desplegable, cerrado y abierto: tienen que decir lo mismo. */
async function shownIn(wrapper: VueWrapper, values: string[]) {
	const dropdown = await selectWith(wrapper, values);
	const shown = dropdown.shown();
	expect(await dropdown.selectedInList()).toBe(shown);
	return shown;
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

		expect(await shownIn(wrapper, STYLES)).toBe('macos');
		expect(await shownIn(wrapper, ORDERS)).toBe('reversed');
		expect(await shownIn(wrapper, WIDTHS)).toBe('thick');
		expect(await shownIn(wrapper, COLORS)).toBe('accent');
	});

	test('sin nada guardado muestra los valores de siempre', async () => {
		stored = { style: { radius: 8 }, desktop: {}, fonts: {}, icons: {} };
		const wrapper = await mountView();

		expect(await shownIn(wrapper, STYLES)).toBe('default');
		expect(await shownIn(wrapper, ORDERS)).toBe('default');
		expect(await shownIn(wrapper, WIDTHS)).toBe('normal');
		expect(await shownIn(wrapper, COLORS)).toBe('scheme');
	});

	test('al aplicar guarda las cuatro opciones y conserva lo demás del archivo', async () => {
		const wrapper = await mountView();

		await (await selectWith(wrapper, STYLES)).choose('default');
		await (await selectWith(wrapper, ORDERS)).choose('default');
		await (await selectWith(wrapper, WIDTHS)).choose('normal');
		await (await selectWith(wrapper, COLORS)).choose('scheme');
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

		await (await selectWith(wrapper, STYLES)).choose('macos');
		await (await selectWith(wrapper, ORDERS)).choose('reversed');
		await (await selectWith(wrapper, WIDTHS)).choose('thick');
		await (await selectWith(wrapper, COLORS)).choose('accent');
		await applyButton(wrapper).trigger('click');
		await flushPromises();

		const written = writeSpy.mock.calls[0][0] as unknown as Record<string, unknown>;
		expect(written.window).toMatchObject({ controlsStyle: 'macos', controlsOrder: 'reversed' });
		expect(written.style).toEqual({ radius: 8, border: { width: 'thick', color: 'accent' } });
	});

	test('muestra el muy grueso guardado', async () => {
		stored = { style: { radius: 8, border: { width: 'heavy', color: 'scheme' } } };
		const wrapper = await mountView();

		expect(await shownIn(wrapper, WIDTHS)).toBe('heavy');
	});

	test('al elegir muy grueso guarda heavy en el archivo', async () => {
		stored = { style: { radius: 8 }, desktop: {}, fonts: {}, icons: {} };
		const wrapper = await mountView();

		await (await selectWith(wrapper, WIDTHS)).choose('heavy');
		await applyButton(wrapper).trigger('click');
		await flushPromises();

		expect(writeSpy).toHaveBeenCalledTimes(1);
		const written = writeSpy.mock.calls[0][0] as unknown as Record<string, unknown>;
		expect(written.style).toEqual({ radius: 8, border: { width: 'heavy', color: 'scheme' } });
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

/**
 * Apariencia → Panel: cuándo se escribe `panel.pinned` al guardar.
 *
 * La pantalla no debe materializar los dos anclados de fábrica como lista fija
 * sólo porque alguien guardó un indicador: si lo hiciera, el escritorio dejaría
 * de usar sus predeterminados para esa cuenta y le taparía cualquier cambio
 * futuro de ellos (hallazgo de CodeRabbit en el PR #190). La regla es: se
 * escribe `panel.pinned` sólo si la persona tocó los anclados acá, o si el
 * archivo ya traía su propia lista. La lógica pura de lectura/escritura y la
 * detección de «lista propia» (`hasPanelPinned`) se prueban sin montar nada en
 * `config-values.test.ts`; acá se mira que la pantalla esté cableada a esa regla.
 *
 * Del plugin de configuración se espían `readConfig`, `writeConfig` y
 * `useConfigStore` sobre el módulo —y `listInstalledApps` sobre su servicio—, y
 * no con `mock.module`: otro doble del mismo módulo da verde o rojo según el
 * orden de la corrida (ver `window-controls-and-border.test.ts`). Los espías se
 * restauran después de cada prueba.
 */

import { afterEach, beforeEach, describe, expect, type Mock, spyOn, test } from 'bun:test';
import * as plugin from '@vasakgroup/plugin-config-manager';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import * as installedApps from '../src/services/installed-apps.service';
import AppearancePanelView from '../src/views/AppearancePanelView.vue';

let view: VueWrapper | null = null;
let stored: Record<string, unknown> = {};
let readSpy: Mock<typeof plugin.readConfig>;
let writeSpy: Mock<typeof plugin.writeConfig>;
let storeSpy: Mock<typeof plugin.useConfigStore>;
let listSpy: Mock<typeof installedApps.listInstalledApps>;

beforeEach(() => {
	stored = { style: { radius: 8 }, desktop: {}, fonts: {}, icons: {} };
	readSpy = spyOn(plugin, 'readConfig').mockImplementation(
		async () => structuredClone(stored) as unknown as plugin.VSKConfig
	);
	writeSpy = spyOn(plugin, 'writeConfig').mockImplementation(async () => {});
	storeSpy = spyOn(plugin, 'useConfigStore').mockImplementation(
		() => ({ loadConfig: async () => {} }) as unknown as ReturnType<typeof plugin.useConfigStore>
	);
	// Sin apps instaladas alcanza para estas pruebas: no se agrega ninguna, y los
	// anclados por defecto se refrescan contra una lista vacía (quedan como están).
	listSpy = spyOn(installedApps, 'listInstalledApps').mockImplementation(async () => []);
});

afterEach(() => {
	view?.unmount();
	view = null;
	readSpy.mockRestore();
	writeSpy.mockRestore();
	storeSpy.mockRestore();
	listSpy.mockRestore();
});

async function mountView() {
	view = mount(AppearancePanelView, { global: { stubs: { ThemeIcon: true } } });
	await flushPromises();
	return view;
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

describe('Apariencia → Panel: `panel.pinned` al guardar', () => {
	test('guardar sin tocar los anclados, y sin lista previa, no escribe `panel.pinned`', async () => {
		// El archivo no trae `panel.pinned`: el panel usa sus dos de fábrica.
		const wrapper = await mountView();

		await applyButton(wrapper).trigger('click');
		await flushPromises();

		expect(writeSpy).toHaveBeenCalledTimes(1);
		const written = writeSpy.mock.calls[0][0] as unknown as Record<string, unknown>;
		// Los indicadores sí se escriben, así que la sección existe...
		expect(written.panel).toBeDefined();
		// ...pero sin materializar la lista de anclados.
		expect((written.panel as Record<string, unknown>).pinned).toBeUndefined();
	});

	test('si el archivo ya traía su lista, guardar la conserva aunque no se la toque', async () => {
		const lista = [{ id: 'x.desktop', name: 'X', icon: 'x', exec: 'x' }];
		stored = { ...stored, panel: { pinned: lista } };
		const wrapper = await mountView();

		await applyButton(wrapper).trigger('click');
		await flushPromises();

		expect(writeSpy).toHaveBeenCalledTimes(1);
		const written = writeSpy.mock.calls[0][0] as unknown as Record<string, unknown>;
		expect((written.panel as Record<string, unknown>).pinned).toEqual(lista);
	});
});

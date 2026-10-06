/**
 * El brillo viene del plugin `display-manager`: una lectura y, después, el
 * evento. Se dobla el binding local (`@/services/display-manager`), que ningún
 * otro archivo de pruebas dobla.
 */

import { describe, expect, mock, test } from 'bun:test';
import { mount } from '@vue/test-utils';
import { defineComponent, nextTick } from 'vue';

const detecting = {
	monitors: [{ output: 'eDP-1', kind: 'backlight', handle: 'intel_backlight', percent: 40 }],
	ddc: { state: 'detecting', reason: null, unsupported: [] as string[] },
};

let listener: ((report: unknown) => void) | null = null;
const unlisten = mock(() => {});
const getBrightness = mock(() => Promise.resolve(structuredClone(detecting)));

mock.module('@/services/display-manager', () => ({
	getBrightness,
	onBrightnessChanged: (handler: (report: unknown) => void) => {
		listener = handler;
		return Promise.resolve(unlisten);
	},
}));

const { useBrightness } = await import('../src/composables/useBrightness');

const translate = (key: string) =>
	({
		'views.monitors.ddcDetecting': 'Buscando…',
		'views.monitors.ddcUnsupported': '{0} no permite',
	})[key] ?? key;

function mountBrightness() {
	let api!: ReturnType<typeof useBrightness>;
	const wrapper = mount(
		defineComponent({
			setup() {
				api = useBrightness(translate);
				return () => null;
			},
		})
	);
	return { wrapper, api };
}

describe('useBrightness', () => {
	test('lee una vez, sigue el evento y suelta el oyente al cerrar', async () => {
		const { wrapper, api } = mountBrightness();
		await api.load();

		expect(api.report.value?.monitors[0].percent).toBe(40);
		expect(api.ddcMessages.value).toEqual(['Buscando…']);

		listener?.({
			monitors: [...detecting.monitors, { output: 'DP-1', kind: 'ddc', handle: '5', percent: 70 }],
			ddc: { state: 'ready', reason: null, unsupported: ['HDMI-A-1'] },
		});
		await nextTick();
		expect(api.report.value?.monitors).toHaveLength(2);
		expect(api.ddcMessages.value).toEqual(['HDMI-A-1 no permite']);

		await api.load();
		expect(getBrightness).toHaveBeenCalledTimes(2);

		wrapper.unmount();
		expect(unlisten).toHaveBeenCalledTimes(1);
	});

	test('un error de lectura queda en error, sin romper', async () => {
		getBrightness.mockImplementationOnce(() => Promise.reject('sin plugin'));
		const { wrapper, api } = mountBrightness();
		await api.load();
		expect(api.error.value).toBe('sin plugin');
		expect(api.report.value).toBeNull();
		wrapper.unmount();
	});
});

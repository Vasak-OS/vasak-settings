/**
 * Los perfiles de energía vienen del plugin `power-profiles`: una lectura al
 * abrir y, después, el evento. Se dobla el paquete
 * (`@vasakgroup/plugin-power-profiles`), que ningún otro archivo de pruebas dobla.
 */

import { describe, expect, mock, test } from 'bun:test';
import { mount } from '@vue/test-utils';
import { defineComponent, nextTick } from 'vue';

type State = {
	available: boolean;
	profiles: string[];
	activeProfile: string | null;
	performanceDegraded: string | null;
};

const initial: State = {
	available: true,
	profiles: ['power-saver', 'balanced', 'performance'],
	activeProfile: 'balanced',
	performanceDegraded: null,
};

let listener: ((state: State) => void) | null = null;
const unlisten = mock(() => {});
const getPowerState = mock(() => Promise.resolve(initial));
const setPowerProfile = mock((profile: string) =>
	Promise.resolve({ ...initial, activeProfile: profile })
);

mock.module('@vasakgroup/plugin-power-profiles', () => ({
	getPowerState,
	setPowerProfile,
	onPowerStateChanged: (handler: (state: State) => void) => {
		listener = handler;
		return Promise.resolve(unlisten);
	},
}));

const { usePowerProfiles } = await import('../src/composables/useBattery');

function mountProfiles() {
	let api!: ReturnType<typeof usePowerProfiles>;
	const wrapper = mount(
		defineComponent({
			setup() {
				api = usePowerProfiles();
				return () => null;
			},
		})
	);
	return { wrapper, api };
}

describe('usePowerProfiles', () => {
	test('lee el estado una vez y se queda escuchando', async () => {
		const { wrapper, api } = mountProfiles();
		await api.load();

		expect(getPowerState).toHaveBeenCalledTimes(1);
		expect(api.available.value).toBe(true);
		expect(api.profiles.value).toEqual(initial.profiles);
		expect(api.active.value).toBe('balanced');

		listener?.({ ...initial, activeProfile: 'power-saver' });
		await nextTick();
		expect(api.active.value).toBe('power-saver');
		expect(getPowerState).toHaveBeenCalledTimes(1);

		wrapper.unmount();
		expect(unlisten).toHaveBeenCalledTimes(1);
	});

	test('cambiar el perfil toma el estado que devuelve el plugin', async () => {
		const { wrapper, api } = mountProfiles();
		await api.load();

		await api.setActive('performance');
		expect(setPowerProfile).toHaveBeenCalledWith('performance');
		expect(api.active.value).toBe('performance');
		wrapper.unmount();
	});

	test('sin demonio queda no disponible, sin error', async () => {
		getPowerState.mockImplementationOnce(() =>
			Promise.resolve({
				available: false,
				profiles: [],
				activeProfile: null,
				performanceDegraded: null,
			})
		);
		const { wrapper, api } = mountProfiles();
		await api.load();

		expect(api.available.value).toBe(false);
		expect(api.profiles.value).toEqual([]);
		expect(api.error.value).toBe('');
		wrapper.unmount();
	});
});

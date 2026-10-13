/**
 * La sección «Tiempo de pantalla» después de mover el interruptor y el borrado
 * a `useScreenTimeSettings` (vasak-settings#145).
 *
 * Lo que la sección tiene además de los dos controles es el informe, y lo que
 * no se puede perder en la mudanza es cómo se engancha a ellos: invalidar las
 * cargas en vuelo antes de un cambio y recargar después. Sin eso, una carga de
 * antes del cambio pinta el informe viejo, o el interruptor queda diciendo lo
 * que el servicio decía antes del `SetEnabled`.
 *
 * El servicio de salud y `vasak.conf` son los de `screen-time-backend.ts`. Del
 * plugin de configuración se espía además `useConfigStore`, como en
 * `window-controls-and-border.test.ts`: la vista carga el store al montar.
 */

import { afterEach, beforeEach, describe, expect, type Mock, spyOn, test } from 'bun:test';
import * as plugin from '@vasakgroup/plugin-config-manager';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import type { ScreenTimeReport } from '../src/utils/screen-time';
import ScreenTimeView from '../src/views/ScreenTimeView.vue';
import {
	type Deferred,
	deferred,
	type FakeBackend,
	fakeBackend,
	READ_CONFIG,
	textsOf,
	WRITE_CONFIG,
} from './screen-time-backend';

/** Un informe con una sola aplicación usada una hora hoy. */
function reportWith(appName: string, enabled: boolean): ScreenTimeReport {
	const today = new Date();
	const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
	return {
		enabled,
		today: date,
		first_day: date,
		days: [
			{
				date,
				apps: [
					{
						app_id: appName.toLowerCase(),
						category: 'Network',
						millis: 3_600_000,
						hours: Array.from({ length: 24 }, (_, hour) => (hour === 10 ? 3_600_000 : 0)),
						icon: appName.toLowerCase(),
						name: appName,
					},
				],
			},
		],
	};
}

let backend: FakeBackend;
let storeSpy: Mock<typeof plugin.useConfigStore>;
let view: VueWrapper | null = null;
/** Lo que contesta cada `screen_time`, en orden; sin más, el último se repite. */
let reports: Array<ScreenTimeReport | Deferred<ScreenTimeReport>> = [];

beforeEach(() => {
	reports = [reportWith('Firefox', false)];
	backend = fakeBackend({ style: { radius: 8 }, screen_time: { enabled: false } });
	let answered = 0;
	backend.handlers.screen_time = () => {
		const next = reports[Math.min(answered++, reports.length - 1)];
		return 'promise' in next ? next.promise : next;
	};
	storeSpy = spyOn(plugin, 'useConfigStore').mockImplementation(
		() => ({ loadConfig: async () => {} }) as unknown as ReturnType<typeof plugin.useConfigStore>
	);
});

afterEach(() => {
	view?.unmount();
	view = null;
	backend.restore();
	storeSpy.mockRestore();
});

async function mountView() {
	view = mount(ScreenTimeView, { global: { stubs: { ThemeIcon: true, AppIcon: true } } });
	await flushPromises();
	return view;
}

const switchOf = (wrapper: VueWrapper) => wrapper.get('[role="switch"]');
const screenTimeCalls = () => backend.commands().filter((command) => command === 'screen_time');

describe('la sección del tiempo de pantalla: el interruptor y el informe', () => {
	test('prender el registro guarda, avisa al servicio y recién después recarga el informe', async () => {
		reports = [reportWith('Firefox', false), reportWith('Firefox', true)];
		const wrapper = await mountView();
		expect(switchOf(wrapper).attributes('aria-checked')).toBe('false');
		backend.calls.length = 0;

		await switchOf(wrapper).trigger('click');
		await flushPromises();

		expect(backend.commands()).toEqual([
			READ_CONFIG,
			WRITE_CONFIG,
			'screen_time_set_enabled',
			'screen_time',
		]);
		expect(backend.config()).toEqual({ style: { radius: 8 }, screen_time: { enabled: true } });
		expect(switchOf(wrapper).attributes('aria-checked')).toBe('true');
	});

	test('si el servicio rechaza el cambio, el interruptor vuelve y no se recarga nada', async () => {
		backend.handlers.screen_time_set_enabled = () => {
			throw new Error('sin servicio de salud');
		};
		const wrapper = await mountView();
		const before = screenTimeCalls().length;

		await switchOf(wrapper).trigger('click');
		await flushPromises();

		expect(switchOf(wrapper).attributes('aria-checked')).toBe('false');
		expect(screenTimeCalls()).toHaveLength(before);
		// El archivo vuelve a decir lo de antes.
		expect(backend.config()).toEqual({ style: { radius: 8 }, screen_time: { enabled: false } });
	});

	test('una carga que estaba en vuelo cuando se tocó el interruptor no pinta su informe viejo', async () => {
		// La primera carga (al abrir) queda colgada y contesta en medio del cambio,
		// con el estado de antes y con una aplicación que después ya no está.
		const stale = deferred<ScreenTimeReport>();
		reports = [stale, reportWith('Thunderbird', true)];
		const change = deferred();
		backend.handlers.screen_time_set_enabled = () => change.promise;
		const wrapper = await mountView();

		await switchOf(wrapper).trigger('click');
		await flushPromises();
		stale.resolve(reportWith('Firefox', false));
		await flushPromises();

		// Ni el informe viejo ni su `enabled`: mientras dura el cambio, manda él.
		expect(wrapper.text()).not.toContain('Firefox');
		expect(switchOf(wrapper).attributes('aria-checked')).toBe('true');

		change.resolve();
		await flushPromises();

		// Terminado, se recarga: el informe nuevo y el estado real.
		expect(screenTimeCalls()).toHaveLength(2);
		expect(wrapper.text()).toContain('Thunderbird');
		expect(wrapper.text()).not.toContain('Firefox');
		expect(switchOf(wrapper).attributes('aria-checked')).toBe('true');
	});

	test('cambiar de período durante el cambio no le devuelve al interruptor el estado viejo', async () => {
		// La carga del período nueva es la vigente, pero el servicio todavía no
		// procesó el `SetEnabled`: contesta apagado. Mientras dura el cambio, el
		// interruptor lo gobierna quien lo tocó.
		reports = [
			reportWith('Firefox', false),
			reportWith('Firefox', false),
			reportWith('Firefox', true),
		];
		const change = deferred();
		backend.handlers.screen_time_set_enabled = () => change.promise;
		const wrapper = await mountView();

		await switchOf(wrapper).trigger('click');
		await flushPromises();
		const today = wrapper
			.findAll('[role="radio"]')
			.find((radio) => textsOf('views.screenTime.period.today').includes(radio.text().trim()));
		if (!today) throw new Error('no está el período «hoy»');
		await today.trigger('click');
		await flushPromises();

		expect(screenTimeCalls()).toHaveLength(2);
		expect(switchOf(wrapper).attributes('aria-checked')).toBe('true');

		change.resolve();
		await flushPromises();

		expect(screenTimeCalls()).toHaveLength(3);
		expect(switchOf(wrapper).attributes('aria-checked')).toBe('true');
	});

	test('después de borrar el historial recarga el informe', async () => {
		reports = [reportWith('Firefox', true), { ...reportWith('Firefox', true), days: [] }];
		const wrapper = await mountView();
		expect(wrapper.text()).toContain('Firefox');
		const button = (key: string) => {
			const found = wrapper
				.findAll('button')
				.find((candidate) => textsOf(key).includes(candidate.text().trim()));
			if (!found) throw new Error(`no está el botón «${key}»`);
			return found;
		};

		await button('views.screenTime.clear.button').trigger('click');
		await button('views.screenTime.clear.confirmButton').trigger('click');
		await flushPromises();

		expect(backend.commands().filter((command) => command === 'clear_screen_time')).toHaveLength(1);
		expect(screenTimeCalls()).toHaveLength(2);
		expect(wrapper.text()).not.toContain('Firefox');
	});
});

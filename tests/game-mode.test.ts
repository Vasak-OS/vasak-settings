/**
 * La sección «Modo juego» (vasak-settings#156): el registro de acciones, la
 * sección `game_mode` de `vasak.conf` y las filas que se dibujan desde el
 * registro.
 *
 * El composable recibe sus dependencias por parámetro, así que no hace falta
 * ningún `mock.module`: `invoke` y el i18n ya están doblados en otros archivos
 * de la suite, y un segundo doble del mismo módulo da verde o rojo según el
 * orden de la corrida.
 */

import { describe, expect, mock, test } from 'bun:test';
import type { VSKConfig } from '@vasakgroup/plugin-config-manager';
import { mount } from '@vue/test-utils';
import GameModeActionList from '../src/components/game-mode/GameModeActionList.vue';
import { useGameModeSettings } from '../src/composables/useGameModeSettings';
import {
	GAME_MODE_ACTIONS,
	GAME_MODE_SECTION,
	isActionAvailable,
	needsInstall,
	readGameModeSettings,
	withGameModeAction,
} from '../src/utils/game-mode';

/** Una configuración mínima con lo que haga falta encima. */
function config(extra: Record<string, unknown> = {}): VSKConfig {
	return {
		style: { darkmode: false, 'color-scheme': 'vasak', radius: 8 },
		desktop: { wallpaper: [], iconsize: 48, showfiles: true, showhiddenfiles: false },
		fonts: { terminal: '', title: '', apps: '' },
		icons: { dark: '', light: '' },
		...extra,
	} as VSKConfig;
}

const ALL_ON = { do_not_disturb: true, disable_animations: true, gamemode: true };

describe('el registro de acciones', () => {
	test('trae las tres acciones de entrada, encendidas por omisión', () => {
		expect(GAME_MODE_ACTIONS.map((action) => action.key)).toEqual([
			'do_not_disturb',
			'disable_animations',
			'gamemode',
		]);
		expect(GAME_MODE_ACTIONS.every((action) => action.defaultValue)).toBe(true);
	});

	test('sólo GameMode necesita algo instalado', () => {
		const needs = GAME_MODE_ACTIONS.filter((action) => 'requires' in action);
		expect(needs.map((action) => action.key)).toEqual(['gamemode']);
	});

	test('cada acción tiene título y explicación en los dos catálogos', async () => {
		for (const lang of ['es', 'en']) {
			const yaml = await Bun.file(
				new URL(`../src-tauri/locales/${lang}.yml`, import.meta.url)
			).text();
			for (const action of GAME_MODE_ACTIONS) {
				const leaf = action.titleKey.split('.').slice(-2, -1)[0];
				expect(yaml).toContain(`      ${leaf}:\n        title:`);
			}
		}
	});
});

describe('la sección game_mode de vasak.conf', () => {
	test('sin la sección se ven los valores por omisión', () => {
		expect(readGameModeSettings(config())).toEqual(ALL_ON);
		expect(readGameModeSettings(null)).toEqual(ALL_ON);
	});

	test('una clave que falta toma su valor por omisión y la que está se respeta', () => {
		const settings = readGameModeSettings(config({ game_mode: { disable_animations: false } }));
		expect(settings).toEqual({ ...ALL_ON, disable_animations: false });
	});

	test('una clave desconocida se ignora y un valor que no es booleano vale el de omisión', () => {
		const settings = readGameModeSettings(
			config({ game_mode: { future_action: false, gamemode: 'no', do_not_disturb: false } })
		);
		expect(settings).toEqual({ ...ALL_ON, do_not_disturb: false });
		expect(settings).not.toHaveProperty('future_action');
	});

	test('una sección que no es un objeto se trata como ausente', () => {
		expect(readGameModeSettings(config({ game_mode: [false] }))).toEqual(ALL_ON);
		expect(readGameModeSettings(config({ game_mode: 'off' }))).toEqual(ALL_ON);
	});

	test('cambiar una acción toca sólo su clave y conserva lo desconocido', () => {
		const before = config({
			game_mode: { future_action: false, gamemode: false },
			widgets: [{ id: 'clock' }],
		});
		const after = withGameModeAction(before, 'disable_animations', false);

		expect(after[GAME_MODE_SECTION as keyof typeof after]).toEqual({
			future_action: false,
			gamemode: false,
			disable_animations: false,
		});
		expect((after as Record<string, unknown>).widgets).toEqual([{ id: 'clock' }]);
		// No se escribe con valores por omisión lo que no se tocó.
		expect(after).not.toHaveProperty('game_mode.do_not_disturb');
		// Y no muta lo que recibe.
		expect(before).not.toHaveProperty('game_mode.disable_animations');
	});

	test('una acción con requisito sólo está disponible si está instalado', () => {
		const gamemode = GAME_MODE_ACTIONS[2];
		expect(isActionAvailable(gamemode, { gamemode: false })).toBe(false);
		expect(isActionAvailable(gamemode, { gamemode: true })).toBe(true);
		expect(isActionAvailable(GAME_MODE_ACTIONS[0], { gamemode: false })).toBe(true);
	});

	test('sin saber si está instalado, no se ofrece ni se manda a instalar', () => {
		const gamemode = GAME_MODE_ACTIONS[2];
		expect(isActionAvailable(gamemode, { gamemode: null })).toBe(false);
		expect(needsInstall(gamemode, { gamemode: null })).toBe(false);
		expect(needsInstall(gamemode, { gamemode: false })).toBe(true);
		expect(needsInstall(gamemode, { gamemode: true })).toBe(false);
		expect(needsInstall(GAME_MODE_ACTIONS[0], { gamemode: false })).toBe(false);
	});
});

describe('useGameModeSettings', () => {
	function deps(stored: VSKConfig | null, gamemode: boolean | null | Error = true) {
		return {
			read: mock(() => Promise.resolve(stored)),
			write: mock((_value: VSKConfig) => Promise.resolve()),
			isGamemodeAvailable: mock(() =>
				gamemode instanceof Error ? Promise.reject(gamemode) : Promise.resolve(gamemode)
			),
		};
	}

	test('al abrir lee una vez y pregunta una vez por GameMode', async () => {
		const fake = deps(config({ game_mode: { gamemode: false } }));
		const api = useGameModeSettings(fake);
		await api.load();

		expect(fake.read).toHaveBeenCalledTimes(1);
		expect(fake.isGamemodeAvailable).toHaveBeenCalledTimes(1);
		expect(api.settings.value).toEqual({ ...ALL_ON, gamemode: false });
		expect(api.installed.value).toEqual({ gamemode: true });
		expect(api.loaded.value).toBe(true);
	});

	test('sin la sección se ven los valores por omisión', async () => {
		const api = useGameModeSettings(deps(config()));
		await api.load();
		expect(api.settings.value).toEqual(ALL_ON);
	});

	test('sin gamemoded en el bus, queda como no instalado', async () => {
		const api = useGameModeSettings(deps(config(), false));
		await api.load();
		expect(api.installed.value).toEqual({ gamemode: false });
	});

	test('si la consulta falla o el bus contesta a medias, no se sabe', async () => {
		for (const answer of [new Error('sin bus'), null]) {
			const api = useGameModeSettings(deps(config(), answer));
			await api.load();
			expect(api.installed.value).toEqual({ gamemode: null });
			expect(api.error.value).toBe('');
		}
	});

	test('cambiar un interruptor escribe la clave correcta sobre lo releído', async () => {
		const stored = config({ game_mode: { future_action: true }, widgets: [] });
		const fake = deps(stored);
		const api = useGameModeSettings(fake);
		await api.load();

		await api.setAction('do_not_disturb', false);

		expect(fake.read).toHaveBeenCalledTimes(2);
		expect(fake.write).toHaveBeenCalledTimes(1);
		const written = fake.write.mock.calls[0][0] as Record<string, unknown>;
		expect(written.game_mode).toEqual({ future_action: true, do_not_disturb: false });
		expect(written.widgets).toEqual([]);
		expect(api.settings.value.do_not_disturb).toBe(false);
		expect(api.saving.value).toBeNull();
	});

	test('si no se puede guardar, el interruptor vuelve a donde estaba', async () => {
		const fake = deps(config());
		fake.write.mockImplementation(() => Promise.reject(new Error('disco lleno')));
		const api = useGameModeSettings(fake);
		await api.load();

		await api.setAction('gamemode', false);

		expect(api.settings.value.gamemode).toBe(true);
		expect(api.error.value).toContain('disco lleno');
	});

	test('si la relectura no trae nada, no escribe y avisa', async () => {
		const fake = deps(null);
		const api = useGameModeSettings(fake);
		await api.setAction('gamemode', false);
		expect(fake.write).not.toHaveBeenCalled();
		expect(api.settings.value.gamemode).toBe(true);
		expect(api.error.value).not.toBe('');
	});
});

describe('GameModeActionList', () => {
	function mountList(
		installed: { gamemode: boolean | null } = { gamemode: true },
		settings = ALL_ON
	) {
		return mount(GameModeActionList, {
			props: { actions: GAME_MODE_ACTIONS, settings, installed, saving: null },
			global: { stubs: { ThemeIcon: true } },
		});
	}

	test('dibuja una fila por acción del registro, en su orden', () => {
		const wrapper = mountList();
		const rows = wrapper.findAll('[data-game-mode-action]');
		expect(rows.map((row) => row.attributes('data-game-mode-action'))).toEqual(
			GAME_MODE_ACTIONS.map((action) => action.key)
		);
		expect(wrapper.findAll('[role="switch"]')).toHaveLength(GAME_MODE_ACTIONS.length);
	});

	test('tocar un interruptor avisa con la clave de esa fila', async () => {
		const wrapper = mountList();
		await wrapper
			.find('[data-game-mode-action="disable_animations"] [role="switch"]')
			.trigger('click');
		expect(wrapper.emitted('toggle')).toEqual([['disable_animations', false]]);
	});

	test('sin gamemoded la fila queda no disponible, apagada y con cómo instalarlo', () => {
		const wrapper = mountList({ gamemode: false });
		const row = wrapper.find('[data-game-mode-action="gamemode"]');

		expect(row.attributes('data-available')).toBe('false');
		const toggle = row.find('[role="switch"]');
		expect(toggle.attributes('aria-checked')).toBe('false');
		expect(toggle.attributes('disabled')).toBeDefined();
		expect(row.find('[data-install-hint]').text()).toContain('pacman -S gamemode');

		// Las demás siguen disponibles.
		const other = wrapper.find('[data-game-mode-action="do_not_disturb"]');
		expect(other.attributes('data-available')).toBe('true');
		expect(other.find('[data-install-hint]').exists()).toBe(false);
	});

	test('antes de leer el archivo no se puede tocar ningún interruptor', () => {
		const wrapper = mount(GameModeActionList, {
			props: {
				actions: GAME_MODE_ACTIONS,
				settings: ALL_ON,
				installed: { gamemode: true },
				saving: null,
				loaded: false,
			},
			global: { stubs: { ThemeIcon: true } },
		});
		expect(wrapper.find('ul').attributes('aria-busy')).toBe('true');
		for (const toggle of wrapper.findAll('[role="switch"]')) {
			expect(toggle.attributes('disabled')).toBeDefined();
		}
	});

	test('sin saber si está, la fila queda no disponible pero sin mandar a instalar', () => {
		const wrapper = mountList({ gamemode: null });
		const row = wrapper.find('[data-game-mode-action="gamemode"]');
		expect(row.attributes('data-available')).toBe('false');
		expect(row.find('[role="switch"]').attributes('disabled')).toBeDefined();
		expect(row.find('[data-unavailable]').exists()).toBe(true);
		expect(row.find('[data-install-hint]').exists()).toBe(false);
	});

	test('con gamemoded la fila no muestra la indicación', () => {
		const wrapper = mountList({ gamemode: true });
		expect(wrapper.find('[data-install-hint]').exists()).toBe(false);
		expect(wrapper.find('[data-unavailable]').exists()).toBe(false);
	});
});

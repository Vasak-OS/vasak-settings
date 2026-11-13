import { describe, expect, test } from 'bun:test';
import type { VSKConfig } from '@vasakgroup/plugin-config-manager';
import {
	type GamificationDeps,
	useGamificationSettings,
} from '../src/composables/useGamificationSettings';

const errorSaving = (reason: string) => `no se guardó: ${reason}`;

function fake(overrides: Partial<GamificationDeps> = {}) {
	let file: Record<string, unknown> = {
		style: { darkmode: true },
		gamification: { enabled: false, xp_rate: 2 },
	};
	const log: string[] = [];
	const writes: Record<string, unknown>[] = [];
	const setCalls: boolean[] = [];
	const deps: GamificationDeps = {
		read: async () => structuredClone(file) as unknown as VSKConfig,
		write: async (config) => {
			log.push('write');
			file = structuredClone(config) as unknown as Record<string, unknown>;
			writes.push(structuredClone(file));
		},
		setEnabled: async (value) => {
			log.push(`setEnabled:${value}`);
			setCalls.push(value);
		},
		...overrides,
	};
	return { deps, log, writes, setCalls, file: () => file };
}

const flag = (config: Record<string, unknown>) =>
	(config.gamification as { enabled: boolean }).enabled;

describe('useGamificationSettings: el interruptor', () => {
	test('prenderla persiste gamification.enabled sin tocar el resto y avisa al servicio', async () => {
		const backend = fake();
		const settings = useGamificationSettings(errorSaving, backend.deps);

		await settings.toggle(true);

		expect(backend.log).toEqual(['write', 'setEnabled:true']);
		expect(backend.file()).toEqual({
			style: { darkmode: true },
			gamification: { enabled: true, xp_rate: 2 },
		});
		expect(settings.enabled.value).toBe(true);
		expect(settings.error.value).toBe('');
		expect(settings.busy.value).toBe(false);
	});

	test('si el servicio rechaza el cambio, vuelven el interruptor y el archivo, y queda el error', async () => {
		const backend = fake({
			setEnabled: async () => {
				throw new Error('sin servicio');
			},
		});
		const settings = useGamificationSettings(errorSaving, backend.deps);

		await settings.toggle(true);

		expect(settings.enabled.value).toBe(false);
		expect(backend.writes.map(flag)).toEqual([true, false]);
		expect(flag(backend.file())).toBe(false);
		expect(settings.error.value).toBe('no se guardó: Error: sin servicio');
		expect(settings.busy.value).toBe(false);
	});

	test('si no se puede escribir el archivo, no se avisa al servicio y el interruptor vuelve', async () => {
		const backend = fake({
			write: async () => {
				throw new Error('disco lleno');
			},
		});
		const settings = useGamificationSettings(errorSaving, backend.deps);

		await settings.toggle(true);

		expect(backend.setCalls).toEqual([]);
		expect(settings.enabled.value).toBe(false);
		expect(settings.error.value).toBe('no se guardó: Error: disco lleno');
	});
});

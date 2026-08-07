import { invoke } from '@tauri-apps/api/core';
import { computed, ref } from 'vue';

export interface WayfirePlugin {
	id: string;
	label: string;
	description: string;
	category: string;
	required: boolean;
	required_reason: string | null;
	enabled: boolean;
	unknown: boolean;
}

/**
 * Module-level state: every view that shows plugin switches shares one fetch
 * and one source of truth, so toggling in one place is reflected everywhere
 * without refetching wayfire.ini per component.
 */
const plugins = ref<WayfirePlugin[]>([]);
const loading = ref(false);
const error = ref('');
let loaded = false;
let inFlight: Promise<void> | null = null;

async function fetchPlugins(): Promise<void> {
	loading.value = true;
	error.value = '';

	try {
		plugins.value = await invoke<WayfirePlugin[]>('get_wayfire_plugins');
		loaded = true;
	} catch (err) {
		error.value = String(err);
	} finally {
		loading.value = false;
	}
}

export function useWayfirePlugins() {
	/** Loads once per session; concurrent callers await the same request. */
	async function load(force = false): Promise<void> {
		if (loaded && !force) return;

		if (!inFlight) {
			inFlight = fetchPlugins().finally(() => {
				inFlight = null;
			});
		}

		await inFlight;
	}

	function isEnabled(id: string): boolean {
		return plugins.value.some((plugin) => plugin.id === id && plugin.enabled);
	}

	function get(id: string): WayfirePlugin | undefined {
		return plugins.value.find((plugin) => plugin.id === id);
	}

	async function setEnabled(id: string, enabled: boolean): Promise<boolean> {
		const plugin = get(id);

		if (plugin?.required && !enabled) {
			error.value = plugin.required_reason ?? 'Este plugin no puede desactivarse.';
			return false;
		}

		// Optimistic: the switch answers immediately, and we roll back on failure.
		const previous = plugin?.enabled ?? false;
		if (plugin) plugin.enabled = enabled;
		error.value = '';

		try {
			await invoke('set_wayfire_plugin_enabled', { plugin: id, enabled });
			return true;
		} catch (err) {
			if (plugin) plugin.enabled = previous;
			error.value = String(err);
			return false;
		}
	}

	const byCategory = computed(() => {
		const groups = new Map<string, WayfirePlugin[]>();

		for (const plugin of plugins.value) {
			const existing = groups.get(plugin.category) ?? [];
			existing.push(plugin);
			groups.set(plugin.category, existing);
		}

		// Most-used first, the specialised ones last.
		const order = ['Ventanas', 'Espacios de trabajo', 'Efectos', 'Sistema', 'Otros'];

		return Array.from(groups.entries())
			.sort(([a], [b]) => {
				const indexA = order.indexOf(a);
				const indexB = order.indexOf(b);
				return (indexA === -1 ? order.length : indexA) - (indexB === -1 ? order.length : indexB);
			})
			.map(([category, items]) => ({ category, items }));
	});

	const enabledCount = computed(() => plugins.value.filter((plugin) => plugin.enabled).length);

	return {
		plugins,
		loading,
		error,
		byCategory,
		enabledCount,
		load,
		get,
		isEnabled,
		setEnabled,
	};
}

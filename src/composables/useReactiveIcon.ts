import { listen } from '@tauri-apps/api/event';
import { getIconSource, getSymbolSource } from '@vasakgroup/plugin-vicons';
import { onUnmounted, type Ref, ref } from 'vue';

type RefreshFn = () => Promise<void>;

let isListening = false;
const refreshFns = new Set<RefreshFn>();

async function ensureListening() {
	if (isListening) return;
	isListening = true;
	await listen('vicons:theme-changed', () => {
		for (const fn of refreshFns) {
			fn();
		}
	});
}

function registerRefresh(fn: RefreshFn) {
	refreshFns.add(fn);
	ensureListening();
	return () => {
		refreshFns.delete(fn);
	};
}

export function useReactiveIcon(getName: string | (() => string)): [Ref<string>, RefreshFn] {
	const icon = ref('');
	const getNameFn = typeof getName === 'function' ? getName : () => getName;

	const refresh: RefreshFn = async () => {
		const name = getNameFn();
		if (!name) {
			icon.value = '';
			return;
		}
		icon.value = await getIconSource(name);
	};

	refresh();

	const unregister = registerRefresh(refresh);
	onUnmounted(unregister);

	return [icon, refresh];
}

export function useReactiveSymbol(getName: string | (() => string)): [Ref<string>, RefreshFn] {
	const symbol = ref('');
	const getNameFn = typeof getName === 'function' ? getName : () => getName;

	const refresh: RefreshFn = async () => {
		const name = getNameFn();
		if (!name) {
			symbol.value = '';
			return;
		}
		symbol.value = await getSymbolSource(name);
	};

	refresh();

	const unregister = registerRefresh(refresh);
	onUnmounted(unregister);

	return [symbol, refresh];
}

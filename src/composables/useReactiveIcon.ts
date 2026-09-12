import { listen } from '@tauri-apps/api/event';
import { getIconSource, getSymbolSource } from '@vasakgroup/plugin-vicons';
import { getCurrentInstance, onUnmounted, type Ref, ref } from 'vue';

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

/**
 * Deja la función anotada para cuando cambie el tema, mientras el componente viva.
 *
 * El «mientras viva» es la parte importante, y por eso el `onUnmounted` está
 * acá adentro y no en quien llama: lo único que saca una función del conjunto
 * es que se desmonte el componente que la puso.
 *
 * De ahí que sin componente no se anote nada. Llamar a uno de estos composables
 * fuera del `setup` —dentro de una función que se ejecuta más tarde— dejaba una
 * función por llamada, para siempre, apuntando a un `ref` que ya nadie mira:
 * pasaba en «Cuentas en Línea», que resolvía los iconos de los proveedores así
 * y volvía a hacerlo con cada recarga del catálogo. Y no servía de nada, porque
 * refrescaba justamente los `ref` que la vista había descartado.
 *
 * El aviso está porque no anotarla es una pérdida real —el icono deja de seguir
 * al tema—, y prefiero que se vea en la consola a que se descubra mirando una
 * ventana con iconos de la variante anterior.
 */
function registerRefresh(fn: RefreshFn) {
	if (!getCurrentInstance()) {
		console.warn(
			'useReactiveIcon: llamado fuera del setup de un componente. El icono no va a seguir los cambios de tema; resolvelo con getIconSource/getSymbolSource y refrescalo desde la vista.'
		);
		return;
	}

	refreshFns.add(fn);
	ensureListening();
	onUnmounted(() => {
		refreshFns.delete(fn);
	});
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
	registerRefresh(refresh);

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
	registerRefresh(refresh);

	return [symbol, refresh];
}

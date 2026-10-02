/**
 * El esquema «Personalizado» del usuario: crearlo, editarlo, guardarlo.
 *
 * **Toda escritura de colores pasa por `updateColors`.** Es a propósito: la
 * detección de colores del fondo (Vasak-OS/vasak-settings#134) se enchufa acá,
 * mandando los colores que saque como un cambio parcial más, y los colores
 * fijados a mano se van a resolver en este mismo lugar. El editor no tiene que
 * enterarse de nada de eso.
 *
 * Los colores fijados a mano también se resuelven acá: un cambio que viene del
 * editor (`origin: 'manual'`, el de siempre) deja fijados los colores que
 * nombra, y uno que viene del fondo (`origin: 'wallpaper'`) no toca los
 * fijados. Ni el editor ni la detección tienen que saber de la otra.
 *
 * El guardado va con antirrebote: arrastrar el selector de color dispara un
 * cambio por cuadro, y cada uno reescribe el archivo y hace que todas las
 * aplicaciones abiertas reapliquen el esquema. Se espera a que el usuario se
 * quede quieto un momento y se guarda una sola vez, con todo junto.
 */

import { type Ref, ref, shallowRef } from 'vue';
import { saveUserScheme } from '@/services/scheme.service';
import type { SchemeColorPatch, SchemeEntry, SchemeFile, SchemeVariantName } from '@/types/scheme';
import {
	applyColorPatch,
	type CloneIdentity,
	cloneAsCustom,
	cloneScheme,
	SCHEME_VARIANTS,
} from '@/utils/custom-scheme';
import {
	omitPaths,
	readWallpaperState,
	uiPathsOf,
	type WallpaperColorsState,
	withWallpaperState,
} from '@/utils/wallpaper-scheme';

/** De dónde viene un cambio de colores. */
export type ColorChangeOrigin = 'manual' | 'wallpaper';

/** Cuánto se espera sin cambios antes de guardar. */
export const SAVE_DELAY_MS = 400;

export type CustomSchemeOptions = {
	/** Cómo se guarda. Por omisión, el comando del plugin. */
	save?: (scheme: SchemeFile) => Promise<SchemeEntry>;
	/** Lo que se hace después de cada guardado que salió bien. */
	onSaved?: (entry: SchemeEntry) => void | Promise<void>;
	/** El antirrebote, en milisegundos. */
	delay?: number;
};

export type CustomScheme = {
	/** El esquema tal como se está editando, con los cambios aún sin guardar. */
	scheme: Ref<SchemeFile | null>;
	saving: Ref<boolean>;
	/** El último error al guardar, o `null` si el último guardado salió bien. */
	error: Ref<unknown>;
	/** Toma un esquema ya guardado, sin escribir nada. */
	load: (scheme: SchemeFile | null) => void;
	/** Clona `base` como «Personalizado» y lo guarda en el acto, sin antirrebote. */
	createFrom: (base: SchemeFile, identity: CloneIdentity) => Promise<SchemeEntry>;
	/**
	 * El «Personalizado» que ya existe, o uno nuevo clonado de la base.
	 *
	 * Si ya existe **no se vuelve a clonar**: es del usuario, y pisarlo es lo que
	 * hace «Empezar de nuevo desde…», con confirmación. La base se pide sólo si
	 * hace falta, porque buscarla es ir al plugin.
	 */
	ensureCustom: (
		existing: SchemeFile | null,
		getBase: () => Promise<{ base: SchemeFile; identity: CloneIdentity }>
	) => Promise<{ created: boolean }>;
	/**
	 * Cambia colores de una variante y agenda el guardado. Lo manual fija los
	 * colores que toca; lo que viene del fondo no pisa los fijados.
	 */
	updateColors: (
		variant: SchemeVariantName,
		patch: SchemeColorPatch,
		origin?: ColorChangeOrigin
	) => void;
	/**
	 * Los colores sacados del fondo, en las dos variantes, y el fondo del que
	 * salieron. Se guarda **en el acto**, sin antirrebote: el cambio de fondo ya
	 * pasó y el acento tiene que seguirlo enseguida.
	 */
	applyWallpaper: (
		patches: Record<SchemeVariantName, SchemeColorPatch>,
		source: string
	) => Promise<void>;
	/** Cambia el estado del modo automático: «Seguir al fondo», los fijados. */
	updateWallpaperState: (
		change: (state: WallpaperColorsState) => WallpaperColorsState,
		options?: { immediate?: boolean }
	) => Promise<void>;
	/** Guarda ya lo que esté pendiente, si hay algo. */
	flush: () => Promise<void>;
};

export function useCustomScheme(options: CustomSchemeOptions = {}): CustomScheme {
	const save = options.save ?? saveUserScheme;
	const delay = options.delay ?? SAVE_DELAY_MS;

	const scheme = shallowRef<SchemeFile | null>(null);
	const saving = ref(false);
	const error = ref<unknown>(null);

	let timer: ReturnType<typeof setTimeout> | null = null;
	/**
	 * Los guardados, en fila. Sin esto, uno lento y el siguiente pueden terminar
	 * en cualquier orden: si el viejo termina último, `onSaved` publica un
	 * esquema viejo y el archivo depende de qué escritura llegó después.
	 */
	let queue: Promise<unknown> = Promise.resolve();
	/** Cuántos guardados hay en la fila: `saving` es verdadero hasta el último. */
	let pending = 0;
	/** Lo último que se sabe que está en disco: lo cargado o lo último guardado. */
	let persisted: SchemeFile | null = null;

	const cancelPending = () => {
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
	};

	const persist = (toSave: SchemeFile): Promise<SchemeEntry> => {
		pending += 1;
		saving.value = true;
		const run = queue
			.catch(() => {})
			.then(async () => {
				try {
					const entry = await save(toSave);
					error.value = null;
					persisted = toSave;
					await options.onSaved?.(entry);
					return entry;
				} catch (err) {
					error.value = err;
					throw err;
				} finally {
					pending -= 1;
					saving.value = pending > 0;
				}
			});
		queue = run;
		return run;
	};

	const load = (loaded: SchemeFile | null) => {
		cancelPending();
		scheme.value = loaded ? cloneScheme(loaded) : null;
		persisted = scheme.value;
	};

	const createFrom = async (base: SchemeFile, identity: CloneIdentity) => {
		// Un cambio agendado sobre el esquema anterior no puede caer encima del
		// recién clonado y pisarlo con los colores viejos.
		cancelPending();
		const clone = cloneAsCustom(base, identity);
		scheme.value = clone;
		try {
			return await persist(clone);
		} catch (err) {
			// El clon no llegó al disco: el editor vuelve a lo que sí está, en vez
			// de mostrar como guardado algo que el archivo no tiene.
			if (scheme.value === clone) {
				scheme.value = persisted ? cloneScheme(persisted) : null;
			}
			throw err;
		}
	};

	const ensureCustom: CustomScheme['ensureCustom'] = async (existing, getBase) => {
		if (existing) {
			if (!scheme.value) load(existing);
			return { created: false };
		}
		const { base, identity } = await getBase();
		await createFrom(base, identity);
		return { created: true };
	};

	/**
	 * Deja `next` como el esquema en edición y lo guarda: con antirrebote, o ya
	 * mismo si `immediate`. Un cambio que no cambió nada —un hex inválido, que
	 * se descarta, o el mismo color de antes— no reescribe el archivo ni hace
	 * reaplicar el esquema en todo el escritorio.
	 */
	const commit = async (next: SchemeFile, immediate: boolean) => {
		const current = scheme.value;
		if (!current || JSON.stringify(next) === JSON.stringify(current)) return;

		scheme.value = next;
		cancelPending();
		if (immediate) {
			await persist(next);
			return;
		}
		timer = setTimeout(() => {
			timer = null;
			// El error ya queda en `error`, que es lo que mira la vista; acá no
			// hay nadie que lo pueda atrapar.
			persist(next).catch(() => {});
		}, delay);
	};

	const updateColors: CustomScheme['updateColors'] = (variant, patch, origin = 'manual') => {
		const current = scheme.value;
		if (!current) return;

		const state = readWallpaperState(current);
		let next: SchemeFile;
		if (origin === 'wallpaper') {
			next = applyColorPatch(current, variant, omitPaths(patch, state.pinned[variant]));
		} else {
			next = applyColorPatch(current, variant, patch);
			// Sólo se fija lo que de verdad cambió: un hex inválido no llega al
			// esquema, y no tiene por qué dejar el color fijado.
			const touched = uiPathsOf(patch);
			if (touched.length && JSON.stringify(next) !== JSON.stringify(current)) {
				const pinned = [...new Set([...state.pinned[variant], ...touched])];
				next = withWallpaperState(next, {
					...state,
					pinned: { ...state.pinned, [variant]: pinned },
				});
			}
		}
		commit(next, false).catch(() => {});
	};

	const applyWallpaper: CustomScheme['applyWallpaper'] = async (patches, source) => {
		const current = scheme.value;
		if (!current) return;
		const state = readWallpaperState(current);
		let next = current;
		for (const variant of SCHEME_VARIANTS) {
			next = applyColorPatch(next, variant, omitPaths(patches[variant], state.pinned[variant]));
		}
		next = withWallpaperState(next, { ...state, source });
		await commit(next, true);
	};

	const updateWallpaperState: CustomScheme['updateWallpaperState'] = async (change, options) => {
		const current = scheme.value;
		if (!current) return;
		const next = withWallpaperState(current, change(readWallpaperState(current)));
		await commit(next, options?.immediate ?? false);
	};

	const flush = async () => {
		if (timer === null || !scheme.value) return;
		cancelPending();
		await persist(scheme.value);
	};

	return {
		scheme,
		saving,
		error,
		load,
		createFrom,
		ensureCustom,
		updateColors,
		applyWallpaper,
		updateWallpaperState,
		flush,
	};
}

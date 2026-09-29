/**
 * El esquema «Personalizado» del usuario: crearlo, editarlo, guardarlo.
 *
 * **Toda escritura de colores pasa por `updateColors`.** Es a propósito: la
 * detección de colores del fondo (Vasak-OS/vasak-settings#134) se enchufa acá,
 * mandando los colores que saque como un cambio parcial más, y los colores
 * fijados a mano se van a resolver en este mismo lugar. El editor no tiene que
 * enterarse de nada de eso.
 *
 * El guardado va con antirrebote: arrastrar el selector de color dispara un
 * cambio por cuadro, y cada uno reescribe el archivo y hace que todas las
 * aplicaciones abiertas reapliquen el esquema. Se espera a que el usuario se
 * quede quieto un momento y se guarda una sola vez, con todo junto.
 */

import { type Ref, ref, shallowRef } from 'vue';
import { saveUserScheme } from '@/services/scheme.service';
import {
	applyColorPatch,
	type CloneIdentity,
	cloneAsCustom,
	cloneScheme,
} from '@/tools/custom-scheme';
import type { SchemeColorPatch, SchemeEntry, SchemeFile, SchemeVariantName } from '@/types/scheme';

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
	/** Cambia colores de una variante y agenda el guardado. */
	updateColors: (variant: SchemeVariantName, patch: SchemeColorPatch) => void;
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

	const updateColors = (variant: SchemeVariantName, patch: SchemeColorPatch) => {
		const current = scheme.value;
		if (!current) return;

		const next = applyColorPatch(current, variant, patch);
		// Un cambio que no cambió nada —un hex inválido, que se descarta, o el
		// mismo color de antes— no reescribe el archivo ni hace reaplicar el
		// esquema en todo el escritorio.
		if (JSON.stringify(next) === JSON.stringify(current)) return;

		scheme.value = next;
		cancelPending();
		timer = setTimeout(() => {
			timer = null;
			// El error ya queda en `error`, que es lo que mira la vista; acá no
			// hay nadie que lo pueda atrapar.
			persist(next).catch(() => {});
		}, delay);
	};

	const flush = async () => {
		if (timer === null || !scheme.value) return;
		cancelPending();
		await persist(scheme.value);
	};

	return { scheme, saving, error, load, createFrom, ensureCustom, updateColors, flush };
}

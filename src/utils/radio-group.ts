/**
 * El teclado de un grupo de opciones de una sola elección, como lo pide la guía
 * de WAI-ARIA para `role="radiogroup"`.
 *
 * Con Tab se entra y se sale del grupo de una vez: sólo la opción elegida es
 * tabulable, y si no hay ninguna elegida, la primera. Adentro, las flechas
 * mueven la selección —y el foco con ella— y dan la vuelta en los extremos.
 * Sin esto, una lista de diez dispositivos eran diez paradas de Tab.
 */

/** El `tabindex` de una opción: 0 para la que recibe el foco del grupo, -1 para el resto. */
export function radioTabIndex(ids: readonly string[], selected: string, id: string): 0 | -1 {
	const focusable = ids.includes(selected) ? selected : ids[0];
	return id === focusable ? 0 : -1;
}

const STEPS: Record<string, 1 | -1> = {
	ArrowDown: 1,
	ArrowRight: 1,
	ArrowUp: -1,
	ArrowLeft: -1,
};

/** La opción a la que lleva una tecla desde `current`, o `null` si la tecla no mueve. */
export function radioStep(ids: readonly string[], current: string, key: string): string | null {
	const step = STEPS[key];
	if (!step || ids.length === 0) return null;
	const from = ids.indexOf(current);
	const start = from === -1 ? (step === 1 ? -1 : 0) : from;
	return ids[(start + step + ids.length) % ids.length];
}

/**
 * Maneja las flechas sobre una opción: elige la siguiente y le pasa el foco.
 * Las opciones tienen que ser hermanas en el mismo orden que `ids`.
 */
export function onRadioArrow(
	event: KeyboardEvent,
	ids: readonly string[],
	current: string,
	select: (id: string) => unknown
): void {
	const next = radioStep(ids, current, event.key);
	if (next === null) return;
	event.preventDefault();
	select(next);
	const option = (event.currentTarget as HTMLElement | null)?.parentElement?.children[
		ids.indexOf(next)
	];
	(option as HTMLElement | undefined)?.focus();
}

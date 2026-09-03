/**
 * Sacar del menú lateral las secciones cuyo hardware no existe.
 *
 * Aparte del componente para poder probarlo: la regla es corta pero tiene dos
 * casos que se equivocan callados —el hardware que no se pudo averiguar, y una
 * categoría que queda sin ningún elemento— y ninguno de los dos se nota mirando
 * la ventana en la máquina de quien programa, que tiene las dos cosas.
 */

import type { SidebarCategory } from '@/types/sidebar';
import type { Disponibilidad } from './useHardwareDeRed';

/**
 * Qué elemento del menú depende de qué hardware.
 *
 * Las claves son los `id` del menú, que son también los nombres de las rutas.
 */
export const HARDWARE_POR_SECCION = {
	'network-wifi': 'wifi',
	'network-bluetooth': 'bluetooth',
} as const;

export type Hardware = (typeof HARDWARE_POR_SECCION)[keyof typeof HARDWARE_POR_SECCION];

/**
 * El menú sin las secciones cuyo hardware se sabe que no está.
 *
 * **`desconocido` deja la sección.** Que no se haya podido preguntar —porque
 * NetworkManager o bluez no contestaron— no es lo mismo que que no haya
 * hardware, y esconder la pantalla en ese caso deja a la persona sin el único
 * lugar donde el problema se puede explicar.
 *
 * Una categoría que se queda sin elementos se saca entera: un título de grupo
 * solo, sin nada abajo, se lee como una lista que no cargó.
 */
export function menuSegunHardware(
	categorias: readonly SidebarCategory[],
	disponible: Record<Hardware, Disponibilidad>
): SidebarCategory[] {
	return categorias
		.map((categoria) => ({
			...categoria,
			items: categoria.items.filter((item) => {
				const hardware = HARDWARE_POR_SECCION[item.id as keyof typeof HARDWARE_POR_SECCION];
				// Un elemento que no depende de ningún hardware siempre queda.
				if (!hardware) return true;
				return disponible[hardware] !== 'no';
			}),
		}))
		.filter((categoria) => categoria.items.length > 0);
}

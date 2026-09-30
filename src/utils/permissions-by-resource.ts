/**
 * Dar vuelta la lista de permisos: del programa al recurso.
 *
 * El servicio contesta por aplicación —«vasak-connect: cámara sí, micrófono
 * no»— porque así es como decide. Pero la pregunta que alguien trae a esta
 * pantalla casi nunca es ésa: es «¿quién puede usar mi cámara?», y contestarla
 * con la lista por aplicación obliga a abrir una por una y recordar lo que
 * decía la anterior.
 *
 * Es la misma vuelta que da macOS en Privacidad y seguridad, y por la misma
 * razón: el recurso es lo que preocupa, la aplicación es el detalle.
 *
 * Acá está la cuenta sola, sin Vue, porque es lo que decide qué se ve en cada
 * pestaña y lo que se rompe callado —una aplicación que aparece donde no debe,
 * un recurso que muestra de menos— no se nota mirando la pantalla.
 */

import type { Decision, PermissionEntry } from '@/services/permissions.service';

/** Una aplicación dentro de la pestaña de un recurso. */
export interface AppWithPermission {
	entry: PermissionEntry;
	decision: Decision;
}

export interface ResourceGroup<Id extends string = string> {
	id: Id;
	apps: AppWithPermission[];
	/** Cuántas lo tienen concedido. Es lo que se muestra al lado del nombre. */
	allowedCount: number;
}

export const decisionOf = (entry: PermissionEntry, resource: string): Decision =>
	entry.decisions[resource] ?? 'unknown';

/**
 * Las aplicaciones de cada recurso, en el orden en que se muestran.
 *
 * **Sólo las que pidieron ese recurso.** Una aplicación sin decisión sobre la
 * cámara no es «la cámara denegada»: es que nunca la pidió, y listarla llenaría
 * la pestaña de programas que no tienen nada que ver con lo que se está
 * mirando.
 *
 * Se ordenan las permitidas primero y después por nombre. Lo que preocupa al
 * abrir esta pantalla es qué tiene acceso, no qué no lo tiene, y dejarlo al
 * final obligaría a recorrer toda la lista para encontrarlo.
 */
export function groupByResource<Id extends string>(
	entries: PermissionEntry[],
	resources: readonly Id[]
): ResourceGroup<Id>[] {
	return resources.map((id) => {
		const apps = entries
			.filter((entry) => decisionOf(entry, id) !== 'unknown')
			.map((entry) => ({ entry, decision: decisionOf(entry, id) }))
			.sort(compareApps);

		return {
			id,
			apps,
			allowedCount: apps.filter((a) => a.decision === 'allowed').length,
		};
	});
}

function compareApps(a: AppWithPermission, b: AppWithPermission): number {
	if (a.decision !== b.decision) {
		return a.decision === 'allowed' ? -1 : 1;
	}

	// `localeCompare` y no `<`: con nombres acentuados, comparar por punto de
	// código pone «Ángela» después de «Zoe».
	return a.entry.application.display_name.localeCompare(b.entry.application.display_name);
}

/**
 * Qué pestaña conviene mostrar al entrar.
 *
 * La primera que tenga algo. Abrir en una pestaña vacía hace pensar que no hay
 * ningún permiso concedido en todo el sistema, cuando lo que pasa es que ese
 * recurso no lo pidió nadie.
 */
export function initialTab<Id extends string>(groups: ResourceGroup<Id>[], fallback: Id): Id {
	return groups.find((g) => g.apps.length > 0)?.id ?? fallback;
}

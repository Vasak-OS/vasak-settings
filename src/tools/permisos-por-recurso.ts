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
export interface AppConPermiso {
	entrada: PermissionEntry;
	decision: Decision;
}

export interface Recurso<Id extends string = string> {
	id: Id;
	apps: AppConPermiso[];
	/** Cuántas lo tienen concedido. Es lo que se muestra al lado del nombre. */
	permitidas: number;
}

export const decisionDe = (entrada: PermissionEntry, recurso: string): Decision =>
	entrada.decisions[recurso] ?? 'unknown';

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
export function porRecurso<Id extends string>(
	entradas: PermissionEntry[],
	recursos: readonly Id[]
): Recurso<Id>[] {
	return recursos.map((id) => {
		const apps = entradas
			.filter((entrada) => decisionDe(entrada, id) !== 'unknown')
			.map((entrada) => ({ entrada, decision: decisionDe(entrada, id) }))
			.sort(comparar);

		return {
			id,
			apps,
			permitidas: apps.filter((a) => a.decision === 'allowed').length,
		};
	});
}

function comparar(a: AppConPermiso, b: AppConPermiso): number {
	if (a.decision !== b.decision) {
		return a.decision === 'allowed' ? -1 : 1;
	}

	// `localeCompare` y no `<`: con nombres acentuados, comparar por punto de
	// código pone «Ángela» después de «Zoe».
	return a.entrada.application.display_name.localeCompare(b.entrada.application.display_name);
}

/**
 * Qué pestaña conviene mostrar al entrar.
 *
 * La primera que tenga algo. Abrir en una pestaña vacía hace pensar que no hay
 * ningún permiso concedido en todo el sistema, cuando lo que pasa es que ese
 * recurso no lo pidió nadie.
 */
export function pestanaInicial<Id extends string>(recursos: Recurso<Id>[], porOmision: Id): Id {
	return recursos.find((r) => r.apps.length > 0)?.id ?? porOmision;
}

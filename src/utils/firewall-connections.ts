/**
 * Agrupa el mapa de conexiones por aplicación, lo más reciente primero.
 *
 * Aparte de la vista para probarlo sin montarla (ver `privacy-resources.ts`).
 */
import type { ObservedConnection } from '@/services/permissions.service';

export interface ConnectionGroup {
	binaryPath: string;
	connections: ObservedConnection[];
}

export function groupConnections(connections: ObservedConnection[]): ConnectionGroup[] {
	const byApp = new Map<string, ObservedConnection[]>();
	for (const c of connections) {
		const list = byApp.get(c.binary_path);
		if (list) list.push(c);
		else byApp.set(c.binary_path, [c]);
	}
	const groups = [...byApp].map(([binaryPath, list]) => ({
		binaryPath,
		connections: list.sort((a, b) => b.last_seen_secs - a.last_seen_secs),
	}));
	return groups.sort((a, b) => b.connections[0].last_seen_secs - a.connections[0].last_seen_secs);
}

/** El destino como se muestra: el dominio si se conoce, si no la IP (v6 entre corchetes). */
export function destinationLabel(c: ObservedConnection): string {
	const host = c.domain || (c.ip.includes(':') ? `[${c.ip}]` : c.ip);
	return `${host}:${c.port}`;
}

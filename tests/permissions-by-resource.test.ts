import { describe, expect, test } from 'bun:test';
import type { PermissionEntry } from '../src/services/permissions.service';
import { decisionOf, groupByResource, initialTab } from '../src/tools/permissions-by-resource';

/**
 * Lo que se prueba acá es lo que se rompe callado: una aplicación que aparece
 * en la pestaña equivocada, o una que no aparece. Las dos se ven bien en
 * pantalla —hay una lista, tiene filas— y las dos mienten sobre quién puede
 * usar la cámara.
 */

const app = (
	name: string,
	decisions: Record<string, string>,
	provenance = 'system-installed'
): PermissionEntry =>
	({
		application: {
			binary_path: `/usr/bin/${name}`,
			display_name: name,
			provenance,
			icon: name,
		},
		asks: false,
		decisions,
	}) as PermissionEntry;

const RESOURCES = ['credentials', 'camera', 'microphone'] as const;

const namesOf = (group: ReturnType<typeof groupByResource>[number] | undefined) =>
	group?.apps.map((a) => a.entry.application.display_name);

describe('dar vuelta la lista', () => {
	test('cada recurso junta las aplicaciones que lo pidieron', () => {
		const groups = groupByResource(
			[app('uno', { camera: 'allowed' }), app('dos', { camera: 'denied', microphone: 'allowed' })],
			RESOURCES
		);

		expect(namesOf(groups.find((g) => g.id === 'camera'))).toEqual(['uno', 'dos']);
		expect(groups.find((g) => g.id === 'microphone')?.apps).toHaveLength(1);
	});

	test('una aplicación que nunca pidió el recurso no aparece en su pestaña', () => {
		// No es «denegada»: es que no tiene nada que ver. Listarla llenaría la
		// pestaña de programas ajenos a lo que se está mirando.
		const groups = groupByResource([app('uno', { camera: 'allowed' })], RESOURCES);

		expect(groups.find((g) => g.id === 'microphone')?.apps).toEqual([]);
		expect(groups.find((g) => g.id === 'credentials')?.apps).toEqual([]);
	});

	test('se devuelven todos los recursos, incluso los vacíos', () => {
		// La lista es fija: un recurso que aparece y desaparece según lo que haya
		// movería los demás de lugar entre una visita y la siguiente.
		const groups = groupByResource([], RESOURCES);

		expect(groups.map((g) => g.id)).toEqual([...RESOURCES]);
	});

	test('las permitidas van primero', () => {
		// Lo que preocupa al abrir esto es qué tiene acceso. Dejarlo mezclado
		// obliga a recorrer la lista entera para encontrarlo.
		const groups = groupByResource(
			[
				app('zeta', { camera: 'denied' }),
				app('alfa', { camera: 'allowed' }),
				app('beta', { camera: 'denied' }),
			],
			RESOURCES
		);

		expect(namesOf(groups[1])).toEqual(['alfa', 'beta', 'zeta']);
	});

	test('con la misma decisión se ordenan por nombre, y los acentos no van al final', () => {
		// Comparando por punto de código, «Ángela» queda después de «Zoe».
		const groups = groupByResource(
			[app('Zoe', { camera: 'allowed' }), app('Ángela', { camera: 'allowed' })],
			RESOURCES
		);

		expect(namesOf(groups[1])).toEqual(['Ángela', 'Zoe']);
	});

	test('la cuenta de permitidas es la que se muestra al lado del nombre', () => {
		const groups = groupByResource(
			[
				app('uno', { camera: 'allowed' }),
				app('dos', { camera: 'allowed' }),
				app('tres', { camera: 'denied' }),
			],
			RESOURCES
		);

		const camera = groups.find((g) => g.id === 'camera');
		expect(camera?.allowedCount).toBe(2);
		expect(camera?.apps).toHaveLength(3);
	});

	test('un recurso del almacén se cuenta aparte del de la cuenta', () => {
		// `store.email` es leer lo que ya está guardado en el equipo y
		// `account.email` es llegar a la cuenta: una aplicación puede tener uno
		// sin el otro, y cada pestaña tiene que decir sólo lo suyo.
		const groups = groupByResource(
			[app('correo', { 'store.email': 'allowed' }), app('otra', { 'account.email': 'allowed' })],
			['account.email', 'store.email'] as const
		);

		expect(namesOf(groups.find((g) => g.id === 'store.email'))).toEqual(['correo']);
		expect(namesOf(groups.find((g) => g.id === 'account.email'))).toEqual(['otra']);
	});
});

describe('la decisión de una aplicación', () => {
	test('lo que no está es desconocido, no denegado', () => {
		// La diferencia decide si la fila se muestra: «no pidió» no es «se le
		// negó», y confundirlas es lo que llenaría las pestañas.
		expect(decisionOf(app('uno', {}), 'camera')).toBe('unknown');
		expect(decisionOf(app('uno', { camera: 'denied' }), 'camera')).toBe('denied');
	});
});

describe('con qué pestaña se abre', () => {
	test('la primera que tenga algo', () => {
		// Abrir en una vacía hace pensar que no hay ningún permiso concedido en
		// todo el sistema, cuando lo que pasa es que ese recurso no lo pidió
		// nadie.
		const groups = groupByResource([app('uno', { camera: 'allowed' })], RESOURCES);

		expect(initialTab(groups, 'credentials')).toBe('camera');
	});

	test('sin nada en ninguna, la de siempre', () => {
		const groups = groupByResource([], RESOURCES);

		expect(initialTab(groups, 'credentials')).toBe('credentials');
	});

	test('con la primera llena, se queda en la primera', () => {
		const groups = groupByResource([app('uno', { credentials: 'denied' })], RESOURCES);

		expect(initialTab(groups, 'credentials')).toBe('credentials');
	});
});

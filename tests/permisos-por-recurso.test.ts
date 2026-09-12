import { describe, expect, test } from 'bun:test';
import type { PermissionEntry } from '../src/services/permissions.service';
import { decisionDe, pestanaInicial, porRecurso } from '../src/tools/permisos-por-recurso';

/**
 * Lo que se prueba acá es lo que se rompe callado: una aplicación que aparece
 * en la pestaña equivocada, o una que no aparece. Las dos se ven bien en
 * pantalla —hay una lista, tiene filas— y las dos mienten sobre quién puede
 * usar la cámara.
 */

const app = (
	nombre: string,
	decisiones: Record<string, string>,
	provenance = 'system-installed'
): PermissionEntry =>
	({
		application: {
			binary_path: `/usr/bin/${nombre}`,
			display_name: nombre,
			provenance,
			icon: nombre,
		},
		asks: false,
		decisions: decisiones,
	}) as PermissionEntry;

const RECURSOS = ['credentials', 'camera', 'microphone'] as const;

describe('dar vuelta la lista', () => {
	test('cada recurso junta las aplicaciones que lo pidieron', () => {
		const recursos = porRecurso(
			[app('uno', { camera: 'allowed' }), app('dos', { camera: 'denied', microphone: 'allowed' })],
			RECURSOS
		);

		const camara = recursos.find((r) => r.id === 'camera');
		expect(camara?.apps.map((a) => a.entrada.application.display_name)).toEqual(['uno', 'dos']);
		expect(recursos.find((r) => r.id === 'microphone')?.apps).toHaveLength(1);
	});

	test('una aplicación que nunca pidió el recurso no aparece en su pestaña', () => {
		// No es «denegada»: es que no tiene nada que ver. Listarla llenaría la
		// pestaña de programas ajenos a lo que se está mirando.
		const recursos = porRecurso([app('uno', { camera: 'allowed' })], RECURSOS);

		expect(recursos.find((r) => r.id === 'microphone')?.apps).toEqual([]);
		expect(recursos.find((r) => r.id === 'credentials')?.apps).toEqual([]);
	});

	test('se devuelven todos los recursos, incluso los vacíos', () => {
		// La fila de pestañas es fija: una que aparece y desaparece según lo que
		// haya movería las demás de lugar entre una visita y la siguiente.
		const recursos = porRecurso([], RECURSOS);

		expect(recursos.map((r) => r.id)).toEqual([...RECURSOS]);
	});

	test('las permitidas van primero', () => {
		// Lo que preocupa al abrir esto es qué tiene acceso. Dejarlo mezclado
		// obliga a recorrer la lista entera para encontrarlo.
		const recursos = porRecurso(
			[
				app('zeta', { camera: 'denied' }),
				app('alfa', { camera: 'allowed' }),
				app('beta', { camera: 'denied' }),
			],
			RECURSOS
		);

		expect(recursos[1].apps.map((a) => a.entrada.application.display_name)).toEqual([
			'alfa',
			'beta',
			'zeta',
		]);
	});

	test('con la misma decisión se ordenan por nombre, y los acentos no van al final', () => {
		// Comparando por punto de código, «Ángela» queda después de «Zoe».
		const recursos = porRecurso(
			[app('Zoe', { camera: 'allowed' }), app('Ángela', { camera: 'allowed' })],
			RECURSOS
		);

		expect(recursos[1].apps.map((a) => a.entrada.application.display_name)).toEqual([
			'Ángela',
			'Zoe',
		]);
	});

	test('la cuenta de permitidas es la que se muestra al lado del nombre', () => {
		const recursos = porRecurso(
			[
				app('uno', { camera: 'allowed' }),
				app('dos', { camera: 'allowed' }),
				app('tres', { camera: 'denied' }),
			],
			RECURSOS
		);

		const camara = recursos.find((r) => r.id === 'camera');
		expect(camara?.permitidas).toBe(2);
		expect(camara?.apps).toHaveLength(3);
	});
});

describe('la decisión de una aplicación', () => {
	test('lo que no está es desconocido, no denegado', () => {
		// La diferencia decide si la fila se muestra: «no pidió» no es «se le
		// negó», y confundirlas es lo que llenaría las pestañas.
		expect(decisionDe(app('uno', {}), 'camera')).toBe('unknown');
		expect(decisionDe(app('uno', { camera: 'denied' }), 'camera')).toBe('denied');
	});
});

describe('con qué pestaña se abre', () => {
	test('la primera que tenga algo', () => {
		// Abrir en una vacía hace pensar que no hay ningún permiso concedido en
		// todo el sistema, cuando lo que pasa es que ese recurso no lo pidió
		// nadie.
		const recursos = porRecurso([app('uno', { camera: 'allowed' })], RECURSOS);

		expect(pestanaInicial(recursos, 'credentials')).toBe('camera');
	});

	test('sin nada en ninguna, la de siempre', () => {
		const recursos = porRecurso([], RECURSOS);

		expect(pestanaInicial(recursos, 'credentials')).toBe('credentials');
	});

	test('con la primera llena, se queda en la primera', () => {
		const recursos = porRecurso([app('uno', { credentials: 'denied' })], RECURSOS);

		expect(pestanaInicial(recursos, 'credentials')).toBe('credentials');
	});
});

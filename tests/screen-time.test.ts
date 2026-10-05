import { describe, expect, test } from 'bun:test';
import {
	aggregateByApp,
	aggregateByCategory,
	aggregateHourly,
	canAdoptReportedEnabled,
	createRequestGate,
	HOURS_IN_DAY,
	type ScreenTimeReport,
	splitDuration,
	totalMillis,
} from '../src/utils/screen-time';

/**
 * Las cuentas del tiempo de pantalla.
 *
 * El servicio contesta por día y por aplicación; las tres vistas —por
 * aplicación, por categoría, por horario— son tres formas de sumar esa misma
 * respuesta. Se prueban acá, sin Vue ni backend, porque son lo único de la
 * pantalla que puede dar un número equivocado sin que nada falle.
 */

/** Un informe con dos días, para que las sumas crucen la frontera del día. */
function informe(): ScreenTimeReport {
	const horas = (indice: number, valor: number) => {
		const h = new Array<number>(HOURS_IN_DAY).fill(0);
		h[indice] = valor;
		return h;
	};

	return {
		enabled: true,
		today: '2026-10-05',
		first_day: '2026-10-04',
		days: [
			{
				date: '2026-10-04',
				apps: [
					{
						app_id: 'firefox',
						category: 'Network',
						millis: 3_600_000,
						hours: horas(9, 3_600_000),
						icon: 'firefox',
						name: 'Firefox',
					},
					{
						app_id: 'code',
						category: 'Development',
						millis: 1_800_000,
						hours: horas(10, 1_800_000),
						icon: 'code',
						name: 'Code',
					},
				],
			},
			{
				date: '2026-10-05',
				apps: [
					{
						app_id: 'firefox',
						category: 'Network',
						millis: 1_200_000,
						hours: horas(9, 1_200_000),
						icon: 'firefox',
						name: 'Firefox',
					},
				],
			},
		],
	};
}

const vacio: ScreenTimeReport = {
	enabled: false,
	today: '2026-10-05',
	first_day: '',
	days: [],
};

describe('totalMillis', () => {
	test('suma todas las aplicaciones de todos los días', () => {
		expect(totalMillis(informe())).toBe(3_600_000 + 1_800_000 + 1_200_000);
	});

	test('un informe vacío da cero', () => {
		expect(totalMillis(vacio)).toBe(0);
	});
});

describe('aggregateByApp', () => {
	test('junta la misma aplicación de distintos días y ordena de mayor a menor', () => {
		const apps = aggregateByApp(informe());

		expect(apps).toHaveLength(2);
		// Firefox: 3.6M + 1.2M = 4.8M, por encima de Code (1.8M).
		expect(apps[0].app_id).toBe('firefox');
		expect(apps[0].millis).toBe(4_800_000);
		expect(apps[1].app_id).toBe('code');
	});

	test('conserva el nombre, y cae en el app_id si falta', () => {
		const sinNombre: ScreenTimeReport = {
			...vacio,
			days: [
				{
					date: '2026-10-05',
					apps: [{ app_id: 'raro', category: '', millis: 10, hours: [], icon: '', name: '' }],
				},
			],
		};

		expect(aggregateByApp(sinNombre)[0].name).toBe('raro');
	});
});

describe('aggregateByCategory', () => {
	test('suma por categoría y ordena de mayor a menor', () => {
		const cats = aggregateByCategory(informe());

		expect(cats[0]).toEqual({ category: 'Network', millis: 4_800_000 });
		expect(cats[1]).toEqual({ category: 'Development', millis: 1_800_000 });
	});
});

describe('aggregateHourly', () => {
	test('siempre son 24 cubetas, aun con el informe vacío', () => {
		expect(aggregateHourly(vacio)).toHaveLength(HOURS_IN_DAY);
	});

	test('suma la misma hora de todas las aplicaciones y días', () => {
		const horas = aggregateHourly(informe());

		// Las dos sesiones de Firefox caen en las 9; Code, en las 10.
		expect(horas[9]).toBe(3_600_000 + 1_200_000);
		expect(horas[10]).toBe(1_800_000);
		expect(horas[0]).toBe(0);
	});

	test('tolera un arreglo de horas más corto que 24', () => {
		// Los datos viejos sólo guardaban el total; sus cubetas pueden faltar.
		const corto: ScreenTimeReport = {
			...vacio,
			days: [
				{
					date: '2026-10-05',
					apps: [{ app_id: 'x', category: '', millis: 5, hours: [1, 2], icon: '', name: 'X' }],
				},
			],
		};

		const horas = aggregateHourly(corto);
		expect(horas).toHaveLength(HOURS_IN_DAY);
		expect(horas[0]).toBe(1);
		expect(horas[23]).toBe(0);
	});
});

describe('splitDuration', () => {
	test('parte en horas y minutos enteros', () => {
		expect(splitDuration(2 * 3_600_000 + 15 * 60_000)).toEqual({ hours: 2, minutes: 15 });
	});

	test('redondea los segundos al minuto más cercano', () => {
		// 90 s → 2 min (redondeo), no 1.
		expect(splitDuration(90_000)).toEqual({ hours: 0, minutes: 2 });
		expect(splitDuration(0)).toEqual({ hours: 0, minutes: 0 });
	});
});

describe('createRequestGate', () => {
	test('sólo el último pedido que arrancó puede aplicar', () => {
		// Es la carrera que se arregla: se pide un período, se cambia a otro antes de
		// que el primero conteste, y la respuesta vieja no debe pisar a la nueva.
		const gate = createRequestGate();

		const viejo = gate.begin();
		const nuevo = gate.begin();

		expect(viejo.isCurrent()).toBe(false);
		expect(nuevo.isCurrent()).toBe(true);
	});

	test('el vigente suelta el «Cargando» en cuanto termina, aunque queden viejos', () => {
		// Es el arreglo: si el vigente ya tiene su informe en pantalla, el indicador
		// se apaga, sin esperar a un pedido viejo y superado que siga dando vueltas.
		const gate = createRequestGate();

		const viejo = gate.begin();
		const actual = gate.begin();

		// El vigente termina primero: libera el «Cargando» ya.
		expect(actual.done()).toBe(true);
		// Y el viejo, al cerrarse después, da true porque no queda ninguno en vuelo
		// —no deja el indicador trabado— pero no es él quien manda.
		expect(viejo.done()).toBe(true);
	});

	test('un pedido superado que termina antes NO suelta el «Cargando»', () => {
		// Apagarlo ahí taparía con datos viejos la carga del período elegido, que
		// todavía no llegó.
		const gate = createRequestGate();

		const viejo = gate.begin();
		const actual = gate.begin();

		expect(viejo.done()).toBe(false); // el vigente sigue pendiente
		expect(actual.done()).toBe(true); // ahora sí
	});

	test('invalidar deja viejo a lo que esté en vuelo, sin arrancar nada', () => {
		// Es lo que hacen el toggle y «borrar historial»: una carga anterior que
		// resuelva tarde no debe pisar el estado nuevo.
		const gate = createRequestGate();

		const enVuelo = gate.begin();
		gate.invalidate();

		expect(enVuelo.isCurrent()).toBe(false);
		// Y aun invalidado, cerrarlo libera el «Cargando».
		expect(enVuelo.done()).toBe(true);
	});

	test('un pedido solo es el vigente y se cierra limpio', () => {
		const gate = createRequestGate();
		const uno = gate.begin();

		expect(uno.isCurrent()).toBe(true);
		expect(uno.done()).toBe(true);
	});
});

describe('canAdoptReportedEnabled', () => {
	test('la carga vigente adopta el enabled del servicio cuando no hay toggle', () => {
		expect(canAdoptReportedEnabled(true, false)).toBe(true);
	});

	test('no lo adopta si hay un toggle en curso, aunque sea la vigente', () => {
		// Es el arreglo: durante el toggle el interruptor lo gobierna el usuario, y
		// la carga de período no debe pisarlo con el `enabled` viejo del servicio.
		expect(canAdoptReportedEnabled(true, true)).toBe(false);
	});

	test('ni una carga superada, con o sin toggle', () => {
		expect(canAdoptReportedEnabled(false, false)).toBe(false);
		expect(canAdoptReportedEnabled(false, true)).toBe(false);
	});
});

/**
 * Las cuentas del tiempo de pantalla, aparte de la vista para poder probarlas.
 *
 * El servicio de salud contesta por día y por aplicación, porque así es como
 * mide. Las tres preguntas que alguien trae a esta pantalla —«¿en qué se me va
 * el tiempo?», «¿en qué tipo de cosas?», «¿a qué hora?»— son tres formas de
 * sumar esa misma respuesta, y cada una se arma acá sin tocar Vue ni el backend.
 *
 * Los nombres de los campos son los que manda Tauri desde las estructuras de
 * Rust (`app_id`, `first_day`): serde serializa con el nombre del campo tal
 * cual, en `snake_case`, así que acá se leen igual.
 */

/** Cuántas cubetas tiene el desglose por hora: una por cada hora del día. */
export const HOURS_IN_DAY = 24;

export interface AppUsage {
	app_id: string;
	category: string;
	millis: number;
	/** Siempre 24 valores; el backend rellena con ceros lo que falte. */
	hours: number[];
	icon: string;
	name: string;
}

export interface DayUsage {
	date: string;
	apps: AppUsage[];
}

export interface ScreenTimeReport {
	enabled: boolean;
	today: string;
	first_day: string;
	days: DayUsage[];
}

/** El total de una aplicación en todo el período. */
export interface AppTotal {
	app_id: string;
	name: string;
	icon: string;
	category: string;
	millis: number;
}

/** El total de una categoría en todo el período. */
export interface CategoryTotal {
	category: string;
	millis: number;
}

/** El total de todas las aplicaciones y días. */
export function totalMillis(report: ScreenTimeReport): number {
	let total = 0;
	for (const day of report.days) {
		for (const app of day.apps) {
			total += app.millis;
		}
	}
	return total;
}

/**
 * El total por aplicación, de mayor a menor.
 *
 * Una misma aplicación aparece una vez por día en que se usó: se suman sus
 * milisegundos y se conserva el primer nombre, icono y categoría con los que
 * llegó —son los mismos en cada día, así que cuál se tome da igual—.
 */
export function aggregateByApp(report: ScreenTimeReport): AppTotal[] {
	const porApp = new Map<string, AppTotal>();

	for (const day of report.days) {
		for (const app of day.apps) {
			const anterior = porApp.get(app.app_id);
			if (anterior) {
				anterior.millis += app.millis;
				// Una categoría que faltó un día puede venir el siguiente.
				if (!anterior.category && app.category) anterior.category = app.category;
			} else {
				porApp.set(app.app_id, {
					app_id: app.app_id,
					name: app.name || app.app_id,
					icon: app.icon,
					category: app.category,
					millis: app.millis,
				});
			}
		}
	}

	return [...porApp.values()].sort((a, b) => b.millis - a.millis);
}

/**
 * El total por categoría, de mayor a menor.
 *
 * La clave es la categoría cruda de freedesktop (`Network`, `Development`…); la
 * vacía —cuando no se pudo averiguar— se agrupa bajo la cadena vacía, y la vista
 * le pone su propia etiqueta.
 */
export function aggregateByCategory(report: ScreenTimeReport): CategoryTotal[] {
	const porCategoria = new Map<string, number>();

	for (const day of report.days) {
		for (const app of day.apps) {
			porCategoria.set(app.category, (porCategoria.get(app.category) ?? 0) + app.millis);
		}
	}

	return [...porCategoria.entries()]
		.map(([category, millis]) => ({ category, millis }))
		.sort((a, b) => b.millis - a.millis);
}

/**
 * El desglose por hora: 24 cubetas con el total de todas las aplicaciones y días.
 *
 * Siempre devuelve 24 valores, aunque el informe esté vacío: la vista dibuja las
 * 24 barras sin tener que defenderse de un arreglo corto.
 */
export function aggregateHourly(report: ScreenTimeReport): number[] {
	const cubetas = new Array<number>(HOURS_IN_DAY).fill(0);

	for (const day of report.days) {
		for (const app of day.apps) {
			for (let hora = 0; hora < HOURS_IN_DAY; hora++) {
				cubetas[hora] += app.hours[hora] ?? 0;
			}
		}
	}

	return cubetas;
}

/** El control de un pedido en vuelo. */
export interface RequestTicket {
	/**
	 * Si este pedido sigue siendo el último que arrancó. Sólo entonces se aplica
	 * su resultado: uno más nuevo —otro período, un toggle, un borrado— lo deja
	 * viejo, y aplicar lo viejo pisaría el estado nuevo.
	 */
	isCurrent(): boolean;
	/**
	 * Lo cierra. Devuelve `true` cuando ya no queda ninguno en vuelo, que es
	 * cuándo se puede apagar el «Cargando…»: así invalidar un pedido no deja el
	 * indicador trabado.
	 */
	done(): boolean;
}

/** Un secuenciador de pedidos: sólo el último que arrancó aplica su resultado. */
export interface RequestGate {
	/** Arranca un pedido y devuelve su control. */
	begin(): RequestTicket;
	/**
	 * Invalida lo que esté en vuelo sin arrancar nada. Es para los cambios que no
	 * son una carga —tocar el interruptor, borrar el historial— pero que igual no
	 * deben ser pisados por una carga anterior que resuelva tarde.
	 */
	invalidate(): void;
}

/**
 * Crea un secuenciador de pedidos.
 *
 * `screenTime()` tarda, y entre que se pide y que contesta puede haber cambiado
 * el período, el interruptor o el historial. Sin esto, una respuesta vieja pisa
 * el estado nuevo. Cada pedido toma un número; sólo el último puede aplicar.
 */
export function createRequestGate(): RequestGate {
	let current = 0;
	let inFlight = 0;

	return {
		begin(): RequestTicket {
			const token = ++current;
			inFlight++;
			return {
				isCurrent: () => token === current,
				done: () => {
					inFlight = Math.max(0, inFlight - 1);
					return inFlight === 0;
				},
			};
		},
		invalidate(): void {
			current++;
		},
	};
}

/**
 * Parte una duración en horas y minutos enteros.
 *
 * Devuelve los números y no el texto porque las unidades («h», «min») se
 * traducen, y la interpolación va en la vista con el `t()` propio. Los segundos
 * se redondean al minuto más cercano: en una pantalla de hábitos de uso, el
 * segundo no dice nada y ensucia la lectura.
 */
export function splitDuration(millis: number): { hours: number; minutes: number } {
	const totalMinutos = Math.round(millis / 60000);
	return {
		hours: Math.floor(totalMinutos / 60),
		minutes: totalMinutos % 60,
	};
}

/**
 * Lo que hay para actualizar, y cómo se configura el aviso.
 *
 * Los datos vienen de `vasak-update`, que es quien los sabe: la comprobación
 * periódica y esta pantalla miran lo mismo, y dos copias del mismo analizador
 * son dos que se separan.
 *
 * Nada de esto aplica nada. Aplicar necesita privilegios y va a ser de la
 * tienda: el candado de pacman admite un solo dueño.
 */
import { invoke } from '@tauri-apps/api/core';

export interface Actualizacion {
	nombre: string;
	version_vieja: string;
	version_nueva: string;
}

/** Por qué habría que reiniciar o volver a entrar. */
export type Motivo = 'kernel' | 'systemd' | 'modulo' | 'sesion';

export interface Razon {
	motivo: Motivo;
	paquetes: string[];
}

const MOTIVOS: readonly Motivo[] = ['kernel', 'systemd', 'modulo', 'sesion'];

export interface Preflight {
	paquetes: number;
	/** Los kernels que cambian de versión, por nombre. */
	kernels: string[];
	/**
	 * Los motivos, con los paquetes que los provocan.
	 *
	 * El motivo va adentro porque «reiniciá» solo no se puede evaluar: no hay
	 * forma de decidir si conviene hacerlo ahora o si puede esperar.
	 */
	razones: Razon[];
	/** Si alcanza con cerrar la sesión, sin reiniciar el equipo. */
	pide_volver_a_entrar: boolean;
	/** Archivos de configuración nuevos sin aplicar. */
	pacnew: string[];
	boot_disponible_bytes: number;
	boot_necesario_bytes: number;
	/**
	 * Si en `/boot` hay lugar para escribir el arranque con red.
	 *
	 * Lo calcula `vasak-update` y no se recalcula acá: es la regla que decide
	 * si se muestra un aviso, y una regla que vive en dos lados es una que se
	 * separa.
	 */
	hay_lugar_con_red: boolean;
	pide_reinicio: boolean;
}

/**
 * Por qué no se pudo comprobar.
 *
 * `null` cuando sí se pudo. Es la diferencia entre «el sistema está al día» y
 * «no pude averiguarlo», que son cosas muy distintas y antes se veían igual.
 */
export interface Fallo {
	/** La causa, o `desconocido` con el texto crudo de pacman. */
	que: { causa: string; detalle?: string };
	explicacion: string;
	/** El comando que lo arregla, si hay uno. Se muestra, no se ejecuta. */
	arreglo: string | null;
}

export interface Informe {
	datos: {
		pendientes: Actualizacion[];
		/** `null` si no se pudo comprobar: sin saber qué se va a actualizar,
		 *  decir «hay lugar en /boot» sería contestar otra pregunta. */
		preflight: Preflight | null;
		fallo: Fallo | null;
	} | null;
	/** Si `vasak-update` está instalado. */
	disponible: boolean;
}

export const informeDeActualizaciones = (): Promise<Informe> =>
	invoke<Informe>('informe_de_actualizaciones');

export const avisoActivo = (): Promise<boolean> =>
	invoke<boolean>('aviso_de_actualizaciones_activo');

export const activarAviso = (activo: boolean): Promise<void> =>
	invoke<void>('activar_aviso_de_actualizaciones', { activo });

export const intervaloDeComprobacion = (): Promise<number> =>
	invoke<number>('intervalo_de_comprobacion');

export const ponerIntervaloDeComprobacion = (dias: number): Promise<void> =>
	invoke<void>('poner_intervalo_de_comprobacion', { dias });

/**
 * Lo que la pantalla usa, ya comprobado.
 *
 * `informe_de_actualizaciones` pasa el JSON de `vasak-update` tal cual, sin
 * modelarlo: del lado de Rust es un valor cualquiera, y las interfaces de
 * arriba son una promesa que TypeScript no tiene cómo comprobar. Son dos
 * paquetes que se versionan por separado, así que la promesa se puede romper
 * sin que nadie toque este archivo.
 *
 * Importa más acá que en ningún otro lado. La rama del fallo sólo se dibuja
 * cuando algo ya falló: un error de tipos ahí deja la pantalla en blanco justo
 * cuando tenía que explicar el problema, y el fallo dentro del manejador de
 * fallos es el que nadie ve venir.
 *
 * Lo que no se entiende se descarta en vez de adivinarse. Media explicación
 * manda a arreglar lo que no está roto.
 */
export interface Lectura {
	pendientes: Actualizacion[];
	preflight: Preflight | null;
	fallo: Fallo | null;
}

const esObjeto = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

const textos = (v: unknown): string[] =>
	Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

const comoActualizacion = (v: unknown): Actualizacion | null =>
	esObjeto(v) && typeof v.nombre === 'string'
		? {
				nombre: v.nombre,
				version_vieja: String(v.version_vieja ?? ''),
				version_nueva: String(v.version_nueva ?? ''),
			}
		: null;

/**
 * Un motivo que no está en la lista se descarta.
 *
 * Acá sí, y al revés que con el fallo: la pantalla le pone a cada motivo su
 * explicación, y para uno que no conoce no tiene ninguna. Mostrar la lista de
 * paquetes sin decir qué les pasa no es información, y un `vasak-update` más
 * nuevo que agregue un motivo sigue diciendo `pide_reinicio`, que es lo que
 * cambia la decisión.
 */
const comoRazon = (v: unknown): Razon | null =>
	esObjeto(v) && MOTIVOS.includes(v.motivo as Motivo)
		? { motivo: v.motivo as Motivo, paquetes: textos(v.paquetes) }
		: null;

const comoPreflight = (v: unknown): Preflight | null =>
	esObjeto(v)
		? {
				paquetes: Number(v.paquetes ?? 0),
				kernels: textos(v.kernels),
				razones: Array.isArray(v.razones)
					? v.razones.map(comoRazon).filter((x): x is Razon => x !== null)
					: [],
				pacnew: textos(v.pacnew),
				boot_disponible_bytes: Number(v.boot_disponible_bytes ?? 0),
				boot_necesario_bytes: Number(v.boot_necesario_bytes ?? 0),
				hay_lugar_con_red: v.hay_lugar_con_red !== false,
				pide_reinicio: v.pide_reinicio === true,
				pide_volver_a_entrar: v.pide_volver_a_entrar === true,
			}
		: null;

/**
 * Un fallo que no se entiende sigue siendo un fallo.
 *
 * Descartarlo por venir mal formado devolvería la pantalla a decir «el sistema
 * está al día» cuando en realidad no se pudo averiguar, que es exactamente el
 * error que esta rama existe para no cometer. Así que lo único que se pierde
 * es el detalle: queda `desconocido` y sin explicación, y la pantalla pone la
 * suya.
 */
const comoFallo = (v: unknown): Fallo | null => {
	if (v === null || v === undefined) {
		return null;
	}
	const que = esObjeto(v) && esObjeto(v.que) ? v.que : {};
	return {
		que: {
			causa: typeof que.causa === 'string' ? que.causa : 'desconocido',
			detalle: typeof que.detalle === 'string' ? que.detalle : undefined,
		},
		explicacion: esObjeto(v) && typeof v.explicacion === 'string' ? v.explicacion : '',
		arreglo: esObjeto(v) && typeof v.arreglo === 'string' ? v.arreglo : null,
	};
};

export const leer = (datos: Informe['datos']): Lectura => {
	const d: unknown = datos;
	if (!esObjeto(d)) {
		return { pendientes: [], preflight: null, fallo: null };
	}
	return {
		pendientes: Array.isArray(d.pendientes)
			? d.pendientes.map(comoActualizacion).filter((x): x is Actualizacion => x !== null)
			: [],
		preflight: comoPreflight(d.preflight),
		fallo: comoFallo(d.fallo),
	};
};

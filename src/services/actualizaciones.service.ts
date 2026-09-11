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

export interface Preflight {
	paquetes: number;
	/** Los kernels que cambian de versión, por nombre. */
	kernels: string[];
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

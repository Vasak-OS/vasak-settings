/**
 * Lo que hay para actualizar, y qué mirar antes.
 *
 * Nada de esto aplica nada: el backend sólo lee. Aplicar necesita privilegios
 * y va por un servicio de sistema con una interfaz D-Bus acotada, no desde
 * acá. Ver Vasak-OS/vasak-settings#45.
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
	 * Si en `/boot` hay lugar para escribir el initramfs con red.
	 *
	 * Lo calcula el backend y no se recalcula acá: es la regla que decide si
	 * se muestra un aviso, y una regla que vive en dos lados es una que se
	 * separa.
	 */
	hay_lugar_con_red: boolean;
	pide_reinicio: boolean;
}

export const actualizacionesPendientes = (): Promise<Actualizacion[]> =>
	invoke<Actualizacion[]>('actualizaciones_pendientes');

export const preflightActualizacion = (): Promise<Preflight> =>
	invoke<Preflight>('preflight_actualizacion');

import { invoke } from '@tauri-apps/api/core';

/** Una aplicación que puede quedar elegida. */
export interface Candidata {
	/** `vasak-terminal.desktop`: lo que entiende `xdg-mime`. */
	id: string;
	nombre: string;
	icono: string;
	/** El binario, sin argumentos. Sólo hace falta para la terminal. */
	programa: string;
}

/** Las aplicaciones que declaran manejar alguno de estos tipos. */
export async function candidatasPara(tipos: string[]): Promise<Candidata[]> {
	return invoke<Candidata[]>('candidatas_para', { tipos });
}

/** Las terminales instaladas, que se reconocen por su categoría y no por tipo. */
export async function terminalesDisponibles(): Promise<Candidata[]> {
	return invoke<Candidata[]>('terminales_disponibles');
}

/** Qué abre hoy este tipo, preguntándoselo a `xdg-mime`. */
export async function aplicacionPorDefecto(tipo: string): Promise<string | null> {
	return invoke<string | null>('aplicacion_por_defecto', { tipo });
}

/** Elige la aplicación para todos esos tipos de una sola vez. */
export async function definirAplicacion(tipos: string[], id: string): Promise<void> {
	return invoke('definir_aplicacion', { tipos, id });
}

export async function terminalPorDefecto(): Promise<string | null> {
	return invoke<string | null>('terminal_por_defecto');
}

/** Deja elegida la terminal en `xdg-terminals.list` y en `TERMINAL`. */
export async function definirTerminal(id: string, programa: string): Promise<void> {
	return invoke('definir_terminal', { id, programa });
}

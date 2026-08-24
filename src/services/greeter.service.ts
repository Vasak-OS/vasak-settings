import { invoke } from '@tauri-apps/api/core';

/**
 * La configuración de la pantalla de inicio de sesión, tal como la ve el
 * sistema: lo que está guardado y, aparte, lo que el greeter va a dibujar con
 * eso. No son lo mismo — sin fondo configurado usa el que trae VasakOS, y un
 * video configurado se muestra encima de una imagen que sigue siendo el
 * respaldo.
 */
export interface GreeterConfig {
	/** El contenido de `/etc/vasak-session-manager/background`, o `null`. */
	background: string | null;
	effective_image: string | null;
	effective_video: string | null;
	theme: 'dark' | 'light';
	scheme_id: string | null;
	configured: boolean;
}

export const getGreeterConfig = (): Promise<GreeterConfig> => {
	return invoke<GreeterConfig>('get_greeter_config');
};

/**
 * Guarda todo junto, y no cada opción por separado, porque escribir en /etc
 * cuesta una autorización de administrador: de a una serían tres contraseñas
 * para un cambio que se piensa como uno.
 */
export const setGreeterConfig = (args: {
	background: string | null;
	theme: 'dark' | 'light';
	schemePath: string | null;
}): Promise<GreeterConfig> => {
	return invoke<GreeterConfig>('set_greeter_config', args);
};

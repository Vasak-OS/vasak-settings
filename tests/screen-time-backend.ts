/**
 * Un servicio de salud y un `vasak.conf` de mentira, para montar las pantallas
 * del tiempo de pantalla.
 *
 * Se espía `invoke` sobre el módulo `@tauri-apps/api/core` y no se pone un
 * `mock.module`: `reactive-icons.test.ts` ya dobla ese módulo para toda la
 * corrida, y un segundo doble del mismo módulo da verde o rojo según el orden.
 * El espía sí sirve con o sin ese doble: `health.service` y el plugin de
 * configuración leen `invoke` al llamar, no al cargarse. Por la misma razón no
 * se espían `readConfig` ni `setScreenTimeEnabled`: el composable se queda con
 * esas funciones al cargarse y un espía puesto después no lo alcanza.
 *
 * Cada comando contesta lo que diga `handlers`, que una prueba puede cambiar;
 * el archivo de configuración vive en `config` y `write_config` lo reemplaza.
 */

import { type Mock, spyOn } from 'bun:test';
import * as core from '@tauri-apps/api/core';

/**
 * Cómo puede verse una clave del i18n en la corrida: cruda —el i18n cae a la
 * clave sin catálogo, y el doble de `reactive-icons.test.ts` la devuelve— o
 * traducida a cualquiera de los dos idiomas. Las pruebas buscan los botones por
 * cualquiera de estas formas para no depender del orden de los archivos.
 */
const CATALOGS = await Promise.all(
	['es', 'en'].map(
		async (language) =>
			Bun.YAML.parse(
				await Bun.file(new URL(`../src-tauri/locales/${language}.yml`, import.meta.url)).text()
			) as Record<string, unknown>
	)
);

export function textsOf(key: string): string[] {
	const lookup = (catalog: Record<string, unknown>) =>
		key
			.split('.')
			.reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], catalog);
	return [key, ...CATALOGS.map(lookup)].filter((text): text is string => typeof text === 'string');
}

export const READ_CONFIG = 'plugin:config-manager|read_config';
export const WRITE_CONFIG = 'plugin:config-manager|write_config';

export interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (reason: unknown) => void;
}

/** Una promesa que la prueba resuelve cuando quiere: así se arma una carrera sin esperar. */
export function deferred<T = void>(): Deferred<T> {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((ok, fail) => {
		resolve = ok;
		reject = fail;
	});
	return { promise, resolve, reject };
}

export interface Call {
	command: string;
	args: Record<string, unknown> | undefined;
}

type Handler = (args: Record<string, unknown> | undefined) => unknown;

export interface FakeBackend {
	calls: Call[];
	/** Los comandos llamados, en orden. */
	commands: () => string[];
	/** El `vasak.conf` como está ahora. */
	config: () => Record<string, unknown>;
	/** Lo que se escribió en cada `write_config`, en orden. */
	writes: () => Record<string, unknown>[];
	handlers: Record<string, Handler>;
	restore: () => void;
}

export function fakeBackend(initialConfig: Record<string, unknown>): FakeBackend {
	const calls: Call[] = [];
	const written: Record<string, unknown>[] = [];
	let config = structuredClone(initialConfig);

	const handlers: Record<string, Handler> = {
		[READ_CONFIG]: () => JSON.stringify(config),
		[WRITE_CONFIG]: (args) => {
			config = JSON.parse(String(args?.payload));
			written.push(structuredClone(config));
		},
	};

	const spy = spyOn(core, 'invoke').mockImplementation((async (
		command: string,
		args?: Record<string, unknown>
	) => {
		calls.push({ command, args });
		const handler = handlers[command];
		return handler ? handler(args) : undefined;
	}) as unknown as typeof core.invoke) as Mock<typeof core.invoke>;

	return {
		calls,
		commands: () => calls.map((call) => call.command),
		config: () => config,
		writes: () => written,
		handlers,
		restore: () => spy.mockRestore(),
	};
}

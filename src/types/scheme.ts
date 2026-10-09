/**
 * La forma de un archivo de esquema de color, tal como vive en disco.
 *
 * El paquete de npm del plugin tipa el esquema, pero sólo con las claves que
 * conoce, y acá importa lo demás porque el editor **escribe** el archivo:
 * cualquier clave que alguien haya puesto a mano —el archivo es un JSON común y
 * se puede editar con un editor de texto— tiene que sobrevivir a una edición
 * desde Configuración. (Hasta la 2.6 tampoco declaraba `text.on-secondary`, que
 * trae `vasak-default.json`.)
 *
 * Por eso cada nivel acepta claves de más. Las que sí se conocen están
 * nombradas para que el editor y las pruebas las usen con su tipo.
 */

export type AnsiColorName =
	| 'black'
	| 'red'
	| 'green'
	| 'yellow'
	| 'blue'
	| 'magenta'
	| 'cyan'
	| 'white'
	| 'brightBlack'
	| 'brightRed'
	| 'brightGreen'
	| 'brightYellow'
	| 'brightBlue'
	| 'brightMagenta'
	| 'brightCyan'
	| 'brightWhite';

export type SchemeAnsiColors = Record<AnsiColorName, string> & Record<string, unknown>;

export type SchemeTextColors = {
	main: string;
	muted: string;
	'on-primary': string;
	'on-secondary'?: string;
	[key: string]: unknown;
};

export type SchemeUiColors = {
	color: { primary: string; secondary: string; [key: string]: unknown };
	text: SchemeTextColors;
	background: string;
	border: string;
	surface: string;
	[key: string]: unknown;
};

export type SchemeTerminalColors = {
	foreground: string;
	background: string;
	cursor: string;
	ansi: SchemeAnsiColors;
	[key: string]: unknown;
};

export type SchemeVariantColors = {
	ui: SchemeUiColors;
	terminal: SchemeTerminalColors;
	[key: string]: unknown;
};

export type SchemeVariantName = 'dark' | 'light';

export type SchemeFile = {
	id: string;
	name: string;
	author: string;
	description: string;
	version: string;
	colors: Record<SchemeVariantName, SchemeVariantColors> & Record<string, unknown>;
	[key: string]: unknown;
};

/** Un esquema con el archivo de donde salió, como lo devuelve el plugin. */
export type SchemeEntry = {
	path: string;
	scheme: SchemeFile;
};

/**
 * Un cambio parcial de colores sobre una variante: el del plugin (2.10.0), que
 * es con el que escriben el esquema el editor y el escritorio cuando sigue al
 * fondo. Es lo que recibe `updateColors` de `useCustomScheme`.
 */
export type { SchemeColorPatch } from '@vasakgroup/plugin-config-manager';

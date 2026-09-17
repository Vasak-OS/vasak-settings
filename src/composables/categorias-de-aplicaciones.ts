/**
 * Qué se puede elegir en «Aplicaciones por defecto», y con qué se decide.
 *
 * Aparte de la vista por lo mismo que `menu`: para poder probarlo. Una lista de
 * tipos MIME es de las cosas que se escriben mal sin que nada falle — un
 * `x-scheme-handler/https` con una letra cambiada deja la categoría eligiendo
 * para un tipo que no existe, la pantalla guarda sin error, y el navegador sigue
 * siendo el de antes.
 *
 * Los tipos no son uno por categoría. «El navegador» son tres —los dos esquemas
 * y el HTML— y elegirlo tiene que escribirlos los tres: con sólo `https`, un
 * enlace `http` de un correo seguiría abriendo el de antes.
 */

/** Una fila de la pantalla. */
export interface CategoriaDeAplicacion {
	/** Sirve de clave del catálogo (`views.defaultApps.categorias.<id>`). */
	id: string;
	icono: string;
	/**
	 * Los tipos MIME que esta categoría decide.
	 *
	 * Vacío **sólo** para la terminal, que no tiene ninguno: no hay un tipo de
	 * archivo que se abra «con una terminal», así que no se puede elegir por
	 * `mimeapps.list` como las demás. Se escribe en `xdg-terminals.list` y en
	 * `TERMINAL`, que son los dos lugares donde la buscan de verdad los
	 * programas que quieren abrir una consola.
	 */
	tipos: string[];
	/**
	 * Con qué tipos se reconoce a una candidata, cuando no son los que se
	 * escriben.
	 *
	 * Existe por el navegador. Se escriben tres tipos —los dos esquemas y el
	 * HTML— pero listar por los tres trae de candidato a cualquier cosa que
	 * pueda abrir un `.html`: medido contra el equipo, «Navegador» ofrecía el
	 * editor de texto de VasakOS, que declara `text/html` entre sus veinte tipos
	 * y no maneja ningún enlace. Lo que distingue a un navegador de un editor que
	 * abre HTML es justamente el esquema: `http`.
	 */
	identifican?: string[];
}

export const CATEGORIAS: CategoriaDeAplicacion[] = [
	{
		id: 'navegador',
		icono: 'applications-internet',
		tipos: ['x-scheme-handler/http', 'x-scheme-handler/https', 'text/html'],
		identifican: ['x-scheme-handler/http', 'x-scheme-handler/https'],
	},
	{
		id: 'correo',
		icono: 'internet-mail-symbolic',
		tipos: ['x-scheme-handler/mailto'],
	},
	{
		id: 'archivos',
		icono: 'system-file-manager',
		tipos: ['inode/directory'],
	},
	{
		id: 'terminal',
		icono: 'utilities-terminal',
		tipos: [],
	},
	{
		id: 'musica',
		icono: 'audio-x-generic',
		tipos: ['audio/mpeg', 'audio/flac', 'audio/ogg', 'audio/x-wav', 'audio/mp4'],
	},
	{
		id: 'video',
		icono: 'video-x-generic',
		tipos: ['video/mp4', 'video/webm', 'video/x-matroska', 'video/quicktime'],
	},
	{
		id: 'imagenes',
		icono: 'image-x-generic',
		tipos: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff'],
	},
	{
		id: 'texto',
		icono: 'accessories-text-editor',
		tipos: ['text/plain'],
	},
	{
		id: 'pdf',
		icono: 'application-pdf',
		tipos: ['application/pdf'],
	},
];

/** La única categoría sin tipos MIME. */
export const TERMINAL = 'terminal';

/**
 * Cuál se pregunta para saber qué está elegido hoy.
 *
 * El primero de la lista y no todos: una categoría puede estar repartida —el
 * navegador de `https` no tiene por qué ser el de `text/html`— y mostrar un
 * único valor obliga a elegir uno. Se toma el primero, que es el que define la
 * categoría: para el navegador, `http`.
 */
export function tipoPrincipal(categoria: CategoriaDeAplicacion): string | null {
	return categoria.tipos[0] ?? null;
}

/** Con qué tipos se le piden las candidatas al sistema. */
export function tiposQueIdentifican(categoria: CategoriaDeAplicacion): string[] {
	return categoria.identifican ?? categoria.tipos;
}

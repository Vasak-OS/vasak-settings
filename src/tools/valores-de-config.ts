/**
 * Leer del archivo de configuración lo que el plugin no tipa.
 *
 * La sección del escritorio lleva claves que son de otras aplicaciones —la
 * disposición de los widgets, la pausa del fondo en video— y el plugin las
 * declara como `unknown`: las transporta, no las conoce. Acá se convierten en
 * el tipo que la interfaz necesita.
 *
 * Se comprueba el tipo en lugar de afirmarlo con una aserción, que es lo que
 * había antes. El valor no viene de nuestro código: viene de un archivo que se
 * puede editar a mano, y ahí un `"si"` no es `true`. Con `as any` eso llegaba
 * hasta el interruptor, que quedaba prendido por ser una cadena no vacía.
 *
 * Vive aparte de las vistas para poder probarlo: importar una vista arrastra
 * Vue, el enrutador y el backend de Tauri.
 */

/** El booleano de una clave, o el valor de fábrica si no hay uno de verdad. */
export function booleanoDeConfig(valor: unknown, porDefecto: boolean): boolean {
	return typeof valor === 'boolean' ? valor : porDefecto;
}

/** La clave del esquema de color, tal como se llama en el archivo. */
export const CLAVE_DEL_ESQUEMA = 'color-scheme';

/**
 * Las claves de estilo que la interfaz ya no escribe y quedaron en los archivos.
 *
 * `color_scheme` —con guión bajo— era lo que guardaba la vista del tema, y por
 * eso **elegir un esquema no cambiaba el esquema**: se escribía una clave nueva
 * que nadie lee y `color-scheme` se quedaba con el valor viejo.
 *
 * `primarycolor` era un control de «Color primario» que no hacía nada: nadie
 * leía esa clave en ningún repositorio. El color primario lo define el esquema,
 * así que el control se sacó en lugar de implementarlo.
 *
 * Hasta la versión 2.6.0 del plugin de configuración, las claves que su modelo
 * no conoce se borraban solas en cada lectura, así que esta basura no duraba.
 * Ahora se conservan —que es lo que salvó la disposición de los widgets—, así
 * que hay que sacarlas a propósito. Si no, quedan para siempre en el archivo de
 * quien haya tocado el tema alguna vez: una diciendo un esquema distinto del
 * que vale, la otra un color que no se aplica en ninguna parte.
 */
const CLAVES_MUERTAS = ['color_scheme', 'primarycolor'];

/**
 * Deja escrito el esquema elegido, en la clave que se lee.
 *
 * Modifica la sección en lugar de devolver una nueva porque es lo que hace el
 * resto de la vista, que guarda la configuración entera que tiene cargada.
 */
export function escribirEsquema(style: Record<string, unknown>, id: string): void {
	style[CLAVE_DEL_ESQUEMA] = id;
}

/** Saca de la sección de estilo lo que la interfaz ya no escribe. */
export function limpiarEstilo(style: Record<string, unknown>): void {
	for (const clave of CLAVES_MUERTAS) {
		delete style[clave];
	}
}

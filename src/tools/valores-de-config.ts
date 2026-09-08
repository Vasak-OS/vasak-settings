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
 * La clave mal escrita que quedó de antes: con guión bajo en lugar de guión.
 *
 * Era lo que guardaba la vista del tema, y por eso **elegir un esquema no
 * cambiaba el esquema**: se escribía una clave nueva que nadie lee y
 * `color-scheme` se quedaba con el valor viejo. La aserción `as any` de esa
 * línea es lo que lo dejó pasar; sin ella no compilaba.
 *
 * Hasta la versión 2.6.0 del plugin de configuración, las claves que su modelo
 * no conoce se borraban solas en cada lectura, así que esta basura no duraba.
 * Ahora se conserva —que es lo que salvó la disposición de los widgets—, así
 * que hay que sacarla a propósito. Si no, queda para siempre en el archivo de
 * quien haya elegido un esquema alguna vez, diciendo algo distinto de lo que
 * vale.
 */
const CLAVE_VIEJA_DEL_ESQUEMA = 'color_scheme';

/**
 * Deja escrito el esquema elegido, en la clave que se lee.
 *
 * Modifica la sección en lugar de devolver una nueva porque es lo que hace el
 * resto de la vista, que guarda la configuración entera que tiene cargada.
 */
export function escribirEsquema(style: Record<string, unknown>, id: string): void {
	style[CLAVE_DEL_ESQUEMA] = id;
	delete style[CLAVE_VIEJA_DEL_ESQUEMA];
}

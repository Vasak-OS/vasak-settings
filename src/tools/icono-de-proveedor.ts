/**
 * Con qué icono se dibuja cada proveedor de «Cuentas en Línea».
 *
 * El `id` de un proveedor lo decide el servicio de cuentas —`google`,
 * `microsoft`, `nextcloud`—, y de ahí sale el nombre del icono que se le pide
 * al tema. O sea que el catálogo puede crecer sin que el tema se entere, y un
 * proveedor nuevo aparece sin dibujo.
 *
 * Eso se veía como el cuadrito de imagen rota, que es peor que un icono
 * impreciso: parece que la aplicación está fallando cuando lo único que pasa es
 * que falta un archivo en el pack.
 *
 * Va aparte de la vista para poder probarlo: importar el `.vue` arrastra Vue,
 * el plugin de iconos y el servicio de cuentas.
 */

/**
 * Cómo se llama el icono de un proveedor en el tema.
 *
 * Los tres del catálogo viven en `vasakos-icon-theme` como enlaces a sus
 * `goa-account-*-symbolic`, que es el vocabulario que ya usaba GNOME Online
 * Accounts.
 */
export const iconoDe = (id: string): string => `${id}-symbolic`;

/**
 * El icono de «una cuenta», sin decir de quién.
 *
 * Es a lo que se cae cuando el proveedor no tiene el suyo. Dice menos que el
 * logo, pero dice algo cierto, y sobre todo no dice «acá se rompió algo».
 */
export const ICONO_GENERICO = 'goa-account-symbolic';

/**
 * El nombre que el tema devuelve cuando no encuentra el que se pidió.
 *
 * No hay forma de preguntar si un nombre existe: el plugin de iconos resuelve
 * con `FORCE_SYMBOLIC` y, si no encuentra nada, devuelve `image-missing` —el
 * cuadrito— como si fuera el icono pedido. Así que se lo pide a propósito una
 * vez y se lo usa de referencia: lo que venga igual a eso es un icono que no
 * está.
 */
export const ICONO_ROTO = 'image-missing';

/**
 * Cuál de los tres dibujar, ya resueltos a `data:` por el plugin.
 *
 * @param resuelto Lo que vino al pedir el icono del proveedor.
 * @param generico Lo que vino al pedir {@link ICONO_GENERICO}.
 * @param roto Lo que vino al pedir {@link ICONO_ROTO}, la referencia.
 * @returns El icono a dibujar, o `''` para no dibujar ninguno.
 */
export function elegirIcono(resuelto: string, generico: string, roto: string): string {
	// Sin referencia no se puede saber si el icono del proveedor existe —el
	// plugin devuelve `''` sólo cuando la llamada falla—, así que se dibuja lo
	// que haya venido en vez de descartarlo por las dudas.
	if (!roto) return resuelto;

	if (resuelto && resuelto !== roto) return resuelto;

	// El genérico también sale del tema, así que también puede faltar. Si falta,
	// ningún icono: la tarjeta se lee igual por el nombre del proveedor, y el
	// cuadrito no aporta nada que el nombre no diga mejor.
	return generico && generico !== roto ? generico : '';
}

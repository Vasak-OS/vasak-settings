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

/** Con qué se pregunta si el tema tiene un nombre. `hasSymbol`, en la aplicación. */
export type Existe = (nombre: string) => Promise<boolean>;

/**
 * Qué nombre de icono le corresponde a cada proveedor.
 *
 * Se pregunta antes de pedir porque pedir no distingue: un nombre que el tema
 * no tiene vuelve como `image-missing` —el cuadrito— con forma de icono válido.
 * Hasta `@vasakgroup/plugin-vicons` 2.2.0 no había con qué preguntar, y lo que
 * se hacía era pedir `image-missing` a propósito y comparar los dos `data:`.
 * `hasSymbol` hace esa misma búsqueda sin traer el archivo.
 *
 * El genérico se pregunta **una sola vez y sólo si falta alguno**, que con el
 * pack completo es nunca. Antes se resolvía siempre, aunque no hiciera falta.
 *
 * @param ids Los `id` de proveedor que dio el servicio de cuentas.
 * @param existe Con qué preguntarle al tema, normalmente `hasSymbol`.
 * @returns Un nombre por proveedor. Los que no tienen ninguno no aparecen.
 */
export async function nombresDeIconos(
	ids: string[],
	existe: Existe
): Promise<Record<string, string>> {
	const propios = await Promise.all(
		ids.map(async (id) => [id, (await existe(iconoDe(id))) ? iconoDe(id) : ''] as const)
	);

	const generico =
		propios.some(([, nombre]) => !nombre) && (await existe(ICONO_GENERICO)) ? ICONO_GENERICO : '';

	const nombres: Record<string, string> = {};
	for (const [id, propio] of propios) {
		const nombre = propio || generico;
		if (nombre) nombres[id] = nombre;
	}
	return nombres;
}

/**
 * Los iconos de todos los proveedores del catálogo, ya elegidos.
 *
 * Va acá y no en la vista porque es donde se puede probar, y porque lo que hace
 * no tiene nada de visual: elegir el nombre de cada uno con
 * {@link nombresDeIconos} y después pedir sólo ésos.
 *
 * Recibe `pedir` y `existe` en vez de importar el plugin de iconos por lo
 * mismo: así la prueba contesta lo que quiere sin levantar Tauri.
 *
 * No devuelve entradas vacías: la vista dibuja el icono sólo si el proveedor
 * está en el objeto, así que un `''` y un ausente significan lo mismo y es
 * mejor que haya una sola forma de decirlo.
 *
 * @param ids Los `id` de proveedor que dio el servicio de cuentas.
 * @param pedir Cómo se resuelve un nombre de icono, normalmente `getSymbolSource`.
 * @param existe Cómo se pregunta si el tema lo tiene, normalmente `hasSymbol`.
 */
export async function resolverIconosDeProveedores(
	ids: string[],
	pedir: (nombre: string) => Promise<string>,
	existe: Existe
): Promise<Record<string, string>> {
	const nombres = await nombresDeIconos(ids, existe);

	const iconos: Record<string, string> = {};
	await Promise.all(
		Object.entries(nombres).map(async ([id, nombre]) => {
			const icono = await pedir(nombre);
			if (icono) iconos[id] = icono;
		})
	);

	return iconos;
}

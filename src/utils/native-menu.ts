/**
 * Apaga el menú del clic derecho que dibuja el motor del navegador.
 *
 * WebKit ofrece «Recargar» e «Inspeccionar elemento» sobre una aplicación que no
 * es una página web: recargar deja la configuración a medio cargar y la otra no
 * le sirve a nadie. Lo que sí daba —copiar y pegar en un campo de texto— lo
 * reemplaza `components/ui/TextContextMenu.vue`.
 *
 * Prevenir el comportamiento por defecto no cancela los escuchas de la página,
 * así que ese menú propio sigue abriéndose.
 */
export function disableNativeContextMenu(): void {
	document.addEventListener('contextmenu', (event) => event.preventDefault(), {
		capture: true,
	});
}

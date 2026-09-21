<script setup lang="ts">
/**
 * El icono de una aplicación en la lista de permisos.
 *
 * Nació como componente aparte porque el composable propio resolvía **un**
 * icono y se suscribía al cambio de tema por llamada, y un `v-for` no puede
 * llamar a un composable. Ese motivo ya no existe —`ThemeIcon` es un componente
 * y se pone dentro de un `v-for` sin más—, pero el componente se queda por el
 * otro: el recuadro con borde que deja el hueco cuando el icono no está.
 *
 * Si el icono no se encuentra queda el hueco con el borde, no un recuadro roto:
 * una fila sin icono se sigue leyendo por su nombre, y una imagen rota llama la
 * atención sobre lo único que no importa de esa fila.
 *
 * # Es decorativo, y por eso va sin texto alternativo
 *
 * El nombre de la aplicación está en el encabezado de la misma fila. Un `alt`
 * con ese nombre lo haría anunciar **dos veces** a quien usa un lector de
 * pantalla: primero la imagen, después el título. El icono no agrega
 * información, agrega reconocimiento de un vistazo — que es exactamente lo que
 * un `alt` vacío declara.
 */
import { ThemeIcon } from '@vasakgroup/vue-libvasak';

defineProps<{
	/** El nombre del icono, ya resuelto por el backend desde el `.desktop`. */
	nombre: string;
}>();
</script>

<template>
	<span
		class="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-corner-sm border border-ui-border bg-ui-bg/60"
	>
		<ThemeIcon :name="nombre" :size="28" />
	</span>
</template>

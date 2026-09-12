<script setup lang="ts">
/**
 * El icono de una aplicación en la lista de permisos.
 *
 * Va en su propio componente porque `useReactiveIcon` resuelve **un** icono y
 * se vuelve a suscribir al cambio de tema: con una lista de aplicaciones hace
 * falta uno por fila, y un `v-for` no puede llamar a un composable.
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
import { useReactiveIcon } from '@/composables/useReactiveIcon';

const props = defineProps<{
	/** El nombre del icono, ya resuelto por el backend desde el `.desktop`. */
	nombre: string;
}>();

const [icono] = useReactiveIcon(() => props.nombre);
</script>

<template>
	<span
		class="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-corner-sm border border-ui-border bg-ui-bg/60"
	>
		<img v-if="icono" :src="icono" alt="" class="size-7 object-contain">
	</span>
</template>

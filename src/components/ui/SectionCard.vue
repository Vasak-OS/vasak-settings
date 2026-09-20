<script setup lang="ts">
/**
 * Una tarjeta de sección.
 *
 * `title` dibuja el encabezado, con el mismo aspecto que las pantallas que lo
 * escriben a mano con un `<h3>`. La propiedad no existía: seis pantallas —las
 * de idioma y teclado, y las cuatro secciones de entrada de Wayfire— le pasaban
 * `:title` igual, y eso caía sobre el `<article>` como el atributo `title` de
 * HTML. O sea que el encabezado **no se dibujaba**: quedaba como un globito al
 * pasar el mouse por encima de toda la tarjeta, que no es lo que nadie quiso
 * escribir. Lo destapó `strictTemplates`.
 *
 * Sigue siendo opcional: las pantallas que ya ponen su propio `<h3>` no cambian.
 */
defineProps<{ title?: string }>();
</script>

<template>
	<article class="rounded-corner border border-ui-border bg-ui-bg/75 p-5 shadow-sm">
		<h3 v-if="title" class="mb-4 font-medium text-lg text-tx-primary">{{ title }}</h3>
		<slot />
	</article>
</template>

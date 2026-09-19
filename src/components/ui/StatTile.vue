<script setup lang="ts">
defineProps<{
	label: string;
	value: string;
	hint?: string;
}>();
</script>

<template>
	<!-- `min-w-0`: una columna de rejilla no baja de la anchura de su contenido
	     por omisión, así que una etiqueta larga de una sola palabra
	     —«TEMPERATURA», con separación entre letras— ensanchaba su columna y se
	     desbordaba sobre la vecina. Quien arma la rejilla es el que decide
	     cuántas columnas entran; esto sólo evita que una las reviente. -->
	<div class="min-w-0 rounded-corner border border-ui-border bg-ui-surface/70 p-4">
		<p class="text-xs uppercase tracking-[0.16em] text-tx-muted">{{ label }}</p>
		<p class="mt-2 text-2xl font-semibold">{{ value }}</p>
		<p v-if="hint" class="mt-1 truncate text-sm text-tx-muted">{{ hint }}</p>
	</div>
</template>

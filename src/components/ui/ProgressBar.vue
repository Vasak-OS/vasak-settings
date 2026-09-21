<script setup lang="ts">
/**
 * Una fila de progreso: la etiqueta, el porcentaje y la barra.
 *
 * La barra es la de la librería y ya no está dibujada acá. Con eso gana lo que
 * le faltaba y no se veía: `role="progressbar"` y sus `aria-value*`, sin los
 * cuales una barra que avanza es una caja de colores que no le dice nada a
 * quien no la mira. Acá se usa para el espacio en disco y la memoria, donde lo
 * que la barra dice es justamente el dato.
 *
 * Lo que Configuración pone encima es la fila: el nombre a la izquierda y el
 * número a la derecha, con un decimal. Eso no está en la librería porque no
 * todas las barras del sistema lo llevan —la del instalador tiene su propio
 * renglón con el paso y el tiempo restante—.
 */
import { ProgressBar as BarraDeLaLibreria } from '@vasakgroup/vue-libvasak';
import { computed } from 'vue';

const props = defineProps<{
	label: string;
	value: number;
}>();

/** El mismo recorte que hace la barra, para que el número no diga otra cosa. */
const acotado = computed(() => Math.max(0, Math.min(100, props.value)));
</script>

<template>
	<div>
		<div class="mb-2 flex items-center justify-between text-xs text-tx-muted">
			<span>{{ label }}</span>
			<span>{{ acotado.toFixed(1) }}%</span>
		</div>
		<BarraDeLaLibreria :value="acotado" :label="label" />
	</div>
</template>

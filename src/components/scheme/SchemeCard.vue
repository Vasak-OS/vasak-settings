<script setup lang="ts">
/**
 * Un esquema en la lista de Apariencia: su nombre, unas muestras y si es el
 * elegido.
 *
 * Es un botón con `aria-pressed`: se elige con Enter o Espacio, y quien no ve
 * el anillo `ring-primary` oye cuál está elegido.
 */
interface Props {
	title: string;
	subtitle?: string;
	/** Los colores que se muestran como puntos, en orden. */
	swatches: string[];
	selected: boolean;
}

withDefaults(defineProps<Props>(), { subtitle: '' });
const emit = defineEmits<{ select: [] }>();
</script>

<template>
	<button
		type="button"
		:aria-pressed="selected ? 'true' : 'false'"
		:class="[
			'flex w-full flex-col gap-3 rounded-corner border bg-ui-surface/70 p-3 text-left transition-colors hover:bg-ui-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
			selected ? 'border-primary ring-2 ring-primary' : 'border-ui-border',
		]"
		@click="emit('select')"
	>
		<div class="min-w-0">
			<p class="truncate text-sm font-medium text-tx-main">{{ title }}</p>
			<p v-if="subtitle" class="truncate text-xs text-tx-muted">{{ subtitle }}</p>
		</div>
		<div class="flex gap-1.5" aria-hidden="true">
			<span
				v-for="(color, index) in swatches"
				:key="index"
				class="h-5 w-5 rounded-full border border-ui-border"
				:style="{ backgroundColor: color }"
			/>
		</div>
	</button>
</template>

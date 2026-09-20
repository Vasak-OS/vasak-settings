<script setup lang="ts" generic="T extends string | number">
interface Props {
	/**
	 * El valor elegido, del tipo que use quien lo pone.
	 *
	 * Era `string | number` fijo, y eso obliga a quien tiene algo más estrecho
	 * —un `Ref<FontTarget>`, por ejemplo— a aceptar de vuelta un valor que
	 * nunca va a llegar: sólo se emiten los que están en `options`. Con
	 * `strictTemplates` eso dejó de pasar en silencio.
	 */
	modelValue: T;
	options: { label: string; value: string | number }[] | string[];
	id?: string;
	disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
	id: '',
	disabled: false,
});

// A <select> always yields a string, so narrowing the emit lets callers type
// their handlers as (value: string) instead of widening every one of them.
const emit = defineEmits<{
	'update:modelValue': [value: T];
}>();

/** El valor que lleva una opción, sea texto suelto o `{ label, value }`. */
const valorDe = (opcion: Props['options'][number]) =>
	typeof opcion === 'string' ? opcion : opcion.value;

const updateValue = (event: Event) => {
	const target = event.target as HTMLSelectElement;
	// El `<select>` siempre devuelve una cadena, y emitir `'5000'` donde quien
	// escucha espera `5000` le deja un tipo que miente: la comparación con los
	// valores de `options` falla sin decir por qué. Antes se emitía la cadena
	// siempre, y como el modelo era `string | number` nadie se enteraba.
	//
	// El valor sale de la opción elegida y no de convertir según el tipo del
	// modelo. Mirar el modelo es adivinar: con una lista mezclada —`'auto'` y
	// `5000` juntos, como la de los intervalos— elegir `'auto'` con un modelo
	// numérico daba `NaN`, y elegir `5000` con un modelo de texto daba
	// `'5000'`. Lo marcó la revisión. La opción sabe lo que vale.
	const elegida = props.options.find((opcion) => String(valorDe(opcion)) === target.value);
	// Si no hay ninguna, el `<select>` está dibujando algo que no salió de
	// `options` —un `<option>` puesto a mano en la ranura, por ejemplo—: va la
	// cadena, que es lo único que se sabe.
	emit('update:modelValue', (elegida === undefined ? target.value : valorDe(elegida)) as T);
};
</script>

<template>
	<select
		:id="id"
		:value="modelValue"
		:disabled="disabled"
		@change="updateValue"
		class="w-full appearance-none rounded-corner border border-ui-border bg-ui-surface/50 bg-[url('data:image/svg+xml;charset=UTF-8,%3csvg_xmlns=%27http://www.w3.org/2000/svg%27_viewBox=%270_0_24_24%27_fill=%27none%27_stroke=%27white%27_stroke-width=%272%27_stroke-linecap=%27round%27_stroke-linejoin=%27round%27%3e%3cpolyline_points=%276_9_12_15_18_9%27%3e%3c/polyline%3e%3c/svg%3e')] bg-[length:20px] bg-[right_8px_center] bg-no-repeat px-3 py-2.5 pr-9 text-sm text-tx-primary transition-all duration-200 hover:bg-ui-surface focus:border-primary focus:bg-ui-surface/80 focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
	>
		<template v-for="opt in options" :key="typeof opt === 'string' ? opt : opt.value">
			<option
				class="bg-ui-bg text-tx-primary"
				:value="typeof opt === 'string' ? opt : opt.value"
			>
				{{ typeof opt === 'string' ? opt : opt.label }}
			</option>
		</template>
	</select>
</template>

<script setup lang="ts">
/**
 * Un color del esquema: la muestra redonda, el selector y el valor hex.
 *
 * Las dos entradas escriben el mismo color. El selector sirve para elegir a
 * ojo; el campo de texto, para pegar un valor que ya se tiene. El campo se
 * valida mientras se escribe: lo que no es `#rgb` ni `#rrggbb` se marca y **no
 * se emite**, así que un valor a medio escribir nunca llega al archivo.
 */
import { computed, ref, watch } from 'vue';
import { isHexColor, toLongHex } from '@/utils/custom-scheme';

interface Props {
	/** El id del campo de texto; el selector lleva el mismo con `-picker`. */
	id: string;
	label: string;
	modelValue: string;
	/** Lo que se dice cuando el valor escrito no es un color. */
	invalidMessage: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const draft = ref(props.modelValue);

// Si el color cambia desde afuera —otra variante, un reclonado— el campo lo
// muestra. Un borrador inválido se pierde, que es lo que se espera: el color de
// verdad ya es otro.
watch(
	() => props.modelValue,
	(value) => {
		draft.value = value;
	}
);

const invalid = computed(() => !isHexColor(draft.value));

// `<input type="color">` sólo entiende `#rrggbb`: con `#abc` se queda en negro.
const pickerValue = computed(() => toLongHex(props.modelValue) ?? '#000000');

const errorId = computed(() => `${props.id}-error`);

const onPicker = (event: Event) => {
	const value = (event.target as HTMLInputElement).value.toLowerCase();
	draft.value = value;
	emit('update:modelValue', value);
};

const onText = (event: Event) => {
	const value = (event.target as HTMLInputElement).value;
	draft.value = value;
	if (isHexColor(value)) {
		emit('update:modelValue', value.trim().toLowerCase());
	}
};
</script>

<template>
	<div class="flex items-center gap-3 rounded-corner border border-ui-border bg-ui-surface/70 p-2">
		<input
			:id="`${id}-picker`"
			type="color"
			:value="pickerValue"
			:aria-label="label"
			class="h-9 w-9 shrink-0 cursor-pointer appearance-none rounded-full border border-ui-border-strong bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-none"
			@input="onPicker"
		/>
		<div class="min-w-0 flex-1">
			<label :for="id" class="block truncate text-xs text-tx-muted">{{ label }}</label>
			<input
				:id="id"
				type="text"
				:value="draft"
				maxlength="7"
				spellcheck="false"
				autocomplete="off"
				:aria-invalid="invalid ? 'true' : 'false'"
				:aria-describedby="invalid ? errorId : undefined"
				:class="[
					'w-full rounded-corner border bg-transparent px-1.5 py-0.5 font-mono text-sm tabular-nums text-tx-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
					invalid ? 'border-status-error' : 'border-transparent',
				]"
				@input="onText"
			/>
			<p v-if="invalid" :id="errorId" class="mt-0.5 text-[11px] text-status-error">{{ invalidMessage }}</p>
		</div>
	</div>
</template>

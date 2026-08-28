<script setup lang="ts">
import { computed } from 'vue';

interface Props {
	modelValue: number;
	min?: number;
	max?: number;
	step?: number;
	id?: string;
	placeholder?: string;
	disabled?: boolean;
	/** Constrains the field to its content instead of filling the row. */
	narrow?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
	disabled: false,
	narrow: false,
});

const emit = defineEmits<{
	'update:modelValue': [value: number];
}>();

const classes = computed(() => [
	'rounded-corner border border-ui-border bg-ui-surface/50 px-3 py-2 text-sm text-tx-primary transition-colors',
	'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20',
	'disabled:cursor-not-allowed disabled:opacity-50',
	props.narrow ? 'w-32' : 'w-full',
]);

/**
 * Emits a number, never NaN: clearing the field would otherwise write NaN into
 * the config and render as an empty value that never recovers.
 */
function handle(event: Event) {
	const raw = (event.target as HTMLInputElement).value;
	const parsed = Number.parseFloat(raw);

	if (raw === '' || Number.isNaN(parsed)) {
		return;
	}

	emit('update:modelValue', parsed);
}
</script>

<template>
	<input
		:id="id"
		type="number"
		:value="modelValue"
		:min="min"
		:max="max"
		:step="step"
		:placeholder="placeholder"
		:disabled="disabled"
		:class="classes"
		@input="handle"
	/>
</template>

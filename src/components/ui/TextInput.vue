<script setup lang="ts">
import { computed } from 'vue';

interface Props {
	modelValue: string;
	type?: 'text' | 'password' | 'time' | 'date' | 'email' | 'search';
	id?: string;
	placeholder?: string;
	disabled?: boolean;
	readonly?: boolean;
	/** Draws the danger border, for a value the caller has judged invalid. */
	invalid?: boolean;
	/** For values where character alignment matters: commands, paths, rules. */
	mono?: boolean;
	/**
	 * Emit on `change` (blur / Enter) instead of on every keystroke. Use it when
	 * each emission has a cost, such as renaming a key or a D-Bus round trip.
	 */
	lazy?: boolean;
	autocomplete?: string;
}

const props = withDefaults(defineProps<Props>(), {
	type: 'text',
	disabled: false,
	readonly: false,
	invalid: false,
	mono: false,
	lazy: false,
});

const emit = defineEmits<{
	'update:modelValue': [value: string];
}>();

const classes = computed(() => [
	'w-full rounded-corner border bg-ui-surface/50 px-3 py-2 text-sm text-tx-primary transition-colors',
	'focus:border-[var(--primary-color,#0084ff)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-color,#0084ff)]/20',
	'disabled:cursor-not-allowed disabled:opacity-50 read-only:opacity-60',
	props.invalid ? 'border-status-danger' : 'border-ui-border',
	props.mono ? 'font-mono' : '',
]);

function handle(event: Event) {
	emit('update:modelValue', (event.target as HTMLInputElement).value);
}
</script>

<template>
	<input
		:id="id"
		:type="type"
		:value="modelValue"
		:placeholder="placeholder"
		:disabled="disabled"
		:readonly="readonly"
		:autocomplete="autocomplete"
		:class="classes"
		@input="lazy ? undefined : handle($event)"
		@change="lazy ? handle($event) : undefined"
	/>
</template>

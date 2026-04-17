<script setup lang="ts">
interface Props {
	modelValue: number;
	min?: number;
	max?: number;
	step?: number;
	id?: string;
	disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
	min: 0,
	max: 100,
	step: 1,
	id: '',
	disabled: false,
});

const emit = defineEmits<{
	'update:modelValue': [value: number];
}>();

const updateValue = (event: Event) => {
	const target = event.target as HTMLInputElement;
	emit('update:modelValue', parseFloat(target.value));
};
</script>

<template>
	<input
		type="range"
		:id="id"
		:min="min"
		:max="max"
		:step="step"
		:value="modelValue"
		:disabled="disabled"
		@input="updateValue"
		class="h-1.5 w-full appearance-none rounded-[3px] bg-ui-surface/60 outline-none transition-all duration-200 focus:bg-ui-surface disabled:cursor-not-allowed disabled:opacity-50 [&::-moz-range-thumb]:h-[18px] [&::-moz-range-thumb]:w-[18px] [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:shadow-[0_2px_8px_var(--color-primary)] [&::-moz-range-thumb]:transition-all [&::-moz-range-thumb]:duration-200 hover:[&::-moz-range-thumb]:scale-110 [&::-webkit-slider-thumb]:h-[18px] [&::-webkit-slider-thumb]:w-[18px] [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-[0_2px_8px_var(--color-primary)] [&::-webkit-slider-thumb]:transition-all [&::-webkit-slider-thumb]:duration-200 hover:[&::-webkit-slider-thumb]:scale-110"
	/>
</template>
